-- ============================================================================
-- Migração: Fila de Avaliações Pendentes (import Assistência 24h + Eventos)
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto em produção).
--
-- Contexto: hoje só duas fontes geram demanda de avaliação NPS — a planilha
-- de atendimentos da Assistência 24h (formato fixo, ver
-- "relatorio_de_atendimento.csv") e o setor de Eventos, que até agora mandava
-- um formulário por e-mail depois de cada atendimento. A ideia é substituir
-- os dois por uma fila única: a planilha é importada (Assistência 24h) e o
-- Eventos passa a lançar cada atendimento direto no sistema (aba nova),
-- ambos caindo na mesma tabela `avaliacao_pendencias` pra virar contato →
-- avaliação (ou recusa).
--
-- 1) atendimento_situacao — as "Situação" que aparecem na planilha da
--    Assistência 24h (Finalizado, Aguardando Check List, Cancelado, etc).
--    Configurável em Configurações, igual indicacao_status/reclamacao_status:
--    cada uma tem uma flag `conta_como_elegivel` que decide se aquela
--    situação vira pendência de avaliação ao importar (só quem já foi
--    atendido de verdade deveria ser perguntado).
-- 2) atendimento_motivo — lista configurável usada no lançamento manual do
--    setor Eventos (tipos de sinistro: Colisão, Roubo, Furto...). A
--    Assistência 24h não usa essa tabela — o motivo dela vem solto da própria planilha
--    (avaliacao_pendencias.motivo_texto), porque é um vocabulário que não é
--    a Girow quem controla.
-- 3) avaliacao_pendencias — a fila em si. Uma linha = um atendimento (ou um
--    grupo de linhas da planilha que são o mesmo atendimento, ver
--    `linhas_agrupadas`) esperando alguém ligar pro associado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS atendimento_situacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'cinza', -- mesma paleta fixa de CORES_STATUS (lib/indicacoes.ts)
  ordem INTEGER NOT NULL DEFAULT 0,
  conta_como_elegivel BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE atendimento_situacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados podem ver atendimento_situacao" ON atendimento_situacao;
CREATE POLICY "Todos autenticados podem ver atendimento_situacao"
ON atendimento_situacao FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Apenas admins podem modificar atendimento_situacao" ON atendimento_situacao;
CREATE POLICY "Apenas admins podem modificar atendimento_situacao"
ON atendimento_situacao FOR ALL TO authenticated USING (is_admin());

-- Seed com os valores exatos observados na planilha atual da Assistência
-- 24h. Todas nascem elegíveis por padrão — se o atendimento chegou a entrar
-- na planilha, o colaborador já considera que vale ligar pra avaliar (ver
-- decisão no chat). Ajustável em Configurações a qualquer momento.
INSERT INTO atendimento_situacao (nome, cor, ordem, conta_como_elegivel)
SELECT * FROM (VALUES
  ('FINALIZADO', 'verde', 0, true),
  ('AGUARDANDO CHECK LIST', 'amarelo', 1, true),
  ('PRESTADOR A CAMINHO', 'azul', 2, true),
  ('CHECK LIST NAO ENVIADO', 'amarelo', 3, true),
  ('PROTOCOLO ABERTO', 'cinza', 4, true),
  ('CANCELADO', 'vermelho', 5, true),
  ('CANCELADO COM SAIDA', 'vermelho', 6, true)
) AS v(nome, cor, ordem, conta_como_elegivel)
WHERE NOT EXISTS (SELECT 1 FROM atendimento_situacao);

CREATE TABLE IF NOT EXISTS atendimento_motivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE atendimento_motivo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados podem ver atendimento_motivo" ON atendimento_motivo;
CREATE POLICY "Todos autenticados podem ver atendimento_motivo"
ON atendimento_motivo FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Apenas admins podem modificar atendimento_motivo" ON atendimento_motivo;
CREATE POLICY "Apenas admins podem modificar atendimento_motivo"
ON atendimento_motivo FOR ALL TO authenticated USING (is_admin());

-- O setor "Eventos" aqui é sinistro (associação de proteção veicular, não
-- evento social) — tipos de sinistro cobertos. Editável em Configurações a
-- qualquer momento.
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
WHERE NOT EXISTS (SELECT 1 FROM atendimento_motivo);

CREATE TABLE IF NOT EXISTS avaliacao_pendencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL CHECK (origem IN ('assistencia_24h', 'eventos', 'manual')),
  setor_id UUID REFERENCES setores(id),

  -- Nulos até alguém vincular manualmente (placa da planilha não bateu com
  -- nenhum veículo cadastrado) — ver decisão no chat, não cria associado
  -- sozinho.
  associado_id UUID REFERENCES associados(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES veiculos(id) ON DELETE SET NULL,

  -- Dados crus da origem, pra dar contexto pro colaborador antes de ligar
  -- mesmo antes/sem vincular um associado.
  nome_beneficiario TEXT,
  nome_solicitante TEXT,
  placa TEXT,
  telefone_principal TEXT,
  telefones_adicionais TEXT[] NOT NULL DEFAULT '{}',
  data_atendimento DATE,

  motivo_id UUID REFERENCES atendimento_motivo(id), -- usado no lançamento manual (Eventos)
  motivo_texto TEXT,                                 -- motivo cru da planilha (Assistência 24h)
  situacao_origem TEXT,
  atendente_origem TEXT,
  produto_origem TEXT,
  servico_origem TEXT,
  representante_origem TEXT,

  -- Quantas linhas da planilha foram agrupadas nessa pendência (mesma
  -- placa+data+solicitante = mesmo atendimento, ver decisão no chat).
  linhas_agrupadas INTEGER NOT NULL DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'contatado', 'avaliado', 'recusado', 'sem_retorno', 'descartado')),
  tentativas INTEGER NOT NULL DEFAULT 0,

  avaliacao_id UUID REFERENCES avaliacoes(id) ON DELETE SET NULL,
  avaliacao_recusa_id UUID REFERENCES avaliacoes_recusas(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES auth.users(id),

  -- Chave de deduplicação (placa|data|solicitante normalizados) — permite
  -- reimportar uma planilha com período sobreposto sem duplicar pendência.
  -- NULL é permitido (lançamento manual não usa isso) — Postgres não trata
  -- múltiplos NULLs como conflito de UNIQUE.
  chave_dedup TEXT UNIQUE,
  lote_importacao_id UUID,

  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_avaliacao_pendencias_status ON avaliacao_pendencias(status);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pendencias_associado_id ON avaliacao_pendencias(associado_id);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pendencias_setor_id ON avaliacao_pendencias(setor_id);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pendencias_lote ON avaliacao_pendencias(lote_importacao_id);

ALTER TABLE avaliacao_pendencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados podem ler/escrever avaliacao_pendencias" ON avaliacao_pendencias;
CREATE POLICY "Autenticados podem ler/escrever avaliacao_pendencias"
ON avaliacao_pendencias FOR ALL TO authenticated USING (true);
