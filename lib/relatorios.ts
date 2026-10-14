// Montagem dos relatórios exportáveis (Fila NPS, Avaliações, Indicações,
// Reclamações). Cada função busca TUDO do período (paginando), cruza com
// associado/veículo/setor/colaborador e devolve abas já no formato do motor
// de exportação (lib/exportacao.ts) — com colunas auxiliares pra agrupar
// (Ano-Mês, classificação, resultado do contato…) e um resumo de indicadores.

import {
  AbaExport, SecaoResumo, RelatorioExcel, buscarTodasPaginas, emLotes,
  formatarData, formatarHora, anoMes, diaDaSemana, diasEntre,
} from '@/lib/exportacao';
import { classificarNota, resumirNotas, percentual } from '@/lib/nps';
import {
  FiltrosPendencias, aplicarFiltrosPendencias, resumirPendencias, resultadoDoContato,
  ROTULO_STATUS_PENDENCIA, STATUS_PENDENCIA_LISTA, StatusPendencia, descreverEventoPendencia, PendenciaEvento,
} from '@/lib/pendencias';

export type Usuario = { id: string; nome: string };

export type ContextoRelatorio = {
  usuarios: Usuario[];
  geradoPor?: string;
};

// Período em ISO (início e fim do dia já convertidos) + setor — usado pelas
// consultas de avaliações/indicações/reclamações do Dashboard Geral.
export type FiltroGeral = {
  inicioISO?: string;
  fimISO?: string;
  setorId?: string;
  rotuloPeriodo: string;
  rotuloSetor: string;
};

const um = (x: any) => (Array.isArray(x) ? x[0] : x) ?? null;

function mapaUsuarios(usuarios: Usuario[]) {
  return new Map(usuarios.map(u => [u.id, u.nome]));
}

const fmtNum = (n: number | null, casas = 1) => (n === null ? '—' : n.toFixed(casas).replace('.', ','));

function nomeArquivoData() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Avaliações
// ---------------------------------------------------------------------------

