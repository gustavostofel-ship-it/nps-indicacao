'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { startOfMonth, format, subDays, isAfter, isBefore } from 'date-fns';
import { ArrowRight, Star, Megaphone, Users, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const supabase = createClient();

type Avaliacao = { id: string, nota: number, data_avaliacao: string, setor: any, usuario_id: string };
type Indicacao = { id: string, status: string, data_indicacao: string, usuario_id: string, nome_indicado: string, responsavel_id: string | null };
type Usuario = { id: string, nome: string };

const COLORS = ['#22c55e', '#eab308', '#ef4444']; // Promotor, Neutro, Detrator
const STATUS_COLORS = { pendente: '#eab308', em_tratativa: '#3b82f6', fechado: '#22c55e', sem_retorno: '#ef4444' };

export default function MainDashboard() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const carregarDados = async () => {
    setLoading(true);
    
    // Base Queries
    let queryAval = supabase.from('avaliacoes').select('id, nota, data_avaliacao, usuario_id, setor:setores(nome)').order('data_avaliacao', { ascending: true });
    let queryInd = supabase.from('indicacoes').select('id, status, data_indicacao, usuario_id, nome_indicado, responsavel_id').order('data_indicacao', { ascending: true });
    
    // Apply Dates
    if (dateFilter.start) {
      const start = new Date(`${dateFilter.start}T00:00:00`);
      
      // removed gte
      // removed gte
    }
    if (dateFilter.end) {
      const end = new Date(`${dateFilter.end}T23:59:59.999`);
      
      // removed lte
      // removed lte
    }

    const [resAval, resInd, resUser] = await Promise.all([
      queryAval,
      queryInd,
      supabase.from('perfis_usuarios').select('id, nome')
    ]);

    
    if (resAval.data) {
      let filteredAval = resAval.data;
      if (dateFilter.start) filteredAval = filteredAval.filter((a: any) => new Date(a.data_avaliacao) >= new Date(dateFilter.start + 'T00:00:00'));
      if (dateFilter.end) filteredAval = filteredAval.filter((a: any) => new Date(a.data_avaliacao) <= new Date(dateFilter.end + 'T23:59:59.999'));
      setAvaliacoes(filteredAval);
    }

    if (resInd.data) setIndicacoes(resInd.data.map((i: any) => ({...i, data_indicacao: i.data_indicacao})));
    if (resUser.data) setUsuarios(resUser.data);
    
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, [dateFilter]);

  // Metrics
  const totalAvaliacoes = avaliacoes.length;
  const mediaNPS = totalAvaliacoes > 0 ? (avaliacoes.reduce((acc, curr) => acc + curr.nota, 0) / totalAvaliacoes).toFixed(1) : '0.0';
  
  const promotores = avaliacoes.filter(a => a.nota >= 9).length;
  const neutros = avaliacoes.filter(a => a.nota >= 7 && a.nota < 9).length;
  const detratores = avaliacoes.filter(a => a.nota < 7).length;
  const pData = [
    { name: 'Promotores', value: promotores },
    { name: 'Neutros', value: neutros },
    { name: 'Detratores', value: detratores },
  ];

  const totalIndicacoes = indicacoes.length;
  const fechadas = indicacoes.filter(i => i.status === 'fechado').length;
  const conversao = totalIndicacoes > 0 ? Math.round((fechadas / totalIndicacoes) * 100) : 0;
  const statusData = [
    { name: 'Pendente', value: indicacoes.filter(i => i.status === 'pendente').length, fill: STATUS_COLORS.pendente },
    { name: 'Tratativa', value: indicacoes.filter(i => i.status === 'em_tratativa').length, fill: STATUS_COLORS.em_tratativa },
    { name: 'Fechado', value: fechadas, fill: STATUS_COLORS.fechado },
    { name: 'S/ Retorno', value: indicacoes.filter(i => i.status === 'sem_retorno').length, fill: STATUS_COLORS.sem_retorno },
  ];

  // Charts Logic
  // 1. NPS Evolution (Daily)
  const npsByDate = avaliacoes.reduce((acc: any, curr) => {
    const d = new Date(curr.data_avaliacao).toLocaleDateString('pt-BR');
    if (!acc[d]) acc[d] = { date: d, soma: 0, count: 0 };
    acc[d].soma += curr.nota;
    acc[d].count += 1;
    return acc;
  }, {});
  const npsEvolutionData = Object.values(npsByDate).map((x: any) => ({
    date: x.date,
    media: Number((x.soma / x.count).toFixed(1))
  }));

  // 2. Avaliações por Setor
  const setorDataMap = avaliacoes.reduce((acc: any, curr) => {
    const s = (Array.isArray(curr.setor) ? curr.setor[0]?.nome : curr.setor?.nome) || 'Desconhecido';
    if (!acc[s]) acc[s] = { setor: s, soma: 0, count: 0 };
    acc[s].soma += curr.nota;
    acc[s].count += 1;
    return acc;
  }, {});
  const setorData = Object.values(setorDataMap).map((x: any) => ({
    name: x.setor,
    media: Number((x.soma / x.count).toFixed(1)),
    total: x.count
  }));

  // Performance
  const userPerformance = usuarios.map(u => {
    const avs = avaliacoes.filter(a => a.usuario_id === u.id).length;
    const inds = indicacoes.filter(i => i.usuario_id === u.id);
    const fech = inds.filter(i => i.status === 'fechado').length;
    const success = inds.length > 0 ? Math.round((fech / inds.length) * 100) : 0;
    return { id: u.id, nome: u.nome, avaliacoes: avs, indicacoes: inds.length, sucesso: success };
  }).sort((a, b) => b.indicacoes - a.indicacoes || b.avaliacoes - a.avaliacoes);

  // Open Indications
  const openIndicacoes = indicacoes
    .filter(i => i.status === 'pendente' || i.status === 'em_tratativa')
    .sort((a, b) => new Date(b.data_indicacao).getTime() - new Date(a.data_indicacao).getTime())
    .slice(0, 5);

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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard Geral</h1>
          <p className="text-slate-500 text-sm mt-1">Acompanhe a satisfação e indicações da sua unidade.</p>
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
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Top Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Avaliações Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
                <Star className="w-5 h-5 text-blue-500" /> Total Avaliações
              </div>
              <div className="text-3xl font-bold text-slate-800">{totalAvaliacoes}</div>
              <div className="mt-2 text-sm text-slate-500 flex items-center gap-2">
                <span className="font-bold text-blue-600">NPS Médio: {mediaNPS}</span>
              </div>
            </div>

            {/* Distribuição Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
                <Users className="w-5 h-5 text-indigo-500" /> Clientes
              </div>
              <div className="flex justify-between items-end mt-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{promotores}</div>
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Promotores</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-500">{neutros}</div>
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Neutros</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-500">{detratores}</div>
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Detratores</div>
                </div>
              </div>
            </div>

            {/* Indicações Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
                <Megaphone className="w-5 h-5 text-orange-500" /> Total Indicações
              </div>
              <div className="text-3xl font-bold text-slate-800">{totalIndicacoes}</div>
              <div className="mt-2 text-sm text-slate-500 flex items-center gap-2">
                <span className="font-bold text-orange-600">Fechadas: {fechadas}</span>
              </div>
            </div>

            {/* Conversão Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
                <Target className="w-5 h-5 text-green-500" /> Conversão
              </div>
              <div className="text-3xl font-bold text-slate-800">{conversao}%</div>
              <div className="mt-2 text-[11px] text-slate-500 uppercase font-semibold">
                Indicações transformadas em negócio
              </div>
            </div>

          </div>

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
                    <div className="text-xs text-slate-500">
                      Cadastrado: {new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}
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
