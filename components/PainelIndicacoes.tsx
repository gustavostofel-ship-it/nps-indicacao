'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Megaphone, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Hash, Clock, Wifi, List, LayoutGrid, Columns3, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { subDays, startOfMonth, format } from 'date-fns';
import { diasDesde } from '@/lib/utils';
import { buscarStatusIndicacao, corStatus, normalizarStatusEmbutido, DIAS_LIMITE_PARADA, StatusIndicacao } from '@/lib/indicacoes';
import IndicacaoDetailModal from '@/components/IndicacaoDetailModal';

const supabase = createClient();

// Quantas indicações mostrar por página nas visões Lista/Card — evita
// carregar o histórico inteiro de uma vez conforme ele cresce.
const PAGE_SIZE = 20;

// A visão Kanban precisa ver o quadro inteiro (agrupado por status), não uma
// página por vez — mas ainda assim com um teto, pra não travar a tela se o
// histórico for enorme. Se passar disso, avisamos e sugerimos filtrar por data.
const KANBAN_LIMIT = 300;

type Indicacao = any;
type Usuario = { id: string, nome: string };
type ViewMode = 'lista' | 'card' | 'kanban';

function DiasParadoBadge({ ind }: { ind: Indicacao }) {
  const dias = diasDesde(ind.updated_at || ind.data_indicacao);
  const parada = !ind.status?.conta_como_fechado && dias >= DIAS_LIMITE_PARADA;
  if (!parada) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded w-fit">
      <Clock className="w-3 h-3" />{Math.floor(dias)}d parada
    </span>
  );
}