async function montarAvaliacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio) {
  const brutas = await buscarTodasPaginas<any>((de, ate) => {
    let q = supabase.from('avaliacoes').select(`
      id, nota, data_avaliacao, comentario, usuario_id, setor_id,
      setor:setores(nome),
      associado:associados(nome_completo, cpf, telefone),
      veiculo:veiculos(placa, modelo),
      avaliacao_notas(nota, criterio:criterios_avaliacao(nome))
    `);
    if (f.inicioISO) q = q.gte('data_avaliacao', f.inicioISO);
    if (f.fimISO) q = q.lte('data_avaliacao', f.fimISO);
    if (f.setorId) q = q.eq('setor_id', f.setorId);
    return q.order('data_avaliacao', { ascending: true }).order('id').range(de, ate);
  });

  const nomes = mapaUsuarios(ctx.usuarios);
  const linhas: Record<string, any>[] = [];
  const linhasCriterios: Record<string, any>[] = [];

  for (const a of brutas) {
    const assoc = um(a.associado);
    const vei = um(a.veiculo);
    const setor = um(a.setor)?.nome || '';
    const notasCrit: any[] = a.avaliacao_notas || [];
    const nota = Number(a.nota);

    linhas.push({
      id: a.id,
      data: a.data_avaliacao,
      hora: formatarHora(a.data_avaliacao),
      anoMes: anoMes(a.data_avaliacao),
      diaSemana: diaDaSemana(a.data_avaliacao),
      setor,
      associado: assoc?.nome_completo || '',
      cpf: assoc?.cpf || '',
      telefone: assoc?.telefone || '',
      placa: vei?.placa || '',
      modelo: vei?.modelo || '',
      nota,
      classificacao: classificarNota(nota),
      tipo: notasCrit.length > 0 ? 'Por critérios' : 'Nota geral',
      qtdCriterios: notasCrit.length,
      comentario: a.comentario || '',
      registradoPor: nomes.get(a.usuario_id) || '',
    });

    for (const n of notasCrit) {
      linhasCriterios.push({
        avaliacaoId: a.id,
        data: a.data_avaliacao,
        setor,
        associado: assoc?.nome_completo || '',
        criterio: um(n.criterio)?.nome || '',
        nota: Number(n.nota),
      });
    }
  }

  const abaAvaliacoes: AbaExport = {
    nome: 'Avaliações',
    tabela: 'tbl_Avaliacoes',
    descricao: 'Uma linha por avaliação NPS registrada no período.',
    colunas: [
      { cabecalho: 'ID da avaliação', chave: 'id', descricao: 'Identificador único (liga com a aba "Notas por critério").' },
      { cabecalho: 'Data', chave: 'data', tipo: 'data', descricao: 'Dia em que a avaliação foi registrada.' },
      { cabecalho: 'Hora', chave: 'hora', descricao: 'Horário do registro (hh:mm).' },
      { cabecalho: 'Ano-Mês', chave: 'anoMes', descricao: 'Mês da avaliação no formato AAAA-MM — use pra agrupar por mês.' },
      { cabecalho: 'Dia da semana', chave: 'diaSemana', descricao: 'Dia da semana da avaliação.' },
      { cabecalho: 'Setor', chave: 'setor', descricao: 'Setor avaliado.' },
      { cabecalho: 'Associado', chave: 'associado', descricao: 'Nome do associado que avaliou.' },
      { cabecalho: 'CPF', chave: 'cpf', descricao: 'CPF do associado (pode estar em branco).' },
      { cabecalho: 'Telefone', chave: 'telefone', descricao: 'Telefone cadastrado do associado.' },
      { cabecalho: 'Placa', chave: 'placa', descricao: 'Placa do veículo da avaliação.' },
      { cabecalho: 'Modelo', chave: 'modelo', descricao: 'Modelo do veículo.' },
      { cabecalho: 'Nota', chave: 'nota', tipo: 'numero', descricao: 'Nota de 0 a 10 (média dos critérios, quando avaliada por critérios).' },
      { cabecalho: 'Classificação NPS', chave: 'classificacao', descricao: 'Promotor (9-10), Neutro (7-8) ou Detrator (0-6).' },
      { cabecalho: 'Tipo de avaliação', chave: 'tipo', descricao: 'Por critérios ou nota geral única.' },
      { cabecalho: 'Qtd. de critérios', chave: 'qtdCriterios', tipo: 'inteiro', descricao: 'Quantos critérios foram notas individualmente.' },
      { cabecalho: 'Comentário', chave: 'comentario', quebrar: true, largura: 50, descricao: 'Comentário livre registrado junto com a nota.' },
      { cabecalho: 'Registrado por', chave: 'registradoPor', descricao: 'Colaborador que lançou a avaliação.' },
    ],
    linhas,
  };

  const abaCriterios: AbaExport = {
    nome: 'Notas por critério',
    tabela: 'tbl_NotasCriterio',
    descricao: 'Uma linha por critério avaliado (formato longo — ideal pra tabela dinâmica por critério).',
    colunas: [
      { cabecalho: 'ID da avaliação', chave: 'avaliacaoId', descricao: 'Liga com a aba "Avaliações".' },
      { cabecalho: 'Data', chave: 'data', tipo: 'data', descricao: 'Dia da avaliação.' },
      { cabecalho: 'Setor', chave: 'setor', descricao: 'Setor avaliado.' },
      { cabecalho: 'Associado', chave: 'associado', descricao: 'Associado que avaliou.' },
      { cabecalho: 'Critério', chave: 'criterio', descricao: 'Nome do critério avaliado.' },
      { cabecalho: 'Nota do critério', chave: 'nota', tipo: 'inteiro', descricao: 'Nota de 0 a 10 dada a esse critério.' },
    ],
    linhas: linhasCriterios,
  };

  // ---- resumo ----
  const notas = linhas.map(l => l.nota as number);
  const r = resumirNotas(notas);
  const indicadores: SecaoResumo = {
    titulo: 'Avaliações (NPS)',
    nota: 'NPS = % de promotores − % de detratores (vai de -100 a 100). Promotor 9-10, neutro 7-8, detrator 0-6.',
    cabecalhos: ['Indicador', 'Valor'],
    linhas: [
      ['Total de avaliações', String(r.total)],
      ['Nota média', fmtNum(r.media)],
      ['Promotores (9-10)', `${r.promotores} (${percentual(r.promotores, r.total)}%)`],
      ['Neutros (7-8)', `${r.neutros} (${percentual(r.neutros, r.total)}%)`],
      ['Detratores (0-6)', `${r.detratores} (${percentual(r.detratores, r.total)}%)`],
      ['NPS', r.nps === null ? '—' : String(r.nps)],
    ],
  };

  const porSetor = new Map<string, number[]>();
  for (const l of linhas) {
    const chave = l.setor || '(sem setor)';
    porSetor.set(chave, [...(porSetor.get(chave) || []), l.nota]);
  }
  const secSetor: SecaoResumo = {
    titulo: 'Avaliações por setor',
    cabecalhos: ['Setor', 'Avaliações', 'Nota média', 'Promotores', 'Neutros', 'Detratores', 'NPS'],
    formatos: ['texto', 'inteiro', 'numero', 'inteiro', 'inteiro', 'inteiro', 'inteiro'],
    linhas: Array.from(porSetor.entries())
      .map(([setor, ns]) => ({ setor, r: resumirNotas(ns) }))
      .sort((a, b) => b.r.total - a.r.total)
      .map(({ setor, r: x }) => [setor, x.total, x.media, x.promotores, x.neutros, x.detratores, x.nps]),
  };

  return { abas: [abaAvaliacoes, abaCriterios], resumo: [indicadores, secSetor] };
}

const DICAS_AVALIACOES = [
  'Tabela dinâmica: clique em qualquer célula da aba "Avaliações" → Inserir → Tabela Dinâmica. Cada aba já é uma Tabela do Excel, então não precisa selecionar intervalo.',
  'NPS por mês: Linhas = Ano-Mês, Colunas = Classificação NPS, Valores = contagem de ID da avaliação.',
  'Média por setor ou por colaborador: Linhas = Setor (ou Registrado por), Valores = média de Nota.',
  'Pontos fracos por critério: na aba "Notas por critério", Linhas = Critério, Valores = média de Nota do critério.',
  'Detratores pra tratar: filtre Classificação NPS = Detrator e leia a coluna Comentário.',
];

// ---------------------------------------------------------------------------
// Indicações
// ---------------------------------------------------------------------------

