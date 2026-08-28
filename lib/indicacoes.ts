// Constantes e helpers compartilhados entre as telas que mostram/editam
// indicações (Dashboard do associado e Painel de Indicações), para manter o
// vocabulário de status e o histórico de auditoria consistentes nos dois lugares.

export const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_tratativa: 'Em Tratativa',
  fechado: 'Fechado',
  sem_retorno: 'Sem Retorno',
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-800',
  em_tratativa: 'bg-blue-100 text-blue-800',
  fechado: 'bg-green-100 text-green-800',
  sem_retorno: 'bg-red-100 text-red-800',
};

// Quantos dias sem atualização para considerar uma indicação "parada".
// Mesmo limite usado no alerta do Dashboard Geral (MainDashboard.tsx).
export const DIAS_LIMITE_PARADA = 3;

export function labelStatus(status: string | null) {
  if (!status) return '—';
  return STATUS_LABELS[status] || status;
}

export type TipoEvento = 'criacao' | 'status_alterado' | 'responsavel_alterado' | 'observacao';

export type IndicacaoEvento = {
  id: string;
  indicacao_id: string;
  tipo: TipoEvento;
  autor_id: string | null;
  descricao: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
};

// Registra uma nova observação na linha do tempo da indicação (não sobrescreve
// as anteriores) e também atualiza o campo `observacoes` da indicação como
// atalho para "última nota", usado nas listagens.
export async function registrarObservacao(
  supabase: any,
  indicacaoId: string,
  texto: string,
  autorId: string | undefined
) {
  const [eventoRes, updateRes] = await Promise.all([
    supabase.from('indicacao_eventos').insert({
      indicacao_id: indicacaoId,
      tipo: 'observacao',
      autor_id: autorId,
      descricao: texto,
    }),
    supabase.from('indicacoes').update({ observacoes: texto }).eq('id', indicacaoId),
  ]);
  return eventoRes.error || updateRes.error || null;
}

export async function buscarEventosIndicacao(supabase: any, indicacaoId: string): Promise<IndicacaoEvento[]> {
  const { data, error } = await supabase
    .from('indicacao_eventos')
    .select('*')
    .eq('indicacao_id', indicacaoId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Erro ao carregar histórico da indicação:', error);
    return [];
  }
  return data || [];
}

export function descreverEvento(evento: IndicacaoEvento) {
  switch (evento.tipo) {
    case 'criacao':
      return evento.descricao || 'Indicação criada';
    case 'status_alterado':
      return `Status alterado: ${labelStatus(evento.valor_anterior)} → ${labelStatus(evento.valor_novo)}`;
    case 'responsavel_alterado':
      return evento.valor_novo ? 'Responsável reatribuído' : 'Responsável removido';
    case 'observacao':
      return 'Observação adicionada';
    default:
      return evento.descricao || 'Evento registrado';
  }
}
