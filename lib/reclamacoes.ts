// Constantes e helpers compartilhados entre as telas que mostram/editam
// reclamações (ficha do associado e Painel de Reclamações) — mesmo
// vocabulário/arquitetura de lib/indicacoes.ts, adaptado pra esse domínio.
//
// Reclamação = tratativa de uma avaliação ruim (nota 0-6) ou de um caso
// avulso reportado direto pelo associado. Tem protocolo próprio, status
// configurável (Configurações) e histórico de eventos imutável — igual
// Indicações.

import { CORES_STATUS, CHAVES_CORES_STATUS, corStatus, normalizarStatusEmbutido } from '@/lib/indicacoes';

// Reexportados: a paleta de cores e a normalização de embed são genéricas o
// bastante pra servir os dois domínios sem duplicar código.
export { CORES_STATUS, CHAVES_CORES_STATUS, corStatus, normalizarStatusEmbutido };

export type StatusReclamacao = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  conta_como_resolvido: boolean;
  ativo: boolean;
};

// Mesmo limite de "parada" usado em Indicações — reclamação sem movimento
// há esse tempo entra no alerta do Dashboard.
export const DIAS_LIMITE_PARADA = 3;

export async function buscarStatusReclamacao(supabase: any, incluirInativos = false): Promise<StatusReclamacao[]> {
  let query = supabase.from('reclamacao_status').select('*').order('ordem', { ascending: true });
  if (!incluirInativos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar status de reclamação:', error);
    return [];
  }
  return data || [];
}

export type MotivoReclamacao = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

export async function buscarMotivosReclamacao(supabase: any, incluirInativos = false): Promise<MotivoReclamacao[]> {
  let query = supabase.from('reclamacao_motivo').select('*').order('ordem', { ascending: true });
  if (!incluirInativos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar motivos de reclamação:', error);
    return [];
  }
  return data || [];
}

export type TipoEventoReclamacao = 'criacao' | 'status_alterado' | 'responsavel_alterado' | 'observacao';

export type ReclamacaoEvento = {
  id: string;
  reclamacao_id: string;
  tipo: TipoEventoReclamacao;
  autor_id: string | null;
  descricao: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
};

// Registra uma nova observação na linha do tempo da reclamação (não
// sobrescreve as anteriores) e também atualiza o campo `observacoes` da
// reclamação como atalho pra "última nota", usado nas listagens.
export async function registrarObservacaoReclamacao(
  supabase: any,
  reclamacaoId: string,
  texto: string,
  autorId: string | undefined
) {
  const [eventoRes, updateRes] = await Promise.all([
    supabase.from('reclamacao_eventos').insert({
      reclamacao_id: reclamacaoId,
      tipo: 'observacao',
      autor_id: autorId,
      descricao: texto,
    }),
    supabase.from('reclamacoes').update({ observacoes: texto }).eq('id', reclamacaoId),
  ]);
  return eventoRes.error || updateRes.error || null;
}

export async function buscarEventosReclamacao(supabase: any, reclamacaoId: string): Promise<ReclamacaoEvento[]> {
  // Mais recente primeiro — o topo da linha do tempo deve ser sempre a
  // última atualização, não a criação original.
  const { data, error } = await supabase
    .from('reclamacao_eventos')
    .select('*')
    .eq('reclamacao_id', reclamacaoId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Erro ao carregar histórico da reclamação:', error);
    return [];
  }
  return data || [];
}

export function descreverEventoReclamacao(evento: ReclamacaoEvento) {
  switch (evento.tipo) {
    case 'criacao':
      return evento.descricao || 'Reclamação aberta';
    case 'status_alterado':
      return `Status alterado: ${evento.valor_anterior || '—'} → ${evento.valor_novo || '—'}`;
    case 'responsavel_alterado':
      return evento.valor_novo ? 'Responsável reatribuído' : 'Responsável removido';
    case 'observacao':
      return 'Observação adicionada';
    default:
      return evento.descricao || 'Evento registrado';
  }
}
