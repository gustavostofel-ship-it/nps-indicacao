-- ============================================================================
-- ZERAR DADOS OPERACIONAIS — apaga todo associado, veículo, avaliação,
-- indicação, reclamação e pendência da Fila NPS, pra começar a usar o
-- sistema do zero. NÃO mexe em Configurações (setores, critérios, status,
-- motivos, situações) nem em usuários/convites da equipe — isso continua
-- exatamente como está.
--
-- ⚠️ IRREVERSÍVEL. Rode só quando tiver certeza. Sugestão: antes de rodar,
-- no Supabase vá em Database → Backups e confirme que existe um backup
-- recente, caso precise recuperar algo depois.
--
-- TRUNCATE ... CASCADE cuida da ordem de apagar sozinho (respeitando as
-- chaves estrangeiras), não precisa se preocupar com a sequência das
-- tabelas na lista abaixo.
-- ============================================================================

TRUNCATE TABLE
  avaliacao_pendencia_eventos,
  avaliacao_pendencias,
  indicacao_eventos,
  indicacoes,
  reclamacao_eventos,
  reclamacoes,
  avaliacao_notas,
  avaliacoes_recusas,
  avaliacoes,
  associado_eventos,
  veiculos,
  associados
RESTART IDENTITY CASCADE;

-- Reinicia a numeração de protocolo (IND-2026-000001 / REC-2026-000001) do
-- zero — cosmético, mas sem isso o próximo protocolo continuaria de onde
-- parou (ex: IND-2026-000043) mesmo com a lista vazia.
ALTER SEQUENCE indicacoes_protocolo_seq RESTART WITH 1;
ALTER SEQUENCE reclamacoes_protocolo_seq RESTART WITH 1;
