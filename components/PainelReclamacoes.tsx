'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AlertOctagon, Filter, ChevronLeft, ChevronRight, Hash, Clock, Wifi, List, LayoutGrid, Columns3, AlertTriangle, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { subDays, startOfMonth, format } from 'date-fns';
import { diasDesde } from '@/lib/utils';
import { buscarStatusReclamacao, buscarMotivosReclamacao, corStatus, normalizarStatusEmbutido, registrarObservacaoReclamacao, DIAS_LIMITE_PARADA, StatusReclamacao, MotivoReclamacao } from '@/lib/reclamacoes';
import ModalFinalizarReclamacao from '@/components/ModalFinalizarReclamacao';
import ReclamacaoDetailModal from '@/components/ReclamacaoDetailModal';

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

export default function PainelReclamacoes() {
  const searchParams = useSearchParams();

  const [reclamacoes, setReclamacoes] = useState<Reclamacao[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [statusTodos, setStatusTodos] = useState<StatusReclamacao[]>([]);
  const [motivosTodos, setMotivosTodos] = useState<MotivoReclamacao[]>([]);
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

  // Item aberto no modal de detalhe — guardamos só o id e derivamos o objeto
  // atual da lista a cada render, assim o modal reflete status/responsável
  // atualizados sem precisar de um segundo estado sincronizado à mão.
  const [detalheAbertoId, setDetalheAbertoId] = useState<string | null>(null);
  const reclamacaoAberta = reclamacoes.find(r => r.id === detalheAbertoId) || null;

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
      status:reclamacao_status(id, nome, cor, ativo, conta_como_resolvido),
      motivo:reclamacao_motivo(id, nome)
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
    buscarMotivosReclamacao(supabase, true).then(setMotivosTodos);
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

  const salvarEdicao = async (id: string, motivoId: string, descricao: string) => {
    const tid = toast.loading('Salvando...');
    const { error } = await supabase.from('reclamacoes').update({
      motivo_id: motivoId || null,
      descricao: descricao || null,
    }).eq('id', id);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message, { id: tid });
      return;
    }
    toast.success('Alterações salvas!', { id: tid });
    const novoMotivo = motivosTodos.find(m => m.id === motivoId);
    setReclamacoes(prev => prev.map(r => r.id === id ? {...r, motivo_id: motivoId || null, motivo: novoMotivo || null, descricao: descricao || null} : r));
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-8 w-8 text-red-500" />
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Reclamações</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-full">
            <Wifi className="w-3.5 h-3.5" /> Atualização em tempo real
          </span>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {([
              { key: 'lista' as const, label: 'Lista', Icon: List },
              { key: 'card' as const, label: 'Card', Icon: LayoutGrid },
              { key: 'kanban' as const, label: 'Kanban', Icon: Columns3 },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setViewMode(key); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === key ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-4 text-slate-700 dark:text-slate-200 font-semibold">
          <Filter className="h-5 w-5" /> Filtros
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Protocolo, associado ou descrição..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={e => atualizarFiltro({ status: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="">Todos</option>
              {statusTodos.map(s => (
                <option key={s.id} value={s.id}>{s.nome}{!s.ativo ? ' (inativo)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Responsável</label>
            <select
              value={filtros.responsavel_atual_id}
              onChange={e => atualizarFiltro({ responsavel_atual_id: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="">Todos</option>
              <option value="unassigned">Sem responsável</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Período de Análise</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="date" value={filtros.data_inicio} onChange={e => atualizarFiltro({ data_inicio: e.target.value })} className="h-10 w-full min-w-0 px-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]" />
              <span className="hidden sm:inline self-center text-slate-400 dark:text-slate-500">-</span>
              <input type="date" value={filtros.data_fim} onChange={e => atualizarFiltro({ data_fim: e.target.value })} className="h-10 w-full min-w-0 px-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
              <button onClick={() => applyDateShortcut('hoje')} className="text-blue-600 font-medium hover:underline">Hoje</button>
              <button onClick={() => applyDateShortcut('7dias')} className="text-blue-600 font-medium hover:underline">7 Dias</button>
              <button onClick={() => applyDateShortcut('mes')} className="text-blue-600 font-medium hover:underline">Este Mês</button>
              <button onClick={() => atualizarFiltro({ data_inicio: '', data_fim: '' })} className="text-slate-500 dark:text-slate-400 hover:underline">Limpar</button>
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

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
          </div>
        ) : reclamacoes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            Nenhuma reclamação encontrada com os filtros atuais.
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard reclamacoes={reclamacoes} statusTodos={statusTodos} onOpenDetalhe={setDetalheAbertoId} />
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {reclamacoes.map(rec => (
              <button
                key={rec.id}
                onClick={() => setDetalheAbertoId(rec.id)}
                className="text-left border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-slate-800 dark:text-slate-100">{rec.associados?.nome_completo}</div>
                  {rec.protocolo && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                      <Hash className="w-2.5 h-2.5" />{rec.protocolo}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{rec.motivo?.nome || 'Sem motivo definido'}</div>
                <DiasParadaBadge rec={rec} />
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${corStatus(rec.status?.cor).badge}`}>{rec.status?.nome || '—'}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{rec.responsavel_atual_id ? getNomeUsuario(rec.responsavel_atual_id) : 'Sem responsável'}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 uppercase font-semibold text-xs border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Protocolo / Data</th>
                  <th className="px-4 py-3">Associado</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reclamacoes.map(rec => (
                  <tr
                    key={rec.id}
                    onClick={() => setDetalheAbertoId(rec.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        <Hash className="w-3 h-3" />{rec.protocolo || '—'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">{new Date(rec.data_abertura).toLocaleDateString('pt-BR')}</div>
                      <DiasParadaBadge rec={rec} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{rec.associados?.nome_completo}</div>
                      {rec.avaliacao && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <Star className="w-3 h-3 text-yellow-500" /> Nota {rec.avaliacao.nota}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{rec.motivo?.nome || 'Sem motivo definido'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${corStatus(rec.status?.cor).badge}`}>{rec.status?.nome || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {rec.responsavel_atual_id ? getNomeUsuario(rec.responsavel_atual_id) : <span className="text-slate-400 dark:text-slate-500">Sem responsável</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewMode !== 'kanban' && totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2">Página {page} de {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= totalCount} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {reclamacaoAberta && (
        <ReclamacaoDetailModal
          rec={reclamacaoAberta}
          statusTodos={statusTodos}
          motivosTodos={motivosTodos}
          usuarios={usuarios}
          currentUserId={currentUserId}
          supabase={supabase}
          onClose={() => setDetalheAbertoId(null)}
          onStatusChange={updateStatus}
          onResponsavelChange={updateResponsavel}
          onSalvarEdicao={salvarEdicao}
          getNomeUsuario={getNomeUsuario}
        />
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
  reclamacoes, statusTodos, onOpenDetalhe,
}: {
  reclamacoes: Reclamacao[];
  statusTodos: StatusReclamacao[];
  onOpenDetalhe: (id: string) => void;
}) {
  const colunas = statusTodos.filter(s => s.ativo || reclamacoes.some(r => r.status_id === s.id));

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {colunas.map(col => {
          const items = reclamacoes.filter(r => r.status_id === col.id);
          const cor = corStatus(col.cor);
          return (
            <div key={col.id} className="rounded-xl p-3 flex flex-col gap-2 min-h-[160px] bg-slate-50 dark:bg-slate-900/40">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${cor.dot}`} />
                  {col.nome}{!col.ativo && ' (inativo)'}
                </span>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>

              {items.map(rec => (
                <button
                  key={rec.id}
                  onClick={() => onOpenDetalhe(rec.id)}
                  className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{rec.protocolo || '—'}</span>
                    <DiasParadaBadge rec={rec} />
                  </div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{rec.associados?.nome_completo}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{rec.motivo?.nome || 'Sem motivo definido'}</div>
                </button>
              ))}

              {items.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">Nenhuma reclamação</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
