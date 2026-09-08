-- ============================================================================
-- Migração: histórico de eventos + observações na Fila de Avaliações
-- Pendentes. Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- Mesmo padrão de indicacao_eventos/reclamacao_eventos: histórico imutável
-- de auditoria (quem pegou a pendência, tentativas sem retorno, observações
-- adicionadas), pra dar suporte ao modal de detalhe da pendência (responsável,
-- histórico de contato, observações).
-- ============================================================================

ALTER TABLE avaliacao_pendencias ADD COLUMN IF NOT EXISTS observacoes TEXT;

CREATE TABLE IF NOT EXISTS avaliacao_pendencia_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id UUID NOT NULL REFERENCES avaliacao_pendencias(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'criacao', 'responsavel_alterado', 'tentativa_sem_retorno', 'observacao', 'vinculado', 'descartado'
  )),
  autor_id UUID REFERENCES auth.users(id),
  descricao TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_avaliacao_pendencia_eventos_pendencia_id ON avaliacao_pendencia_eventos(pendencia_id);

ALTER TABLE avaliacao_pendencia_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados podem ler/escrever avaliacao_pendencia_eventos" ON avaliacao_pendencia_eventos;
CREATE POLICY "Autenticados podem ler/escrever avaliacao_pendencia_eventos"
ON avaliacao_pendencia_eventos FOR ALL TO authenticated USING (true);
