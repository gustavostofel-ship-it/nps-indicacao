-- ============================================================================
-- Migração: arquivar associado (soft-delete)
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- "Apagar" um associado de verdade (DELETE) arrastaria em cascata todas as
-- avaliações, indicações e todo o histórico de auditoria dele — igual já
-- acontece com setores/veículos/critérios/status, associado nunca é
-- removido de fato, só marcado como inativo. Some das listas normais, mas
-- nada se perde e pode ser restaurado.
-- ============================================================================

ALTER TABLE associados ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
