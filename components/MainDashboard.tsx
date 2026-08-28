'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { startOfMonth, format, subDays, isAfter, isBefore } from 'date-fns';
import { ArrowRight, Star, Megaphone, Users, Target, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, Clock, AlertTriangle, Download, Filter, Wifi } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const supabase = createClient();

type Avaliacao = { id: string, nota: number, data_avaliacao: string, setor: any, setor_id: string, usuario_id: string, associado_id: string };
type Indicacao = { id: string, status: string, data_indicacao: string, updated_at: string, data_fechamento: string | null, usuario_id: string, nome_indicado: string, responsavel_id: string | null, associado_id: string, protocolo: string | null };
type Usuario = { id: string, nome: string };
type Setor = { id: string, nome: string };

const COLORS = ['#22c55e', '#eab308', '#ef4444']; // Promotor, Neutro, Detrator
const STATUS_COLORS = { pendente: '#eab308', em_tratativa: '#3b82f6', fechado: '#22c55e', sem_retorno: '#ef4444' };
const DIAS_LIMITE_ESQUECIDA = 3; // dias sem atualização para considerar uma indicação "esquecida"

// Badge de variação percentual em relação ao período anterior.
// invertido=true significa "menor é melhor" (ex: tempo de fechamento).
function DeltaBadge({ delta, invertido = false }: { delta: number | null, invertido?: boolean }) {
  if (delta === null || delta === 0) return null;
  const positivo = invertido ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${positivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <Icon className="w-3 h-3" /> {Math.abs(delta)}%
    </span>
  );
}

