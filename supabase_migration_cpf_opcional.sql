-- ============================================================================
-- Correção: CPF deixa de ser obrigatório em associados.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- Contexto: a planilha de atendimento da Assistência 24h não traz CPF (só
-- nome, placa e telefone) — e o Girow não é a base mestre dos associados
-- ativos, só cresce organicamente pelos atendimentos registrados aqui. Exigir
-- CPF pra cadastrar um associado a partir da Fila de Avaliações Pendentes
-- travava o colaborador no meio da ligação. A placa (já UNIQUE em veiculos)
-- passa a ser a identidade confiável nesses casos — CPF fica opcional,
-- preenchível depois quando/se for descoberto.
--
-- UNIQUE continua valendo (Postgres permite múltiplos NULLs numa coluna
-- UNIQUE sem conflito entre eles).
-- ============================================================================

ALTER TABLE associados ALTER COLUMN cpf DROP NOT NULL;
