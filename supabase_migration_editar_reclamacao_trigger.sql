-- ============================================================================
-- Migração: trigger de auditoria passa a registrar motivo/detalhes editados
-- Rode este arquivo DEPOIS de supabase_migration_editar_reclamacao.sql
-- (precisa rodar em separado porque o Postgres não deixa usar um valor de
-- enum recém-criado na mesma transação em que ele foi adicionado).
-- ============================================================================

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
    IF NEW.motivo_id IS DISTINCT FROM OLD.motivo_id THEN
      INSERT INTO reclamacao_eventos (reclamacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (
        NEW.id, 'motivo_alterado', auth.uid(),
        (SELECT nome FROM reclamacao_motivo WHERE id = OLD.motivo_id),
        (SELECT nome FROM reclamacao_motivo WHERE id = NEW.motivo_id)
      );
    END IF;
    IF NEW.descricao IS DISTINCT FROM OLD.descricao THEN
      INSERT INTO reclamacao_eventos (reclamacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (NEW.id, 'descricao_alterada', auth.uid(), OLD.descricao, NEW.descricao);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
