-- ============================================================================
-- Migração: permite editar motivo/detalhes de uma reclamação, com auditoria
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Adiciona dois novos tipos de evento (motivo_alterado, descricao_alterada)
-- e atualiza a trigger de auditoria pra registrar essas mudanças também —
-- igual já acontece com status e responsável. É o que garante que editar
-- motivo/detalhes SEMPRE fica registrado no histórico, sem exceção (a
-- gravação acontece no banco, não depende do front-end lembrar de logar).
-- ============================================================================

ALTER TYPE tipo_evento_reclamacao ADD VALUE IF NOT EXISTS 'motivo_alterado';
ALTER TYPE tipo_evento_reclamacao ADD VALUE IF NOT EXISTS 'descricao_alterada';
