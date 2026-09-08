'use client';

// Fila de Avaliações Pendentes — ponto único de entrada de demanda de NPS,
// alimentado por duas origens:
// - Assistência 24h: import da planilha de atendimentos (formato fixo, ver
//   lib/pendencias.ts).
// - Eventos (e casos avulsos): lançamento manual, substituindo o e-mail que
//   era mandado depois de cada atendimento.
// Cada pendência é fechada com os mesmos dois botões já usados na ficha do
// associado: "Avaliar" (ModalNovaAvaliacao, compartilhado) ou "Cliente não
// quer avaliar" (dentro do mesmo modal).

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Upload, ClipboardList, PhoneCall, PhoneOff, UserPlus, UserCheck, Star, XCircle,
  CheckCircle2, AlertTriangle, Filter, X, Search, Car, Inbox
} from 'lucide-react';
import { ModalNovaAvaliacao, ResultadoAvaliacao } from '@/components/AvaliacaoModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { maskCPF, maskPhone, maskPlaca, validarCPF, validarPlaca, diasDesde } from '@/lib/utils';
import {
  parseRelatorioAtendimento, agruparAtendimentos, dataBrParaISO,
  ROTULO_STATUS_PENDENCIA, LIMITE_TENTATIVAS, StatusPendencia, AtendimentoAgrupado,
} from '@/lib/pendencias';

const supabase = createClient();

type Pendencia = {
  id: string;
  origem: 'assistencia_24h' | 'eventos' | 'manual';
  setor_id: string | null;
  associado_id: string | null;
  veiculo_id: string | null;
  nome_beneficiario: string | null;
  nome_solicitante: string | null;
  placa: string | null;
  telefone_principal: string | null;
  telefones_adicionais: string[];
  data_atendimento: string | null;
  motivo_texto: string | null;
  situacao_origem: string | null;
  servico_origem: string | null;
  linhas_agrupadas: number;
  status: StatusPendencia;
  tentativas: number;
  created_at: string;
  associado: { id: string, nome_completo: string, cpf: string, telefone: string | null } | null;
  veiculo: { id: string, placa: string, modelo: string } | null;
  setor: { id: string, nome: string } | null;
  motivo: { id: string, nome: string } | null;
};

const STATUS_ATIVOS: StatusPendencia[] = ['pendente', 'contatado', 'sem_retorno'];