async function montarIndicacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio) {
  const brutas = await buscarTodasPaginas<any>((de, ate) => {
    let q = supabase.from('indicacoes').select(`
      id, protocolo, nome_indicado, telefone_indicado, data_indicacao, updated_at, data_fechamento,
      observacoes, usuario_id, responsavel_id,
      status:indicacao_status(nome, conta_como_fechado),
      associado:associados(nome_completo, cpf),
      avaliacao:avaliacoes(nota, setor:setores(nome))
    `);
    if (f.inicioISO) q = q.gte('data_indicacao', f.inicioISO);
    if (f.fimISO) q = q.lte('data_indicacao', f.fimISO);
    return q.order('data_indicacao', { ascending: true }).order('id').range(de, ate);
  });

  const nomes = mapaUsuarios(ctx.usuarios);
  const agora = new Date();

  const linhas = brutas.map(i => {
    const status = um(i.status);
    const assoc = um(i.associado);
    const av = um(i.avaliacao);
    const fechada = !!status?.conta_como_fechado;
    return {
      protocolo: i.protocolo || '',
      data: i.data_indicacao,
      hora: formatarHora(i.data_indicacao),
      anoMes: anoMes(i.data_indicacao),
      indicado: i.nome_indicado || '',
      telefoneIndicado: i.telefone_indicado || '',
      associado: assoc?.nome_completo || '',
      cpf: assoc?.cpf || '',
      setorOrigem: um(av?.setor)?.nome || '',
      notaOrigem: av?.nota !== undefined && av?.nota !== null ? Number(av.nota) : null,
      status: status?.nome || '',
      fechada: fechada ? 'Sim' : 'Não',
      responsavel: nomes.get(i.responsavel_id) || '',
      registradoPor: nomes.get(i.usuario_id) || '',
      dataFechamento: i.data_fechamento,
      diasAteFechar: fechada && i.data_fechamento ? diasEntre(i.data_indicacao, i.data_fechamento) : null,
      diasParada: fechada ? null : diasEntre(i.updated_at || i.data_indicacao, agora),
      ultimaAtualizacao: i.updated_at,
      observacoes: i.observacoes || '',
    };
  });

  const aba: AbaExport = {
    nome: 'Indicações',
    tabela: 'tbl_Indicacoes',
    descricao: 'Uma linha por indicação registrada no período.',
    colunas: [
      { cabecalho: 'Protocolo', chave: 'protocolo', descricao: 'Número do protocolo da indicação (IND-AAAA-NNNNNN).' },
      { cabecalho: 'Data da indicação', chave: 'data', tipo: 'data', descricao: 'Dia em que a indicação foi registrada.' },
      { cabecalho: 'Hora', chave: 'hora', descricao: 'Horário do registro (hh:mm).' },
      { cabecalho: 'Ano-Mês', chave: 'anoMes', descricao: 'Mês no formato AAAA-MM — use pra agrupar por mês.' },
      { cabecalho: 'Indicado', chave: 'indicado', descricao: 'Nome da pessoa indicada.' },
      { cabecalho: 'Telefone do indicado', chave: 'telefoneIndicado', descricao: 'Telefone da pessoa indicada.' },
      { cabecalho: 'Associado que indicou', chave: 'associado', descricao: 'Quem fez a indicação.' },
      { cabecalho: 'CPF do associado', chave: 'cpf', descricao: 'CPF de quem indicou (pode estar em branco).' },
      { cabecalho: 'Setor da avaliação de origem', chave: 'setorOrigem', descricao: 'Setor da avaliação que originou a indicação (em branco se avulsa).' },
      { cabecalho: 'Nota de origem', chave: 'notaOrigem', tipo: 'numero', descricao: 'Nota da avaliação que originou a indicação.' },
      { cabecalho: 'Status', chave: 'status', descricao: 'Etapa atual da indicação.' },
      { cabecalho: 'Fechada?', chave: 'fechada', descricao: 'Sim se o status conta como fechado (virou negócio).' },
      { cabecalho: 'Responsável', chave: 'responsavel', descricao: 'Quem está acompanhando a indicação.' },
      { cabecalho: 'Registrada por', chave: 'registradoPor', descricao: 'Colaborador que registrou.' },
      { cabecalho: 'Data de fechamento', chave: 'dataFechamento', tipo: 'data', descricao: 'Dia em que foi fechada.' },
      { cabecalho: 'Dias até fechar', chave: 'diasAteFechar', tipo: 'numero', descricao: 'Dias entre a indicação e o fechamento.' },
      { cabecalho: 'Dias parada', chave: 'diasParada', tipo: 'numero', descricao: 'Para indicações abertas: dias sem movimentação até a exportação.' },
      { cabecalho: 'Última atualização', chave: 'ultimaAtualizacao', tipo: 'datahora', descricao: 'Último movimento registrado.' },
      { cabecalho: 'Observações', chave: 'observacoes', quebrar: true, largura: 50, descricao: 'Última observação registrada.' },
    ],
    linhas,
  };

  const total = linhas.length;
  const fechadas = linhas.filter(l => l.fechada === 'Sim').length;
  const tempos = linhas.map(l => l.diasAteFechar).filter((n): n is number => n !== null);
  const tempoMedio = tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  const indicadores: SecaoResumo = {
    titulo: 'Indicações',
    nota: 'Conversão = indicações fechadas ÷ total de indicações do período.',
    cabecalhos: ['Indicador', 'Valor'],
    linhas: [
      ['Total de indicações', String(total)],
      ['Fechadas', `${fechadas} (${percentual(fechadas, total)}%)`],
      ['Em aberto', `${total - fechadas} (${percentual(total - fechadas, total)}%)`],
      ['Tempo médio até fechar (dias)', fmtNum(tempoMedio)],
    ],
  };

  const porStatus = new Map<string, number>();
  for (const l of linhas) porStatus.set(l.status || '(sem status)', (porStatus.get(l.status || '(sem status)') || 0) + 1);
  const secStatus: SecaoResumo = {
    titulo: 'Indicações por status',
    cabecalhos: ['Status', 'Quantidade', '% do total'],
    formatos: ['texto', 'inteiro', 'percentual'],
    linhas: Array.from(porStatus.entries()).sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, n, total > 0 ? n / total : 0]),
  };

  return { abas: [aba], resumo: [indicadores, secStatus] };
}

