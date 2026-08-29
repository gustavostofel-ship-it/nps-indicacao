-- ============================================================================
-- Migração: Histórico de auditoria para edições de dados de associado
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
-- Mesmo princípio já aplicado a indicacoes (ver
-- supabase_migration_protocolo_historico.sql): nome/CPF de associado hoje é
-- sobrescrito sem deixar rastro de quem mudou o quê e quando.
-- ============================================================================

CREATE TABLE IF NOT EXISTS associado_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES auth.users(id),
  campo TEXT NOT NULL, -- 'criacao' | 'nome_completo' | 'cpf'
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_associado_eventos_associado_id ON associado_eventos(associado_id);

ALTER TABLE associado_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler/escrever associado_eventos" ON associado_eventos;
CREATE POLICY "Autenticados podem ler/escrever associado_eventos"
ON associado_eventos FOR ALL TO authenticated USING (true);

-- Registro automático: funciona mesmo em edições feitas direto no banco, não
-- só pela tela do sistema (mesmo princípio do trigger de indicacoes).
CREATE OR REPLACE FUNCTION registrar_evento_associado() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_novo)
    VALUES (NEW.id, auth.uid(), 'criacao', NEW.nome_completo);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.nome_completo IS DISTINCT FROM OLD.nome_completo THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'nome_completo', OLD.nome_completo, NEW.nome_completo);
    END IF;
    IF NEW.cpf IS DISTINCT FROM OLD.cpf THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'cpf', OLD.cpf, NEW.cpf);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_registrar_evento_associado_insert
AFTER INSERT ON associados
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_associado();

CREATE OR REPLACE TRIGGER trg_registrar_evento_associado_update
AFTER UPDATE ON associados
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_associado();

-- Registro retroativo de "criação" para associados que já existiam antes
-- desta migração (senão o histórico deles começaria vazio).
INSERT INTO associado_eventos (associado_id, campo, valor_novo, created_at)
SELECT a.id, 'criacao', a.nome_completo, a.created_at
FROM associados a
WHERE NOT EXISTS (
  SELECT 1 FROM associado_eventos e WHERE e.associado_id = a.id AND e.campo = 'criacao'
);
