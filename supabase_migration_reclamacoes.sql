-- ============================================================================
-- Migração: Reclamações (tratativa de avaliações NPS ruins e casos avulsos)
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Mesma arquitetura já usada em Indicações: protocolo legível, status
-- configurável (Configurações), histórico de eventos imutável (auditoria),
-- e "responsável atual" separado de quem abriu o caso (pra rastrear quando
-- é encaminhado a uma liderança e depois volta).
-- ============================================================================

-- 1) Status configurável (nome, cor, ordem, conta_como_resolvido) -------------

CREATE TABLE IF NOT EXISTS reclamacao_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'cinza', -- chave da mesma paleta usada em indicacao_status (ver CORES_STATUS)
  ordem INTEGER NOT NULL DEFAULT 0,
  -- Equivalente ao conta_como_fechado de indicacao_status: define o que
  -- entra nas métricas de "reclamações resolvidas" do Dashboard.
  conta_como_resolvido BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE reclamacao_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver reclamacao_status" ON reclamacao_status;
CREATE POLICY "Todos autenticados podem ver reclamacao_status"
ON reclamacao_status FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Apenas admins podem modificar reclamacao_status" ON reclamacao_status;
CREATE POLICY "Apenas admins podem modificar reclamacao_status"
ON reclamacao_status FOR ALL TO authenticated USING (is_admin());

INSERT INTO reclamacao_status (nome, cor, ordem, conta_como_resolvido)
SELECT * FROM (VALUES
  ('Aberta', 'vermelho', 0, false),
  ('Em Análise', 'amarelo', 1, false),
  ('Encaminhada à Liderança', 'roxo', 2, false),
  ('Aguardando Retorno do Associado', 'azul', 3, false),
  ('Resolvida', 'verde', 4, true),
  ('Não Resolvida', 'cinza', 5, true)
) AS v(nome, cor, ordem, conta_como_resolvido)
WHERE NOT EXISTS (SELECT 1 FROM reclamacao_status);

-- 2) Tabela principal ----------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS reclamacoes_protocolo_seq START 1;

CREATE TABLE IF NOT EXISTS reclamacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo TEXT UNIQUE,
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  -- Nula quando a reclamação é avulsa (associado ligou direto reclamando,
  -- sem uma avaliação ruim registrada por trás).
  avaliacao_id UUID REFERENCES avaliacoes(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  status_id UUID NOT NULL REFERENCES reclamacao_status(id),
  -- Quem abriu o caso — fixo, nunca muda (diferente de responsavel_atual_id).
  aberto_por UUID NOT NULL REFERENCES auth.users(id),
  -- Quem está tratando agora — reatribuível (ex: encaminhado a um líder).
  responsavel_atual_id UUID REFERENCES auth.users(id),
  observacoes TEXT,
  data_abertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
  data_resolucao TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_reclamacoes_associado_id ON reclamacoes(associado_id);
CREATE INDEX IF NOT EXISTS idx_reclamacoes_status_id ON reclamacoes(status_id);

ALTER TABLE reclamacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler/escrever reclamacoes" ON reclamacoes;
CREATE POLICY "Autenticados podem ler/escrever reclamacoes"
ON reclamacoes FOR ALL TO authenticated USING (true);

-- 3) Histórico de eventos (auditoria imutável) --------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_evento_reclamacao') THEN
    EXECUTE $sql$CREATE TYPE tipo_evento_reclamacao AS ENUM ('criacao', 'status_alterado', 'responsavel_alterado', 'observacao')$sql$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reclamacao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamacao_id UUID NOT NULL REFERENCES reclamacoes(id) ON DELETE CASCADE,
  tipo tipo_evento_reclamacao NOT NULL,
  autor_id UUID REFERENCES auth.users(id),
  descricao TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_reclamacao_eventos_reclamacao_id ON reclamacao_eventos(reclamacao_id);

ALTER TABLE reclamacao_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler/escrever reclamacao_eventos" ON reclamacao_eventos;
CREATE POLICY "Autenticados podem ler/escrever reclamacao_eventos"
ON reclamacao_eventos FOR ALL TO authenticated USING (true);

-- 4) Protocolo automático -------------------------------------------------------

CREATE OR REPLACE FUNCTION gerar_protocolo_reclamacao() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.protocolo IS NULL THEN
    NEW.protocolo := 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('reclamacoes_protocolo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_gerar_protocolo_reclamacao
BEFORE INSERT ON reclamacoes
FOR EACH ROW EXECUTE PROCEDURE gerar_protocolo_reclamacao();

-- 5) Auditoria automática + updated_at/data_resolucao -------------------------

CREATE OR REPLACE FUNCTION registrar_evento_reclamacao() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO reclamacao_eventos (reclamacao_id, tipo, autor_id, descricao)
    VALUES (NEW.id, 'criacao', auth.uid(), 'Reclamação aberta');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      INSERT INTO reclamacao_eventos (reclamacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (
        NEW.id, 'status_alterado', auth.uid(),
        (SELECT nome FROM reclamacao_status WHERE id = OLD.status_id),
        (SELECT nome FROM reclamacao_status WHERE id = NEW.status_id)
      );
    END IF;
    IF NEW.responsavel_atual_id IS DISTINCT FROM OLD.responsavel_atual_id THEN
      INSERT INTO reclamacao_eventos (reclamacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (NEW.id, 'responsavel_alterado', auth.uid(), OLD.responsavel_atual_id::text, NEW.responsavel_atual_id::text);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_registrar_evento_reclamacao_insert
AFTER INSERT ON reclamacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_reclamacao();

CREATE OR REPLACE TRIGGER trg_registrar_evento_reclamacao_update
AFTER UPDATE ON reclamacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_reclamacao();

CREATE OR REPLACE FUNCTION trg_reclamacoes_touch() RETURNS TRIGGER AS $$
DECLARE
  resolvido_novo BOOLEAN;
  resolvido_antigo BOOLEAN;
BEGIN
  NEW.updated_at = timezone('utc', now());

  SELECT conta_como_resolvido INTO resolvido_novo FROM reclamacao_status WHERE id = NEW.status_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT conta_como_resolvido INTO resolvido_antigo FROM reclamacao_status WHERE id = OLD.status_id;
  ELSE
    resolvido_antigo := false;
  END IF;

  IF COALESCE(resolvido_novo, false) AND NOT COALESCE(resolvido_antigo, false) THEN
    NEW.data_resolucao = timezone('utc', now());
  ELSIF NOT COALESCE(resolvido_novo, false) THEN
    NEW.data_resolucao = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_reclamacoes_touch
BEFORE INSERT OR UPDATE ON reclamacoes
FOR EACH ROW EXECUTE PROCEDURE trg_reclamacoes_touch();
