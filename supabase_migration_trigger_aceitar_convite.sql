-- ============================================================================
-- Migração: cria perfil + marca convite como aceito via trigger no banco
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Antes, quem criava o perfil (perfis_usuarios) e marcava o convite como
-- "aceito" era o próprio navegador da pessoa convidada, logo depois do
-- signUp(). Problema: nesse instante nem sempre existe uma sessão válida
-- ainda (depende de confirmação de e-mail, timing, etc.), então essas duas
-- gravações podiam falhar silenciosamente por RLS — e o app seguia em
-- frente sem avisar, deixando o convite preso em "Pendente" e, pior, às
-- vezes o perfil nem existia direito (por isso o novo admin não conseguia
-- entrar em Configurações — o middleware não achava papel = 'admin').
--
-- Agora isso é feito por uma trigger em auth.users, com SECURITY DEFINER
-- (roda com privilégio total, ignora RLS, não depende de sessão do
-- navegador). O front-end só precisa mandar o id do convite dentro dos
-- metadados do signUp() — ver app/invite/[token]/page.tsx.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_convite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convite_id UUID;
BEGIN
  v_convite_id := (NEW.raw_user_meta_data->>'convite_id')::UUID;

  IF v_convite_id IS NOT NULL THEN
    -- nome/função/papel vêm do convite no banco (não dos metadados que o
    -- navegador manda), então não dá pra um usuário forjar isso pra virar
    -- admin sozinho — só funciona se existir mesmo um convite pendente
    -- com esse id.
    INSERT INTO perfis_usuarios (id, nome, funcao, papel, status)
    SELECT NEW.id, c.nome, c.funcao, c.papel, 'ativo'
    FROM convites c
    WHERE c.id = v_convite_id AND c.status = 'pendente'
    ON CONFLICT (id) DO NOTHING;

    UPDATE convites
    SET status = 'aceito', aceito_em = timezone('utc', now())
    WHERE id = v_convite_id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_convite ON auth.users;
CREATE TRIGGER on_auth_user_created_convite
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_convite();
