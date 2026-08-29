-- ============================================================================
-- Migração: Status de indicação configurável (nome, cor, ordem, quantidade)
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Hoje o status é um ENUM fixo do Postgres (pendente/em_tratativa/fechado/
-- sem_retorno). Esta migração troca isso por uma tabela configurável pelas
-- Configurações do sistema — igual já existe para "Setores".
-- ============================================================================

-- 1) Tabela de configuração dos status ----------------------------------------

CREATE TABLE IF NOT EXISTS indicacao_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  -- Chave de cor de uma paleta fixa (ver CORES_STATUS no front-end) — não é
  -- hex livre porque o Tailwind precisa das classes conhecidas em tempo de
  -- build, não dá pra montar "bg-#hex-100" dinamicamente.
  cor TEXT NOT NULL DEFAULT 'cinza',
  ordem INTEGER NOT NULL DEFAULT 0,
  -- Interruptor que decide se uma indicação nesse status conta como
  -- "fechada com sucesso" nas métricas do Dashboard (Conversão, Tempo de
  -- Fechamento). Pode haver mais de um status marcado assim.
  conta_como_fechado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE indicacao_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver indicacao_status" ON indicacao_status;
CREATE POLICY "Todos autenticados podem ver indicacao_status"
ON indicacao_status FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Apenas admins podem modificar indicacao_status" ON indicacao_status;
CREATE POLICY "Apenas admins podem modificar indicacao_status"
ON indicacao_status FOR ALL TO authenticated USING (is_admin());

-- 2) Cria as 4 colunas atuais, preservando ordem e cor, e migra os dados -------

DO $$
DECLARE
  id_pendente UUID;
  id_tratativa UUID;
  id_fechado UUID;
  id_sem_retorno UUID;
BEGIN
  -- Só roda a migração de dados se ainda não foi feita (coluna status_id
  -- não existe / está vazia) — evita duplicar linhas se rodar de novo.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'status_id') THEN

    INSERT INTO indicacao_status (nome, cor, ordem, conta_como_fechado) VALUES ('Pendente', 'amarelo', 0, false) RETURNING id INTO id_pendente;
    INSERT INTO indicacao_status (nome, cor, ordem, conta_como_fechado) VALUES ('Em Tratativa', 'azul', 1, false) RETURNING id INTO id_tratativa;
    INSERT INTO indicacao_status (nome, cor, ordem, conta_como_fechado) VALUES ('Fechado', 'verde', 2, true) RETURNING id INTO id_fechado;
    INSERT INTO indicacao_status (nome, cor, ordem, conta_como_fechado) VALUES ('Sem Retorno', 'vermelho', 3, false) RETURNING id INTO id_sem_retorno;

    EXECUTE 'ALTER TABLE indicacoes ADD COLUMN status_id UUID REFERENCES indicacao_status(id)';

    UPDATE indicacoes SET status_id = id_pendente WHERE status = 'pendente';
    UPDATE indicacoes SET status_id = id_tratativa WHERE status = 'em_tratativa';
    UPDATE indicacoes SET status_id = id_fechado WHERE status = 'fechado';
    UPDATE indicacoes SET status_id = id_sem_retorno WHERE status = 'sem_retorno';

    EXECUTE 'ALTER TABLE indicacoes ALTER COLUMN status_id SET NOT NULL';
  END IF;
END $$;

-- 3) Atualiza os triggers que liam a coluna antiga `status` --------------------

CREATE OR REPLACE FUNCTION registrar_evento_indicacao() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, descricao)
    VALUES (NEW.id, 'criacao', auth.uid(), 'Indicação criada');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (
        NEW.id, 'status_alterado', auth.uid(),
        (SELECT nome FROM indicacao_status WHERE id = OLD.status_id),
        (SELECT nome FROM indicacao_status WHERE id = NEW.status_id)
      );
    END IF;
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (NEW.id, 'responsavel_alterado', auth.uid(), OLD.responsavel_id::text, NEW.responsavel_id::text);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_indicacoes_modtime() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id
     OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    NEW.updated_at = timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Remove a coluna e o tipo antigos -------------------------------------
ALTER TABLE indicacoes DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS status_indicacao;
