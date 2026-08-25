'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Copy, Check, Trash2, Edit2, Settings, Users, LayoutDashboard, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ConfigPage() {
  const [setores, setSetores] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [convites, setConvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    const [setoresRes, usuariosRes, convitesRes] = await Promise.all([
      supabase.from('setores').select('*').order('ordem', { ascending: true }),
      supabase.from('perfis_usuarios').select('*').order('created_at', { ascending: false }),
      supabase.from('convites').select('*').order('created_at', { ascending: false })
    ]);
    
    if (setoresRes.data) setSetores(setoresRes.data);
    if (usuariosRes.data) setUsuarios(usuariosRes.data);
    if (convitesRes.data) setConvites(convitesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Configurações</h2>
          <p className="text-slate-500 text-sm">Gerencie setores e acessos da equipe</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
          <SetoresManager setores={setores} onUpdate={fetchData} supabase={supabase} />
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
           <UsuariosManager usuarios={usuarios} convites={convites} onUpdate={fetchData} supabase={supabase} />
        </div>
      </div>
    </div>
  );
}

function SetorItem({ setor, onUpdate, supabase }: any) {
  const [expanded, setExpanded] = useState(false);
  const [criterios, setCriterios] = useState<any[]>([]);
  const [novoCriterio, setNovoCriterio] = useState('');

  const toggleAtivo = async () => {
    const toastId = toast.loading('Atualizando status...');
    const { error } = await supabase.from('setores').update({ ativo: !setor.ativo }).eq('id', setor.id);
    if (error) toast.error('Erro ao atualizar', { id: toastId });
    else { toast.success('Status atualizado', { id: toastId }); onUpdate(); }
  };

  const loadCriterios = async () => {
    const { data } = await supabase.from('criterios_avaliacao').select('*').eq('setor_id', setor.id).order('ordem', { ascending: true });
    if (data) setCriterios(data);
  };

  useEffect(() => {
    if (expanded) loadCriterios();
  }, [expanded]);

  const handleAddCriterio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoCriterio.trim()) return;
    const toastId = toast.loading('Adicionando critério...');
    const { error } = await supabase.from('criterios_avaliacao').insert({ setor_id: setor.id, nome: novoCriterio, ordem: criterios.length });
    if (error) toast.error('Erro ao adicionar', { id: toastId });
    else { toast.success('Adicionado!', { id: toastId }); setNovoCriterio(''); loadCriterios(); }
  };

  const toggleCriterioAtivo = async (id: string, ativo: boolean) => {
    const toastId = toast.loading('Atualizando...');
    const { error } = await supabase.from('criterios_avaliacao').update({ ativo: !ativo }).eq('id', id);
    if (error) toast.error('Erro', { id: toastId });
    else { toast.success('Atualizado', { id: toastId }); loadCriterios(); }
  };

  return (
    <li className="flex flex-col p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          <span className={`font-medium ${!setor.ativo ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{setor.nome}</span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); toggleAtivo(); }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${setor.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
        >
          {setor.ativo ? 'Ativo' : 'Inativo'}
        </button>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-200 pl-7 space-y-3">
          <p className="text-sm font-semibold text-slate-600 mb-2">Critérios de Avaliação</p>
          
          <form onSubmit={handleAddCriterio} className="flex gap-2">
            <input type="text" placeholder="Novo critério" value={novoCriterio} onChange={(e) => setNovoCriterio(e.target.value)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="bg-slate-800 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-slate-900 transition-colors">Adicionar</button>
          </form>
          
          {criterios.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhum critério. O setor usará nota única.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {criterios.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-white px-3 py-2 border border-slate-100 rounded-lg">
                  <span className={`text-sm ${!c.ativo ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{c.nome}</span>
                  <button onClick={() => toggleCriterioAtivo(c.id, c.ativo)} className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${c.ativo ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function SetoresManager({ setores, onUpdate, supabase }: any) {
  const [nome, setNome] = useState('');
  
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    
    const toastId = toast.loading('Adicionando setor...');
    const { error } = await supabase.from('setores').insert({ nome, ordem: setores.length });
    
    if (error) {
      toast.error('Erro ao adicionar setor', { id: toastId });
    } else {
      toast.success('Setor adicionado!', { id: toastId });
      setNome('');
      onUpdate();
    }
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    const toastId = toast.loading('Atualizando status...');
    const { error } = await supabase.from('setores').update({ ativo: !ativo }).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar', { id: toastId });
    } else {
      toast.success('Status atualizado', { id: toastId });
      onUpdate();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <LayoutDashboard className="w-5 h-5 text-slate-400" />
        <h3 className="text-lg font-bold text-slate-800">Setores de Avaliação</h3>
      </div>
      
      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input 
          type="text" 
          placeholder="Nome do novo setor" 
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
        <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-sm shadow-blue-200">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </form>

      {setores.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <LayoutDashboard className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">Nenhum setor cadastrado</p>
          <p className="text-sm text-slate-500 mt-1">Cadastre o primeiro setor para começar a usar os cards de avaliação.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {setores.map((setor: any) => (
            <SetorItem key={setor.id} setor={setor} onUpdate={onUpdate} supabase={supabase} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UsuariosManager({ usuarios, convites, onUpdate, supabase }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ nome: '', cargo: '', funcao: '', papel: 'atendente' });
  
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Gerando convite...');
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('convites').insert({
      ...formData,
      criado_por: user?.id
    });
    
    if (error) {
      toast.error('Erro ao gerar convite', { id: toastId });
    } else {
      toast.success('Convite gerado com sucesso!', { id: toastId });
      setFormData({ nome: '', cargo: '', funcao: '', papel: 'atendente' });
      setShowForm(false);
      onUpdate();
    }
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link de convite copiado!');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-bold text-slate-800">Usuários & Convites</h3>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Convite
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} className="mb-6 p-5 bg-blue-50 border border-blue-100 rounded-xl space-y-4 text-sm animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Nome completo" required value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <input type="text" placeholder="Cargo (Ex: Supervisor)" required value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Função" required value={formData.funcao} onChange={e => setFormData({...formData, funcao: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <select value={formData.papel} onChange={e => setFormData({...formData, papel: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium">
              <option value="atendente">Atendente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 font-medium text-slate-600 hover:bg-blue-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">Gerar Convite</button>
          </div>
        </form>
      )}

      {usuarios.length === 0 && convites.filter((c:any) => c.status === 'pendente').length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <Users className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">Nenhuma equipe configurada</p>
          <p className="text-sm text-slate-500 mt-1">Gere um convite para adicionar membros.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {convites.filter((c:any) => c.status === 'pendente').map((convite: any) => (
            <div key={convite.id} className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-semibold text-orange-900 text-sm flex items-center gap-2">
                  {convite.nome} 
                  <span className="text-[10px] uppercase tracking-wider font-bold bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">Pendente</span>
                </p>
                <p className="text-xs text-orange-700 mt-0.5">{convite.cargo} • {convite.papel === 'admin' ? 'Administrador' : 'Atendente'}</p>
              </div>
              <button onClick={() => copyToClipboard(convite.token)} className="text-orange-600 bg-white hover:bg-orange-100 p-2 border border-orange-200 rounded-lg shadow-sm transition-colors flex items-center gap-2" title="Copiar Link">
                <Copy className="w-4 h-4" />
                <span className="text-xs font-semibold">Copiar Link</span>
              </button>
            </div>
          ))}

          {usuarios.map((usr: any) => (
            <div key={usr.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800 text-sm">{usr.nome}</p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">{usr.cargo}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${usr.papel === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                  {usr.papel === 'admin' ? 'Admin' : 'Atendente'}
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${usr.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                  {usr.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

