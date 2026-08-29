-- ============================================================================
-- Migração: E-mail no convite de usuário
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Até agora quem preenchia o e-mail era a própria pessoa convidada, na tela
-- de aceitar convite. Passa a ser o admin quem define o e-mail no momento em
-- que gera o convite — a pessoa convidada só define a senha.
-- ============================================================================

ALTER TABLE convites ADD COLUMN IF NOT EXISTS email TEXT;

-- Evita gerar dois convites pendentes pro mesmo e-mail (parcial: não afeta
-- convites já aceitos/expirados, só os que ainda estão em aberto).
CREATE UNIQUE INDEX IF NOT EXISTS idx_convites_email_pendente
ON convites (email)
WHERE status = 'pendente';
