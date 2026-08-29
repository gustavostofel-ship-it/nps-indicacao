// Helpers de auditoria para edições de dados cadastrais do associado —
// mesmo princípio de lib/indicacoes.ts, aplicado a associado_eventos.

export type AssociadoEvento = {
  id: string;
  associado_id: string;
  autor_id: string | null;
  campo: 'criacao' | 'nome_completo' | 'cpf' | 'telefone';
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
};

export async function buscarEventosAssociado(supabase: any, associadoId: string): Promise<AssociadoEvento[]> {
  const { data, error } = await supabase
    .from('associado_eventos')
    .select('*')
    .eq('associado_id', associadoId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Erro ao carregar histórico do associado:', error);
    return [];
  }
  return data || [];
}

export function descreverEventoAssociado(evento: AssociadoEvento) {
  switch (evento.campo) {
    case 'criacao':
      return `Cadastrado como "${evento.valor_novo}"`;
    case 'nome_completo':
      return `Nome alterado: "${evento.valor_anterior}" → "${evento.valor_novo}"`;
    case 'cpf':
      return `CPF alterado: ${evento.valor_anterior} → ${evento.valor_novo}`;
    case 'telefone':
      return evento.valor_anterior
        ? `Telefone alterado: ${evento.valor_anterior} → ${evento.valor_novo || '—'}`
        : `Telefone cadastrado: ${evento.valor_novo}`;
    default:
      return 'Dado alterado';
  }
}
