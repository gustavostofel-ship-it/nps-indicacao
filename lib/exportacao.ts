// Motor de exportação de relatórios (Excel .xlsx e CSV).
//
// Princípio: o arquivo exportado tem que servir de MATÉRIA-PRIMA pra
// relatório, não só de lista pra olhar. Por isso:
// - cada aba de dados é uma TABELA do Excel (filtro nos cabeçalhos, linhas
//   zebradas, referência estruturada) — dá pra criar Tabela Dinâmica direto
//   nela, sem selecionar intervalo;
// - uma linha por fato, sem célula mesclada nem linha de total no meio dos
//   dados, e com tipos reais (data é data, nota é número) — senão filtro,
//   gráfico e tabela dinâmica não funcionam;
// - colunas auxiliares pra agrupar (Ano-Mês, classificação, resultado…)
//   já vêm prontas;
// - aba "Leia-me" com filtros aplicados, quantidade de registros, dicas de
//   relatório e dicionário de cada coluna; aba "Resumo" com os indicadores.
//
// O exceljs é carregado só no clique de exportar (import dinâmico), pra não
// pesar o carregamento normal das telas.

export type TipoColuna = 'texto' | 'inteiro' | 'numero' | 'percentual' | 'data' | 'datahora';

export type ColunaExport = {
  cabecalho: string; // único dentro da aba
  chave: string; // chave no objeto da linha
  tipo?: TipoColuna;
  largura?: number;
  quebrar?: boolean; // quebra de linha na célula (textos longos)
  descricao?: string; // vai pro dicionário da aba "Leia-me"
};

export type AbaExport = {
  nome: string; // nome da aba (máx. 31 caracteres)
  tabela: string; // nome da Tabela do Excel (sem espaços/acentos)
  colunas: ColunaExport[];
  linhas: Record<string, any>[];
  descricao?: string;
};

export type SecaoResumo = {
  titulo: string;
  nota?: string; // explicação de como o indicador é calculado
  cabecalhos: string[];
  linhas: (string | number | null)[][];
  formatos?: TipoColuna[]; // um por coluna; padrão texto
};

export type RelatorioExcel = {
  arquivo: string; // sem extensão
  titulo: string;
  filtros: [string, string][];
  geradoPor?: string;
  resumo?: SecaoResumo[];
  abas: AbaExport[];
  dicas?: string[];
};

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

