// Fila de Avaliações Pendentes — helpers de leitura/normalização da planilha
// de atendimentos da Assistência 24h, e tipos compartilhados com o
// lançamento manual (Eventos). Ver supabase_migration_fila_avaliacoes.sql
// para o desenho das tabelas.

import Papa from 'papaparse';
import { maskPhone } from '@/lib/utils';

export type StatusPendencia = 'pendente' | 'contatado' | 'avaliado' | 'recusado' | 'sem_retorno' | 'descartado';

export const ROTULO_STATUS_PENDENCIA: Record<StatusPendencia, string> = {
  pendente: 'Pendente',
  contatado: 'Contatado',
  avaliado: 'Avaliado',
  recusado: 'Recusou avaliar',
  sem_retorno: 'Sem retorno',
  descartado: 'Descartado',
};

// Histórico imutável de uma pendência — mesmo padrão de IndicacaoEvento/
// ReclamacaoEvento (lib/indicacoes.ts / lib/reclamacoes.ts), adaptado pra
// esse domínio: quem pegou o caso, tentativas sem retorno, observações.
export type TipoEventoPendencia = 'criacao' | 'responsavel_alterado' | 'tentativa_sem_retorno' | 'observacao' | 'vinculado' | 'descartado';

export type PendenciaEvento = {
  id: string;
  pendencia_id: string;
  tipo: TipoEventoPendencia;
  autor_id: string | null;
  descricao: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
};

export async function buscarEventosPendencia(supabase: any, pendenciaId: string): Promise<PendenciaEvento[]> {
  const { data, error } = await supabase
    .from('avaliacao_pendencia_eventos')
    .select('*')
    .eq('pendencia_id', pendenciaId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Erro ao carregar histórico da pendência:', error);
    return [];
  }
  return data || [];
}

export function descreverEventoPendencia(evento: PendenciaEvento) {
  switch (evento.tipo) {
    case 'criacao':
      return evento.descricao || 'Pendência criada';
    case 'responsavel_alterado':
      return evento.valor_novo ? `Assumida por ${evento.valor_novo}` : 'Responsável removido';
    case 'tentativa_sem_retorno':
      return evento.descricao || 'Tentativa de contato sem retorno';
    case 'observacao':
      return 'Observação adicionada';
    case 'vinculado':
      return evento.descricao || 'Associado vinculado';
    case 'descartado':
      return 'Pendência descartada';
    default:
      return evento.descricao || 'Evento registrado';
  }
}

// Registra uma observação na linha do tempo da pendência (não sobrescreve as
// anteriores) e também atualiza avaliacao_pendencias.observacoes como atalho
// pra "última nota" — mesmo padrão de registrarObservacaoReclamacao
// (lib/reclamacoes.ts).
export async function registrarObservacaoPendencia(
  supabase: any,
  pendenciaId: string,
  texto: string,
  autorId: string | undefined
) {
  const [eventoRes, updateRes] = await Promise.all([
    supabase.from('avaliacao_pendencia_eventos').insert({
      pendencia_id: pendenciaId,
      tipo: 'observacao',
      autor_id: autorId,
      descricao: texto,
    }),
    supabase.from('avaliacao_pendencias').update({ observacoes: texto, updated_at: new Date().toISOString() }).eq('id', pendenciaId),
  ]);
  return eventoRes.error || updateRes.error || null;
}

// Quantas tentativas de contato sem sucesso até considerar "sem retorno
// definitivo" — usado só como referência visual na tela (não bloqueia nada).
export const LIMITE_TENTATIVAS = 3;

// Uma linha da planilha, já com as colunas identificadas pelo nome do
// cabeçalho (não pela posição) — robusto a reordenação de colunas, contanto
// que os nomes continuem os mesmos.
export type LinhaAtendimentoBruta = {
  data_atendimento: string; // dd/mm/yyyy, como vem na planilha
  atendente: string;
  beneficiario: string;
  placa: string; // já normalizada (só A-Z0-9, maiúsculo)
  situacao: string; // maiúsculo, como vem na planilha
  motivo: string;
  telefone_bruto: string;
  solicitante: string;
  produto: string;
  servico: string;
  representante: string;
};

