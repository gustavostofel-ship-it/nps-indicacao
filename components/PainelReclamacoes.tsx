'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AlertOctagon, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Hash, Clock, Wifi, List, LayoutGrid, Columns3, AlertTriangle, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { subDays, startOfMonth, format } from 'date-fns';
import { diasDesde } from '@/lib/utils';
import { buscarStatusReclamacao, corStatus, normalizarStatusEmbutido, registrarObservacaoReclamacao, DIAS_LIMITE_PARADA, StatusReclamacao } from '@/lib/reclamacoes';
import ReclamacaoTimeline from '@/components/ReclamacaoTimeline';
import ModalFinalizarReclamacao from '@/components/ModalFinalizarReclamacao';

const supabase = createClient();

// Mesmos limites/motivos que o Painel de Indicações — ver comentários lá.
const PAGE_SIZE = 20;
const KANBAN_LIMIT = 300;

type Reclamacao = any;
type Usuario = { id: string, nome: string };
type ViewMode = 'lista' | 'card' | 'kanban';

function DiasParadaBadge({ rec }: { rec: Reclamacao }) {
  const dias = diasDesde(rec.updated_at || rec.data_abertura);
  const parada = !rec.status?.conta_como_resolvido && dias >= DIAS_LIMITE_PARADA;
  if (!parada) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded w-fit">
      <Clock className="w-3 h-3" />{Math.floor(dias)}d parada
    </span>
  );
}

function StatusSelect({ rec, opcoes, onChange }: { rec: Reclamacao, opcoes: StatusReclamacao[], onChange: (id: string, statusId: string) => void }) {
  const cor = corStatus(rec.status?.cor);
  return (
    <select
      value={rec.status_id}
      onChange={(e) => onChange(rec.id, e.target.value)}
      className={`px-2 py-1 rounded-lg text-xs font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2 ${cor.badge} ${cor.ring}`}
    >
      {opcoes.map(s => (
        <option key={s.id} value={s.id}>{s.nome}</option>
      ))}
    </select>
  );
}

