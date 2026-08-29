// Constantes e helpers compartilhados entre as telas que mostram/editam
// indicações (Dashboard do associado e Painel de Indicações), para manter o
// vocabulário de status e o histórico de auditoria consistentes nos dois lugares.

// Status deixou de ser um ENUM fixo (era pendente/em_tratativa/fechado/
// sem_retorno) e virou uma tabela configurável (indicacao_status), editável
// em Configurações. As telas agora carregam a lista com buscarStatusIndicacao
// em vez de usar uma lista fixa.

export type StatusIndicacao = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  conta_como_fechado: boolean;
  ativo: boolean;
};

// Paleta fixa de cores — o Tailwind precisa das classes escritas por extenso
// em algum lugar do código pra incluí-las no build; por isso a cor de cada
// status é uma chave desta paleta, não um hex livre vindo do banco.
export const CORES_STATUS: Record<string, { badge: string; ring: string; dot: string; hex: string }> = {
  amarelo:  { badge: 'bg-yellow-100 text-yellow-800',  ring: 'ring-yellow-200',  dot: 'bg-yellow-400',  hex: '#eab308' },
  azul:     { badge: 'bg-blue-100 text-blue-800',      ring: 'ring-blue-200',    dot: 'bg-blue-500',    hex: '#3b82f6' },
  verde:    { badge: 'bg-green-100 text-green-800',    ring: 'ring-green-200',   dot: 'bg-green-500',   hex: '#22c55e' },
  vermelho: { badge: 'bg-red-100 text-red-800',        ring: 'ring-red-200',     dot: 'bg-red-500',     hex: '#ef4444' },
  roxo:     { badge: 'bg-purple-100 text-purple-800',  ring: 'ring-purple-200',  dot: 'bg-purple-500',  hex: '#a855f7' },
  cinza:    { badge: 'bg-slate-100 text-slate-700',    ring: 'ring-slate-200',   dot: 'bg-slate-400',   hex: '#64748b' },
};
export const CHAVES_CORES_STATUS = Object.keys(CORES_STATUS);

export function corStatus(cor: string) {
  return CORES_STATUS[cor] || CORES_STATUS.cinza;
}

// Quantos dias sem atualização para considerar uma indicação "parada".
// Mesmo limite usado no alerta do Dashboard Geral (MainDashboard.tsx).
export const DIAS_LIMITE_PARADA = 3;

export async function buscarStatusIndicacao(supabase: any, incluirInativos = false): Promise<StatusIndicacao[]> {
  let query = supabase.from('indicacao_status').select('*').order('ordem', { ascending: true });
  if (!incluirInativos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar status de indicação:', error);
    return [];
  }
  return data || [];
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
      // O trigger que grava esse evento já salva o NOME do status (não uma
      // chave de enum), então não precisa traduzir nada aqui.
      return `Status alterado: ${evento.valor_anterior || '—'} → ${evento.valor_novo || '—'}`;
    case 'responsavel_alterado':
      return evento.valor_novo ? 'Responsável reatribuído' : 'Responsável removido';
    case 'observacao':
      return 'Observação adicionada';
    default:
      return evento.descricao || 'Evento registrado';
  }
}
