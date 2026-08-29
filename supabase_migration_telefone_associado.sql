-- ============================================================================
-- Migração: Telefone do associado
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
-- ============================================================================

ALTER TABLE associados ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Estende o trigger de auditoria de associados (já existente, ver
-- supabase_migration_historico_associados.sql) pra também rastrear mudanças
-- de telefone, do mesmo jeito que já rastreia nome e CPF.
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
    IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'telefone', OLD.telefone, NEW.telefone);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
