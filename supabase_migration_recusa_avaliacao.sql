-- ============================================================================
-- Migração: Avaliação geral (sem critérios) + registro de recusa de avaliação
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- 1) "Avaliação geral do atendimento": não precisa de coluna nova — o modal
--    de avaliação (ModalNovaAvaliacao, em components/Dashboard.tsx) ganhou um
--    botão que permite lançar uma nota única (0-10) mesmo quando o setor tem
--    critérios cadastrados, reaproveitando o mesmo caminho que já existia
--    pra setores sem critério (avaliacoes.nota preenchido, sem linhas em
--    avaliacao_notas).
--
-- 2) "Cliente não quer avaliar": quando o associado se recusa a dar uma nota,
--    o colaborador registra a recusa com um motivo obrigatório. Isso NÃO vai
--    para a tabela `avaliacoes` de propósito — entrar lá exigiria nota
--    obrigatória (NOT NULL) e poluiria as métricas de NPS (média, promotores/
--    neutros/detratores, % que virou reclamação) com registros sem nota.
--    Fica numa tabela própria, ligada ao mesmo associado/veículo/setor pra
--    manter o contexto de quando e onde a recusa aconteceu.
-- ============================================================================

CREATE TABLE IF NOT EXISTS avaliacoes_recusas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES veiculos(id) ON DELETE SET NULL,
  setor_id UUID REFERENCES setores(id),
  motivo TEXT NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_recusas_associado_id ON avaliacoes_recusas(associado_id);

ALTER TABLE avaliacoes_recusas ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão permissivo usado em `avaliacoes` (dado operacional do dia a
-- dia, não uma tabela de configuração restrita a admin).
DROP POLICY IF EXISTS "Autenticados podem ler/escrever recusas de avaliação" ON avaliacoes_recusas;
CREATE POLICY "Autenticados podem ler/escrever recusas de avaliação"
ON avaliacoes_recusas FOR ALL TO authenticated USING (true);