const DICAS_INDICACOES = [
  'Tabela dinâmica: clique em qualquer célula da aba "Indicações" → Inserir → Tabela Dinâmica.',
  'Conversão por responsável: Linhas = Responsável, Colunas = Fechada?, Valores = contagem de Protocolo.',
  'Indicações que nascem de avaliações boas? Linhas = Setor da avaliação de origem, Valores = contagem e média de Nota de origem.',
  'Funil: Linhas = Status, Valores = contagem de Protocolo.',
  'Indicações esquecidas: filtre Fechada? = Não e ordene por Dias parada (maior primeiro).',
];

// ---------------------------------------------------------------------------
// Reclamações
// ---------------------------------------------------------------------------

async function montarReclamacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio) {
  const brutas = await buscarTodasPaginas<any>((de, ate) => {
    // Reclamação não tem setor próprio — o setor vem da avaliação de origem.
    // Com filtro de setor precisa de INNER JOIN (senão o PostgREST não deixa
    // filtrar pela tabela embutida); sem filtro, LEFT JOIN pra não perder as
    // reclamações avulsas (sem avaliação por trás).
    let q = supabase.from('reclamacoes').select(`
      id, protocolo, descricao, observacoes, data_abertura, updated_at, data_resolucao,
      aberto_por, responsavel_atual_id,
      status:reclamacao_status(nome, conta_como_resolvido),
      motivo:reclamacao_motivo(nome),
      associado:associados(nome_completo, cpf),
      avaliacao:avaliacoes${f.setorId ? '!inner' : ''}(nota, setor_id, setor:setores(nome))
    `);
    if (f.setorId) q = q.eq('avaliacao.setor_id', f.setorId);
    if (f.inicioISO) q = q.gte('data_abertura', f.inicioISO);
    if (f.fimISO) q = q.lte('data_abertura', f.fimISO);
    return q.order('data_abertura', { ascending: true }).order('id').range(de, ate);
  });

  const nomes = mapaUsuarios(ctx.usuarios);
  const agora = new Date();

  const linhas = brutas.map(r => {
    const status = um(r.status);
    const assoc = um(r.associado);
    const av = um(r.avaliacao);
    const resolvida = !!status?.conta_como_resolvido;
    return {
      protocolo: r.protocolo || '',
      data: r.data_abertura,
      hora: formatarHora(r.data_abertura),
      anoMes: anoMes(r.data_abertura),
      associado: assoc?.nome_completo || '',
      cpf: assoc?.cpf || '',
      motivo: um(r.motivo)?.nome || '',
      descricao: r.descricao || '',
      origem: av ? 'Avaliação' : 'Avulsa',
      setorOrigem: um(av?.setor)?.nome || '',
      notaOrigem: av?.nota !== undefined && av?.nota !== null ? Number(av.nota) : null,
      status: status?.nome || '',
      resolvida: resolvida ? 'Sim' : 'Não',
      responsavel: nomes.get(r.responsavel_atual_id) || '',
      abertaPor: nomes.get(r.aberto_por) || '',
      dataResolucao: r.data_resolucao,
      diasParaResolver: resolvida && r.data_resolucao ? diasEntre(r.data_abertura, r.data_resolucao) : null,
      diasEmAberto: resolvida ? null : diasEntre(r.data_abertura, agora),
      ultimaAtualizacao: r.updated_at,
      observacoes: r.observacoes || '',
    };
  });

  const aba: AbaExport = {
    nome: 'Reclamações',
    tabela: 'tbl_Reclamacoes',
    descricao: 'Uma linha por reclamação aberta no período.',
    colunas: [
      { cabecalho: 'Protocolo', chave: 'protocolo', descricao: 'Número do protocolo (REC-AAAA-NNNNNN).' },
      { cabecalho: 'Data de abertura', chave: 'data', tipo: 'data', descricao: 'Dia em que a reclamação foi aberta.' },
      { cabecalho: 'Hora', chave: 'hora', descricao: 'Horário da abertura (hh:mm).' },
      { cabecalho: 'Ano-Mês', chave: 'anoMes', descricao: 'Mês no formato AAAA-MM — use pra agrupar por mês.' },
      { cabecalho: 'Associado', chave: 'associado', descricao: 'Quem reclamou.' },
      { cabecalho: 'CPF do associado', chave: 'cpf', descricao: 'CPF do associado (pode estar em branco).' },
      { cabecalho: 'Motivo', chave: 'motivo', descricao: 'Motivo da reclamação (lista configurada em Configurações).' },
      { cabecalho: 'Descrição', chave: 'descricao', quebrar: true, largura: 50, descricao: 'Detalhes do relato.' },
      { cabecalho: 'Origem', chave: 'origem', descricao: 'Avaliação (nasceu de uma nota ruim) ou Avulsa (associado ligou direto).' },
      { cabecalho: 'Setor da avaliação de origem', chave: 'setorOrigem', descricao: 'Setor da avaliação que originou a reclamação.' },
      { cabecalho: 'Nota de origem', chave: 'notaOrigem', tipo: 'numero', descricao: 'Nota da avaliação que originou a reclamação.' },
      { cabecalho: 'Status', chave: 'status', descricao: 'Etapa atual do tratamento.' },
      { cabecalho: 'Resolvida?', chave: 'resolvida', descricao: 'Sim se o status conta como resolvido.' },
      { cabecalho: 'Responsável atual', chave: 'responsavel', descricao: 'Quem está tratando agora.' },
      { cabecalho: 'Aberta por', chave: 'abertaPor', descricao: 'Colaborador que abriu a reclamação.' },
      { cabecalho: 'Data de resolução', chave: 'dataResolucao', tipo: 'data', descricao: 'Dia em que foi resolvida.' },
      { cabecalho: 'Dias para resolver', chave: 'diasParaResolver', tipo: 'numero', descricao: 'Dias entre a abertura e a resolução.' },
      { cabecalho: 'Dias em aberto', chave: 'diasEmAberto', tipo: 'numero', descricao: 'Para reclamações não resolvidas: dias desde a abertura até a exportação.' },
      { cabecalho: 'Última atualização', chave: 'ultimaAtualizacao', tipo: 'datahora', descricao: 'Último movimento registrado.' },
      { cabecalho: 'Observações', chave: 'observacoes', quebrar: true, largura: 50, descricao: 'Última observação registrada.' },
    ],
    linhas,
  };

  const total = linhas.length;
  const resolvidas = linhas.filter(l => l.resolvida === 'Sim').length;
  const tempos = linhas.map(l => l.diasParaResolver).filter((n): n is number => n !== null);
  const tempoMedio = tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  const indicadores: SecaoResumo = {
    titulo: 'Reclamações',
    cabecalhos: ['Indicador', 'Valor'],
    linhas: [
      ['Total de reclamações', String(total)],
      ['Resolvidas', `${resolvidas} (${percentual(resolvidas, total)}%)`],
      ['Em aberto', `${total - resolvidas} (${percentual(total - resolvidas, total)}%)`],
      ['Tempo médio para resolver (dias)', fmtNum(tempoMedio)],
    ],
  };

  const porMotivo = new Map<string, number>();
  for (const l of linhas) porMotivo.set(l.motivo || '(sem motivo)', (porMotivo.get(l.motivo || '(sem motivo)') || 0) + 1);
  const secMotivo: SecaoResumo = {
    titulo: 'Reclamações por motivo',
    cabecalhos: ['Motivo', 'Quantidade', '% do total'],
    formatos: ['texto', 'inteiro', 'percentual'],
    linhas: Array.from(porMotivo.entries()).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, n, total > 0 ? n / total : 0]),
  };

  return { abas: [aba], resumo: [indicadores, secMotivo] };
}