// Aceita Date, timestamp ISO ou "YYYY-MM-DD". Data pura vira meia-noite
// LOCAL (new Date('2026-07-28') seria meia-noite UTC e mostraria dia 27 no
// fuso do Brasil em alguns formatos).
function paraInstante(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const dois = (n: number) => String(n).padStart(2, '0');

export function formatarData(v: any): string {
  const d = paraInstante(v);
  return d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

export function formatarHora(v: any): string {
  const d = paraInstante(v);
  return d ? `${dois(d.getHours())}:${dois(d.getMinutes())}` : '';
}

export function formatarDataHora(v: any): string {
  const d = paraInstante(v);
  return d ? `${formatarData(d)} ${formatarHora(d)}` : '';
}

export function anoMes(v: any): string {
  const d = paraInstante(v);
  return d ? `${d.getFullYear()}-${dois(d.getMonth() + 1)}` : '';
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export function diaDaSemana(v: any): string {
  const d = paraInstante(v);
  return d ? DIAS_SEMANA[d.getDay()] : '';
}

// Dias (com 1 casa) entre duas datas; null se alguma faltar.
export function diasEntre(inicio: any, fim: any): number | null {
  const a = paraInstante(inicio);
  const b = paraInstante(fim);
  if (!a || !b) return null;
  return Math.round(((b.getTime() - a.getTime()) / 86400000) * 10) / 10;
}

// O exceljs grava datas como UTC. Pra o Excel mostrar o horário do relógio
// local (e não 3h adiantado), desloca de forma que os campos UTC fiquem
// iguais aos campos locais.
function deslocarParaExcel(d: Date, comHora: boolean): Date {
  return comHora
    ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

const LIMITE_CELULA = 32000; // o Excel recusa célula com mais de 32.767 caracteres

function valorExcel(valor: any, tipo: TipoColuna = 'texto'): any {
  switch (tipo) {
    case 'data': {
      const d = paraInstante(valor);
      return d ? deslocarParaExcel(d, false) : null;
    }
    case 'datahora': {
      const d = paraInstante(valor);
      return d ? deslocarParaExcel(d, true) : null;
    }
    case 'inteiro':
    case 'numero':
    case 'percentual': {
      if (valor === null || valor === undefined || valor === '') return null;
      const n = Number(valor);
      return Number.isFinite(n) ? n : null;
    }
    default:
      if (valor === null || valor === undefined) return null;
      return String(valor).slice(0, LIMITE_CELULA);
  }
}

const FORMATO_EXCEL: Record<TipoColuna, string | undefined> = {
  texto: undefined,
  inteiro: '0',
  numero: '0.0',
  percentual: '0.0%',
  data: 'dd/mm/yyyy',
  datahora: 'dd/mm/yyyy hh:mm',
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Texto que começa com = + @ (ou - seguido de algo) é executado como fórmula
// quando o CSV abre no Excel — neutraliza com apóstrofo (padrão OWASP).
function neutralizarFormula(texto: string): string {
  if (/^[=+@]/.test(texto) || /^-\S/.test(texto)) return `'${texto}`;
  return texto;
}

function valorCSV(valor: any, tipo: TipoColuna = 'texto'): string {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (tipo) {
    case 'data':
      return formatarData(valor);
    case 'datahora':
      return formatarDataHora(valor);
    case 'inteiro':
      return Number.isFinite(Number(valor)) ? String(Math.round(Number(valor))) : '';
    case 'numero':
      // Vírgula decimal: o CSV é pensado pra abrir no Excel/Sheets em pt-BR.
      return Number.isFinite(Number(valor)) ? String(Math.round(Number(valor) * 100) / 100).replace('.', ',') : '';
    case 'percentual':
      return Number.isFinite(Number(valor)) ? `${(Math.round(Number(valor) * 1000) / 10).toString().replace('.', ',')}%` : '';
    default:
      return neutralizarFormula(String(valor));
  }
}

function escaparCampoCSV(campo: string): string {
  return /[;"\r\n]/.test(campo) ? `"${campo.replace(/"/g, '""')}"` : campo;
}

// BOM pro Excel reconhecer UTF-8 (senão acentos viram lixo). Montado por
// código (e não digitado como caractere invisível no texto) pra nenhum
// editor poder removê-lo sem querer.
const BOM_UTF8 = String.fromCharCode(0xfeff);
const QUEBRA_LINHA_CSV = String.fromCharCode(13, 10); // CRLF, o padrão do Excel

export function exportarCSV(arquivo: string, aba: AbaExport) {
  const linhas: string[] = [aba.colunas.map(c => escaparCampoCSV(c.cabecalho)).join(';')];
  for (const l of aba.linhas) {
    linhas.push(aba.colunas.map(c => escaparCampoCSV(valorCSV(l[c.chave], c.tipo))).join(';'));
  }
  // Separador ";" e vírgula decimal: o padrão do Excel em português.
  const blob = new Blob([BOM_UTF8 + linhas.join(QUEBRA_LINHA_CSV)], { type: 'text/csv;charset=utf-8;' });
  baixarBlob(`${arquivo}.csv`, blob);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

function baixarBlob(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function nomeAbaSeguro(nome: string) {
  return nome.replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31);
}

function nomeTabelaSeguro(nome: string) {
  const limpo = nome.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(limpo) ? limpo : `_${limpo}`;
}

// Largura aproximada pelo maior texto (cabeçalho ou amostra dos dados).
function larguraAuto(col: ColunaExport, linhas: Record<string, any>[]): number {
  if (col.largura) return col.largura;
  let max = col.cabecalho.length + 3; // folga pro botão de filtro
  const amostra = linhas.slice(0, 300);
  for (const l of amostra) {
    const v = l[col.chave];
    const tam =
      col.tipo === 'data' ? 10 :
      col.tipo === 'datahora' ? 16 :
      v === null || v === undefined ? 0 : String(v).length;
    if (tam > max) max = tam;
  }
  return Math.min(Math.max(max + 2, 10), 55);
}

const COR_TITULO = 'FF1E3A8A';
const COR_SUBTITULO = 'FF64748B';
const COR_CABECALHO = 'FF1E40AF';

export async function exportarExcel(rel: RelatorioExcel) {
  const mod: any = await import('exceljs');
  const ExcelJS: any = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = rel.geradoPor ? `Girow — ${rel.geradoPor}` : 'Girow';
  wb.created = new Date();

  const agora = new Date();
  const geradoEm = formatarDataHora(agora);

  // ---- Leia-me ----
  const leia = wb.addWorksheet('Leia-me', { views: [{ showGridLines: false }] });
  leia.getColumn(1).width = 26;
  leia.getColumn(2).width = 34;
  leia.getColumn(3).width = 16;
  leia.getColumn(4).width = 80;

  let r = 1;
  leia.getCell(r, 1).value = rel.titulo;
  leia.getCell(r, 1).font = { size: 18, bold: true, color: { argb: COR_TITULO } };
  r++;
  leia.getCell(r, 1).value = `Gerado em ${geradoEm}${rel.geradoPor ? ` por ${rel.geradoPor}` : ''} · Girow`;
  leia.getCell(r, 1).font = { size: 10, color: { argb: COR_SUBTITULO } };
  r += 2;

  const tituloSecao = (texto: string) => {
    const c = leia.getCell(r, 1);
    c.value = texto;
    c.font = { size: 12, bold: true, color: { argb: COR_TITULO } };
    r++;
  };

  tituloSecao('Filtros aplicados');
  for (const [rotulo, valor] of rel.filtros) {
    leia.getCell(r, 1).value = rotulo;
    leia.getCell(r, 1).font = { bold: true };
    leia.getCell(r, 2).value = valor;
    r++;
  }
  r++;

  tituloSecao('Abas deste arquivo');
  const cabecalhoAbas = ['Aba', 'Tabela do Excel', 'Registros', 'O que contém'];
  cabecalhoAbas.forEach((t, i) => {
    const c = leia.getCell(r, i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  r++;
  if (rel.resumo && rel.resumo.length > 0) {
    leia.getCell(r, 1).value = 'Resumo';
    leia.getCell(r, 4).value = 'Indicadores já calculados com os mesmos filtros (valores fixos, não fórmulas).';
    r++;
  }
  for (const aba of rel.abas) {
    leia.getCell(r, 1).value = nomeAbaSeguro(aba.nome);
    leia.getCell(r, 2).value = nomeTabelaSeguro(aba.tabela);
    leia.getCell(r, 3).value = aba.linhas.length;
    leia.getCell(r, 4).value = aba.descricao || '';
    leia.getCell(r, 4).alignment = { wrapText: true, vertical: 'top' };
    r++;
  }
  r++;

  if (rel.dicas && rel.dicas.length > 0) {
    tituloSecao('Como montar seus relatórios');
    for (const dica of rel.dicas) {
      leia.getCell(r, 1).value = `• ${dica}`;
      leia.mergeCells(r, 1, r, 4);
      leia.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
      leia.getRow(r).height = dica.length > 120 ? 32 : 18;
      r++;
    }
    r++;
  }

  tituloSecao('Dicionário de colunas');
  ['Aba', 'Coluna', 'Tipo', 'Descrição'].forEach((t, i) => {
    const c = leia.getCell(r, i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  r++;
  const rotuloTipo: Record<TipoColuna, string> = {
    texto: 'Texto', inteiro: 'Número inteiro', numero: 'Número', percentual: 'Percentual', data: 'Data', datahora: 'Data e hora',
  };
  for (const aba of rel.abas) {
    for (const col of aba.colunas) {
      leia.getCell(r, 1).value = nomeAbaSeguro(aba.nome);
      leia.getCell(r, 2).value = col.cabecalho;
      leia.getCell(r, 3).value = rotuloTipo[col.tipo || 'texto'];
      leia.getCell(r, 4).value = col.descricao || '';
      leia.getCell(r, 4).alignment = { wrapText: true, vertical: 'top' };
      r++;
    }
  }

  // ---- Resumo ----
  if (rel.resumo && rel.resumo.length > 0) {
    const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 36;
    for (let i = 2; i <= 10; i++) ws.getColumn(i).width = 16;

    let rr = 1;
    ws.getCell(rr, 1).value = `${rel.titulo} — Resumo`;
    ws.getCell(rr, 1).font = { size: 16, bold: true, color: { argb: COR_TITULO } };
    rr += 2;

    for (const sec of rel.resumo) {
      ws.getCell(rr, 1).value = sec.titulo;
      ws.getCell(rr, 1).font = { size: 12, bold: true, color: { argb: COR_TITULO } };
      rr++;
      if (sec.nota) {
        ws.getCell(rr, 1).value = sec.nota;
        ws.getCell(rr, 1).font = { size: 9, italic: true, color: { argb: COR_SUBTITULO } };
        rr++;
      }
      sec.cabecalhos.forEach((t, i) => {
        const c = ws.getCell(rr, i + 1);
        c.value = t;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
        c.alignment = { horizontal: i === 0 ? 'left' : 'center', wrapText: true, vertical: 'middle' };
      });
      rr++;
      for (const linha of sec.linhas) {
        linha.forEach((v, i) => {
          const tipo = sec.formatos?.[i] || 'texto';
          const c = ws.getCell(rr, i + 1);
          c.value = valorExcel(v, tipo);
          const fmt = FORMATO_EXCEL[tipo];
          if (fmt) c.numFmt = fmt;
          if (i > 0) c.alignment = { horizontal: 'center' };
          c.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
        });
        rr++;
      }
      rr += 2;
    }
  }

  // ---- Abas de dados (cada uma é uma Tabela do Excel) ----
  const nomesUsados = new Set<string>(['Leia-me', 'Resumo']);
  const tabelasUsadas = new Set<string>();

  for (const aba of rel.abas) {
    let nomeAba = nomeAbaSeguro(aba.nome);
    while (nomesUsados.has(nomeAba)) nomeAba = `${nomeAba.slice(0, 28)}_${nomesUsados.size}`;
    nomesUsados.add(nomeAba);

    let nomeTab = nomeTabelaSeguro(aba.tabela);
    while (tabelasUsadas.has(nomeTab)) nomeTab = `${nomeTab}_${tabelasUsadas.size}`;
    tabelasUsadas.add(nomeTab);

    const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 1 }] });

    if (aba.linhas.length > 0) {
      ws.addTable({
        name: nomeTab,
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: aba.colunas.map(c => ({ name: c.cabecalho, filterButton: true })),
        rows: aba.linhas.map(l => aba.colunas.map(c => valorExcel(l[c.chave], c.tipo))),
      });

      aba.colunas.forEach((col, i) => {
        const coluna = ws.getColumn(i + 1);
        coluna.width = larguraAuto(col, aba.linhas);
        const fmt = FORMATO_EXCEL[col.tipo || 'texto'];
        if (fmt || col.quebrar) {
          for (let linha = 2; linha <= aba.linhas.length + 1; linha++) {
            const cel = ws.getCell(linha, i + 1);
            if (fmt) cel.numFmt = fmt;
            if (col.quebrar) cel.alignment = { wrapText: true, vertical: 'top' };
          }
        }
      });
    } else {
      // Tabela do Excel sem nenhuma linha de dado gera arquivo que o Excel
      // pede pra "reparar" — escreve só o cabeçalho e um aviso.
      aba.colunas.forEach((col, i) => {
        const c = ws.getCell(1, i + 1);
        c.value = col.cabecalho;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
        ws.getColumn(i + 1).width = larguraAuto(col, []);
      });
      ws.getCell(2, 1).value = 'Nenhum registro para os filtros selecionados.';
      ws.getCell(2, 1).font = { italic: true, color: { argb: COR_SUBTITULO } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  baixarBlob(`${rel.arquivo}.xlsx`, blob);
}

// ---------------------------------------------------------------------------
// Busca paginada (o Supabase devolve no máximo 1000 linhas por requisição —
// sem paginar, uma exportação "completa" sairia cortada em silêncio).
// ---------------------------------------------------------------------------

export async function buscarTodasPaginas<T = any>(
  montar: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>
): Promise<T[]> {
  const TAMANHO = 1000;
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await montar(de, de + TAMANHO - 1);
    if (error) throw new Error(error.message || 'Erro ao buscar dados');
    const lote = data || [];
    todas.push(...(lote as T[]));
    if (lote.length < TAMANHO) break;
  }
  return todas;
}

// Quebra uma lista em pedaços (ex: .in('id', ids) com centenas de ids estoura
// o tamanho máximo da URL).
export function emLotes<T>(lista: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}