export default function PainelPendencias() {
  const [setores, setSetores] = useState<any[]>([]);
  const [situacoes, setSituacoes] = useState<any[]>([]);
  const [motivosAtendimento, setMotivosAtendimento] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'ativas' | 'todas' | StatusPendencia>('ativas');

  const [showImportar, setShowImportar] = useState(false);
  const [showNovoManual, setShowNovoManual] = useState(false);
  const [vinculando, setVinculando] = useState<Pendencia | null>(null);
  const [avaliando, setAvaliando] = useState<{ pendencia: Pendencia, veiculos: any[] } | null>(null);
  const [descartando, setDescartando] = useState<Pendencia | null>(null);

  const fetchListas = async () => {
    const [setoresRes, situacoesRes, motivosRes] = await Promise.all([
      supabase.from('setores').select('id, nome').eq('ativo', true).order('ordem', { ascending: true }),
      supabase.from('atendimento_situacao').select('*').order('ordem', { ascending: true }),
      supabase.from('atendimento_motivo').select('*').eq('ativo', true).order('ordem', { ascending: true }),
    ]);
    setSetores(setoresRes.data || []);
    setSituacoes(situacoesRes.data || []);
    setMotivosAtendimento(motivosRes.data || []);
  };

  const fetchContagens = async () => {
    const statuses: StatusPendencia[] = ['pendente', 'contatado', 'avaliado', 'recusado', 'sem_retorno', 'descartado'];
    const results = await Promise.all(
      statuses.map(s => supabase.from('avaliacao_pendencias').select('id', { count: 'exact', head: true }).eq('status', s))
    );
    const novo: Record<string, number> = {};
    statuses.forEach((s, i) => { novo[s] = results[i].count || 0; });
    setContagens(novo);
  };

  const fetchPendencias = async () => {
    setLoading(true);
    let q = supabase.from('avaliacao_pendencias')
      .select('*, associado:associados(id,nome_completo,cpf,telefone), veiculo:veiculos(id,placa,modelo), setor:setores(id,nome), motivo:atendimento_motivo(id,nome)')
      .order('data_atendimento', { ascending: true })
      .limit(300);
    if (filtroSetor) q = q.eq('setor_id', filtroSetor);
    if (filtroStatus === 'ativas') q = q.in('status', STATUS_ATIVOS);
    else if (filtroStatus !== 'todas') q = q.eq('status', filtroStatus);

    const { data, error } = await q;
    if (error) {
      console.error('Erro ao carregar fila:', error);
      toast.error('Erro ao carregar a fila: ' + error.message);
    }
    setPendencias((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchListas(); fetchContagens(); }, []);
  useEffect(() => { fetchPendencias(); }, [filtroSetor, filtroStatus]);

  useEffect(() => {
    const channel = supabase
      .channel('fila-pendencias')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacao_pendencias' }, () => { fetchPendencias(); fetchContagens(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSetor, filtroStatus]);

  const atualizarPendencia = async (id: string, patch: Record<string, any>) => {
    const { error } = await supabase.from('avaliacao_pendencias').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar: ' + error.message); return false; }
    fetchPendencias();
    fetchContagens();
    return true;
  };

  const handleAbrirAvaliar = async (p: Pendencia) => {
    if (!p.associado_id) return;
    // Sem filtro de ativo de propósito: o veículo já vinculado à pendência
    // (ex: pela placa da planilha) precisa aparecer na lista mesmo que
    // tenha sido desativado depois — senão o <select> do modal de avaliação
    // cai silenciosamente pro primeiro veículo ativo, trocando o carro sem o
    // colaborador perceber.
    const { data } = await supabase.from('veiculos').select('id, placa, modelo').eq('associado_id', p.associado_id);
    setAvaliando({ pendencia: p, veiculos: data || [] });
  };

  const handleAvaliacaoSalva = async (p: Pendencia, resultado?: ResultadoAvaliacao) => {
    if (!resultado) return;
    if (resultado.tipo === 'avaliacao') await atualizarPendencia(p.id, { status: 'avaliado', avaliacao_id: resultado.id });
    else await atualizarPendencia(p.id, { status: 'recusado', avaliacao_recusa_id: resultado.id });
  };

  const handleSemRetorno = async (p: Pendencia) => {
    const tentativas = p.tentativas + 1;
    const status = tentativas >= LIMITE_TENTATIVAS ? 'sem_retorno' : 'pendente';
    await atualizarPendencia(p.id, { tentativas, status });
  };

  const handleDescartar = async () => {
    if (!descartando) return;
    await atualizarPendencia(descartando.id, { status: 'descartado' });
    setDescartando(null);
  };

  const handleVinculado = async (associadoId: string, veiculoId: string) => {
    if (!vinculando) return;
    await atualizarPendencia(vinculando.id, { associado_id: associadoId, veiculo_id: veiculoId });
    setVinculando(null);
  };

  const cardsStatus: { chave: StatusPendencia, cor: string, Icon: any }[] = [
    { chave: 'pendente', cor: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300', Icon: Inbox },
    { chave: 'avaliado', cor: 'text-green-700 bg-green-100', Icon: CheckCircle2 },
    { chave: 'recusado', cor: 'text-orange-700 bg-orange-100', Icon: XCircle },
    { chave: 'sem_retorno', cor: 'text-red-700 bg-red-100', Icon: PhoneOff },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Fila de Avaliações Pendentes</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Assistência 24h (import de planilha) e Eventos (lançamento manual) — tudo num lugar só</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNovoManual(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors">
            <UserPlus className="w-4 h-4" /> Novo Atendimento
          </button>
          <button onClick={() => setShowImportar(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors shadow-sm">
            <Upload className="w-4 h-4" /> Importar Planilha
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cardsStatus.map(({ chave, cor, Icon }) => (
          <button
            key={chave}
            onClick={() => setFiltroStatus(chave)}
            className={`p-4 rounded-2xl border text-left transition-colors ${filtroStatus === chave ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'} bg-white dark:bg-slate-800`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${cor}`}><Icon className="w-4 h-4" /></div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{contagens[chave] ?? '—'}</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{ROTULO_STATUS_PENDENCIA[chave]}</div>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg outline-none">
            <option value="">Todos os setores</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg outline-none">
            <option value="ativas">Ativas (padrão)</option>
            <option value="todas">Todas</option>
            {Object.entries(ROTULO_STATUS_PENDENCIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{pendencias.length} na lista</span>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : pendencias.length === 0 ? (
          <div className="text-center p-12">
            <Inbox className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">Nenhuma pendência por aqui</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Importe a planilha da Assistência 24h ou lance um atendimento manual do Eventos.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {pendencias.map(p => (
              <LinhaPendencia
                key={p.id}
                p={p}
                onAvaliar={() => handleAbrirAvaliar(p)}
                onSemRetorno={() => handleSemRetorno(p)}
                onDescartar={() => setDescartando(p)}
                onVincular={() => setVinculando(p)}
              />
            ))}
          </ul>
        )}
      </div>

      {showImportar && (
        <ModalImportarCSV
          setores={setores}
          situacoes={situacoes}
          onClose={() => setShowImportar(false)}
          onImportado={() => { setShowImportar(false); fetchPendencias(); fetchContagens(); }}
        />
      )}

      {showNovoManual && (
        <ModalNovoAtendimentoManual
          setores={setores}
          motivos={motivosAtendimento}
          onClose={() => setShowNovoManual(false)}
          onSalvo={() => { setShowNovoManual(false); fetchPendencias(); fetchContagens(); }}
        />
      )}

      {vinculando && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2"><UserCheck className="w-5 h-5 text-blue-600" /> Vincular associado</h3>
              <button onClick={() => setVinculando(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <BuscarOuCriarAssociado
                sugestaoNome={vinculando.nome_beneficiario || ''}
                sugestaoTelefone={vinculando.telefone_principal || ''}
                sugestaoPlaca={vinculando.placa || ''}
                onSelecionado={handleVinculado}
              />
            </div>
          </div>
        </div>
      )}

      {avaliando && (
        <ModalNovaAvaliacao
          associadoId={avaliando.pendencia.associado_id!}
          veiculos={avaliando.veiculos}
          veiculoPreSelecionado={avaliando.pendencia.veiculo_id}
          setorPreSelecionado={avaliando.pendencia.setor_id}
          setores={setores}
          onClose={() => setAvaliando(null)}
          onSave={(resultado) => handleAvaliacaoSalva(avaliando.pendencia, resultado)}
        />
      )}

      <ConfirmDialog
        open={!!descartando}
        title="Descartar pendência?"
        message={'Ela sai da fila de trabalho. Use isso pra duplicata ou dado inválido — não é o mesmo que "sem retorno".'}
        confirmLabel="Descartar"
        onConfirm={handleDescartar}
        onCancel={() => setDescartando(null)}
      />
    </div>
  );
}

function LinhaPendencia({ p, onAvaliar, onSemRetorno, onDescartar, onVincular }: {
  p: Pendencia, onAvaliar: () => void, onSemRetorno: () => void, onDescartar: () => void, onVincular: () => void,
}) {
  const dias = p.data_atendimento ? Math.floor(diasDesde(p.data_atendimento)) : null;
  const parado = dias !== null && dias >= 3 && p.status !== 'avaliado' && p.status !== 'recusado' && p.status !== 'descartado';
  const nome = p.associado?.nome_completo || p.nome_beneficiario || 'Sem nome';
  const telefone = p.associado?.telefone || p.telefone_principal;
  const contexto = [p.motivo?.nome, p.motivo_texto, p.servico_origem].filter(Boolean).join(' · ');

  return (
    <li className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 dark:text-slate-100">{nome}</span>
          {p.status !== 'pendente' && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{ROTULO_STATUS_PENDENCIA[p.status]}</span>
          )}
          {parado && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {dias}d na fila</span>
          )}
          {p.tentativas > 0 && <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.tentativas} tentativa(s)</span>}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
          {p.setor?.nome && <span className="font-semibold text-slate-600 dark:text-slate-300">{p.setor.nome}</span>}
          {p.veiculo?.placa && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {p.veiculo.placa}</span>}
          {!p.veiculo?.placa && p.placa && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {p.placa} (não vinculado)</span>}
          {contexto && <span className="truncate max-w-xs">{contexto}</span>}
          {p.nome_solicitante && p.nome_solicitante.toUpperCase() !== nome.toUpperCase() && (
            <span className="italic">solicitado por {p.nome_solicitante}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {telefone && (
          <a href={`tel:${telefone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            <PhoneCall className="w-3.5 h-3.5" /> {telefone}
          </a>
        )}
        {/* "Sem retorno" não depende de estar vinculado a um associado —
            "tentei ligar e não atendeu" não exige cadastro formal. Só
            "Avaliar" precisa do vínculo, porque a nota tem que ficar presa
            a um associado/veículo no banco. */}
        {!p.associado_id && (
          <button onClick={onVincular} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
            <UserPlus className="w-3.5 h-3.5" /> Vincular associado
          </button>
        )}
        {(p.status === 'pendente' || p.status === 'contatado' || p.status === 'sem_retorno') && (
          <>
            {p.associado_id && (
              <button onClick={onAvaliar} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                <Star className="w-3.5 h-3.5" /> Avaliar
              </button>
            )}
            <button onClick={onSemRetorno} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
              <PhoneOff className="w-3.5 h-3.5" /> Sem retorno
            </button>
          </>
        )}
        {p.status !== 'descartado' && p.status !== 'avaliado' && p.status !== 'recusado' && (
          <button onClick={onDescartar} title="Descartar" className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Busca um associado existente (por nome/CPF ou placa) ou cadastra um novo —
// reaproveitado tanto pra "Vincular associado" numa pendência sem match
// quanto pro formulário de "Novo Atendimento" manual (Eventos).
// ---------------------------------------------------------------------------
function BuscarOuCriarAssociado({ sugestaoNome, sugestaoTelefone, sugestaoPlaca, onSelecionado }: {
  sugestaoNome: string, sugestaoTelefone: string, sugestaoPlaca: string,
  onSelecionado: (associadoId: string, veiculoId: string) => void,
}) {
  const [termo, setTermo] = useState(sugestaoNome);
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState<any | null>(null);

  const [mostrarNovoVeiculo, setMostrarNovoVeiculo] = useState(false);
  const [novaPlaca, setNovaPlaca] = useState(sugestaoPlaca);
  const [novoModelo, setNovoModelo] = useState('');

  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [nome, setNome] = useState(sugestaoNome);
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState(sugestaoTelefone);
  const [placa, setPlaca] = useState(sugestaoPlaca);
  const [modelo, setModelo] = useState('');
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

  const buscar = async () => {
    if (!termo.trim()) { setResultados([]); return; }
    setBuscando(true);
    const digitos = termo.replace(/\D/g, '');
    const [porNomeCpf, porPlaca] = await Promise.all([
      supabase.from('associados').select('id, nome_completo, cpf, telefone, veiculos(id, placa, modelo)')
        .or(`nome_completo.ilike.%${termo.trim()}%${digitos.length >= 3 ? `,cpf.ilike.%${digitos}%` : ''}`)
        .eq('ativo', true).limit(8),
      supabase.from('veiculos').select('id, placa, modelo, associado_id, associados!inner(id, nome_completo, cpf, telefone)')
        .ilike('placa', `%${termo.replace(/[^A-Za-z0-9]/g, '')}%`).limit(8),
    ]);
    const porNomeCpfData = (porNomeCpf.data || []).map((a: any) => ({ ...a, veiculos: a.veiculos || [] }));
    const porPlacaData = (porPlaca.data || []).map((v: any) => ({
      id: v.associados.id, nome_completo: v.associados.nome_completo, cpf: v.associados.cpf, telefone: v.associados.telefone,
      veiculos: [{ id: v.id, placa: v.placa, modelo: v.modelo }],
    }));
    const combinados = [...porNomeCpfData, ...porPlacaData];
    const unicos = Array.from(new Map<string, any>(combinados.map(a => [a.id, a])).values());
    setResultados(unicos);
    setBuscando(false);
  };

  useEffect(() => { const t = setTimeout(buscar, 350); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [termo]);

  const handleCriarVeiculo = async () => {
    if (!selecionado) return;
    if (!validarPlaca(novaPlaca)) return toast.error('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    if (!novoModelo.trim()) return toast.error('Informe o modelo do veículo');
    const tid = toast.loading('Adicionando veículo...');
    const { data, error } = await supabase.from('veiculos').insert({
      associado_id: selecionado.id, placa: novaPlaca.replace(/[^A-Z0-9]/g, ''), modelo: novoModelo.trim(),
    }).select().single();
    if (error) return toast.error('Erro ao adicionar veículo: ' + error.message, { id: tid });
    toast.success('Veículo adicionado!', { id: tid });
    onSelecionado(selecionado.id, data.id);
  };

  const handleCadastrarNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Preencha o nome');
    // CPF é opcional aqui de propósito: a planilha da Assistência 24h não
    // traz CPF, só nome/placa/telefone — e a placa (já UNIQUE) é identidade
    // suficiente pra não duplicar cadastro. Se foi digitado, ainda assim
    // precisa ser um CPF válido.
    if (cpf.trim() && !validarCPF(cpf)) return toast.error('CPF inválido. Confira os números digitados.');
    if (!validarPlaca(placa)) return toast.error('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    if (!modelo.trim()) return toast.error('Informe o modelo do veículo');

    setSalvandoCadastro(true);
    const tid = toast.loading('Cadastrando associado...');
    const { data: assocData, error: assocError } = await supabase.from('associados')
      .insert({ nome_completo: nome.trim(), cpf: cpf.trim() || null, telefone: telefone || null }).select().single();
    if (assocError) {
      setSalvandoCadastro(false);
      if (assocError.code === '23505') return toast.error('Já existe um associado cadastrado com esse CPF.', { id: tid });
      return toast.error('Erro ao cadastrar: ' + assocError.message, { id: tid });
    }
    const { data: veiculoData, error: veiculoError } = await supabase.from('veiculos')
      .insert({ associado_id: assocData.id, placa: placa.replace(/[^A-Z0-9]/g, ''), modelo: modelo.trim() }).select().single();
    setSalvandoCadastro(false);
    if (veiculoError) return toast.error('Associado criado, mas houve erro ao cadastrar o veículo: ' + veiculoError.message, { id: tid });
    toast.success('Cadastrado com sucesso!', { id: tid });
    onSelecionado(assocData.id, veiculoData.id);
  };

  if (mostrarCadastro) {
    return (
      <form onSubmit={handleCadastrarNovo} className="space-y-4">
        <button type="button" onClick={() => setMostrarCadastro(false)} className="text-xs font-semibold text-blue-600 hover:underline">← Voltar pra busca</button>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nome Completo *</label>
          <input required value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">CPF (opcional)</label>
            <input value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} maxLength={14} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="000.000.000-00 (se souber)" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Telefone</label>
            <input value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} maxLength={15} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="(00) 00000-0000" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Placa *</label>
            <input required value={placa} onChange={e => setPlaca(maskPlaca(e.target.value))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="ABC1D23" maxLength={8} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Modelo *</label>
            <input required value={modelo} onChange={e => setModelo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Onix 1.0" />
          </div>
        </div>
        <button type="submit" disabled={salvandoCadastro} className="w-full px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60">
          Cadastrar e usar
        </button>
      </form>
    );
  }

  if (selecionado) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelecionado(null)} className="text-xs font-semibold text-blue-600 hover:underline">← Voltar pra busca</button>
        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-700/60">
          <p className="font-bold text-slate-800 dark:text-slate-100">{selecionado.nome_completo}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{selecionado.cpf} {selecionado.telefone ? `· ${selecionado.telefone}` : ''}</p>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Escolha o veículo</p>
        <div className="flex flex-wrap gap-2">
          {(selecionado.veiculos || []).map((v: any) => (
            <button key={v.id} type="button" onClick={() => onSelecionado(selecionado.id, v.id)} className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
              {v.placa} <span className="text-slate-400 dark:text-slate-500 font-normal">{v.modelo}</span>
            </button>
          ))}
        </div>
        {!mostrarNovoVeiculo ? (
          <button type="button" onClick={() => setMostrarNovoVeiculo(true)} className="text-xs font-semibold text-blue-600 hover:underline">+ Cadastrar outro veículo</button>
        ) : (
          <div className="p-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={novaPlaca} onChange={e => setNovaPlaca(maskPlaca(e.target.value))} placeholder="Placa" maxLength={8} className="px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none uppercase" />
              <input value={novoModelo} onChange={e => setNovoModelo(e.target.value)} placeholder="Modelo" className="px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none" />
            </div>
            <button type="button" onClick={handleCriarVeiculo} className="text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900">Adicionar e usar</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={termo}
          onChange={e => setTermo(e.target.value)}
          placeholder="Buscar por nome, CPF ou placa"
          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      {buscando && <p className="text-xs text-slate-400 dark:text-slate-500">Buscando...</p>}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {resultados.map(a => (
          <button key={a.id} type="button" onClick={() => setSelecionado(a)} className="w-full text-left p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 rounded-lg hover:border-blue-300 transition-colors">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{a.nome_completo}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{a.cpf} {a.veiculos?.length ? `· ${a.veiculos.map((v: any) => v.placa).join(', ')}` : '· sem veículo'}</p>
          </button>
        ))}
        {!buscando && termo.trim() && resultados.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Nenhum associado encontrado.</p>
        )}
      </div>
      <button type="button" onClick={() => { setMostrarCadastro(true); setNome(termo); }} className="text-xs font-semibold text-blue-600 hover:underline">
        Não encontrei — cadastrar novo associado
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lançamento manual (Eventos): substitui o formulário mandado por e-mail —
// o colaborador que fechou o atendimento já registra aqui na hora.
// ---------------------------------------------------------------------------
function ModalNovoAtendimentoManual({ setores, motivos, onClose, onSalvo }: any) {
  const [associadoId, setAssociadoId] = useState<string | null>(null);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [nomeEscolhido, setNomeEscolhido] = useState('');
  const [setorId, setSetorId] = useState(setores.find((s: any) => s.nome.toLowerCase().includes('evento'))?.id || setores[0]?.id || '');
  const [motivoId, setMotivoId] = useState('');
  const [dataAtendimento, setDataAtendimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSelecionado = async (assocId: string, veicId: string) => {
    setAssociadoId(assocId);
    setVeiculoId(veicId);
    const { data } = await supabase.from('associados').select('nome_completo, telefone').eq('id', assocId).single();
    if (data) { setNomeEscolhido(data.nome_completo); setTelefone(prev => prev || data.telefone || ''); }
  };

  const handleSubmit = async () => {
    if (!associadoId || !veiculoId) return toast.error('Selecione o associado e o veículo');
    if (!setorId) return toast.error('Selecione o setor');
    setSalvando(true);
    const tid = toast.loading('Registrando...');
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('avaliacao_pendencias').insert({
      origem: 'manual',
      setor_id: setorId,
      associado_id: associadoId,
      veiculo_id: veiculoId,
      nome_beneficiario: nomeEscolhido,
      telefone_principal: telefone || null,
      data_atendimento: dataAtendimento,
      motivo_id: motivoId || null,
      status: 'pendente',
      criado_por: user?.id,
    });
    setSalvando(false);
    if (error) return toast.error('Erro ao registrar: ' + error.message, { id: tid });
    toast.success('Atendimento lançado na fila!', { id: tid });
    onSalvo();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2"><UserPlus className="w-5 h-5 text-blue-600" /> Novo Atendimento</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          {!associadoId ? (
            <BuscarOuCriarAssociado sugestaoNome="" sugestaoTelefone="" sugestaoPlaca="" onSelecionado={handleSelecionado} />
          ) : (
            <>
              <div className="p-3 bg-green-50 border border-green-100 rounded-lg flex items-center justify-between">
                <span className="text-sm font-semibold text-green-800">{nomeEscolhido}</span>
                <button onClick={() => { setAssociadoId(null); setVeiculoId(null); }} className="text-xs font-semibold text-green-700 hover:underline">Trocar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Setor</label>
                  <select value={setorId} onChange={e => setSetorId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    {setores.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Data do atendimento</label>
                  <input type="date" value={dataAtendimento} onChange={e => setDataAtendimento(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo de sinistro</label>
                  <select value={motivoId} onChange={e => setMotivoId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Selecione</option>
                    {motivos.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Telefone de contato</label>
                  <input value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} maxLength={15} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
                <button type="button" disabled={salvando} onClick={handleSubmit} className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60">
                  Adicionar à fila
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import da planilha da Assistência 24h: seleciona o arquivo, mostra um
// resumo do que vai entrar (agrupado, deduplicado, com/sem placa
// reconhecida) antes de confirmar.
// ---------------------------------------------------------------------------
type GrupoPreview = AtendimentoAgrupado & { veiculoMatch: { id: string, associado_id: string } | null, jaExiste: boolean };

function ModalImportarCSV({ setores, situacoes, onClose, onImportado }: any) {
  const [setorId, setSetorId] = useState(setores.find((s: any) => s.nome.toLowerCase().includes('assist'))?.id || setores[0]?.id || '');
  const [processando, setProcessando] = useState(false);
  const [preview, setPreview] = useState<{ grupos: GrupoPreview[], totalLinhas: number, naoElegiveis: number } | null>(null);
  const [importando, setImportando] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const elegiveis = useMemo(() => new Set<string>(situacoes.filter((s: any) => s.conta_como_elegivel).map((s: any) => String(s.nome).toUpperCase())), [situacoes]);

  const handleArquivo = async (file: File | undefined) => {
    if (!file) return;
    setProcessando(true);
    try {
      const texto = await file.text();
      const linhas = parseRelatorioAtendimento(texto);
      if (linhas.length === 0) throw new Error('Nenhuma linha de dados encontrada nesse arquivo.');

      const grupos = agruparAtendimentos(linhas, elegiveis);
      const elegiveisGrupos = grupos.filter(g => elegiveis.has(g.situacao_origem));

      const placas = Array.from(new Set(elegiveisGrupos.map(g => g.placa).filter(Boolean)));
      const chaves = elegiveisGrupos.map(g => g.chave_dedup);
      const [veiculosRes, existentesRes] = await Promise.all([
        supabase.from('veiculos').select('id, placa, associado_id').in('placa', placas.length ? placas : ['__none__']),
        supabase.from('avaliacao_pendencias').select('chave_dedup').in('chave_dedup', chaves.length ? chaves : ['__none__']),
      ]);
      const porPlaca = new Map<string, any>((veiculosRes.data || []).map((v: any) => [v.placa, v]));
      const chavesExistentes = new Set<string>((existentesRes.data || []).map((e: any) => e.chave_dedup));

      const grupoComMatch: GrupoPreview[] = elegiveisGrupos.map(g => ({
        ...g,
        veiculoMatch: porPlaca.get(g.placa) || null,
        jaExiste: chavesExistentes.has(g.chave_dedup),
      }));

      setPreview({ grupos: grupoComMatch, totalLinhas: linhas.length, naoElegiveis: grupos.length - elegiveisGrupos.length });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao ler o arquivo');
    } finally {
      setProcessando(false);
    }
  };

  const handleConfirmar = async () => {
    if (!preview || !setorId) return toast.error('Selecione o setor antes de importar');
    const novos = preview.grupos.filter(g => !g.jaExiste);
    if (novos.length === 0) return toast.error('Não há nenhum atendimento novo pra importar.');

    setImportando(true);
    const tid = toast.loading(`Importando ${novos.length} atendimento(s)...`);
    const { data: { user } } = await supabase.auth.getUser();
    const loteId = crypto.randomUUID();

    // Cadastra automaticamente associado + veículo pras placas sem match,
    // usando nome/placa/telefone que a própria planilha já trouxe (CPF fica
    // em branco — ver supabase_migration_cpf_opcional.sql). Isso evita ter
    // que clicar em "Vincular associado" um por um; só fica de fora quem
    // não tem placa em formato válido (mantém disponível pra vínculo
    // manual). Dedup por placa dentro do próprio lote, pra não tentar criar
    // o mesmo veículo duas vezes se ele aparecer em dois grupos diferentes
    // (ex: mesma placa em dois dias distintos).
    toast.loading('Cadastrando associados novos...', { id: tid });
    const semMatch = novos.filter(g => !g.veiculoMatch && validarPlaca(g.placa));
    const placasUnicas = Array.from(new Map(semMatch.map(g => [g.placa, g])).values());
    const criadosPorPlaca = new Map<string, { associado_id: string, veiculo_id: string }>();
    for (const g of placasUnicas) {
      const { data: assocData, error: assocError } = await supabase.from('associados')
        .insert({ nome_completo: g.nome_beneficiario || `Associado ${g.placa}`, telefone: g.telefones[0] || null })
        .select().single();
      if (assocError) { console.error('Erro ao criar associado automaticamente', g.placa, assocError); continue; }
      const { data: veiculoData, error: veiculoError } = await supabase.from('veiculos')
        .insert({ associado_id: assocData.id, placa: g.placa, modelo: 'Não informado' })
        .select().single();
      if (veiculoError) { console.error('Erro ao criar veículo automaticamente', g.placa, veiculoError); continue; }
      criadosPorPlaca.set(g.placa, { associado_id: assocData.id, veiculo_id: veiculoData.id });
    }

    toast.loading(`Importando ${novos.length} atendimento(s)...`, { id: tid });
    const rows = novos.map(g => {
      const criado = criadosPorPlaca.get(g.placa);
      return {
        origem: 'assistencia_24h',
        setor_id: setorId,
        associado_id: g.veiculoMatch?.associado_id || criado?.associado_id || null,
        veiculo_id: g.veiculoMatch?.id || criado?.veiculo_id || null,
        nome_beneficiario: g.nome_beneficiario,
        nome_solicitante: g.nome_solicitante,
        placa: g.placa,
        telefone_principal: g.telefones[0] || null,
        telefones_adicionais: g.telefones.slice(1),
        data_atendimento: dataBrParaISO(g.data_atendimento),
        motivo_texto: g.motivo_texto,
        situacao_origem: g.situacao_origem,
        atendente_origem: g.atendente_origem,
        produto_origem: g.produto_origem,
        servico_origem: g.servico_origem,
        representante_origem: g.representante_origem,
        linhas_agrupadas: g.linhas_agrupadas,
        chave_dedup: g.chave_dedup,
        lote_importacao_id: loteId,
        criado_por: user?.id,
      };
    });

    const { error } = await supabase.from('avaliacao_pendencias').upsert(rows, { onConflict: 'chave_dedup', ignoreDuplicates: true });
    setImportando(false);
    if (error) return toast.error('Erro ao importar: ' + error.message, { id: tid });
    toast.success(`${novos.length} atendimento(s) importado(s)!`, { id: tid });
    onImportado();
  };

  const duplicados = preview?.grupos.filter(g => g.jaExiste).length ?? 0;
  const gruposNovos = preview?.grupos.filter(g => !g.jaExiste) ?? [];
  const novosCount = gruposNovos.length;
  const comMatch = gruposNovos.filter(g => g.veiculoMatch).length;
  const seraoCriados = gruposNovos.filter(g => !g.veiculoMatch && validarPlaca(g.placa)).length;
  const semPlacaValida = gruposNovos.filter(g => !g.veiculoMatch && !validarPlaca(g.placa)).length;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2"><Upload className="w-5 h-5 text-blue-600" /> Importar Planilha — Assistência 24h</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Setor que essas pendências vão pertencer</label>
            <select value={setorId} onChange={e => setSetorId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              {setores.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>

          {!preview ? (
            <label className="flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-blue-300 transition-colors">
              <Upload className="w-8 h-8 text-slate-300" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{processando ? 'Lendo arquivo...' : 'Clique para selecionar o .csv do relatório de atendimento'}</span>
              <input type="file" accept=".csv" className="hidden" disabled={processando} onChange={e => handleArquivo(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                  <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{preview.totalLinhas}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">linhas lidas</div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                  <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{preview.grupos.length}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">elegíveis (agrupado)</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl">
                  <div className="text-xl font-bold text-amber-700">{duplicados}</div>
                  <div className="text-[11px] text-amber-700">já importados antes</div>
                </div>
                <div className="p-3 bg-green-50 rounded-xl">
                  <div className="text-xl font-bold text-green-700">{comMatch}</div>
                  <div className="text-[11px] text-green-700">associado já existia</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                  <div className="text-xl font-bold text-blue-700">{seraoCriados}</div>
                  <div className="text-[11px] text-blue-700">serão cadastrados automaticamente</div>
                </div>
                {semPlacaValida > 0 && (
                  <div className="p-3 bg-red-50 rounded-xl">
                    <div className="text-xl font-bold text-red-700">{semPlacaValida}</div>
                    <div className="text-[11px] text-red-700">sem placa válida — vincular manualmente</div>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {preview.naoElegiveis} atendimento(s) da planilha não estão numa situação elegível pra avaliação (ajustável em Configurações) e não entram na fila.
                Vão ser adicionadas <strong>{novosCount}</strong> pendência(s) novas — {seraoCriados > 0 && <>as <strong>{seraoCriados}</strong> sem associado já vão nascer cadastradas automaticamente (nome/placa/telefone da própria planilha, CPF em branco).</>}
              </p>

              {/* Por padrão só mostra quem precisa de ação sua (placa fora do
                  formato ABC1234 ou ABC1D23/Mercosul — inclusive placa vazia,
                  o caso mais comum, de linhas tipo "Protocolo Aberto" sem
                  quase nenhum dado). O resto (114 de 114, por exemplo) entra
                  sozinho, sem precisar aparecer aqui. */}
              {semPlacaValida === 0 ? (
                <p className="text-xs font-semibold text-green-700 bg-green-50 rounded-lg p-3">
                  Nenhum problema encontrado — os {novosCount} atendimentos serão processados sem precisar de ação manual.
                </p>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-2">
                    {semPlacaValida} atendimento(s) com placa vazia ou fora do formato aceito (ABC1234 ou ABC1D23) — vão entrar na fila, mas sem associado vinculado. Use "Vincular associado" na Fila NPS depois de importar.
                  </p>
                  <div className="max-h-56 overflow-y-auto border border-red-100 rounded-lg divide-y divide-red-100">
                    {preview.grupos.filter(g => !g.jaExiste && !g.veiculoMatch && !validarPlaca(g.placa)).map(g => (
                      <div key={g.chave_dedup} className="p-2.5 text-xs flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{g.nome_beneficiario}</span>
                        <span className="shrink-0 font-bold text-red-600">{g.placa ? `placa "${g.placa}" inválida` : 'sem placa informada'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setMostrarTodos(v => !v)} className="text-xs font-semibold text-blue-600 hover:underline">
                {mostrarTodos ? 'Esconder' : 'Ver'} lista completa ({preview.grupos.length})
              </button>
              {mostrarTodos && (
                <div className="max-h-56 overflow-y-auto border border-slate-100 dark:border-slate-700/60 rounded-lg divide-y divide-slate-100 dark:divide-slate-700/60">
                  {preview.grupos.slice(0, 200).map(g => {
                    const vaiCriar = !g.jaExiste && !g.veiculoMatch && validarPlaca(g.placa);
                    const rotulo = g.jaExiste ? 'já importado' : g.veiculoMatch ? 'associado já existia' : vaiCriar ? 'será cadastrado' : 'placa inválida';
                    const cor = g.jaExiste ? 'text-slate-400' : g.veiculoMatch ? 'text-green-600' : vaiCriar ? 'text-blue-600' : 'text-red-600';
                    return (
                      <div key={g.chave_dedup} className={`p-2.5 text-xs flex items-center justify-between gap-2 ${g.jaExiste ? 'opacity-40' : ''}`}>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{g.nome_beneficiario} <span className="text-slate-400 dark:text-slate-500 font-normal">{g.placa}</span></span>
                        <span className={`shrink-0 font-bold ${cor}`}>{rotulo}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={() => setPreview(null)} className="text-xs font-semibold text-blue-600 hover:underline block">Escolher outro arquivo</button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
            {preview && (
              <button type="button" disabled={importando || novosCount === 0} onClick={handleConfirmar} className="px-5 py-2 bg-blue-600 font-medium text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60">
                Importar {novosCount} pendência(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
