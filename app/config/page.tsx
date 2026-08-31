'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Copy, Check, Trash2, Edit2, Settings, Users, LayoutDashboard, ChevronDown, ChevronUp, Columns3, ArrowUp, ArrowDown, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { CHAVES_CORES_STATUS, corStatus } from '@/lib/indicacoes';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function ConfigPage() {
  const [setores, setSetores] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [convites, setConvites] = useState<any[]>([]);
  const [statusIndicacao, setStatusIndicacao] = useState<any[]>([]);
  const [statusReclamacao, setStatusReclamacao] = useState<any[]>([]);
  const [motivosReclamacao, setMotivosReclamacao] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    const [setoresRes, usuariosRes, convitesRes, statusRes, statusReclRes, motivosRes, userRes] = await Promise.all([
      supabase.from('setores').select('*').order('ordem', { ascending: true }),
      supabase.from('perfis_usuarios').select('*').order('created_at', { ascending: false }),
      supabase.from('convites').select('*').order('created_at', { ascending: false }),
      supabase.from('indicacao_status').select('*').order('ordem', { ascending: true }),
      supabase.from('reclamacao_status').select('*').order('ordem', { ascending: true }),
      supabase.from('reclamacao_motivo').select('*').order('ordem', { ascending: true }),
      supabase.auth.getUser(),
    ]);

    if (setoresRes.data) setSetores(setoresRes.data);
    if (usuariosRes.data) setUsuarios(usuariosRes.data);
    if (convitesRes.data) setConvites(convitesRes.data);
    if (statusRes.data) setStatusIndicacao(statusRes.data);
    if (statusReclRes.data) setStatusReclamacao(statusReclRes.data);
    if (motivosRes.data) setMotivosReclamacao(motivosRes.data);
    setCurrentUserId(userRes.data.user?.id);
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
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Configurações</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Gerencie setores, status de indicação e acessos da equipe</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60 flex flex-col h-full">
          <SetoresManager setores={setores} onUpdate={fetchData} supabase={supabase} />
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60 flex flex-col h-full">
           <UsuariosManager usuarios={usuarios} convites={convites} onUpdate={fetchData} supabase={supabase} currentUserId={currentUserId} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <StatusManager
          statusList={statusIndicacao}
          onUpdate={fetchData}
          supabase={supabase}
          tabela="indicacao_status"
          campoFlag="conta_como_fechado"
          rotuloFlag="Conta como fechado"
          titulo="Status de Indicação"
          descricao={'Essas são as colunas do Kanban e as opções de status em cada indicação. "Conta como fechado" define o que entra nas métricas de Conversão e Tempo de Fechamento do Dashboard.'}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <StatusManager
          statusList={statusReclamacao}
          onUpdate={fetchData}
          supabase={supabase}
          tabela="reclamacao_status"
          campoFlag="conta_como_resolvido"
          rotuloFlag="Conta como resolvido"
          titulo="Status de Reclamação"
          descricao={'Essas são as colunas do Kanban e as opções de status em cada reclamação/tratativa. "Conta como resolvido" define o que entra nas métricas de reclamações resolvidas do Dashboard.'}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <MotivosReclamacaoManager motivos={motivosReclamacao} onUpdate={fetchData} supabase={supabase} />
      </div>
    </div>
  );
}