export default function PainelIndicacoes() {
  // Chegando de um link como "Ver lista do período" no Dashboard Geral, a
  // tela já abre com o mesmo período selecionado ali (?inicio=&fim=), em vez
  // de sempre resetar pro mês atual.
  const searchParams = useSearchParams();

  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // Todos os status (inclusive inativos — uma indicação antiga pode estar
  // presa a um status que já foi desativado, e precisa continuar mostrando
  // o nome dele em vez de sumir/quebrar).
  const [statusTodos, setStatusTodos] = useState<StatusIndicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  // Só importa no celular — a partir do breakpoint md os filtros ficam
  // sempre visíveis (o CSS força isso independente desse estado); no
  // celular, esconder por padrão evita que os filtros empurrem a lista
  // inteira pra fora da tela.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Lembra o último modo de visualização escolhido (Lista/Card/Kanban) entre
  // navegações — sem isso, toda vez que o usuário saía da aba e voltava o
  // painel resetava pra "lista". Lazy init lê direto na primeira renderização
  // pra não "piscar" lista antes de trocar pro modo salvo.
  const VIEW_MODE_KEY = 'girow:indicacoes:viewMode';
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'lista';
    const salvo = window.localStorage.getItem(VIEW_MODE_KEY);
    return salvo === 'lista' || salvo === 'card' || salvo === 'kanban' ? salvo : 'lista';
  });
  const setViewMode = (modo: ViewMode) => {
    setViewModeState(modo);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, modo);
    } catch {
      // localStorage indisponível (modo privado, etc.) — ignora, só não persiste
    }
  };

  // Filtros que disparam uma nova consulta ao banco.
  const [filtros, setFiltros] = useState(() => ({
    status: '',
    responsavel_id: '',
    data_inicio: searchParams.get('inicio') || format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    data_fim: searchParams.get('fim') || format(new Date(), 'yyyy-MM-dd')
  }));

  // Campo de texto (digitação imediata) vs termo efetivamente buscado
  // (com debounce de 400ms) — evita disparar uma consulta ao banco a cada
  // tecla digitada, e agora busca no histórico inteiro, não só na página
  // carregada (por isso precisa ir ao servidor, não dá pra filtrar só local).
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Item aberto no modal de detalhe — guardamos só o id e derivamos o objeto
  // atual da lista a cada render, assim o modal reflete status/responsável
  // atualizados sem precisar de um segundo estado sincronizado à mão.
  const [detalheAbertoId, setDetalheAbertoId] = useState<string | null>(null);
  const indicacaoAberta = indicacoes.find(i => i.id === detalheAbertoId) || null;

  const carregarUsuarios = async () => {
    const { data } = await supabase.from('perfis_usuarios').select('id, nome');
    if (data) setUsuarios(data);
  };

  const carregarIndicacoes = async () => {
    setLoading(true);

    let query = supabase.from('indicacoes').select(`
      *,
      associados(nome_completo),
      status:indicacao_status(id, nome, cor, ativo, conta_como_fechado)
    `, { count: 'exact' }).order('data_indicacao', { ascending: false });

    if (filtros.status) query = query.eq('status_id', filtros.status);
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

    if (searchTerm) {
      // Nome do indicado e protocolo são colunas da própria tabela — dá pra
      // filtrar direto. Nome do associado é de outra tabela, então primeiro
      // descobrimos os ids dos associados que combinam com o termo.
      const { data: assocMatches } = await supabase
        .from('associados')
        .select('id')
        .ilike('nome_completo', `%${searchTerm}%`);
      const assocIds = (assocMatches || []).map((a: any) => a.id);

      // vírgula e parênteses têm significado estrutural na sintaxe de filtro
      // do PostgREST (.or('a.eq.b,c.eq.d')) — sem tirar isso, um termo de
      // busca com esses caracteres poderia adulterar o filtro montado abaixo
      // em vez de só ser buscado como texto.
      const termoSeguro = searchTerm.replace(/[,()]/g, '');
      let orClause = `nome_indicado.ilike.%${termoSeguro}%,protocolo.ilike.%${termoSeguro}%`;
      if (assocIds.length > 0) orClause += `,associado_id.in.(${assocIds.join(',')})`;
      query = query.or(orClause);
    }

    if (viewMode === 'kanban') {
      // Kanban precisa ver o quadro inteiro de uma vez (agrupado por status),
      // não uma página por vez — mas com um teto de segurança.
      query = query.limit(KANBAN_LIMIT);
    } else {
      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Erro ao carregar indicações:', error);
      toast.error('Erro ao carregar indicações: ' + error.message);
      setIndicacoes([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setIndicacoes((data || []).map(normalizarStatusEmbutido));
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    carregarUsuarios();
    buscarStatusIndicacao(supabase, true).then(setStatusTodos);
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  useEffect(() => {
    carregarIndicacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, page, searchTerm, viewMode]);

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
  }, [filtros, page, searchTerm, viewMode]);

  const atualizarFiltro = (novo: Partial<typeof filtros>) => {
    setFiltros(prev => ({ ...prev, ...novo }));
    setPage(1);
  };

  const updateStatus = async (id: string, novoStatusId: string) => {
    const tid = toast.loading('Atualizando status...');
    const { error } = await supabase.from('indicacoes').update({ status_id: novoStatusId }).eq('id', id);
    if (!error) {
      toast.success('Status atualizado', { id: tid });
      const novoStatus = statusTodos.find(s => s.id === novoStatusId);
      setIndicacoes(prev => prev.map(i => i.id === id ? {...i, status_id: novoStatusId, status: novoStatus} : i));
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
      setIndicacoes(prev => prev.map(i => i.id === id ? {...i, responsavel_id: val} : i));
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  const applyDateShortcut = (type: 'hoje' | '7dias' | 'mes') => {
    const today = new Date();
    let start = today;
    if (type === '7dias') start = subDays(today, 7);
    if (type === 'mes') start = startOfMonth(today);

    atualizarFiltro({
      data_inicio: format(start, 'yyyy-MM-dd'),
      data_fim: format(today, 'yyyy-MM-dd')
    });
  };

  const getNomeUsuario = (id: string) => {
    const u = usuarios.find(x => x.id === id);
    return u ? u.nome : 'Usuário Desconhecido';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-8 w-8 text-orange-500" />
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Painel de Indicações</h1>
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

      {/* Filtros — no celular fica colapsado por padrão (só o cabeçalho, que
          funciona como botão) pra não empurrar a lista pra baixo da tela;
          do md pra cima o conteúdo fica sempre visível, o estado passa a não
          fazer diferença nenhuma. */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setFiltrosAbertos(v => !v)}
          className="w-full flex items-center justify-between mb-4 md:cursor-default text-slate-700 dark:text-slate-200 font-semibold"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filtros
          </span>
          <span className="md:hidden text-slate-400 dark:text-slate-500">
            {filtrosAbertos ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </button>

        <div className={`${filtrosAbertos ? 'grid' : 'hidden'} md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`}>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nome, associado ou protocolo..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={e => atualizarFiltro({ status: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
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
              value={filtros.responsavel_id}
              onChange={e => atualizarFiltro({ responsavel_id: e.target.value })}
              className="h-10 w-full px-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="">Todos</option>
              <option value="unassigned">Sem Responsável (Apenas Criador)</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Período de Análise</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={filtros.data_inicio}
                onChange={e => atualizarFiltro({ data_inicio: e.target.value })}
                className="h-10 w-full min-w-0 px-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
              />
              <span className="hidden sm:inline self-center text-slate-400 dark:text-slate-500">-</span>
              <input
                type="date"
                value={filtros.data_fim}
                onChange={e => atualizarFiltro({ data_fim: e.target.value })}
                className="h-10 w-full min-w-0 px-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
              />
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
          Mostrando as {KANBAN_LIMIT} indicações mais recentes de {totalCount} que combinam com os filtros. Restrinja o período de análise pra ver o quadro completo.
        </div>
      )}

      {/* Lista */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl" />
            ))}
          </div>
        ) : indicacoes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            Nenhuma indicação encontrada com os filtros atuais.
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            indicacoes={indicacoes}
            statusTodos={statusTodos}
            onOpenDetalhe={setDetalheAbertoId}
          />
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {indicacoes.map(ind => (
              <button
                key={ind.id}
                onClick={() => setDetalheAbertoId(ind.id)}
                className="text-left border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-slate-800 dark:text-slate-100">{ind.nome_indicado}</div>
                  {ind.protocolo && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                      <Hash className="w-2.5 h-2.5" />{ind.protocolo}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{ind.associados?.nome_completo}</div>
                <DiasParadoBadge ind={ind} />
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${corStatus(ind.status?.cor).badge}`}>{ind.status?.nome || '—'}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{ind.responsavel_id ? getNomeUsuario(ind.responsavel_id) : 'Sem responsável'}</span>
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
                  <th className="px-4 py-3">Indicado / Telefone</th>
                  <th className="px-4 py-3">Associado (Quem indicou)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {indicacoes.map(ind => (
                  <tr
                    key={ind.id}
                    onClick={() => setDetalheAbertoId(ind.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        <Hash className="w-3 h-3" />{ind.protocolo || '—'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">{new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}</div>
                      <DiasParadoBadge ind={ind} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{ind.nome_indicado}</div>
                      <div className="text-slate-500 dark:text-slate-400">{ind.telefone_indicado}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{ind.associados?.nome_completo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${corStatus(ind.status?.cor).badge}`}>{ind.status?.nome || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {ind.responsavel_id ? getNomeUsuario(ind.responsavel_id) : <span className="text-slate-400 dark:text-slate-500">Sem responsável</span>}
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
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2">
              Página {page} de {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * PAGE_SIZE >= totalCount}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {indicacaoAberta && (
        <IndicacaoDetailModal
          ind={indicacaoAberta}
          statusTodos={statusTodos}
          usuarios={usuarios}
          currentUserId={currentUserId}
          supabase={supabase}
          onClose={() => setDetalheAbertoId(null)}
          onStatusChange={updateStatus}
          onResponsavelChange={updateResponsavel}
          getNomeUsuario={getNomeUsuario}
        />
      )}
    </div>
  );
}

// ================= KANBAN =================

function KanbanBoard({
  indicacoes, statusTodos, onOpenDetalhe,
}: {
  indicacoes: Indicacao[];
  statusTodos: StatusIndicacao[];
  onOpenDetalhe: (id: string) => void;
}) {
  const colunas = statusTodos.filter(s => s.ativo || indicacoes.some(i => i.status_id === s.id));

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {colunas.map(col => {
          const items = indicacoes.filter(i => i.status_id === col.id);
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

              {items.map(ind => (
                <button
                  key={ind.id}
                  onClick={() => onOpenDetalhe(ind.id)}
                  className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{ind.protocolo || '—'}</span>
                    <DiasParadoBadge ind={ind} />
                  </div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{ind.nome_indicado}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{ind.associados?.nome_completo}</div>
                </button>
              ))}

              {items.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">Nenhuma indicação</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
