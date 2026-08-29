'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Plus, UserPlus, Car, Star, Megaphone, Edit2, X, ChevronDown, ChevronUp, Users, ArrowLeft, Hash, Clock, ChevronLeft, ChevronRight, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { diasDesde } from '@/lib/utils';
import { STATUS_BADGE_CLASSES, STATUS_LABELS, DIAS_LIMITE_PARADA } from '@/lib/indicacoes';
import IndicacaoTimeline from '@/components/IndicacaoTimeline';
import AssociadoHistorico from '@/components/AssociadoHistorico';

const supabase = createClient();

// Quantos associados mostrar por página na lista — evita carregar a base
// inteira de uma vez conforme o cadastro cresce.
const ASSOC_PAGE_SIZE = 12;

export default function Dashboard() {
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [associado, setAssociado] = useState<any>(null);
  const [listaAssociados, setListaAssociados] = useState<any[]>([]);
  const [assocSearchTerm, setAssocSearchTerm] = useState('');
  const [assocPage, setAssocPage] = useState(1);
  const [assocTotalCount, setAssocTotalCount] = useState(0);
  const [showHistoricoAssociado, setShowHistoricoAssociado] = useState(false);

  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [indicacoes, setIndicacoes] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  
  // Modals
  const [showNovoAssociado, setShowNovoAssociado] = useState(false);
  const [showNovaPlaca, setShowNovaPlaca] = useState(false);
  const [showNovaAvaliacao, setShowNovaAvaliacao] = useState<{aberto: boolean, setorId: string | null}>({aberto: false, setorId: null});
  const [showNovaIndicacao, setShowNovaIndicacao] = useState(false);
  
  // Inline edit state
  const [editAssociado, setEditAssociado] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editCpf, setEditCpf] = useState('');

  // Expandable sections
  const [expandedSetores, setExpandedSetores] = useState<Record<string, boolean>>({});
  const [expandedIndicacoes, setExpandedIndicacoes] = useState<Record<string, boolean>>({});

  // Lista paginada de associados — busca (se houver termo) e navegação de
  // página passam sempre por aqui, evitando carregar a base inteira de uma vez.
  const carregarListaAssociados = async (termo = '', pagina = 1) => {
    let query = supabase.from('associados')
      .select('id, nome_completo, cpf, veiculos(id), avaliacoes(id), indicacoes(id)', { count: 'exact' })
      .order('nome_completo', { ascending: true });

    if (termo) query = query.or(`cpf.ilike.%${termo}%,nome_completo.ilike.%${termo}%`);

    const from = (pagina - 1) * ASSOC_PAGE_SIZE;
    query = query.range(from, from + ASSOC_PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      toast.error('Erro ao carregar associados: ' + error.message);
      setListaAssociados([]);
      setAssocTotalCount(0);
      return;
    }

    if (termo && (!data || data.length === 0)) {
      toast.error('Nenhum associado encontrado.');
    }

    setListaAssociados(data || []);
    setAssocTotalCount(count || 0);
  };

  const irParaPaginaAssociados = (pagina: number) => {
    setAssocPage(pagina);
    carregarListaAssociados(assocSearchTerm, pagina);
  };

  const carregarSetores = async () => {
    const { data } = await supabase.from('setores').select('*').eq('ativo', true).order('ordem', { ascending: true });
    if (data) setSetores(data);
  };

  useEffect(() => {
    carregarSetores();
    carregarListaAssociados('', 1);
    supabase.from('perfis_usuarios').select('id, nome').then(({ data }) => {
      if (data) setUsuarios(data);
    });
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssociado(null);
    if (!busca) {
      setAssocSearchTerm('');
      setAssocPage(1);
      await carregarListaAssociados('', 1);
      return;
    }

    setLoading(true);

    // CPF exato e placa exata são checados em paralelo (antes eram duas idas
    // sequenciais ao banco antes de cair na busca combinada) — reduz a
    // espera no caso mais comum de digitar um CPF ou placa completos.
    const [cpfRes, placaRes] = await Promise.all([
      supabase.from('associados').select('*').eq('cpf', busca).maybeSingle(),
      supabase.from('veiculos').select('associado_id').ilike('placa', busca).eq('ativo', true).maybeSingle(),
    ]);

    if (cpfRes.data) {
      await carregarDadosAssociado(cpfRes.data);
      setLoading(false);
      return;
    }

    if (placaRes.data) {
      const assoc = await supabase.from('associados').select('*').eq('id', placaRes.data.associado_id).maybeSingle();
      if (assoc.data) {
        await carregarDadosAssociado(assoc.data);
        setLoading(false);
        return;
      }
    }

    setAssocSearchTerm(busca);
    setAssocPage(1);
    await carregarListaAssociados(busca, 1);
    setLoading(false);
  };

  const carregarDadosAssociado = async (assocData: any) => {
    setAssociado(assocData);
    setEditNome(assocData.nome_completo);
    setEditCpf(assocData.cpf);
    setShowHistoricoAssociado(false);
    
    const [veiculosRes, avaliacoesRes, indicacoesRes] = await Promise.all([
      supabase.from('veiculos').select('*').eq('associado_id', assocData.id).eq('ativo', true),
      supabase.from('avaliacoes').select('*, setor:setores(nome), avaliacao_notas(nota, criterios_avaliacao(nome))').eq('associado_id', assocData.id).order('data_avaliacao', { ascending: false }),
      supabase.from('indicacoes').select('*').eq('associado_id', assocData.id).order('data_indicacao', { ascending: false })
    ]);
    
    setVeiculos(veiculosRes.data || []);
    setAvaliacoes(avaliacoesRes.data || []);
    setIndicacoes(indicacoesRes.data || []);
  };

  const handleSaveAssociado = async () => {
    if (!editNome || !editCpf) return;
    const tid = toast.loading('Salvando...');
    const { error } = await supabase.from('associados').update({ nome_completo: editNome, cpf: editCpf }).eq('id', associado.id);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message, { id: tid });
    } else {
      toast.success('Salvo!', { id: tid });
      setAssociado({...associado, nome_completo: editNome, cpf: editCpf});
      setEditAssociado(false);
    }
  };

  const toggleSetorExpand = (setorId: string) => {
    setExpandedSetores(prev => ({...prev, [setorId]: !prev[setorId]}));
  };
  
  const toggleIndicacaoExpand = (indId: string) => {
    setExpandedIndicacoes(prev => ({...prev, [indId]: !prev[indId]}));
  };

  const updateIndicacaoStatus = async (id: string, novoStatus: string) => {
    const tid = toast.loading('Atualizando...');
    const { error } = await supabase.from('indicacoes').update({ status: novoStatus }).eq('id', id);
    if (!error) {
      setIndicacoes(indicacoes.map(i => i.id === id ? {...i, status: novoStatus} : i));
      toast.success('Status atualizado', { id: tid });
    } else {
      toast.error('Erro ao atualizar', { id: tid });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Search Bar */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por CPF ou Nome do associado..."
              className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all shadow-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 font-semibold shadow-sm shadow-blue-200 transition-colors flex justify-center items-center"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Buscar'}
          </button>
        </form>
      </div>

      {/* Initial / List State */}
      {!associado && !loading && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" /> Associados
            </h2>
            <button 
              onClick={() => setShowNovoAssociado(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 font-semibold shadow-sm shadow-blue-200 transition-colors flex items-center gap-2"
            >
              <UserPlus className="h-5 w-5" />
              Novo Associado
            </button>
          </div>

          {listaAssociados.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Nenhum associado encontrado</h2>
              <p className="text-slate-500 max-w-md">
                Você ainda não tem associados cadastrados ou nenhum corresponde à sua busca.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listaAssociados.map((assoc) => (
                <div 
                  key={assoc.id} 
                  onClick={() => { setBusca(assoc.cpf); handleSearch({preventDefault: () => null} as any); }}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 group"
                >
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">{assoc.nome_completo}</h3>
                    <p className="text-sm text-slate-500 font-medium">CPF: {assoc.cpf}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-2 border-t border-slate-100 pt-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                      <Car className="w-4 h-4 text-slate-400" /> {assoc.veiculos?.length || 0} veículos
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">
                      <Star className="w-4 h-4 text-blue-400" /> {assoc.avaliacoes?.length || 0} avaliações
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-orange-50 text-orange-600 px-2.5 py-1 rounded-lg">
                      <Megaphone className="w-4 h-4 text-orange-400" /> {assoc.indicacoes?.length || 0} indicações
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assocTotalCount > ASSOC_PAGE_SIZE && (
            <div className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-sm text-slate-500">
                Mostrando {(assocPage - 1) * ASSOC_PAGE_SIZE + 1}–{Math.min(assocPage * ASSOC_PAGE_SIZE, assocTotalCount)} de {assocTotalCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => irParaPaginaAssociados(assocPage - 1)}
                  disabled={assocPage <= 1}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-slate-700 px-2">
                  Página {assocPage} de {Math.max(1, Math.ceil(assocTotalCount / ASSOC_PAGE_SIZE))}
                </span>
                <button
                  onClick={() => irParaPaginaAssociados(assocPage + 1)}
                  disabled={assocPage * ASSOC_PAGE_SIZE >= assocTotalCount}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Associado Found */}
      {associado && (
        <div className="space-y-6">
          <div className="flex items-center">
            <button
              onClick={() => { setAssociado(null); setBusca(''); setAssocSearchTerm(''); setAssocPage(1); carregarListaAssociados('', 1); }}
              className="text-slate-500 hover:text-blue-600 flex items-center gap-2 font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Voltar para a lista
            </button>
          </div>
          
          {/* Header Info */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-start">
            {editAssociado ? (
              <div className="flex-1 max-w-lg space-y-3">
                <input value={editNome} onChange={e=>setEditNome(e.target.value)} className="w-full text-xl font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Nome Completo" />
                <input value={editCpf} onChange={e=>setEditCpf(e.target.value)} className="w-full text-slate-600 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="CPF" />
                <div className="flex gap-2">
                  <button onClick={handleSaveAssociado} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">Salvar</button>
                  <button onClick={() => {setEditAssociado(false); setEditNome(associado.nome_completo); setEditCpf(associado.cpf);}} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="w-full">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                  {associado.nome_completo}
                  <button onClick={() => setEditAssociado(true)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Editar dados">
                    <Edit2 className="h-4 w-4" />
                  </button>
                </h2>
                <p className="text-slate-500 mt-1 font-medium">CPF: {associado.cpf}</p>
              </div>
            )}
            {!editAssociado && (
              <button
                onClick={() => setShowHistoricoAssociado(v => !v)}
                className="text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1 text-xs font-semibold shrink-0 ml-4"
                title="Ver histórico de edições do cadastro"
              >
                <History className="h-4 w-4" /> Histórico
                {showHistoricoAssociado ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {showHistoricoAssociado && !editAssociado && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 -mt-2">
              <AssociadoHistorico supabase={supabase} associadoId={associado.id} usuarios={usuarios} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Veiculos */}
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Car className="h-5 w-5 text-blue-600" /> Veículos
                </h3>
                <button onClick={() => setShowNovaPlaca(true)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              {veiculos.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500 text-sm font-medium">Nenhum veículo</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {veiculos.map(v => (
                    <div key={v.id} className="bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-sm flex flex-col">
                      <span className="font-bold text-slate-800">{v.placa}</span>
                      <span className="text-slate-500 text-xs">{v.modelo}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avaliações */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-5">
                <Star className="h-5 w-5 text-yellow-500" /> Avaliações NPS
              </h3>
              
              {setores.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500 text-sm font-medium">Nenhum setor de avaliação configurado no sistema.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {setores.map(setor => {
                    const avalDoSetor = avaliacoes.filter(a => a.setor_id === setor.id);
                    const ultima = avalDoSetor[0]; // já ordenado DESC
                    const isPromoter = ultima && ultima.nota >= 9;
                    
                    return (
                      <div key={setor.id} className={`border rounded-xl overflow-hidden transition-colors ${isPromoter ? 'border-green-300 shadow-sm' : 'border-slate-200'}`}>
                        <div className={`p-4 ${isPromoter ? 'bg-green-50' : 'bg-slate-50'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-800">{setor.nome}</h4>
                            <button 
                              onClick={() => setShowNovaAvaliacao({aberto: true, setorId: setor.id})}
                              className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2 py-1 bg-blue-100 rounded flex items-center"
                            >
                              + Nova
                            </button>
                          </div>
                          
                          {ultima ? (
                            <div className="mt-3 flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                                ${ultima.nota >= 9 ? 'bg-green-200 text-green-800' : 
                                  ultima.nota >= 7 ? 'bg-yellow-200 text-yellow-800' : 'bg-red-200 text-red-800'}`}>
                                {ultima.nota}
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 font-medium">Última em {new Date(ultima.data_avaliacao).toLocaleDateString('pt-BR')}</p>
                                {isPromoter && <span className="text-[10px] uppercase font-bold text-green-700">Oportunidade de Indicação</span>}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400 mt-2">Sem avaliações</p>
                          )}
                        </div>
                        
                        {(() => {
                          const temNotasCriteriosUltima = ultima?.avaliacao_notas && ultima.avaliacao_notas.length > 0;
                          const temHistorico = avalDoSetor.length > 1;
                          const podeExpandir = temHistorico || temNotasCriteriosUltima;
                          
                          if (!podeExpandir) return null;
                          
                          return (
                            <div className="border-t border-slate-200/50 bg-white">
                              <button 
                                onClick={() => toggleSetorExpand(setor.id)} 
                                className="w-full px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 flex justify-center items-center gap-1"
                              >
                                {expandedSetores[setor.id] ? 'Ocultar Detalhes' : (temHistorico ? 'Ver Detalhes e Histórico' : 'Ver Detalhes')}
                                {expandedSetores[setor.id] ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                              </button>
                              
                              {expandedSetores[setor.id] && (
                                <div className="px-4 pb-3 space-y-2">
                                  {avalDoSetor.map((av, index) => {
                                    const temNotasCriterios = av.avaliacao_notas && av.avaliacao_notas.length > 0;
                                    return (
                                      <div key={av.id} className="flex flex-col text-xs py-2 border-b border-slate-100 last:border-0">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-slate-500">
                                            {new Date(av.data_avaliacao).toLocaleDateString('pt-BR')}
                                            {index === 0 ? ' (Última)' : ''}
                                          </span>
                                          <span className={`font-bold px-2 py-0.5 rounded ${av.nota >= 9 ? 'bg-green-100 text-green-700' : av.nota >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                            {temNotasCriterios ? 'Média' : 'Nota'}: {av.nota}
                                          </span>
                                        </div>
                                        {temNotasCriterios && (
                                          <div className="mt-1 pl-2 border-l-2 border-slate-200 space-y-1">
                                            {av.avaliacao_notas.map((an: any, idx: number) => (
                                              <div key={idx} className="flex justify-between text-slate-600">
                                                <span>{an.criterios_avaliacao?.nome || 'Critério'}:</span>
                                                <span className="font-medium">{an.nota}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Indicações */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-600" /> Indicações
              </h3>
              <button 
                onClick={() => setShowNovaIndicacao(true)} 
                className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" /> Nova Indicação
              </button>
            </div>
            
            {indicacoes.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 font-medium">Nenhuma indicação registrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {indicacoes.map(ind => {
                  const dias = diasDesde(ind.updated_at || ind.data_indicacao);
                  const parada = (ind.status === 'pendente' || ind.status === 'em_tratativa') && dias >= DIAS_LIMITE_PARADA;
                  return (
                  <div key={ind.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800">{ind.nome_indicado}</p>
                          {ind.protocolo && (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                              <Hash className="w-3 h-3" />{ind.protocolo}
                            </span>
                          )}
                          {parada && (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              <Clock className="w-3 h-3" />{Math.floor(dias)}d parada
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{ind.telefone_indicado} • {new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={ind.status}
                          onChange={(e) => updateIndicacaoStatus(ind.id, e.target.value)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 appearance-none ${STATUS_BADGE_CLASSES[ind.status] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => toggleIndicacaoExpand(ind.id)}
                          className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-slate-50"
                        >
                          {expandedIndicacoes[ind.id] ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                        </button>
                      </div>
                    </div>

                    {expandedIndicacoes[ind.id] && (
                      <div className="p-4 bg-slate-50 border-t border-slate-100">
                        <IndicacaoTimeline
                          supabase={supabase}
                          indicacaoId={ind.id}
                          usuarios={usuarios}
                          currentUserId={currentUserId}
                        />
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals go here */}
      {showNovoAssociado && <ModalNovoAssociado setores={setores} onClose={() => setShowNovoAssociado(false)} onSave={(assoc: any) => { setBusca(assoc.cpf); handleSearch({preventDefault:()=>null} as any); }} />}
      {showNovaPlaca && <ModalNovaPlaca associadoId={associado?.id} onClose={() => setShowNovaPlaca(false)} onSave={() => handleSearch({preventDefault:()=>null} as any)} />}
      {showNovaAvaliacao.aberto && <ModalNovaAvaliacao associadoId={associado?.id} veiculos={veiculos} setorPreSelecionado={showNovaAvaliacao.setorId} setores={setores} onClose={() => setShowNovaAvaliacao({aberto: false, setorId: null})} onSave={() => handleSearch({preventDefault:()=>null} as any)} />}
      {showNovaIndicacao && <ModalNovaIndicacao associadoId={associado?.id} onClose={() => setShowNovaIndicacao(false)} onSave={() => handleSearch({preventDefault:()=>null} as any)} />}
    </div>
  );
}

// ================= MODALS =================

function NotaSelector({ value, onChange }: { value: number | null, onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 w-full">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
        const isSelected = value === n;
        const colorClass = isSelected 
          ? (n >= 9 ? 'bg-green-600 border-green-600 text-white' : n >= 7 ? 'bg-yellow-500 border-yellow-500 text-white' : 'bg-red-600 border-red-600 text-white')
          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400';
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-10 rounded-lg font-bold border transition-colors flex items-center justify-center ${colorClass}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  );
}

function ModalNovoAssociado({ setores, onClose, onSave }: any) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  
  const [setorId, setSetorId] = useState(setores[0]?.id || '');
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!nome || !cpf) return toast.error('Preencha nome e CPF');
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }

    const tid = toast.loading('Cadastrando...');
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data: assocData, error: assocError } = await supabase
      .from('associados')
      .insert({ nome_completo: nome, cpf })
      .select()
      .single();

    if (assocError) {
      toast.error('Erro ao cadastrar: ' + assocError.message, { id: tid });
      return;
    }

    let veiculoId = null;
    if (placa && modelo) {
      const { data: veiculoData } = await supabase.from('veiculos').insert({
        associado_id: assocData.id,
        placa,
        modelo
      }).select().single();
      if (veiculoData) veiculoId = veiculoData.id;
    }
    
    if (nota !== null && veiculoId && setorId) {
      await supabase.from('avaliacoes').insert({
        associado_id: assocData.id,
        veiculo_id: veiculoId,
        setor_id: setorId,
        nota,
        comentario,
        usuario_id: user?.id
      });
    }
    
    toast.success('Cadastrado com sucesso!', { id: tid });
    onSave(assocData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">Novo Associado - Passo {step} de 3</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input required value={nome} onChange={e=>setNome(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">CPF *</label>
                <input required value={cpf} onChange={e=>setCpf(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Apenas números" />
              </div>
            </div>
          )}
          
          {step === 2 && (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Car className="w-4 h-4 text-slate-400"/> Primeiro Veículo (Opcional)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Placa</label>
                  <input value={placa} onChange={e=>setPlaca(e.target.value.toUpperCase())} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="ABC1D23" maxLength={7} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Modelo</label>
                  <input value={modelo} onChange={e=>setModelo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Onix 1.0" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-slate-400"/> Primeira Avaliação (Opcional)</h4>
              
              {(!placa || !modelo) ? (
                 <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">Adicione um veículo no passo anterior para poder avaliar.</p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Setor</label>
                    <select value={setorId} onChange={e=>setSetorId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                      {setores.map((s:any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nota (0 a 10)</label>
                    <NotaSelector value={nota} onChange={setNota} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Comentário (Opcional)</label>
                    <textarea value={comentario} onChange={e=>setComentario(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={2}></textarea>
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Voltar</button>
            )}
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              {step === 3 ? 'Finalizar' : 'Próximo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalNovaPlaca({ associadoId, onClose, onSave }: any) {
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = toast.loading('Adicionando...');
    const { error } = await supabase.from('veiculos').insert({ associado_id: associadoId, placa, modelo });
    if (error) { toast.error('Erro ao adicionar', { id: tid }); }
    else { toast.success('Adicionado!', { id: tid }); onSave(); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">Nova Placa</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Placa *</label>
            <input required value={placa} onChange={e=>setPlaca(e.target.value.toUpperCase())} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="ABC1D23" maxLength={7} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Modelo *</label>
            <input required value={modelo} onChange={e=>setModelo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalNovaAvaliacao({ associadoId, veiculos, setorPreSelecionado, setores, onClose, onSave }: any) {
  const [setorId, setSetorId] = useState(setorPreSelecionado || (setores[0]?.id || ''));
  const [veiculoId, setVeiculoId] = useState(veiculos[0]?.id || '');
  
  const [criterios, setCriterios] = useState<any[]>([]);
  const [notasCriterios, setNotasCriterios] = useState<Record<string, number>>({});
  const [notaGeral, setNotaGeral] = useState<number | null>(null);
  
  const [comentario, setComentario] = useState('');
  
  useEffect(() => {
    if (!setorId) return;
    const fetchCriterios = async () => {
      const { data } = await supabase.from('criterios_avaliacao').select('*').eq('setor_id', setorId).eq('ativo', true).order('ordem', { ascending: true });
      setCriterios(data || []);
      setNotasCriterios({});
      setNotaGeral(null);
    };
    fetchCriterios();
  }, [setorId]);

  const temCriterios = criterios.length > 0;

  const getMediaCalculada = () => {
    if (!temCriterios) return notaGeral;
    const preenchidas = Object.values(notasCriterios);
    if (preenchidas.length === 0) return null;
    const sum = preenchidas.reduce((a, b) => a + b, 0);
    return Math.round((sum / preenchidas.length) * 10) / 10;
  };

  const media = getMediaCalculada();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoId) return toast.error('Nenhum veículo selecionado');
    
    if (temCriterios) {
      if (Object.keys(notasCriterios).length < criterios.length) {
        return toast.error('Preencha as notas de todos os critérios');
      }
    } else {
      if (notaGeral === null) return toast.error('Selecione uma nota');
    }

    const notaFinal = temCriterios ? media : notaGeral;
    if (notaFinal === null) return;

    const tid = toast.loading('Salvando avaliação...');
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data: avaliacaoData, error } = await supabase.from('avaliacoes').insert({ 
      associado_id: associadoId, 
      veiculo_id: veiculoId, 
      setor_id: setorId,
      nota: notaFinal,
      comentario,
      usuario_id: user?.id
    }).select().single();
    
    if (error) { 
      return toast.error('Erro ao salvar: ' + error.message, { id: tid }); 
    }

    if (temCriterios && avaliacaoData) {
      const notasParaSalvar = Object.entries(notasCriterios).map(([criterio_id, nota_valor]) => ({
        avaliacao_id: avaliacaoData.id,
        criterio_id: criterio_id,
        nota: nota_valor
      }));
      await supabase.from('avaliacao_notas').insert(notasParaSalvar);
    }
    
    toast.success('Avaliação registrada!', { id: tid }); 
    onSave(); 
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500"/> Registrar Avaliação</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Setor</label>
              <select required value={setorId} onChange={e=>setSetorId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {setores.map((s:any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Veículo</label>
              <select required value={veiculoId} onChange={e=>setVeiculoId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {veiculos.length === 0 && <option value="">Sem veículos</option>}
                {veiculos.map((v:any) => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
            </div>
          </div>
          
          {temCriterios ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-semibold text-slate-700">Critérios de Avaliação</h4>
                {media !== null && (
                  <span className={`px-2 py-1 rounded font-bold text-sm ${media >= 9 ? 'bg-green-100 text-green-700' : media >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    Média: {media.toFixed(1)}
                  </span>
                )}
              </div>
              {criterios.map(c => (
                <div key={c.id}>
                  <label className="block text-sm font-medium text-slate-600 mb-2">{c.nome}</label>
                  <NotaSelector 
                    value={notasCriterios[c.id] ?? null} 
                    onChange={(n) => setNotasCriterios(prev => ({...prev, [c.id]: n}))} 
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Nota Geral (0 a 10)</label>
              <NotaSelector value={notaGeral} onChange={setNotaGeral} />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Comentário (Opcional)</label>
            <textarea value={comentario} onChange={e=>setComentario(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={3}></textarea>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Salvar Avaliação</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalNovaIndicacao({ associadoId, onClose, onSave }: any) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [obs, setObs] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = toast.loading('Registrando indicação...');
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('indicacoes').insert({ 
      associado_id: associadoId, 
      nome_indicado: nome, 
      telefone_indicado: telefone,
      observacoes: obs,
      usuario_id: user?.id,
      responsavel_id: user?.id
    });
    
    if (error) { toast.error('Erro ao registrar', { id: tid }); }
    else { toast.success('Indicação salva!', { id: tid }); onSave(); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">Nova Indicação</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome do Indicado *</label>
            <input required value={nome} onChange={e=>setNome(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Telefone / WhatsApp *</label>
            <input required value={telefone} onChange={e=>setTelefone(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Observações iniciais</label>
            <textarea value={obs} onChange={e=>setObs(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={2}></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
