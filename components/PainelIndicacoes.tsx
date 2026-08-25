'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Megaphone, Edit2, Check, X, Users, Calendar, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { subDays, startOfMonth, format } from 'date-fns';

const supabase = createClient();

type Indicacao = any;
type Usuario = { id: string, nome: string };

export default function PainelIndicacoes() {
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtros, setFiltros] = useState({
    status: '',
    search: '',
    responsavel_id: '',
    data_inicio: '',
    data_fim: ''
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editObs, setEditObs] = useState('');

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
    if (filtros.responsavel_id) query = query.eq('responsavel_id', filtros.responsavel_id);
    if (filtros.data_inicio) {
      const start = new Date(`${filtros.data_inicio}T00:00:00`);
      
      // removed gte
    }
    if (filtros.data_fim) {
      const end = new Date(`${filtros.data_fim}T23:59:59.999`);
      
      // removed lte
    }

    const { data, error } = await query;
    
    if (data) {
      let filteredData = data;
      if (filtros.data_inicio) filteredData = filteredData.filter((a: any) => new Date(a.data_indicacao) >= new Date(filtros.data_inicio + 'T00:00:00'));
      if (filtros.data_fim) filteredData = filteredData.filter((a: any) => new Date(a.data_indicacao) <= new Date(filtros.data_fim + 'T23:59:59.999'));
      if (filtros.search) {
        const term = filtros.search.toLowerCase();
        filteredData = data.filter((item: any) => 
          item.nome_indicado?.toLowerCase().includes(term) ||
          item.associados?.nome_completo?.toLowerCase().includes(term)
        );
      }
      setIndicacoes(filteredData);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  useEffect(() => {
    carregarIndicacoes();
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

  const saveObs = async (id: string) => {
    const tid = toast.loading('Salvando observações...');
    const { error } = await supabase.from('indicacoes').update({ observacoes: editObs }).eq('id', id);
    if (!error) {
      toast.success('Salvo!', { id: tid });
      setIndicacoes(indicacoes.map(i => i.id === id ? {...i, observacoes: editObs} : i));
      setEditId(null);
    } else {
      toast.error('Erro ao salvar', { id: tid });
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <Megaphone className="h-8 w-8 text-orange-500" />
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Painel de Indicações</h1>
      </div>

      {/* Filtros */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
          <Filter className="h-5 w-5" /> Filtros
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Buscar (Associado ou Indicado)</label>
            <input 
              type="text" 
              placeholder="Digite um nome..."
              value={filtros.search}
              onChange={e => setFiltros({...filtros, search: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
            <select 
              value={filtros.status}
              onChange={e => setFiltros({...filtros, status: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="em_tratativa">Em Tratativa</option>
              <option value="fechado">Fechado</option>
              <option value="sem_retorno">Sem Retorno</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Responsável</label>
            <select 
              value={filtros.responsavel_id}
              onChange={e => setFiltros({...filtros, responsavel_id: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="unassigned">Sem Responsável (Apenas Criador)</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Período</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="date"
                value={filtros.data_inicio}
                onChange={e => setFiltros({...filtros, data_inicio: e.target.value})}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm outline-none"
              />
              <span className="hidden sm:inline self-center text-slate-400">-</span>
              <input 
                type="date"
                value={filtros.data_fim}
                onChange={e => setFiltros({...filtros, data_fim: e.target.value})}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <button onClick={() => applyDateShortcut('hoje')} className="text-orange-600 font-medium hover:underline">Hoje</button>
              <button onClick={() => applyDateShortcut('7dias')} className="text-orange-600 font-medium hover:underline">7 Dias</button>
              <button onClick={() => applyDateShortcut('mes')} className="text-orange-600 font-medium hover:underline">Este Mês</button>
              <button onClick={() => setFiltros({...filtros, data_inicio: '', data_fim: ''})} className="text-slate-500 hover:underline">Limpar</button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : indicacoes.length === 0 ? (
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
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Indicado / Telefone</th>
                    <th className="px-4 py-3">Associado (Quem indicou)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Observações (Follow-up)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {indicacoes.map(ind => (
                    <tr key={ind.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{ind.nome_indicado}</div>
                        <div className="text-slate-500">{ind.telefone_indicado}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">{ind.associados?.nome_completo}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select 
                          value={ind.status}
                          onChange={(e) => updateStatus(ind.id, e.target.value)}
                          className={`px-2 py-1 rounded-lg text-xs font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2
                            ${ind.status === 'pendente' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200 focus:ring-yellow-500' : 
                              ind.status === 'em_tratativa' ? 'bg-blue-50 text-blue-700 ring-blue-200 focus:ring-blue-500' : 
                              ind.status === 'fechado' ? 'bg-green-50 text-green-700 ring-green-200 focus:ring-green-500' : 
                              'bg-red-50 text-red-700 ring-red-200 focus:ring-red-500'}
                          `}
                        >
                          <option value="pendente">Pendente</option>
                          <option value="em_tratativa">Em Tratativa</option>
                          <option value="fechado">Fechado</option>
                          <option value="sem_retorno">Sem Retorno</option>
                        </select>
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
                      <td className="px-4 py-3 min-w-[250px]">
                        {editId === ind.id ? (
                          <div className="flex gap-2">
                            <textarea
                              value={editObs}
                              onChange={(e) => setEditObs(e.target.value)}
                              className="w-full text-xs p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                              rows={3}
                              placeholder="Adicione um follow-up..."
                            />
                            <div className="flex flex-col gap-1">
                              <button onClick={() => saveObs(ind.id)} className="bg-green-500 text-white p-1 rounded hover:bg-green-600"><Check className="w-4 h-4"/></button>
                              <button onClick={() => setEditId(null)} className="bg-red-500 text-white p-1 rounded hover:bg-red-600"><X className="w-4 h-4"/></button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative pr-8 text-xs text-slate-600 whitespace-pre-wrap">
                            {ind.observacoes ? ind.observacoes : <span className="text-slate-400 italic">Sem observações.</span>}
                            <button 
                              onClick={() => {setEditId(ind.id); setEditObs(ind.observacoes || '');}}
                              className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 transition-opacity"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Cards View */}
            <div className="block lg:hidden divide-y divide-slate-100">
              {indicacoes.map(ind => (
                <div key={ind.id} className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-800 text-base">{ind.nome_indicado}</div>
                      <div className="text-slate-500 text-sm">{ind.telefone_indicado}</div>
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
                      <select 
                        value={ind.status}
                        onChange={(e) => updateStatus(ind.id, e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2
                          ${ind.status === 'pendente' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200 focus:ring-yellow-500' : 
                            ind.status === 'em_tratativa' ? 'bg-blue-50 text-blue-700 ring-blue-200 focus:ring-blue-500' : 
                            ind.status === 'fechado' ? 'bg-green-50 text-green-700 ring-green-200 focus:ring-green-500' : 
                            'bg-red-50 text-red-700 ring-red-200 focus:ring-red-500'}
                        `}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="em_tratativa">Em Tratativa</option>
                        <option value="fechado">Fechado</option>
                        <option value="sem_retorno">Sem Retorno</option>
                      </select>
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
                    <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Observações</div>
                    {editId === ind.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editObs}
                          onChange={(e) => setEditObs(e.target.value)}
                          className="w-full text-sm p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                          rows={3}
                          placeholder="Adicione um follow-up..."
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
                          <button onClick={() => saveObs(ind.id)} className="px-3 py-1.5 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600">Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <div className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
                          {ind.observacoes ? ind.observacoes : <span className="text-slate-400 italic">Sem observações.</span>}
                        </div>
                        <button 
                          onClick={() => {setEditId(ind.id); setEditObs(ind.observacoes || '');}}
                          className="absolute right-2 top-2 p-1 bg-white rounded-md shadow-sm text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
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
