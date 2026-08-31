-- ============================================================================
-- Migração de segurança: fecha o vazamento de convites e trava cadastro
-- direto (sem convite). Rode este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================================

-- 1) FECHA O VAZAMENTO DE CONVITES -------------------------------------------
--
-- A política antiga deixava QUALQUER visitante não-logado listar TODOS os
-- convites já criados (nome, e-mail, papel e o TOKEN de verdade de cada um)
-- — bastava um GET direto na API do Supabase, sem token nenhum em mãos.
-- Isso permitia pegar o token de um convite pendente (inclusive de admin)
-- e completar o cadastro no lugar da pessoa certa.
--
-- Troca: a tabela deixa de ser legível por anônimos. No lugar, uma função seguro
-- (SECURITY DEFINER) devolve só os campos necessários de UM convite específico
-- — e só se quem está perguntando já sabe o token exato (não dá pra listar
-- convites sem token nenhum, só consultar um que você já tem em mãos).

DROP POLICY IF EXISTS "Visitantes podem ler convites pelo token" ON convites;

CREATE OR REPLACE FUNCTION buscar_convite_por_token(p_token TEXT)
RETURNS TABLE (id UUID, nome TEXT, email TEXT, funcao TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome, email, funcao
  FROM convites
  WHERE token = p_token AND status = 'pendente';
$$;

-- Permite chamar essa função sem estar logado (é exatamente o caso de uso:
-- a pessoa convidada ainda não tem conta) — mas só executa a consulta acima,
-- nunca lista a tabela inteira.
GRANT EXECUTE ON FUNCTION buscar_convite_por_token(TEXT) TO anon, authenticated;

-- 2) TRAVA CADASTRO SEM CONVITE VÁLIDO ----------------------------------------
--
-- Nada impedia alguém de chamar auth.signUp() direto (fora da tela de
-- convite) e virar um usuário autenticado de verdade, sem aprovação de
-- nenhum admin — e a partir daí ter acesso de leitura/escrita a
-- praticamente todos os dados do sistema (associados, avaliações,
-- indicações, reclamações), porque essas tabelas liberam tudo pra
-- "qualquer autenticado".
--
-- Essa trigger roda ANTES de o usuário ser de fato criado e barra a
-- criação se os metadados não apontarem pra um convite pendente com o
-- e-mail batendo. Se isso acontecer, o signUp() falha com o erro abaixo
-- em vez de criar a conta.

CREATE OR REPLACE FUNCTION validar_signup_convite() RETURNS TRIGGER AS $$
DECLARE
  v_convite_id UUID;
  v_email_convite TEXT;
BEGIN
  -- Recuperação de senha (auth.updateUser) e outras operações internas do
  -- Supabase também podem passar por aqui dependendo da versão — essa
  -- trigger é só em INSERT (novo usuário), então só afeta signUp() mesmo.
  v_convite_id := (NEW.raw_user_meta_data->>'convite_id')::UUID;

  IF v_convite_id IS NULL THEN
    RAISE EXCEPTION 'Cadastro permitido apenas por convite. Peça um convite a um administrador.';
  END IF;

  SELECT email INTO v_email_convite
  FROM convites
  WHERE id = v_convite_id AND status = 'pendente';

  IF v_email_convite IS NULL THEN
    RAISE EXCEPTION 'Convite inválido, expirado ou já utilizado.';
  END IF;

  IF v_email_convite IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION 'O e-mail não corresponde ao convite.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_signup_convite ON auth.users;
CREATE TRIGGER trg_validar_signup_convite
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION validar_signup_convite();
