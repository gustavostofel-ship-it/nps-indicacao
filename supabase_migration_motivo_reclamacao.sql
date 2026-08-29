-- ============================================================================
-- Migração: Motivo de reclamação configurável + reclamação sem nota mínima
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- 1) Lista de motivos (ex: "Demora no atendimento", "Atraso de peças") que o
--    admin mantém em Configurações — quem abre a reclamação só escolhe entre
--    eles, não digita mais uma descrição livre. Isso permite cruzar "quais
--    são os maiores motivos de reclamação" no Dashboard mais pra frente.
-- 2) reclamacoes.descricao deixa de ser obrigatória (a categorização
--    principal agora é o motivo; a descrição vira um campo de detalhes
--    opcional).
-- ============================================================================

CREATE TABLE IF NOT EXISTS reclamacao_motivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE reclamacao_motivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver reclamacao_motivo" ON reclamacao_motivo;
CREATE POLICY "Todos autenticados podem ver reclamacao_motivo"
ON reclamacao_motivo FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Apenas admins podem modificar reclamacao_motivo" ON reclamacao_motivo;
CREATE POLICY "Apenas admins podem modificar reclamacao_motivo"
ON reclamacao_motivo FOR ALL TO authenticated USING (is_admin());

INSERT INTO reclamacao_motivo (nome, ordem)
SELECT * FROM (VALUES
  ('Demora no atendimento', 0),
  ('Atraso no prazo / fora do prazo', 1),
  ('Atraso de peças', 2),
  ('Negativa de assistência', 3),
  ('Qualidade do serviço', 4),
  ('Outro', 5)
) AS v(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM reclamacao_motivo);

ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS motivo_id UUID REFERENCES reclamacao_motivo(id);
ALTER TABLE reclamacoes ALTER COLUMN descricao DROP NOT NULL;