export default function MainDashboard() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [setoresList, setSetoresList] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);

  // Dados do período anterior, usados só para calcular a variação percentual (comparação)
  const [avaliacoesPrev, setAvaliacoesPrev] = useState<{ nota: number }[]>([]);
  const [indicacoesPrev, setIndicacoesPrev] = useState<{ status: string, data_indicacao: string, data_fechamento: string | null }[]>([]);

  const [dateFilter, setDateFilter] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [setorFilter, setSetorFilter] = useState('');

  const carregarDados = async () => {
    setLoading(true);

    // Base Queries (período atual)
    let queryAval = supabase.from('avaliacoes').select('id, nota, data_avaliacao, usuario_id, associado_id, setor_id, setor:setores(nome)').order('data_avaliacao', { ascending: true });
    let queryInd = supabase.from('indicacoes').select('id, status, data_indicacao, updated_at, data_fechamento, usuario_id, nome_indicado, responsavel_id, associado_id, protocolo').order('data_indicacao', { ascending: true });

    if (dateFilter.start) {
      const start = new Date(`${dateFilter.start}T00:00:00`).toISOString();
      queryAval = queryAval.gte('data_avaliacao', start);
      queryInd = queryInd.gte('data_indicacao', start);
    }
    if (dateFilter.end) {
      const end = new Date(`${dateFilter.end}T23:59:59.999`).toISOString();
      queryAval = queryAval.lte('data_avaliacao', end);
      queryInd = queryInd.lte('data_indicacao', end);
    }
    if (setorFilter) {
      queryAval = queryAval.eq('setor_id', setorFilter);
    }

    // Período imediatamente anterior, com a mesma duração, só para comparação (%)
    let queryAvalPrev: any = Promise.resolve({ data: [], error: null });
    let queryIndPrev: any = Promise.resolve({ data: [], error: null });
    if (dateFilter.start && dateFilter.end) {
      const start = new Date(`${dateFilter.start}T00:00:00`);
      const end = new Date(`${dateFilter.end}T23:59:59.999`);
      const duracaoMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duracaoMs);

      let qap = supabase.from('avaliacoes').select('nota').gte('data_avaliacao', prevStart.toISOString()).lte('data_avaliacao', prevEnd.toISOString());
      if (setorFilter) qap = qap.eq('setor_id', setorFilter);
      queryAvalPrev = qap;

      queryIndPrev = supabase.from('indicacoes').select('status, data_indicacao, data_fechamento').gte('data_indicacao', prevStart.toISOString()).lte('data_indicacao', prevEnd.toISOString());
    }

    const [resAval, resInd, resUser, resSetores, resAvalPrev, resIndPrev] = await Promise.all([
      queryAval,
      queryInd,
      supabase.from('perfis_usuarios').select('id, nome'),
      supabase.from('setores').select('id, nome').eq('ativo', true).order('ordem', { ascending: true }),
      queryAvalPrev,
      queryIndPrev
    ]);

    if (resAval.error) {
      console.error('Erro ao carregar avaliações:', resAval.error);
      toast.error('Erro ao carregar avaliações: ' + resAval.error.message);
    }
    if (resInd.error) {
      console.error('Erro ao carregar indicações:', resInd.error);
      toast.error('Erro ao carregar indicações: ' + resInd.error.message);
    }
    if (resUser.error) console.error('Erro ao carregar usuários:', resUser.error);
    if (resSetores.error) console.error('Erro ao carregar setores:', resSetores.error);

    setAvaliacoes(resAval.data || []);
    setIndicacoes(resInd.data || []);
    setUsuarios(resUser.data || []);
    setSetoresList(resSetores.data || []);
    setAvaliacoesPrev(resAvalPrev.data || []);
    setIndicacoesPrev(resIndPrev.data || []);

    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, [dateFilter, setorFilter]);

  // Tempo real: qualquer criação/alteração em avaliações ou indicações feita
  // por outra pessoa atualiza este dashboard sozinho.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-geral')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'indicacoes' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, () => carregarDados())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, setorFilter]);

  // Metrics — memoizados para não recalcular tudo a cada re-render (só quando
  // os dados-fonte realmente mudam), já que os agrupamentos abaixo passam por
  // toda a lista de avaliações/indicações do período.
  const totalAvaliacoes = avaliacoes.length;
  const mediaNPS = totalAvaliacoes > 0 ? (avaliacoes.reduce((acc, curr) => acc + curr.nota, 0) / totalAvaliacoes).toFixed(1) : '0.0';

  const promotores = useMemo(() => avaliacoes.filter(a => a.nota >= 9).length, [avaliacoes]);
  const neutros = useMemo(() => avaliacoes.filter(a => a.nota >= 7 && a.nota < 9).length, [avaliacoes]);
  const detratores = useMemo(() => avaliacoes.filter(a => a.nota < 7).length, [avaliacoes]);
  const npsScore = totalAvaliacoes > 0 ? Math.round(((promotores - detratores) / totalAvaliacoes) * 100) : 0;
  const pData = [
    { name: 'Promotores', value: promotores },
    { name: 'Neutros', value: neutros },
    { name: 'Detratores', value: detratores },
  ];

  const totalIndicacoes = indicacoes.length;
  const fechadas = indicacoes.filter(i => i.status === 'fechado').length;
  const conversao = totalIndicacoes > 0 ? Math.round((fechadas / totalIndicacoes) * 100) : 0;
  const statusData = useMemo(() => [
    { name: 'Pendente', value: indicacoes.filter(i => i.status === 'pendente').length, fill: STATUS_COLORS.pendente },
    { name: 'Tratativa', value: indicacoes.filter(i => i.status === 'em_tratativa').length, fill: STATUS_COLORS.em_tratativa },
    { name: 'Fechado', value: fechadas, fill: STATUS_COLORS.fechado },
    { name: 'S/ Retorno', value: indicacoes.filter(i => i.status === 'sem_retorno').length, fill: STATUS_COLORS.sem_retorno },
  ], [indicacoes, fechadas]);

  // Charts Logic
  // 1. NPS Evolution (Daily)
  const npsEvolutionData = useMemo(() => {
    const npsByDate = avaliacoes.reduce((acc: any, curr) => {
      const d = new Date(curr.data_avaliacao).toLocaleDateString('pt-BR');
      if (!acc[d]) acc[d] = { date: d, soma: 0, count: 0 };
      acc[d].soma += curr.nota;
      acc[d].count += 1;
      return acc;
    }, {});
    return Object.values(npsByDate).map((x: any) => ({
      date: x.date,
      media: Number((x.soma / x.count).toFixed(1))
    }));
  }, [avaliacoes]);

  // 2. Avaliações por Setor
  const setorData = useMemo(() => {
    const setorDataMap = avaliacoes.reduce((acc: any, curr) => {
      const s = (Array.isArray(curr.setor) ? curr.setor[0]?.nome : curr.setor?.nome) || 'Desconhecido';
      if (!acc[s]) acc[s] = { setor: s, soma: 0, count: 0 };
      acc[s].soma += curr.nota;
      acc[s].count += 1;
      return acc;
    }, {});
    return Object.values(setorDataMap).map((x: any) => ({
      name: x.setor,
      media: Number((x.soma / x.count).toFixed(1)),
      total: x.count
    }));
  }, [avaliacoes]);

  // Performance
  const userPerformance = useMemo(() => usuarios.map(u => {
    const avs = avaliacoes.filter(a => a.usuario_id === u.id).length;
    const inds = indicacoes.filter(i => i.usuario_id === u.id);
    const fech = inds.filter(i => i.status === 'fechado').length;
    const success = inds.length > 0 ? Math.round((fech / inds.length) * 100) : 0;
    return { id: u.id, nome: u.nome, avaliacoes: avs, indicacoes: inds.length, sucesso: success };
  }).sort((a, b) => b.indicacoes - a.indicacoes || b.avaliacoes - a.avaliacoes), [usuarios, avaliacoes, indicacoes]);

  // Open Indications
  const openIndicacoes = useMemo(() => indicacoes
    .filter(i => i.status === 'pendente' || i.status === 'em_tratativa')
    .sort((a, b) => new Date(b.data_indicacao).getTime() - new Date(a.data_indicacao).getTime())
    .slice(0, 5), [indicacoes]);

  // ---- Comparação com o período anterior (%) ----
  const calcDelta = (atual: number, anterior: number | null) => {
    if (anterior === null || anterior === 0) return null;
    return Math.round(((atual - anterior) / anterior) * 100);
  };
  const totalAvaliacoesPrev = avaliacoesPrev.length;
  const mediaNPSPrev = totalAvaliacoesPrev > 0 ? avaliacoesPrev.reduce((a, c) => a + c.nota, 0) / totalAvaliacoesPrev : null;
  const totalIndicacoesPrev = indicacoesPrev.length;
  const fechadasPrev = indicacoesPrev.filter(i => i.status === 'fechado').length;
  const conversaoPrev = totalIndicacoesPrev > 0 ? Math.round((fechadasPrev / totalIndicacoesPrev) * 100) : null;

  const deltaAvaliacoes = calcDelta(totalAvaliacoes, totalAvaliacoesPrev || null);
  const deltaNPS = calcDelta(Number(mediaNPS), mediaNPSPrev);
  const deltaIndicacoes = calcDelta(totalIndicacoes, totalIndicacoesPrev || null);
  const deltaConversao = calcDelta(conversao, conversaoPrev);

  // ---- Tempo médio de fechamento ----
  const fechadasComData = indicacoes.filter(i => i.status === 'fechado' && i.data_fechamento);
  const tempoMedioFechamentoDias = fechadasComData.length > 0
    ? fechadasComData.reduce((acc, i) => acc + (new Date(i.data_fechamento!).getTime() - new Date(i.data_indicacao).getTime()), 0) / fechadasComData.length / (1000 * 60 * 60 * 24)
    : null;

  const fechadasPrevComData = indicacoesPrev.filter(i => i.status === 'fechado' && i.data_fechamento);
  const tempoMedioFechamentoPrevDias = fechadasPrevComData.length > 0
    ? fechadasPrevComData.reduce((acc, i) => acc + (new Date(i.data_fechamento!).getTime() - new Date(i.data_indicacao).getTime()), 0) / fechadasPrevComData.length / (1000 * 60 * 60 * 24)
    : null;
  const deltaTempoFechamento = tempoMedioFechamentoDias !== null ? calcDelta(tempoMedioFechamentoDias, tempoMedioFechamentoPrevDias) : null;

  // ---- Indicações esquecidas (paradas há mais de X dias, sem estar fechadas) ----
  const agora = new Date();
  const indicacoesEsquecidas = useMemo(() => indicacoes
    .filter(i => i.status === 'pendente' || i.status === 'em_tratativa')
    .map(i => {
      const referencia = new Date(i.updated_at || i.data_indicacao);
      const diasParado = (agora.getTime() - referencia.getTime()) / (1000 * 60 * 60 * 24);
      return { ...i, diasParado };
    })
    .filter(i => i.diasParado >= DIAS_LIMITE_ESQUECIDA)
    .sort((a, b) => b.diasParado - a.diasParado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indicacoes]);

  // ---- Correlação NPS -> Indicações: associados com nota alta indicam mais? ----
  const correlacaoData = useMemo(() => {
    const associadoNotaMap = avaliacoes.reduce((acc: any, curr) => {
      if (!acc[curr.associado_id]) acc[curr.associado_id] = { soma: 0, count: 0 };
      acc[curr.associado_id].soma += curr.nota;
      acc[curr.associado_id].count += 1;
      return acc;
    }, {});
    const classificarAssociado = (associadoId: string) => {
      const s = associadoNotaMap[associadoId];
      if (!s) return 'Sem avaliação';
      const media = s.soma / s.count;
      if (media >= 9) return 'Promotor';
      if (media >= 7) return 'Neutro';
      return 'Detrator';
    };
    const correlacaoMap: Record<string, number> = { 'Promotor': 0, 'Neutro': 0, 'Detrator': 0, 'Sem avaliação': 0 };
    indicacoes.forEach(ind => {
      const classe = classificarAssociado(ind.associado_id);
      correlacaoMap[classe] = (correlacaoMap[classe] || 0) + 1;
    });
    return [
      { name: 'Promotor', value: correlacaoMap['Promotor'], fill: COLORS[0] },
      { name: 'Neutro', value: correlacaoMap['Neutro'], fill: COLORS[1] },
      { name: 'Detrator', value: correlacaoMap['Detrator'], fill: COLORS[2] },
      { name: 'Sem avaliação', value: correlacaoMap['Sem avaliação'], fill: '#94a3b8' },
    ];
  }, [avaliacoes, indicacoes]);
  const totalComCorrelacao = correlacaoData.reduce((a, c) => a + c.value, 0);

  // ---- Exportar CSV ----
  const exportarCSV = (tipo: 'indicacoes' | 'avaliacoes') => {
    const linhas: string[] = [];
    if (tipo === 'indicacoes') {
      linhas.push('Protocolo,Data,Indicado,Status,Dias Parado,Data Fechamento');
      indicacoes.forEach(i => {
        const dias = ((agora.getTime() - new Date(i.updated_at || i.data_indicacao).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1);
        linhas.push([
          i.protocolo || '',
          new Date(i.data_indicacao).toLocaleDateString('pt-BR'),
          `"${(i.nome_indicado || '').replace(/"/g, '""')}"`,
          i.status,
          dias,
          i.data_fechamento ? new Date(i.data_fechamento).toLocaleDateString('pt-BR') : ''
        ].join(','));
      });
    } else {
      linhas.push('Data,Setor,Nota');
      avaliacoes.forEach(a => {
        const setorNome = Array.isArray(a.setor) ? a.setor[0]?.nome : a.setor?.nome;
        linhas.push([
          new Date(a.data_avaliacao).toLocaleDateString('pt-BR'),
          `"${(setorNome || '').replace(/"/g, '""')}"`,
          String(a.nota)
        ].join(','));
      });
    }
    const csvContent = '\uFEFF' + linhas.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tipo}_${dateFilter.start}_a_${dateFilter.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyShortcut = (type: 'hoje'|'7dias'|'mes') => {
    const today = new Date();
    let start = today;
    if (type === '7dias') start = subDays(today, 7);
    if (type === 'mes') start = startOfMonth(today);
    setDateFilter({ start: format(start, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard Geral</h1>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
              <Wifi className="w-3.5 h-3.5" /> Ao vivo
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">Acompanhe a satisfação e indicações da sua unidade.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Setor</label>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={setorFilter}
                onChange={e => setSetorFilter(e.target.value)}
                className="pl-7 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none bg-white"
              >
                <option value="">Todos os setores</option>
                {setoresList.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Período de Análise</label>
            <div className="flex gap-2">
              <input 
                type="date"
                value={dateFilter.start}
                onChange={e => setDateFilter({...dateFilter, start: e.target.value})}
                className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm outline-none"
              />
              <span className="self-center text-slate-400">-</span>
              <input 
                type="date"
                value={dateFilter.end}
                onChange={e => setDateFilter({...dateFilter, end: e.target.value})}
                className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm outline-none"
              />
            </div>
            <div className="flex gap-3 mt-1.5 text-xs">
              <button onClick={() => applyShortcut('hoje')} className="text-blue-600 font-medium hover:underline">Hoje</button>
              <button onClick={() => applyShortcut('7dias')} className="text-blue-600 font-medium hover:underline">7 Dias</button>
              <button onClick={() => applyShortcut('mes')} className="text-blue-600 font-medium hover:underline">Este Mês</button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => exportarCSV('avaliacoes')} title="Exportar avaliações do período em CSV" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-3.5 h-3.5" /> Avaliações
            </button>
            <button onClick={() => exportarCSV('indicacoes')} title="Exportar indicações do período em CSV" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-3.5 h-3.5" /> Indicações
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 h-[300px]" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Top Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Avaliações Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold">
                  <Star className="w-5 h-5 text-blue-500" /> Total Avaliações
                </div>
                <DeltaBadge delta={deltaAvaliacoes} />
              </div>
              <div className="text-3xl font-bold text-slate-800">{totalAvaliacoes}</div>
              <div className="mt-2 text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                <span className="font-bold text-blue-600">NPS Médio: {mediaNPS}</span>
                <DeltaBadge delta={deltaNPS} />
              </div>
            </div>

            {/* Classificação das Avaliações Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-slate-500 font-semibold">
                  <Users className="w-5 h-5 text-indigo-500" /> Classificação
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${npsScore >= 50 ? 'bg-green-100 text-green-700' : npsScore >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  NPS {npsScore}
                </span>
              </div>
              {totalAvaliacoes > 0 ? (
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 mb-3">
                  <div className="bg-green-500 h-full" style={{ width: `${(promotores / totalAvaliacoes) * 100}%` }} />
                  <div className="bg-yellow-400 h-full" style={{ width: `${(neutros / totalAvaliacoes) * 100}%` }} />
                  <div className="bg-red-500 h-full" style={{ width: `${(detratores / totalAvaliacoes) * 100}%` }} />
                </div>
              ) : (
                <div className="h-2.5 rounded-full bg-slate-100 mb-3" />
              )}
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-green-500" />Promotores <span className="font-bold text-slate-800">{promotores}</span></span>
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-yellow-400" />Neutros <span className="font-bold text-slate-800">{neutros}</span></span>
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-red-500" />Detratores <span className="font-bold text-slate-800">{detratores}</span></span>
              </div>
            </div>

            {/* Indicações Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold">
                  <Megaphone className="w-5 h-5 text-orange-500" /> Total Indicações
                </div>
                <DeltaBadge delta={deltaIndicacoes} />
              </div>
              <div className="text-3xl font-bold text-slate-800">{totalIndicacoes}</div>
              <div className="mt-2 text-sm text-slate-500 flex items-center gap-2">
                <span className="font-bold text-orange-600">Fechadas: {fechadas}</span>
              </div>
            </div>

            {/* Conversão Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold">
                  <Target className="w-5 h-5 text-green-500" /> Conversão
                </div>
                <DeltaBadge delta={deltaConversao} />
              </div>
              <div className="text-3xl font-bold text-slate-800">{conversao}%</div>
              <div className="mt-2 text-[11px] text-slate-500 uppercase font-semibold">
                Indicações transformadas em negócio
              </div>
            </div>

            {/* Tempo Médio de Fechamento Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold">
                  <Clock className="w-5 h-5 text-purple-500" /> Tempo de Fechamento
                </div>
                <DeltaBadge delta={deltaTempoFechamento} invertido />
              </div>
              <div className="text-3xl font-bold text-slate-800">
                {tempoMedioFechamentoDias !== null ? `${tempoMedioFechamentoDias.toFixed(1)}d` : '—'}
              </div>
              <div className="mt-2 text-[11px] text-slate-500 uppercase font-semibold">
                Média do cadastro até o fechamento
              </div>
            </div>

          </div>

          {/* Alerta: Indicações Esquecidas */}
          {indicacoesEsquecidas.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> {indicacoesEsquecidas.length} indicação(ões) parada(s) há mais de {DIAS_LIMITE_ESQUECIDA} dias
                </h3>
                <Link href="/indicacoes" className="text-xs font-semibold text-amber-700 hover:underline flex items-center gap-1">
                  Ver Todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {indicacoesEsquecidas.slice(0, 6).map(ind => (
                  <Link href="/indicacoes" key={ind.id} className="bg-white border border-amber-100 rounded-lg px-3 py-2 hover:border-amber-300 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-800">{ind.nome_indicado}</div>
                      {ind.protocolo && <div className="font-mono text-[10px] text-slate-400">{ind.protocolo}</div>}
                    </div>
                    <div className="text-xs text-amber-700 font-medium">{Math.floor(ind.diasParado)} dias sem atualização</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* NPS Evolution */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4">Evolução NPS Médio</h3>
              <div className="h-[250px] w-full">
                {npsEvolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={npsEvolutionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 10]} tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="media" name="Média NPS" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados suficientes</div>
                )}
              </div>
            </div>

            {/* Avaliações por Setor */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4">Média NPS por Setor</h3>
              <div className="h-[250px] w-full">
                {setorData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={setorData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" domain={[0, 10]} hide />
                      <YAxis dataKey="name" type="category" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="media" name="Média" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados suficientes</div>
                )}
              </div>
            </div>

            {/* Promotor/Neutro/Detrator */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4">Distribuição de Clientes</h3>
              <div className="h-[250px] w-full">
                {totalAvaliacoes > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {pData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '12px', color: '#64748b'}} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados suficientes</div>
                )}
              </div>
            </div>

            {/* Indicações Status */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4">Status de Indicações</h3>
              <div className="h-[250px] w-full">
                {totalIndicacoes > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]} barSize={40}>
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados suficientes</div>
                )}
              </div>
            </div>

            {/* Correlação NPS -> Indicações */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
              <h3 className="font-bold text-slate-700 mb-1">Indicações por Perfil do Cliente</h3>
              <p className="text-xs text-slate-400 mb-4">Associados promotores (nota 9-10) indicam mais do que detratores?</p>
              <div className="h-[220px] w-full">
                {totalComCorrelacao > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={correlacaoData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis dataKey="name" type="category" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} width={90} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" name="Indicações" radius={[0, 4, 4, 0]} barSize={22}>
                        {correlacaoData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados suficientes</div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tabela Desempenho */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">Desempenho por Colaborador</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Membro da Equipe</th>
                      <th className="px-5 py-3 text-center">Avaliações (NPS)</th>
                      <th className="px-5 py-3 text-center">Indicações Captadas</th>
                      <th className="px-5 py-3 text-center">Taxa de Sucesso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userPerformance.length > 0 ? userPerformance.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{u.nome}</td>
                        <td className="px-5 py-3 text-center">{u.avaliacoes}</td>
                        <td className="px-5 py-3 text-center">{u.indicacoes}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${u.sucesso >= 50 ? 'bg-green-100 text-green-700' : u.sucesso >= 20 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                            {u.sucesso}%
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-slate-400">Sem dados no período</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Indicações em Aberto */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" /> Em Andamento
                </h3>
                <Link href="/indicacoes" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  Ver Todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-2 flex-1 flex flex-col gap-1">
                {openIndicacoes.length > 0 ? openIndicacoes.map(ind => (
                  <Link href="/indicacoes" key={ind.id} className="block p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm text-slate-800">{ind.nome_indicado}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ind.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ind.status === 'pendente' ? 'Pendente' : 'Em Tratativa'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                      {ind.protocolo && <span className="font-mono text-slate-400">{ind.protocolo}</span>}
                      <span>Cadastrado: {new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </Link>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-sm">
                    <CheckCircle2 className="w-8 h-8 text-slate-200 mb-2" />
                    Nenhuma indicação pendente. Ótimo trabalho!
                  </div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}