const CABECALHO_ESPERADO = [
  'data do atendimento', 'atendente', 'nome do beneficiário', 'placa', 'situação',
  'motivo', 'telefone solicitante', 'solicitante', 'produto', 'serviço', 'representante',
];

// dd/mm/yyyy — usado tanto pra achar onde os dados terminam (rodapé "Total
// Relatório" não bate) quanto pra validar cada linha.
const REGEX_DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

function normalizarPlaca(placa: string) {
  return (placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function limpar(v: string | undefined) {
  return (v ?? '').trim();
}

// Lê o CSV exportado pelo sistema da Assistência 24h. O arquivo tem um
// título na primeira linha, o cabeçalho de verdade só na segunda, e um
// rodapé (Total Relatório / Filtros) depois dos dados — por isso não dá pra
// simplesmente tratar a primeira linha como cabeçalho nem parar no fim do
// arquivo por contagem de linha; localiza o cabeçalho pelo conteúdo e filtra
// as linhas de dados pela primeira coluna bater com uma data válida.
export function parseRelatorioAtendimento(csvText: string): LinhaAtendimentoBruta[] {
  const { data } = Papa.parse<string[]>(csvText, { delimiter: ';', skipEmptyLines: false });
  const linhas = data as string[][];

  const headerIdx = linhas.findIndex(r => limpar(r[0]).toLowerCase() === 'data do atendimento');
  if (headerIdx === -1) {
    throw new Error('Não encontrei a coluna "Data do atendimento" nesse arquivo. Confirme que é o relatório de atendimento exportado no formato padrão.');
  }
  const header = linhas[headerIdx].map(h => limpar(h).toLowerCase());

  const faltando = CABECALHO_ESPERADO.filter(nome => !header.includes(nome));
  if (faltando.length > 0) {
    throw new Error(`Faltam colunas esperadas nesse arquivo: ${faltando.join(', ')}.`);
  }

  const idx = Object.fromEntries(CABECALHO_ESPERADO.map(nome => [nome, header.indexOf(nome)]));

  return linhas
    .slice(headerIdx + 1)
    .filter(r => REGEX_DATA_BR.test(limpar(r[idx['data do atendimento']])))
    .map(r => ({
      data_atendimento: limpar(r[idx['data do atendimento']]),
      atendente: limpar(r[idx['atendente']]),
      beneficiario: limpar(r[idx['nome do beneficiário']]),
      placa: normalizarPlaca(r[idx['placa']]),
      situacao: limpar(r[idx['situação']]).toUpperCase(),
      motivo: limpar(r[idx['motivo']]),
      telefone_bruto: limpar(r[idx['telefone solicitante']]),
      solicitante: limpar(r[idx['solicitante']]),
      produto: limpar(r[idx['produto']]),
      servico: limpar(r[idx['serviço']]),
      representante: limpar(r[idx['representante']]),
    }));
}

// A planilha às vezes traz mais de um telefone na mesma célula (separados
// por "<br>"), placeholders de "sem telefone" ("-", "(00) 00000-0000") e
// números com pontuação estranha. Extrai só os dígitos, valida por
// tamanho (DDD + fixo/celular = 10 ou 11 dígitos) e reaplica a máscara
// padrão do sistema.
export function normalizarTelefones(bruto: string): string[] {
  if (!bruto) return [];
  const candidatos = bruto.split(/<br\s*\/?>/i).map(t => t.replace(/\D/g, ''));
  const validos = candidatos.filter(t => (t.length === 10 || t.length === 11) && !/^0+$/.test(t));
  const formatados = validos.map(maskPhone);
  return Array.from(new Set(formatados));
}

// Chave de deduplicação: mesma placa + mesma data + mesmo solicitante é
// tratado como o mesmo atendimento (mesmo que a planilha tenha exportado
// mais de uma linha pra ele, uma por serviço prestado). Cai pro nome do
// beneficiário quando não tem placa (raro, mas acontece em protocolo
// avulso), pra ainda gerar uma chave estável.
function chaveAgrupamento(linha: LinhaAtendimentoBruta) {
  const identificador = linha.placa || linha.beneficiario.toUpperCase();
  const solicitante = linha.solicitante.toUpperCase();
  return `${identificador}|${linha.data_atendimento}|${solicitante}`;
}

export type AtendimentoAgrupado = {
  chave_dedup: string;
  data_atendimento: string; // dd/mm/yyyy
  nome_beneficiario: string;
  nome_solicitante: string;
  placa: string;
  telefones: string[];
  situacoes: string[]; // todas as situações vistas no grupo (contexto)
  situacao_origem: string; // a que decide elegibilidade — ver escolherSituacao
  motivo_texto: string; // motivos únicos, concatenados
  servico_origem: string; // serviços únicos, concatenados
  produto_origem: string;
  atendente_origem: string;
  representante_origem: string;
  linhas_agrupadas: number;
};

// Entre as situações de um grupo, prioriza a mais "final": se qualquer linha
// do grupo está em algum status elegível (conta_como_elegivel), o grupo
// inteiro é tratado como elegível — ex: uma linha "Aguardando Check List" e
// outra "Finalizado" pro mesmo atendimento deve contar como finalizado.
function escolherSituacao(situacoes: string[], elegiveis: Set<string>) {
  const elegivel = situacoes.find(s => elegiveis.has(s));
  return elegivel || situacoes[situacoes.length - 1];
}

function concatenarUnicos(valores: string[]) {
  return Array.from(new Set(valores.filter(Boolean))).join(' + ');
}

// Agrupa as linhas cruas em atendimentos (ver chaveAgrupamento) e já marca
// qual situação representa o grupo. `situacoesElegiveis` é o conjunto de
// nomes (maiúsculo) configurados em Configurações como
// "conta_como_elegivel" — vem de atendimento_situacao.
export function agruparAtendimentos(
  linhas: LinhaAtendimentoBruta[],
  situacoesElegiveis: Set<string>
): AtendimentoAgrupado[] {
  const grupos = new Map<string, LinhaAtendimentoBruta[]>();
  for (const linha of linhas) {
    const chave = chaveAgrupamento(linha);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(linha);
    else grupos.set(chave, [linha]);
  }

  return Array.from(grupos.entries()).map(([chave, grupo]) => {
    const primeira = grupo[0];
    const telefones = Array.from(new Set(grupo.flatMap(l => normalizarTelefones(l.telefone_bruto))));
    return {
      chave_dedup: chave,
      data_atendimento: primeira.data_atendimento,
      nome_beneficiario: primeira.beneficiario,
      nome_solicitante: primeira.solicitante,
      placa: primeira.placa,
      telefones,
      situacoes: grupo.map(l => l.situacao),
      situacao_origem: escolherSituacao(grupo.map(l => l.situacao), situacoesElegiveis),
      motivo_texto: concatenarUnicos(grupo.map(l => l.motivo)),
      servico_origem: concatenarUnicos(grupo.map(l => l.servico)),
      produto_origem: concatenarUnicos(grupo.map(l => l.produto).filter(p => p && p !== 'Sem produto')) || primeira.produto,
      atendente_origem: concatenarUnicos(grupo.map(l => l.atendente)),
      representante_origem: concatenarUnicos(grupo.map(l => l.representante)),
      linhas_agrupadas: grupo.length,
    };
  });
}

// dd/mm/yyyy -> yyyy-mm-dd (formato de coluna DATE do Postgres).
export function dataBrParaISO(dataBr: string) {
  const [d, m, y] = dataBr.split('/');
  return `${y}-${m}-${d}`;
}