const DICAS_RECLAMACOES = [
  'Tabela dinâmica: clique em qualquer célula da aba "Reclamações" → Inserir → Tabela Dinâmica.',
  'Maiores motivos: Linhas = Motivo, Valores = contagem de Protocolo (ordene do maior pro menor).',
  'Resolução por responsável: Linhas = Responsável atual, Colunas = Resolvida?, Valores = contagem de Protocolo.',
  'Prazo: média de Dias para resolver por Motivo ou por Responsável atual.',
  'Pendências críticas: filtre Resolvida? = Não e ordene por Dias em aberto (maior primeiro).',
];

// ---------------------------------------------------------------------------
// Relatórios prontos do Dashboard Geral
// ---------------------------------------------------------------------------

function filtrosGeral(f: FiltroGeral): [string, string][] {
  return [
    ['Período', f.rotuloPeriodo],
    ['Setor', f.rotuloSetor],
  ];
}

export async function relatorioAvaliacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio): Promise<RelatorioExcel> {
  const d = await montarAvaliacoes(supabase, f, ctx);
  return {
    arquivo: `avaliacoes_${nomeArquivoData()}`,
    titulo: 'Relatório de Avaliações NPS',
    filtros: filtrosGeral(f),
    geradoPor: ctx.geradoPor,
    resumo: d.resumo,
    abas: d.abas,
    dicas: DICAS_AVALIACOES,
  };
}

export async function relatorioIndicacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio): Promise<RelatorioExcel> {
  const d = await montarIndicacoes(supabase, f, ctx);
  return {
    arquivo: `indicacoes_${nomeArquivoData()}`,
    titulo: 'Relatório de Indicações',
    filtros: [['Período', f.rotuloPeriodo], ['Setor', 'Não se aplica (indicações não são filtradas por setor)']],
    geradoPor: ctx.geradoPor,
    resumo: d.resumo,
    abas: d.abas,
    dicas: DICAS_INDICACOES,
  };
}

export async function relatorioReclamacoes(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio): Promise<RelatorioExcel> {
  const d = await montarReclamacoes(supabase, f, ctx);
  return {
    arquivo: `reclamacoes_${nomeArquivoData()}`,
    titulo: 'Relatório de Reclamações',
    filtros: [
      ['Período', f.rotuloPeriodo],
      ['Setor', f.setorId ? `${f.rotuloSetor} (pelo setor da avaliação de origem)` : f.rotuloSetor],
    ],
    geradoPor: ctx.geradoPor,
    resumo: d.resumo,
    abas: d.abas,
    dicas: DICAS_RECLAMACOES,
  };
}

