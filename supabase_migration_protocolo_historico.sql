-- ============================================================================
-- Migração: Protocolo + Histórico de Auditoria para Indicações
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
-- É seguro rodar mais de uma vez (idempotente onde o Postgres permite).
-- ============================================================================

-- 1) Número de protocolo legível (ex: IND-2026-000042) ------------------------

CREATE SEQUENCE IF NOT EXISTS indicacoes_protocolo_seq START 1;

ALTER TABLE indicacoes ADD COLUMN IF NOT EXISTS protocolo TEXT UNIQUE;

CREATE OR REPLACE FUNCTION gerar_protocolo_indicacao() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.protocolo IS NULL THEN
    NEW.protocolo := 'IND-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('indicacoes_protocolo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_gerar_protocolo_indicacao
BEFORE INSERT ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE gerar_protocolo_indicacao();

-- Preenche protocolo para indicações que já existem (feitas antes desta migração)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM indicacoes WHERE protocolo IS NULL ORDER BY data_indicacao ASC LOOP
    UPDATE indicacoes
    SET protocolo = 'IND-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('indicacoes_protocolo_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 2) Tabela de histórico de eventos (auditoria imutável) ----------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_evento_indicacao') THEN
    EXECUTE $sql$CREATE TYPE tipo_evento_indicacao AS ENUM ('criacao', 'status_alterado', 'responsavel_alterado', 'observacao')$sql$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS indicacao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicacao_id UUID NOT NULL REFERENCES indicacoes(id) ON DELETE CASCADE,
  tipo tipo_evento_indicacao NOT NULL,
  autor_id UUID REFERENCES auth.users(id),
  descricao TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_indicacao_eventos_indicacao_id ON indicacao_eventos(indicacao_id);

ALTER TABLE indicacao_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler/escrever indicacao_eventos" ON indicacao_eventos;
CREATE POLICY "Autenticados podem ler/escrever indicacao_eventos"
ON indicacao_eventos FOR ALL TO authenticated USING (true);

-- 3) Registro automático de auditoria (funciona mesmo se alguém editar direto
--    no banco, fora da tela do sistema) ---------------------------------------

CREATE OR REPLACE FUNCTION registrar_evento_indicacao() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, descricao)
    VALUES (NEW.id, 'criacao', auth.uid(), 'Indicação criada');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (NEW.id, 'status_alterado', auth.uid(), OLD.status::text, NEW.status::text);
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

CREATE OR REPLACE TRIGGER trg_registrar_evento_indicacao_insert
AFTER INSERT ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_indicacao();

CREATE OR REPLACE TRIGGER trg_registrar_evento_indicacao_update
AFTER UPDATE ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_indicacao();

-- Registro retroativo de "criação" para indicações que já existiam antes desta
-- migração (senão a linha do tempo delas começaria vazia).
INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, descricao, created_at)
SELECT i.id, 'criacao', i.usuario_id, 'Indicação criada (registro retroativo)', i.data_indicacao
FROM indicacoes i
WHERE NOT EXISTS (
  SELECT 1 FROM indicacao_eventos e WHERE e.indicacao_id = i.id AND e.tipo = 'criacao'
);

-- 4) `updated_at` passa a avançar sozinho quando status, responsável ou
--    observações mudam (hoje isso não acontecia — o selo de "dias parado"
--    das telas depende desse valor estar correto) --------------------------

CREATE OR REPLACE FUNCTION update_indicacoes_modtime() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    NEW.updated_at = timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_indicacoes_modtime
BEFORE UPDATE ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE update_indicacoes_modtime();

-- 5) Habilita o Realtime para a tabela (necessário para atualização ao vivo
--    nas telas) -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'indicacoes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE indicacoes';
  END IF;
END $$;