// Genérico o bastante pra gerenciar tanto indicacao_status quanto
// reclamacao_status (mesma forma: nome/cor/ordem/ativo + uma flag de
// "conta como concluído" cujo nome de campo e rótulo variam por domínio).
function StatusManager({ statusList, onUpdate, supabase, tabela, campoFlag, rotuloFlag, titulo, descricao }: any) {
  const [nome, setNome] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    const toastId = toast.loading('Adicionando status...');
    const { error } = await supabase.from(tabela).insert({ nome, ordem: statusList.length });
    if (error) {
      toast.error('Erro ao adicionar status', { id: toastId });
    } else {
      toast.success('Status adicionado!', { id: toastId });
      setNome('');
      onUpdate();
    }
  };

  const handleRename = async (id: string, novoNome: string, nomeAtual: string) => {
    if (!novoNome.trim() || novoNome === nomeAtual) return;
    const { error } = await supabase.from(tabela).update({ nome: novoNome.trim() }).eq('id', id);
    if (error) toast.error('Erro ao renomear');
    else onUpdate();
  };

  const handleCorChange = async (id: string, cor: string) => {
    const { error } = await supabase.from(tabela).update({ cor }).eq('id', id);
    if (error) toast.error('Erro ao atualizar cor');
    else onUpdate();
  };

  const handleToggle = async (id: string, campo: string, valorAtual: boolean) => {
    const { error } = await supabase.from(tabela).update({ [campo]: !valorAtual }).eq('id', id);
    if (error) toast.error('Erro ao atualizar');
    else onUpdate();
  };

  const handleReorder = async (index: number, direcao: -1 | 1) => {
    const outro = statusList[index + direcao];
    const atual = statusList[index];
    if (!outro) return;
    const toastId = toast.loading('Reordenando...');
    const [r1, r2] = await Promise.all([
      supabase.from(tabela).update({ ordem: outro.ordem }).eq('id', atual.id),
      supabase.from(tabela).update({ ordem: atual.ordem }).eq('id', outro.id),
    ]);
    if (r1.error || r2.error) toast.error('Erro ao reordenar', { id: toastId });
    else { toast.success('Reordenado', { id: toastId }); onUpdate(); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Columns3 className="w-5 h-5 text-slate-400 dark:text-slate-500" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{titulo}</h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{descricao}</p>

      <form onSubmit={handleAdd} className="flex gap-3 mb-6 max-w-lg">
        <input
          type="text"
          placeholder="Nome do novo status"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
        <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-sm shadow-blue-200">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </form>

      {statusList.length === 0 ? (
        <div className="text-center p-8 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Columns3 className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Nenhum status cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 dark:text-slate-400 uppercase font-semibold text-xs border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2 pr-3 w-16">Ordem</th>
                <th className="py-2 pr-3">Cor</th>
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3 text-center">{rotuloFlag}</th>
                <th className="py-2 pr-3 text-center">Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statusList.map((s: any, index: number) => (
                <tr key={s.id} className={!s.ativo ? 'opacity-50' : ''}>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleReorder(index, -1)} disabled={index === 0} className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleReorder(index, 1)} disabled={index === statusList.length - 1} className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={s.cor}
                      onChange={(e) => handleCorChange(s.id, e.target.value)}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${corStatus(s.cor).badge}`}
                    >
                      {CHAVES_CORES_STATUS.map(chave => (
                        <option key={chave} value={chave}>{chave}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      defaultValue={s.nome}
                      onBlur={(e) => handleRename(s.id, e.target.value, s.nome)}
                      className="px-2 py-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-slate-300 rounded-lg outline-none font-medium text-slate-700 dark:text-slate-200 w-full"
                    />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={s[campoFlag]}
                      onChange={() => handleToggle(s.id, campoFlag, s[campoFlag])}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      onClick={() => handleToggle(s.id, 'ativo', s.ativo)}
                      className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${s.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                    >
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Lista de motivos que a pessoa escolhe ao abrir uma reclamação (ex: "Demora
// no atendimento") — mantida pelo admin aqui, sem cor/flag como os status,
// só nome + ativo/inativo. Alimenta o cruzamento "maiores motivos de
// reclamação" no Dashboard.
function MotivosReclamacaoManager({ motivos, onUpdate, supabase }: any) {
  const [nome, setNome] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    const toastId = toast.loading('Adicionando motivo...');
    const { error } = await supabase.from('reclamacao_motivo').insert({ nome: nome.trim(), ordem: motivos.length });
    if (error) {
      toast.error('Erro ao adicionar motivo', { id: toastId });
    } else {
      toast.success('Motivo adicionado!', { id: toastId });
      setNome('');
      onUpdate();
    }
  };

  const handleRename = async (id: string, novoNome: string, nomeAtual: string) => {
    if (!novoNome.trim() || novoNome === nomeAtual) return;
    const { error } = await supabase.from('reclamacao_motivo').update({ nome: novoNome.trim() }).eq('id', id);
    if (error) toast.error('Erro ao renomear');
    else onUpdate();
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    const toastId = toast.loading('Atualizando...');
    const { error } = await supabase.from('reclamacao_motivo').update({ ativo: !ativo }).eq('id', id);
    if (error) toast.error('Erro', { id: toastId });
    else { toast.success('Atualizado', { id: toastId }); onUpdate(); }
  };

  const handleReorder = async (index: number, direcao: -1 | 1) => {
    const outro = motivos[index + direcao];
    const atual = motivos[index];
    if (!outro) return;
    const toastId = toast.loading('Reordenando...');
    const [r1, r2] = await Promise.all([
      supabase.from('reclamacao_motivo').update({ ordem: outro.ordem }).eq('id', atual.id),
      supabase.from('reclamacao_motivo').update({ ordem: atual.ordem }).eq('id', outro.id),
    ]);
    if (r1.error || r2.error) toast.error('Erro ao reordenar', { id: toastId });
    else { toast.success('Reordenado', { id: toastId }); onUpdate(); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Columns3 className="w-5 h-5 text-slate-400 dark:text-slate-500" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Motivos de Reclamação</h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Opções que aparecem ao abrir uma reclamação (ex: "Demora no atendimento", "Atraso de peças"). Quem abre escolhe entre eles, não digita um texto livre — assim dá pra ver no Dashboard quais são os motivos mais recorrentes.
      </p>

      <form onSubmit={handleAdd} className="flex gap-3 mb-6 max-w-lg">
        <input
          type="text"
          placeholder="Nome do novo motivo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
        <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-sm shadow-blue-200">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </form>

      {motivos.length === 0 ? (
        <div className="text-center p-8 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Columns3 className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Nenhum motivo cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {motivos.map((m: any, index: number) => (
            <div key={m.id} className={`flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 rounded-lg ${!m.ativo ? 'opacity-50' : ''}`}>
              <div className="flex gap-0.5">
                <button onClick={() => handleReorder(index, -1)} disabled={index === 0} className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleReorder(index, 1)} disabled={index === motivos.length - 1} className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                defaultValue={m.nome}
                onBlur={(e) => handleRename(m.id, e.target.value, m.nome)}
                className="flex-1 px-2 py-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-slate-300 rounded-lg outline-none font-medium text-slate-700 dark:text-slate-200"
              />
              <button
                onClick={() => toggleAtivo(m.id, m.ativo)}
                className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors shrink-0 ${m.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
              >
                {m.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>
      )}
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
    <li className="flex flex-col p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
          <span className={`font-medium ${!setor.ativo ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{setor.nome}</span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); toggleAtivo(); }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${setor.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
        >
          {setor.ativo ? 'Ativo' : 'Inativo'}
        </button>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 pl-7 space-y-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Critérios de Avaliação</p>
          
          <form onSubmit={handleAddCriterio} className="flex gap-2">
            <input type="text" placeholder="Novo critério" value={novoCriterio} onChange={(e) => setNovoCriterio(e.target.value)} className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="bg-slate-800 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-slate-900 transition-colors">Adicionar</button>
          </form>
          
          {criterios.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum critério. O setor usará nota única.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {criterios.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-slate-700/60 rounded-lg">
                  <span className={`text-sm ${!c.ativo ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-600 dark:text-slate-300'}`}>{c.nome}</span>
                  <button onClick={() => toggleCriterioAtivo(c.id, c.ativo)} className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${c.ativo ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
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
        <LayoutDashboard className="w-5 h-5 text-slate-400 dark:text-slate-500" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Setores de Avaliação</h3>
      </div>
      
      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input 
          type="text" 
          placeholder="Nome do novo setor" 
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
        <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-sm shadow-blue-200">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </form>

      {setores.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <LayoutDashboard className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Nenhum setor cadastrado</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cadastre o primeiro setor para começar a usar os cards de avaliação.</p>
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

function UsuariosManager({ usuarios, convites, onUpdate, supabase, currentUserId }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ nome: '', email: '', funcao: '', papel: 'atendente' });
  const [usuarioParaExcluir, setUsuarioParaExcluir] = useState<any>(null);
  const [excluindo, setExcluindo] = useState(false);

  const toggleStatusUsuario = async (usr: any) => {
    const novoStatus = usr.status === 'ativo' ? 'inativo' : 'ativo';
    const toastId = toast.loading(novoStatus === 'ativo' ? 'Ativando...' : 'Inativando...');
    const { error } = await supabase.from('perfis_usuarios').update({ status: novoStatus }).eq('id', usr.id);
    if (error) {
      toast.error('Erro ao atualizar status', { id: toastId });
    } else {
      toast.success(novoStatus === 'ativo' ? 'Usuário ativado!' : 'Usuário inativado — ele será desconectado no próximo acesso.', { id: toastId });
      onUpdate();
    }
  };

  const handleExcluirUsuario = async () => {
    if (!usuarioParaExcluir) return;
    setExcluindo(true);
    const toastId = toast.loading('Excluindo usuário...');
    try {
      const res = await fetch(`/api/usuarios/${usuarioParaExcluir.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || 'Erro ao excluir usuário', { id: toastId });
      } else {
        toast.success('Usuário excluído.', { id: toastId });
        setUsuarioParaExcluir(null);
        onUpdate();
      }
    } catch {
      toast.error('Erro de rede ao excluir usuário', { id: toastId });
    } finally {
      setExcluindo(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailNormalizado = formData.email.trim().toLowerCase();
    const toastId = toast.loading('Gerando convite...');
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('convites').insert({
      ...formData,
      email: emailNormalizado,
      criado_por: user?.id
    });

    if (error) {
      // E-mail já convidado (ver índice único parcial em convites.email) — dá
      // um retorno específico em vez do genérico "erro ao gerar convite".
      if (error.code === '23505') {
        toast.error('Já existe um convite pendente para esse e-mail.', { id: toastId });
      } else {
        toast.error('Erro ao gerar convite', { id: toastId });
      }
    } else {
      toast.success('Convite gerado com sucesso!', { id: toastId });
      setFormData({ nome: '', email: '', funcao: '', papel: 'atendente' });
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
          <Users className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Usuários & Convites</h3>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Convite
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} className="mb-6 p-5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl space-y-4 text-sm animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" placeholder="Nome completo" required value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-500/30 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
            <input type="email" placeholder="E-mail" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-500/30 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" placeholder="Função" required value={formData.funcao} onChange={e => setFormData({...formData, funcao: e.target.value})} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-500/30 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
            <select value={formData.papel} onChange={e => setFormData({...formData, papel: e.target.value})} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-500/30 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 dark:text-slate-100">
              <option value="atendente">Atendente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-blue-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">Gerar Convite</button>
          </div>
        </form>
      )}

      {usuarios.length === 0 && convites.filter((c:any) => c.status === 'pendente').length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Users className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Nenhuma equipe configurada</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gere um convite para adicionar membros.</p>
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
                <p className="text-xs text-orange-700 mt-0.5">{convite.email}</p>
                <p className="text-xs text-orange-700 mt-0.5">{convite.funcao} • {convite.papel === 'admin' ? 'Administrador' : 'Atendente'}</p>
              </div>
              <button onClick={() => copyToClipboard(convite.token)} className="text-orange-600 bg-white dark:bg-slate-800 hover:bg-orange-100 p-2 border border-orange-200 rounded-lg shadow-sm transition-colors flex items-center gap-2" title="Copiar Link">
                <Copy className="w-4 h-4" />
                <span className="text-xs font-semibold">Copiar Link</span>
              </button>
            </div>
          ))}

          {usuarios.map((usr: any) => {
            const souEu = usr.id === currentUserId;
            return (
            <div key={usr.id} className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 rounded-xl flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{usr.nome} {souEu && <span className="text-slate-400 dark:text-slate-500 font-normal">(você)</span>}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{usr.funcao}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${usr.papel === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {usr.papel === 'admin' ? 'Admin' : 'Atendente'}
                </span>
                <button
                  onClick={() => !souEu && toggleStatusUsuario(usr)}
                  disabled={souEu}
                  title={souEu ? 'Você não pode inativar sua própria conta' : (usr.status === 'ativo' ? 'Inativar usuário' : 'Ativar usuário')}
                  className={`text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${usr.status === 'ativo' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {usr.status === 'ativo' ? 'Ativo' : 'Inativo'}
                </button>
                {!souEu && (
                  <button
                    onClick={() => setUsuarioParaExcluir(usr)}
                    title="Excluir usuário"
                    className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!usuarioParaExcluir}
        title="Excluir usuário?"
        message={`A conta de ${usuarioParaExcluir?.nome} será excluída permanentemente — ele perde o acesso ao sistema imediatamente. Essa ação não pode ser desfeita. Se for só afastar temporariamente, use "Inativar" em vez de excluir.`}
        confirmLabel="Excluir"
        loading={excluindo}
        onConfirm={handleExcluirUsuario}
        onCancel={() => setUsuarioParaExcluir(null)}
      />
    </div>
  );
}