export default function PainelReclamacoes() {
  const searchParams = useSearchParams();

  const [reclamacoes, setReclamacoes] = useState<Reclamacao[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [statusTodos, setStatusTodos] = useState<StatusReclamacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const VIEW_MODE_KEY = 'girow:reclamacoes:viewMode';
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'lista';
    const salvo = window.localStorage.getItem(VIEW_MODE_KEY);
    return salvo === 'lista' || salvo === 'card' || salvo === 'kanban' ? salvo : 'lista';
  });
  const setViewMode = (modo: ViewMode) => {
    setViewModeState(modo);
    try { window.localStorage.setItem(VIEW_MODE_KEY, modo); } catch {}
  };

  const statusAtivos = statusTodos.filter(s => s.ativo);

  const opcoesStatusPara = (rec: Reclamacao): StatusReclamacao[] => {
    if (!rec.status || rec.status.ativo === false && !statusAtivos.some(s => s.id === rec.status_id)) {
      const atual = statusTodos.find(s => s.id === rec.status_id);
      return atual ? [...statusAtivos, atual] : statusAtivos;
    }
    return statusAtivos;
  };

  const [filtros, setFiltros] = useState(() => ({
    status: '',
    responsavel_atual_id: '',
    data_inicio: searchParams.get('inicio') || format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    data_fim: searchParams.get('fim') || format(new Date(), 'yyyy-MM-dd')
  }));

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearchTerm(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  // Guarda a troca de status pendente enquanto o modal de finalização está
  // aberto (precisa da nota antes de aplicar de verdade).
  const [finalizando, setFinalizando] = useState<{ id: string, statusId: string, statusNome: string } | null>(null);

  const carregarUsuarios = async () => {
    const { data } = await supabase.from('perfis_usuarios').select('id, nome');
    if (data) setUsuarios(data);
  };

  const carregarReclamacoes = async () => {
    setLoading(true);

    let query = supabase.from('reclamacoes').select(`
      *,
      associados(nome_completo),
      avaliacao:avaliacoes(nota, setor:setores(nome)),
      status:reclamacao_status(id, nome, cor, ativo, conta_como_resolvido)
    `, { count: 'exact' }).order('data_abertura', { ascending: false });

    if (filtros.status) query = query.eq('status_id', filtros.status);
    if (filtros.responsavel_atual_id === 'unassigned') {
      query = query.is('responsavel_atual_id', null);
    } else if (filtros.responsavel_atual_id) {
      query = query.eq('responsavel_atual_id', filtros.responsavel_atual_id);
    }
    if (filtros.data_inicio) {
      query = query.gte('data_abertura', new Date(`${filtros.data_inicio}T00:00:00`).toISOString());
    }
    if (filtros.data_fim) {
      query = query.lte('data_abertura', new Date(`${filtros.data_fim}T23:59:59.999`).toISOString());
    }

    if (searchTerm) {
      const { data: assocMatches } = await supabase
        .from('associados')
        .select('id')
        .ilike('nome_completo', `%${searchTerm}%`);
      const assocIds = (assocMatches || []).map((a: any) => a.id);

      let orClause = `protocolo.ilike.%${searchTerm}%,descricao.ilike.%${searchTerm}%`;
      if (assocIds.length > 0) orClause += `,associado_id.in.(${assocIds.join(',')})`;
      query = query.or(orClause);
    }

    if (viewMode === 'kanban') {
      query = query.limit(KANBAN_LIMIT);
    } else {
      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Erro ao carregar reclamações:', error);
      toast.error('Erro ao carregar reclamações: ' + error.message);
      setReclamacoes([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setReclamacoes((data || []).map(normalizarStatusEmbutido));
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    carregarUsuarios();
    buscarStatusReclamacao(supabase, true).then(setStatusTodos);
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  useEffect(() => {
    carregarReclamacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, page, searchTerm, viewMode]);

  useEffect(() => {
    const channel = supabase
      .channel('reclamacoes-painel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reclamacoes' }, () => {
        carregarReclamacoes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, page, searchTerm, viewMode]);

  const atualizarFiltro = (novo: Partial<typeof filtros>) => {
    setFiltros(prev => ({ ...prev, ...novo }));
    setPage(1);
  };

  const aplicarNovoStatus = async (id: string, novoStatusId: string) => {
    const tid = toast.loading('Atualizando status...');
    const { error } = await supabase.from('reclamacoes').update({ status_id: novoStatusId }).eq('id', id);
    if (!error) {
      toast.success('Status atualizado', { id: tid });
      const novoStatus = statusTodos.find(s => s.id === novoStatusId);
      setReclamacoes(prev => prev.map(r => r.id === id ? {...r, status_id: novoStatusId, status: novoStatus} : r));
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  // "Conta como resolvido" exige protocolar a finalização primeiro — o
  // status só é de fato trocado depois que a nota é confirmada no modal.
  const updateStatus = (id: string, novoStatusId: string) => {
    const rec = reclamacoes.find(r => r.id === id);
    const novoStatus = statusTodos.find(s => s.id === novoStatusId);
    if (novoStatus?.conta_como_resolvido && !rec?.status?.conta_como_resolvido) {
      setFinalizando({ id, statusId: novoStatusId, statusNome: novoStatus.nome });
      return;
    }
    aplicarNovoStatus(id, novoStatusId);
  };

  const confirmarFinalizacao = async (nota: string) => {
    if (!finalizando) return;
    const { id, statusId } = finalizando;
    const tid = toast.loading('Finalizando...');
    const errNota = await registrarObservacaoReclamacao(supabase, id, nota, currentUserId);
    const { error } = await supabase.from('reclamacoes').update({ status_id: statusId }).eq('id', id);
    if (error || errNota) {
      toast.error('Erro ao finalizar', { id: tid });
    } else {
      toast.success('Reclamação finalizada!', { id: tid });
      const novoStatus = statusTodos.find(s => s.id === statusId);
      setReclamacoes(prev => prev.map(r => r.id === id ? {...r, status_id: statusId, status: novoStatus} : r));
    }
    setFinalizando(null);
  };

  const updateResponsavel = async (id: string, novoResp: string) => {
    const tid = toast.loading('Encaminhando...');
    const val = novoResp === '' ? null : novoResp;
    const { error } = await supabase.from('reclamacoes').update({ responsavel_atual_id: val }).eq('id', id);
    if (!error) {
      toast.success('Responsável atualizado', { id: tid });
      setReclamacoes(prev => prev.map(r => r.id === id ? {...r, responsavel_atual_id: val} : r));
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  const applyDateShortcut = (type: 'hoje' | '7dias' | 'mes') => {
    const today = new Date();
    let start = today;
    if (type === '7dias') start = subDays(today, 7);
    if (type === 'mes') start = startOfMonth(today);
    atualizarFiltro({ data_inicio: format(start, 'yyyy-MM-dd'), data_fim: format(today, 'yyyy-MM-dd') });
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
          <AlertOctagon className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Reclamações</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-full">
            <Wifi className="w-3.5 h-3.5" /> Atualização em tempo real
          </span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {([
              { key: 'lista' as const, label: 'Lista', Icon: List },
              { key: 'card' as const, label: 'Card', Icon: LayoutGrid },
              { key: 'kanban' as const, label: 'Kanban', Icon: Columns3 },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setViewMode(key); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
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
              placeholder="Protocolo, associado ou descrição..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={e => atualizarFiltro({ status: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
            >
              <option value="">Todos</option>
              {statusTodos.map(s => (
                <option key={s.id} value={s.id}>{s.nome}{!s.ativo ? ' (inativo)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Responsável</label>
            <select
              value={filtros.responsavel_atual_id}
              onChange={e => atualizarFiltro({ responsavel_atual_id: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="unassigned">Sem responsável</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Período de Análise</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="date" value={filtros.data_inicio} onChange={e => atualizarFiltro({ data_inicio: e.target.value })} className="h-10 w-full min-w-0 px-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="hidden sm:inline self-center text-slate-400">-</span>
              <input type="date" value={filtros.data_fim} onChange={e => atualizarFiltro({ data_fim: e.target.value })} className="h-10 w-full min-w-0 px-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
              <button onClick={() => applyDateShortcut('hoje')} className="text-blue-600 font-medium hover:underline">Hoje</button>
              <button onClick={() => applyDateShortcut('7dias')} className="text-blue-600 font-medium hover:underline">7 Dias</button>
              <button onClick={() => applyDateShortcut('mes')} className="text-blue-600 font-medium hover:underline">Este Mês</button>
              <button onClick={() => atualizarFiltro({ data_inicio: '', data_fim: '' })} className="text-slate-500 hover:underline">Limpar</button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'kanban' && totalCount > KANBAN_LIMIT && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Mostrando as {KANBAN_LIMIT} reclamações mais recentes de {totalCount} que combinam com os filtros. Restrinja o período de análise pra ver o quadro completo.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
          </div>
        ) : reclamacoes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nenhuma reclamação encontrada com os filtros atuais.
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            reclamacoes={reclamacoes}
            statusTodos={statusTodos}
            usuarios={usuarios}
            currentUserId={currentUserId}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            updateStatus={updateStatus}
            updateResponsavel={updateResponsavel}
            getNomeUsuario={getNomeUsuario}
          />
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {reclamacoes.map(rec => (
              <div key={rec.id} className="border border-slate-200 rounded-xl p-4 space-y-3 hover:border-blue-200 transition-colors">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-slate-800">{rec.associados?.nome_completo}</div>
                      {rec.protocolo && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                          <Hash className="w-2.5 h-2.5" />{rec.protocolo}
                        </span>
                      )}
                    </div>
                    {rec.avaliacao && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <Star className="w-3 h-3 text-yellow-500" /> Nota {rec.avaliacao.nota} · {rec.avaliacao.setor?.nome}
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded whitespace-nowrap">
                    {new Date(rec.data_abertura).toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <DiasParadaBadge rec={rec} />

                <p className="text-sm text-slate-600 line-clamp-2">{rec.descricao}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Status</div>
                    <StatusSelect rec={rec} opcoes={opcoesStatusPara(rec)} onChange={updateStatus} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Responsável</div>
                    <select
                      value={rec.responsavel_atual_id || ''}
                      onChange={(e) => updateResponsavel(rec.id, e.target.value)}
                      className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white w-full outline-none"
                    >
                      <option value="">Sem responsável</option>
                      {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                    <div className="text-[10px] text-slate-400 mt-1">Aberto por: {getNomeUsuario(rec.aberto_por)}</div>
                  </div>
                </div>

                <div>
                  <button onClick={() => toggleExpand(rec.id)} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 mb-2">
                    {expandedIds[rec.id] ? 'Ocultar histórico' : 'Ver histórico'}
                    {expandedIds[rec.id] ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                  </button>
                  {expandedIds[rec.id] && (
                    <ReclamacaoTimeline supabase={supabase} reclamacaoId={rec.id} usuarios={usuarios} currentUserId={currentUserId} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Protocolo / Data</th>
                  <th className="px-4 py-3">Associado</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Histórico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reclamacoes.map(rec => (
                  <Fragment key={rec.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500">
                          <Hash className="w-3 h-3" />{rec.protocolo || '—'}
                        </div>
                        <div className="text-slate-500 mt-0.5">{new Date(rec.data_abertura).toLocaleDateString('pt-BR')}</div>
                        <DiasParadaBadge rec={rec} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">{rec.associados?.nome_completo}</div>
                        {rec.avaliacao && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                            <Star className="w-3 h-3 text-yellow-500" /> Nota {rec.avaliacao.nota} · {rec.avaliacao.setor?.nome}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="line-clamp-2">{rec.descricao}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusSelect rec={rec} opcoes={opcoesStatusPara(rec)} onChange={updateStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={rec.responsavel_atual_id || ''}
                          onChange={(e) => updateResponsavel(rec.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white w-full max-w-[150px] outline-none"
                        >
                          <option value="">Sem responsável</option>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                        <div className="text-[10px] text-slate-400 mt-1">Aberto por: {getNomeUsuario(rec.aberto_por)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(rec.id)} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
                          {expandedIds[rec.id] ? 'Ocultar' : 'Ver histórico'}
                          {expandedIds[rec.id] ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                      </td>
                    </tr>
                    {expandedIds[rec.id] && (
                      <tr>
                        <td colSpan={6} className="px-4 pb-5 bg-slate-50 border-b border-slate-100">
                          <div className="max-w-2xl">
                            <p className="text-sm text-slate-600 mb-3 bg-white border border-slate-200 rounded-lg p-3">{rec.descricao}</p>
                            <ReclamacaoTimeline supabase={supabase} reclamacaoId={rec.id} usuarios={usuarios} currentUserId={currentUserId} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewMode !== 'kanban' && totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-sm text-slate-500">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 px-2">Página {page} de {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= totalCount} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {finalizando && (
        <ModalFinalizarReclamacao
          statusNome={finalizando.statusNome}
          onConfirm={confirmarFinalizacao}
          onCancel={() => setFinalizando(null)}
        />
      )}
    </div>
  );
}

// ================= KANBAN =================

function KanbanBoard({
  reclamacoes, statusTodos, usuarios, currentUserId, expandedIds, toggleExpand, updateStatus, updateResponsavel, getNomeUsuario,
}: {
  reclamacoes: Reclamacao[];
  statusTodos: StatusReclamacao[];
  usuarios: Usuario[];
  currentUserId: string | undefined;
  expandedIds: Record<string, boolean>;
  toggleExpand: (id: string) => void;
  updateStatus: (id: string, statusId: string) => void;
  updateResponsavel: (id: string, respId: string) => void;
  getNomeUsuario: (id: string) => string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const colunas = statusTodos.filter(s => s.ativo || reclamacoes.some(r => r.status_id === s.id));

  const handleDrop = (statusId: string) => {
    const rec = reclamacoes.find(r => r.id === draggingId);
    if (draggingId && rec && rec.status_id !== statusId) updateStatus(draggingId, statusId);
    setDraggingId(null);
    setDragOverStatus(null);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-slate-400 mb-3">Arraste um card entre as colunas pra mudar o status. Mover pra uma coluna "conta como resolvido" pede uma nota de finalização.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {colunas.map(col => {
          const items = reclamacoes.filter(r => r.status_id === col.id);
          const cor = corStatus(col.cor);
          return (
            <div
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col.id); }}
              onDragLeave={() => setDragOverStatus(prev => (prev === col.id ? null : prev))}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.id); }}
              className={`rounded-xl p-3 flex flex-col gap-2 min-h-[160px] border-2 border-dashed transition-colors ${dragOverStatus === col.id ? 'border-blue-300 bg-blue-50' : 'border-transparent bg-slate-50'}`}
            >
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${cor.dot}`} />
                  {col.nome}{!col.ativo && ' (inativo)'}
                </span>
                <span className="text-xs font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full">{items.length}</span>
              </div>

              {items.map(rec => (
                <div
                  key={rec.id}
                  draggable
                  onDragStart={() => setDraggingId(rec.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                  className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors ${draggingId === rec.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-slate-400">{rec.protocolo || '—'}</span>
                    <DiasParadaBadge rec={rec} />
                  </div>
                  <div className="font-bold text-sm text-slate-800">{rec.associados?.nome_completo}</div>
                  {rec.avaliacao && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Star className="w-3 h-3 text-yellow-500" /> Nota {rec.avaliacao.nota}
                    </div>
                  )}

                  <select
                    value={rec.responsavel_atual_id || ''}
                    onChange={(e) => updateResponsavel(rec.id, e.target.value)}
                    className="mt-2 w-full text-[11px] px-1.5 py-1 border border-slate-200 rounded-md bg-white outline-none"
                  >
                    <option value="">Sem responsável</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>

                  <button onClick={() => toggleExpand(rec.id)} className="text-[11px] text-blue-600 font-semibold mt-2 hover:underline">
                    {expandedIds[rec.id] ? 'Ocultar histórico' : 'Ver histórico'}
                  </button>
                  {expandedIds[rec.id] && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <ReclamacaoTimeline supabase={supabase} reclamacaoId={rec.id} usuarios={usuarios} currentUserId={currentUserId} />
                    </div>
                  )}
                </div>
              ))}

              {items.length === 0 && <p className="text-xs text-slate-400 italic text-center py-6">Nenhuma reclamação</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
