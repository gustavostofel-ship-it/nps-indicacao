'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Megaphone, Filter, ChevronDown, ChevronUp, Hash, Clock, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';
import { subDays, startOfMonth, format } from 'date-fns';
import { diasDesde } from '@/lib/utils';
import { STATUS_LABELS, STATUS_BADGE_CLASSES, DIAS_LIMITE_PARADA } from '@/lib/indicacoes';
import IndicacaoTimeline from '@/components/IndicacaoTimeline';

const supabase = createClient();

type Indicacao = any;
type Usuario = { id: string, nome: string };

// Definidos fora do componente para não serem recriados a cada render (o que
// desmontaria o <select> nativo e derrubaria o foco do usuário no meio de uma
// interação).
function DiasParadoBadge({ ind }: { ind: Indicacao }) {
  const dias = diasDesde(ind.updated_at || ind.data_indicacao);
  const parada = (ind.status === 'pendente' || ind.status === 'em_tratativa') && dias >= DIAS_LIMITE_PARADA;
  if (!parada) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded w-fit">
      <Clock className="w-3 h-3" />{Math.floor(dias)}d parada
    </span>
  );
}

function StatusSelect({ ind, onChange }: { ind: Indicacao, onChange: (id: string, status: string) => void }) {
  return (
    <select
      value={ind.status}
      onChange={(e) => onChange(ind.id, e.target.value)}
      className={`px-2 py-1 rounded-lg text-xs font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2 ${STATUS_BADGE_CLASSES[ind.status] || 'bg-slate-50 text-slate-700 ring-slate-200'}`}
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}

export default function PainelIndicacoes() {
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  // Filtros que disparam uma nova consulta ao banco.
  const [filtros, setFiltros] = useState({
    status: '',
    responsavel_id: '',
    data_inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    data_fim: format(new Date(), 'yyyy-MM-dd')
  });

  // Busca por texto: filtra só na memória (não deve gerar uma nova consulta
  // ao banco a cada letra digitada — ver anotação abaixo).
  const [searchTerm, setSearchTerm] = useState('');

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const carregarUsuarios = async () => {
    const { data } = await supabase.from('perfis_usuarios').select('id, nome');
    if (data) setUsuarios(data);
  };

  const carregarIndicacoes = async () => {
    setLoading(true);
    let query = supabase.from('indicacoes').select(`
      *,
      associados(nome_completo)
    `).order('data_indicacao', { ascending: false });

    if (filtros.status) query = query.eq('status', filtros.status);
    if (filtros.responsavel_id === 'unassigned') {
      query = query.is('responsavel_id', null);
    } else if (filtros.responsavel_id) {
      query = query.eq('responsavel_id', filtros.responsavel_id);
    }
    if (filtros.data_inicio) {
      const start = new Date(`${filtros.data_inicio}T00:00:00`).toISOString();
      query = query.gte('data_indicacao', start);
    }
    if (filtros.data_fim) {
      const end = new Date(`${filtros.data_fim}T23:59:59.999`).toISOString();
      query = query.lte('data_indicacao', end);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao carregar indicações:', error);
      toast.error('Erro ao carregar indicações: ' + error.message);
      setIndicacoes([]);
      setLoading(false);
      return;
    }

    setIndicacoes(data || []);
    setLoading(false);
  };

  // Filtro de texto aplicado só sobre os dados já carregados — não refaz a
  // consulta ao Supabase a cada tecla digitada.
  const indicacoesFiltradas = useMemo(() => {
    if (!searchTerm) return indicacoes;
    const term = searchTerm.toLowerCase();
    return indicacoes.filter((item: any) =>
      item.nome_indicado?.toLowerCase().includes(term) ||
      item.protocolo?.toLowerCase().includes(term) ||
      item.associados?.nome_completo?.toLowerCase().includes(term)
    );
  }, [indicacoes, searchTerm]);

  useEffect(() => {
    carregarUsuarios();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  useEffect(() => {
    carregarIndicacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  // Tempo real: qualquer criação/alteração em indicacoes feita por outra
  // pessoa (ou outra aba) atualiza esta tela sozinha, sem precisar de F5.
  useEffect(() => {
    const channel = supabase
      .channel('indicacoes-painel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'indicacoes' }, () => {
        carregarIndicacoes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const updateStatus = async (id: string, novoStatus: string) => {
    const tid = toast.loading('Atualizando status...');
    const { error } = await supabase.from('indicacoes').update({ status: novoStatus }).eq('id', id);
    if (!error) {
      toast.success('Status atualizado', { id: tid });
      setIndicacoes(indicacoes.map(i => i.id === id ? {...i, status: novoStatus} : i));
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  const updateResponsavel = async (id: string, novoResp: string) => {
    const tid = toast.loading('Reatribuindo responsável...');
    const val = novoResp === '' ? null : novoResp;
    const { error } = await supabase.from('indicacoes').update({ responsavel_id: val }).eq('id', id);
    if (!error) {
      toast.success('Responsável atualizado', { id: tid });
      setIndicacoes(indicacoes.map(i => i.id === id ? {...i, responsavel_id: val} : i));
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  const applyDateShortcut = (type: 'hoje' | '7dias' | 'mes') => {
    const today = new Date();
    let start = today;
    if (type === '7dias') start = subDays(today, 7);
    if (type === 'mes') start = startOfMonth(today);

    setFiltros({
      ...filtros,
      data_inicio: format(start, 'yyyy-MM-dd'),
      data_fim: format(today, 'yyyy-MM-dd')
    });
  };

  const getNomeUsuario = (id: string) => {
    const u = usuarios.find(x => x.id === id);
    return u ? u.nome : 'Usuário Desconhecido';
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-8 w-8 text-orange-500" />
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Painel de Indicações</h1>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-full">
          <Wifi className="w-3.5 h-3.5" /> Atualização em tempo real
        </span>
      </div>

      {/* Filtros */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
          <Filter className="h-5 w-5" /> Filtros
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nome, associado ou protocolo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={e => setFiltros({...filtros, status: e.target.value})}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Responsável</label>
            <select
              value={filtros.responsavel_id}
              onChange={e => setFiltros({...filtros, responsavel_id: e.target.value})}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="unassigned">Sem Responsável (Apenas Criador)</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Período de Análise</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={filtros.data_inicio}
                onChange={e => setFiltros({...filtros, data_inicio: e.target.value})}
                className="h-10 w-full min-w-0 px-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="hidden sm:inline self-center text-slate-400">-</span>
              <input
                type="date"
                value={filtros.data_fim}
                onChange={e => setFiltros({...filtros, data_fim: e.target.value})}
                className="h-10 w-full min-w-0 px-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
              <button onClick={() => applyDateShortcut('hoje')} className="text-blue-600 font-medium hover:underline">Hoje</button>
              <button onClick={() => applyDateShortcut('7dias')} className="text-blue-600 font-medium hover:underline">7 Dias</button>
              <button onClick={() => applyDateShortcut('mes')} className="text-blue-600 font-medium hover:underline">Este Mês</button>
              <button onClick={() => setFiltros({...filtros, data_inicio: '', data_fim: ''})} className="text-slate-500 hover:underline">Limpar</button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : indicacoesFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nenhuma indicação encontrada com os filtros atuais.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Protocolo / Data</th>
                    <th className="px-4 py-3">Indicado / Telefone</th>
                    <th className="px-4 py-3">Associado (Quem indicou)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Histórico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {indicacoesFiltradas.map(ind => (
                    <Fragment key={ind.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500">
                            <Hash className="w-3 h-3" />{ind.protocolo || '—'}
                          </div>
                          <div className="text-slate-500 mt-0.5">{new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}</div>
                          <DiasParadoBadge ind={ind} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{ind.nome_indicado}</div>
                          <div className="text-slate-500">{ind.telefone_indicado}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-700">{ind.associados?.nome_completo}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusSelect ind={ind} onChange={updateStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={ind.responsavel_id || ''}
                            onChange={(e) => updateResponsavel(ind.id, e.target.value)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white w-full max-w-[150px] outline-none"
                          >
                            <option value="">Sem responsável</option>
                            {usuarios.map(u => (
                              <option key={u.id} value={u.id}>{u.nome}</option>
                            ))}
                          </select>
                          {!ind.responsavel_id && ind.usuario_id && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              Criador: {getNomeUsuario(ind.usuario_id)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(ind.id)}
                            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            {expandedIds[ind.id] ? 'Ocultar' : 'Ver histórico'}
                            {expandedIds[ind.id] ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                        </td>
                      </tr>
                      {expandedIds[ind.id] && (
                        <tr>
                          <td colSpan={6} className="px-4 pb-5 bg-slate-50 border-b border-slate-100">
                            <div className="max-w-2xl">
                              <IndicacaoTimeline
                                supabase={supabase}
                                indicacaoId={ind.id}
                                usuarios={usuarios}
                                currentUserId={currentUserId}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block lg:hidden divide-y divide-slate-100">
              {indicacoesFiltradas.map(ind => (
                <div key={ind.id} className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-slate-800 text-base">{ind.nome_indicado}</div>
                        {ind.protocolo && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                            <Hash className="w-2.5 h-2.5" />{ind.protocolo}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-sm">{ind.telefone_indicado}</div>
                      <DiasParadoBadge ind={ind} />
                    </div>
                    <div className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      {new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Indicado por</div>
                    <div className="text-sm font-medium text-slate-700">{ind.associados?.nome_completo}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Status</div>
                      <StatusSelect ind={ind} onChange={updateStatus} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Responsável</div>
                      <select
                        value={ind.responsavel_id || ''}
                        onChange={(e) => updateResponsavel(ind.id, e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white w-full outline-none"
                      >
                        <option value="">Sem responsável</option>
                        {usuarios.map(u => (
                          <option key={u.id} value={u.id}>{u.nome}</option>
                        ))}
                      </select>
                      {!ind.responsavel_id && ind.usuario_id && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Criador: {getNomeUsuario(ind.usuario_id)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => toggleExpand(ind.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 mb-2"
                    >
                      {expandedIds[ind.id] ? 'Ocultar histórico' : 'Ver histórico'}
                      {expandedIds[ind.id] ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                    </button>
                    {expandedIds[ind.id] && (
                      <IndicacaoTimeline
                        supabase={supabase}
                        indicacaoId={ind.id}
                        usuarios={usuarios}
                        currentUserId={currentUserId}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
