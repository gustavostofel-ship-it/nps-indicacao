-- ============================================================================
-- Correção: motivos do setor Eventos são tipos de SINISTRO, não evento
-- social. Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- A migração original (supabase_migration_fila_avaliacoes.sql) semeou
-- "Casamento", "Formatura" etc. por engano — associação de proteção
-- veicular, o setor "Eventos" trata sinistros (colisão, roubo, furto...).
-- Este script:
-- 1) Remove os motivos de exemplo errados, mas só os que ninguém já usou
--    (se alguma pendência de teste já referenciar um deles, o motivo fica —
--    edite/inative manualmente em Configurações se for o caso).
-- 2) Insere a lista real de tipos de sinistro, sem duplicar se você já
--    tiver cadastrado algum manualmente em Configurações.
-- ============================================================================

DELETE FROM atendimento_motivo
WHERE nome IN ('Casamento', 'Formatura', 'Evento Corporativo', 'Confraternização', 'Outro')
  AND id NOT IN (
    SELECT motivo_id FROM avaliacao_pendencias WHERE motivo_id IS NOT NULL
  );

INSERT INTO atendimento_motivo (nome, ordem)
SELECT * FROM (VALUES
  ('Colisão', 0),
  ('Roubo', 1),
  ('Furto', 2),
  ('Incêndio', 3),
  ('Roubo/Furto Recuperado', 4),
  ('Carro Reserva', 5),
  ('Vidros', 6)
) AS v(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM atendimento_motivo WHERE atendimento_motivo.nome = v.nome);
