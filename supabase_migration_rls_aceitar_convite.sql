-- ============================================================================
-- Migração: permite o próprio convidado marcar seu convite como aceito
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- A política "Admins podem gerenciar convites" (FOR ALL ... USING(is_admin()))
-- bloqueava até o UPDATE feito pelo próprio convidado ao concluir o cadastro
-- em /invite/[token] — por isso o convite ficava "Pendente" pra sempre,
-- mesmo com o cadastro e o perfil já criados com sucesso.
-- ============================================================================

CREATE POLICY "Convidado pode aceitar o próprio convite"
ON convites FOR UPDATE TO authenticated
USING (status = 'pendente' AND email = auth.email())
WITH CHECK (status = 'aceito' AND email = auth.email());