export async function relatorioCompletoGeral(supabase: any, f: FiltroGeral, ctx: ContextoRelatorio): Promise<RelatorioExcel> {
  const [av, ind, rec] = await Promise.all([
    montarAvaliacoes(supabase, f, ctx),
    montarIndicacoes(supabase, f, ctx),
    montarReclamacoes(supabase, f, ctx),
  ]);
  return {
    arquivo: `relatorio-completo_${nomeArquivoData()}`,
    titulo: 'Relatório Completo — NPS, Indicações e Reclamações',
    filtros: [
      ['Período', f.rotuloPeriodo],
      ['Setor', f.rotuloSetor],
      ['Observação', 'O filtro de setor vale pra avaliações e reclamações (pelo setor da avaliação de origem); indicações entram completas no período.'],
    ],
    geradoPor: ctx.geradoPor,
    resumo: [...av.resumo, ...ind.resumo, ...rec.resumo],
    abas: [...av.abas, ...ind.abas, ...rec.abas],
    dicas: [
      ...DICAS_AVALIACOES,
      ...DICAS_INDICACOES.slice(1),
      ...DICAS_RECLAMACOES.slice(1),
      'Cruzar dados: associados aparecem pelo nome e CPF em todas as abas — dá pra juntar avaliação, indicação e reclamação do mesmo associado com PROCV/PROCX.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Fila NPS
// ---------------------------------------------------------------------------

const ROTULO_ORIGEM: Record<string, string> = {
  assistencia_24h: 'Assistência 24h (planilha)',
  eventos: 'Eventos',
  manual: 'Lançamento manual',
};

const ROTULO_EVENTO: Record<string, string> = {
  criacao: 'Criação',
  responsavel_alterado: 'Mudança de responsável',
  tentativa_sem_retorno: 'Tentativa sem retorno',
  observacao: 'Comentário',
  vinculado: 'Associado vinculado',
  descartado: 'Descartada',
};

export type OpcoesFila = {
  rotuloSetor: string;
  rotuloResponsavel: string;
  rotuloPeriodo: string;
  incluirHistorico: boolean;
};

export async function relatorioFila(
  supabase: any,
  f: FiltrosPendencias,
  opcoes: OpcoesFila,
  ctx: ContextoRelatorio
): Promise<RelatorioExcel> {
  const brutas = await buscarTodasPaginas<any>((de, ate) =>
    aplicarFiltrosPendencias(
      supabase.from('avaliacao_pendencias').select(`
        *,
        associado:associados(nome_completo, cpf, telefone),
        veiculo:veiculos(placa, modelo),
        setor:setores(nome),
        motivo:atendimento_motivo(nome),
        avaliacao:avaliacoes(nota),
        recusa:avaliacoes_recusas(motivo)
      `),
      f
    ).order('data_atendimento', { ascending: true }).order('id').range(de, ate)
  );

  const nomes = mapaUsuarios(ctx.usuarios);

  const linhas = brutas.map(p => {
    const assoc = um(p.associado);
    const vei = um(p.veiculo);
    const nota = um(p.avaliacao)?.nota;
    const notaNum = nota !== undefined && nota !== null ? Number(nota) : null;
    const status = p.status as StatusPendencia;
    return {
      _statusRaw: status,
      _setorNome: um(p.setor)?.nome || '(sem setor)',
      _responsavelNome: nomes.get(p.responsavel_id) || '(sem responsável)',
      id: p.id,
      origem: ROTULO_ORIGEM[p.origem] || p.origem,
      setor: um(p.setor)?.nome || '',
      dataAtendimento: p.data_atendimento,
      anoMes: anoMes(p.data_atendimento),
      diaSemana: diaDaSemana(p.data_atendimento),
      entrouNaFila: p.created_at,
      beneficiario: p.nome_beneficiario || '',
      solicitante: p.nome_solicitante || '',
      associado: assoc?.nome_completo || '',
      vinculado: p.associado_id ? 'Sim' : 'Não',
      cpf: assoc?.cpf || '',
      telefone: p.telefone_principal || assoc?.telefone || '',
      telefonesExtras: (p.telefones_adicionais || []).join(' / '),
      placa: vei?.placa || p.placa || '',
      modelo: vei?.modelo || '',
      tipoAtendimento: um(p.motivo)?.nome || p.motivo_texto || '',
      servico: p.servico_origem || '',
      produto: p.produto_origem || '',
      situacaoOrigem: p.situacao_origem || '',
      atendenteOrigem: p.atendente_origem || '',
      representante: p.representante_origem || '',
      status: ROTULO_STATUS_PENDENCIA[status] || status,
      resultado: resultadoDoContato(status),
      tentativas: p.tentativas || 0,
      responsavel: nomes.get(p.responsavel_id) || '',
      nota: notaNum,
      classificacao: notaNum !== null ? classificarNota(notaNum) : '',
      motivoRecusa: um(p.recusa)?.motivo || '',
      observacao: p.observacoes || '',
      ultimaAtualizacao: p.updated_at,
    };
  });

  const abaFila: AbaExport = {
    nome: 'Fila',
    tabela: 'tbl_Fila',
    descricao: 'Uma linha por atendimento na Fila NPS (inclui descartadas — filtre a coluna Status se não quiser).',
    colunas: [
      { cabecalho: 'ID da pendência', chave: 'id', descricao: 'Identificador único (liga com a aba "Histórico").' },
      { cabecalho: 'Origem', chave: 'origem', descricao: 'De onde veio: planilha da Assistência 24h, Eventos ou lançamento manual.' },
      { cabecalho: 'Setor', chave: 'setor', descricao: 'Setor responsável pela avaliação.' },
      { cabecalho: 'Data do atendimento', chave: 'dataAtendimento', tipo: 'data', descricao: 'Dia em que o atendimento aconteceu (vem da planilha/lançamento).' },
      { cabecalho: 'Ano-Mês', chave: 'anoMes', descricao: 'Mês do atendimento no formato AAAA-MM — use pra agrupar por mês.' },
      { cabecalho: 'Dia da semana', chave: 'diaSemana', descricao: 'Dia da semana do atendimento.' },
      { cabecalho: 'Entrou na fila em', chave: 'entrouNaFila', tipo: 'datahora', descricao: 'Quando a pendência foi criada no Girow.' },
      { cabecalho: 'Beneficiário', chave: 'beneficiario', descricao: 'Nome do beneficiário como veio da origem.' },
      { cabecalho: 'Solicitante', chave: 'solicitante', descricao: 'Quem solicitou o atendimento (pode ser diferente do beneficiário).' },
      { cabecalho: 'Associado (cadastro)', chave: 'associado', descricao: 'Nome no cadastro de associados, quando vinculado.' },
      { cabecalho: 'Vinculado?', chave: 'vinculado', descricao: 'Sim se a pendência já está ligada a um associado cadastrado.' },
      { cabecalho: 'CPF', chave: 'cpf', descricao: 'CPF do associado (pode estar em branco).' },
      { cabecalho: 'Telefone', chave: 'telefone', descricao: 'Telefone principal de contato.' },
      { cabecalho: 'Outros telefones', chave: 'telefonesExtras', descricao: 'Telefones alternativos que vieram na origem.' },
      { cabecalho: 'Placa', chave: 'placa', descricao: 'Placa do veículo.' },
      { cabecalho: 'Modelo', chave: 'modelo', descricao: 'Modelo do veículo (quando cadastrado).' },
      { cabecalho: 'Tipo de atendimento', chave: 'tipoAtendimento', descricao: 'Motivo do atendimento (ex: Pane mecânica, Colisão, Roubo).' },
      { cabecalho: 'Serviço prestado', chave: 'servico', descricao: 'Serviço executado (ex: Reboque leve) — só nas pendências da planilha.' },
      { cabecalho: 'Produto / plano', chave: 'produto', descricao: 'Plano ou produto do associado — só nas pendências da planilha.' },
      { cabecalho: 'Situação na origem', chave: 'situacaoOrigem', descricao: 'Situação do atendimento no sistema de origem (ex: Finalizado, Aguardando check list).' },
      { cabecalho: 'Atendente (origem)', chave: 'atendenteOrigem', descricao: 'Quem atendeu o chamado no sistema de origem.' },
      { cabecalho: 'Representante', chave: 'representante', descricao: 'Representante comercial do associado, quando informado.' },
      { cabecalho: 'Status', chave: 'status', descricao: 'Pendente, Contatado, Avaliado, Recusou avaliar, Sem retorno ou Descartado.' },
      { cabecalho: 'Resultado do contato', chave: 'resultado', descricao: 'Sucesso (avaliou), Sem sucesso (recusou ou sem retorno), Em aberto ou Descartado.' },
      { cabecalho: 'Tentativas', chave: 'tentativas', tipo: 'inteiro', descricao: 'Quantas tentativas de contato sem retorno foram registradas.' },
      { cabecalho: 'Responsável', chave: 'responsavel', descricao: 'Colaborador que assumiu a pendência (em branco se ninguém).' },
      { cabecalho: 'Nota', chave: 'nota', tipo: 'numero', descricao: 'Nota da avaliação obtida (só pendências avaliadas).' },
      { cabecalho: 'Classificação NPS', chave: 'classificacao', descricao: 'Promotor (9-10), Neutro (7-8) ou Detrator (0-6).' },
      { cabecalho: 'Motivo da recusa', chave: 'motivoRecusa', quebrar: true, largura: 40, descricao: 'Por que o associado não quis avaliar (só pendências recusadas).' },
      { cabecalho: 'Última observação', chave: 'observacao', quebrar: true, largura: 50, descricao: 'Último comentário registrado na pendência.' },
      { cabecalho: 'Última atualização', chave: 'ultimaAtualizacao', tipo: 'datahora', descricao: 'Último movimento registrado.' },
    ],
    linhas,
  };

  const abas: AbaExport[] = [abaFila];

  // ---- Histórico (comentários, tentativas, transferências) ----
  if (opcoes.incluirHistorico && brutas.length > 0) {
    const porId = new Map(linhas.map(l => [l.id as string, l]));
    const eventos: any[] = [];
    for (const lote of emLotes(brutas.map(p => p.id as string), 100)) {
      const parte = await buscarTodasPaginas<any>((de, ate) =>
        supabase.from('avaliacao_pendencia_eventos').select('*').in('pendencia_id', lote).order('created_at', { ascending: true }).order('id').range(de, ate)
      );
      eventos.push(...parte);
    }
    eventos.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    abas.push({
      nome: 'Histórico',
      tabela: 'tbl_Historico',
      descricao: 'Linha do tempo de cada pendência: tentativas sem retorno, comentários, transferências e vínculos.',
      colunas: [
        { cabecalho: 'ID da pendência', chave: 'pendenciaId', descricao: 'Liga com a aba "Fila".' },
        { cabecalho: 'Data e hora', chave: 'quando', tipo: 'datahora', descricao: 'Quando o evento aconteceu.' },
        { cabecalho: 'Ano-Mês', chave: 'anoMes', descricao: 'Mês do evento (AAAA-MM).' },
        { cabecalho: 'Autor', chave: 'autor', descricao: 'Quem fez a ação.' },
        { cabecalho: 'Tipo de evento', chave: 'tipo', descricao: 'Tentativa sem retorno, Comentário, Mudança de responsável, etc.' },
        { cabecalho: 'Descrição / comentário', chave: 'descricao', quebrar: true, largura: 60, descricao: 'Texto do comentário ou descrição do evento.' },
        { cabecalho: 'De', chave: 'de', descricao: 'Valor anterior (ex: responsável anterior).' },
        { cabecalho: 'Para', chave: 'para', descricao: 'Valor novo (ex: novo responsável).' },
        { cabecalho: 'Beneficiário', chave: 'beneficiario', descricao: 'Beneficiário da pendência (pra ler a aba sozinha).' },
        { cabecalho: 'Placa', chave: 'placa', descricao: 'Placa da pendência.' },
        { cabecalho: 'Setor', chave: 'setor', descricao: 'Setor da pendência.' },
      ],
      linhas: eventos.map(e => {
        const p = porId.get(e.pendencia_id);
        return {
          pendenciaId: e.pendencia_id,
          quando: e.created_at,
          anoMes: anoMes(e.created_at),
          autor: (e.autor_id && nomes.get(e.autor_id)) || (e.autor_id ? 'Alguém da equipe' : 'Sistema'),
          tipo: ROTULO_EVENTO[e.tipo] || e.tipo,
          descricao: descreverEventoPendencia(e as PendenciaEvento),
          de: e.valor_anterior || '',
          para: e.valor_novo || '',
          beneficiario: p?.beneficiario || '',
          placa: p?.placa || '',
          setor: p?.setor || '',
        };
      }),
    });
  }

  // ---- Resumo ----
  const contar = (rows: typeof linhas) => {
    const porStatus = Object.fromEntries(STATUS_PENDENCIA_LISTA.map(s => [s, 0])) as Record<StatusPendencia, number>;
    const notas: number[] = [];
    for (const l of rows) {
      porStatus[l._statusRaw] = (porStatus[l._statusRaw] || 0) + 1;
      if (l._statusRaw === 'avaliado' && l.nota !== null) notas.push(l.nota);
    }
    return resumirPendencias(porStatus, notas);
  };

  const geral = contar(linhas);
  const n = geral.notas;
  const indicadores: SecaoResumo = {
    titulo: 'Indicadores da fila',
    nota: 'Taxa de sucesso = avaliaram ÷ (avaliaram + recusaram + sem retorno), ou seja, só atendimentos com contato já concluído. Descartadas não entram nas contas.',
    cabecalhos: ['Indicador', 'Valor'],
    linhas: [
      ['Total na fila (sem descartadas)', String(geral.totalFila)],
      ['Contato concluído (tratadas)', String(geral.tratados)],
      ['Em aberto (pendente + contatado)', `${geral.emAberto} (${percentual(geral.emAberto, geral.totalFila)}% da fila)`],
      ['Sucesso — avaliaram', `${geral.sucesso} (${percentual(geral.sucesso, geral.tratados)}% das tratadas)`],
      ['Sem sucesso', `${geral.semSucesso} (${percentual(geral.semSucesso, geral.tratados)}% das tratadas)`],
      ['   • Recusaram avaliar', String(geral.recusaram)],
      ['   • Sem retorno', String(geral.semRetorno)],
      ['Descartadas', String(geral.descartados)],
      ['Taxa de sucesso', geral.taxaSucesso === null ? '—' : `${geral.taxaSucesso}%`],
    ],
  };
  const resultado: SecaoResumo = {
    titulo: 'Resultado das avaliações obtidas (NPS)',
    nota: 'Positivas = promotores (9-10), neutras (7-8), negativas = detratores (0-6). NPS = % positivas − % negativas.',
    cabecalhos: ['Indicador', 'Valor'],
    linhas: [
      ['Avaliações obtidas', String(n.total)],
      ['Positivas (9-10)', `${n.promotores} (${percentual(n.promotores, n.total)}%)`],
      ['Neutras (7-8)', `${n.neutros} (${percentual(n.neutros, n.total)}%)`],
      ['Negativas (0-6)', `${n.detratores} (${percentual(n.detratores, n.total)}%)`],
      ['Nota média', fmtNum(n.media)],
      ['NPS', n.nps === null ? '—' : String(n.nps)],
    ],
  };

  const quebrar = (titulo: string, rotulo: string, chave: '_setorNome' | '_responsavelNome'): SecaoResumo => {
    const grupos = new Map<string, typeof linhas>();
    for (const l of linhas) grupos.set(l[chave], [...(grupos.get(l[chave]) || []), l]);
    return {
      titulo,
      cabecalhos: [rotulo, 'Total na fila', 'Avaliaram', 'Recusaram', 'Sem retorno', 'Em aberto', 'Taxa de sucesso', 'Nota média', 'NPS'],
      formatos: ['texto', 'inteiro', 'inteiro', 'inteiro', 'inteiro', 'inteiro', 'percentual', 'numero', 'inteiro'],
      linhas: Array.from(grupos.entries())
        .map(([nome, rows]) => ({ nome, r: contar(rows) }))
        .sort((a, b) => b.r.totalFila - a.r.totalFila)
        .map(({ nome, r }) => [
          nome, r.totalFila, r.sucesso, r.recusaram, r.semRetorno, r.emAberto,
          r.taxaSucesso === null ? null : r.taxaSucesso / 100, r.notas.media, r.notas.nps,
        ]),
    };
  };

  return {
    arquivo: `fila-nps_${nomeArquivoData()}`,
    titulo: 'Relatório da Fila NPS',
    filtros: [
      ['Setor', opcoes.rotuloSetor],
      ['Responsável', opcoes.rotuloResponsavel],
      ['Período do atendimento', opcoes.rotuloPeriodo],
      ['Status', 'Todos (inclui descartadas)'],
    ],
    geradoPor: ctx.geradoPor,
    resumo: [indicadores, resultado, quebrar('Por setor', 'Setor', '_setorNome'), quebrar('Por responsável', 'Responsável', '_responsavelNome')],
    abas,
    dicas: [
      'Tabela dinâmica: clique em qualquer célula da aba "Fila" → Inserir → Tabela Dinâmica. Cada aba já é uma Tabela do Excel, então não precisa selecionar intervalo.',
      'Produtividade por pessoa: Linhas = Responsável, Colunas = Resultado do contato, Valores = contagem de ID da pendência.',
      'Conversão por setor ou por tipo de atendimento: Linhas = Setor (ou Tipo de atendimento), Colunas = Status, Valores = contagem de ID.',
      'NPS ao longo do tempo: Linhas = Ano-Mês, Colunas = Classificação NPS, Valores = contagem de ID (ou média de Nota).',
      'Por que as pessoas não avaliam: filtre Status = "Recusou avaliar" e agrupe por Motivo da recusa.',
      'Esforço de contato: média de Tentativas por Setor, Tipo de atendimento ou Responsável.',
      'Qualidade da base: filtre Vinculado? = Não pra ver o que ainda não está ligado a um associado cadastrado.',
      'Linha do tempo de uma pendência: use a aba "Histórico" (liga com a Fila pelo ID da pendência) — tentativas, comentários e transferências com data e autor.',
    ],
  };
}
