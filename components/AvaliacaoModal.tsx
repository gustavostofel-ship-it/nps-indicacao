'use client';

// Modal de "Registrar Avaliação" — extraído de Dashboard.tsx pra ser
// reaproveitado também pela Fila de Avaliações Pendentes (PainelPendencias),
// que precisa abrir a mesma tela já com associado/veículo/setor
// pré-selecionados a partir de uma pendência. NotaSelector vai junto porque
// só é usado por esse modal e pelo ModalNovoAssociado/ModalEditarAvaliacao
// (que seguem em Dashboard.tsx).

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Star, X } from 'lucide-react';
import toast from 'react-hot-toast';

const supabase = createClient();

export function NotaSelector({ value, onChange }: { value: number | null, onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 w-full">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
        const isSelected = value === n;
        const colorClass = isSelected
          ? (n >= 9 ? 'bg-green-600 border-green-600 text-white' : n >= 7 ? 'bg-yellow-500 border-yellow-500 text-white' : 'bg-red-600 border-red-600 text-white')
          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400';
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

// Resultado devolvido em onSave, além do onSave() sem argumento que as telas
// mais antigas (Dashboard) já usavam — permite que quem abriu o modal (ex:
// a Fila de Avaliações Pendentes) saiba qual avaliação/recusa foi criada
// pra linkar de volta na pendência.
export type ResultadoAvaliacao =
  | { tipo: 'avaliacao', id: string | null }
  | { tipo: 'recusa', id: string | null };

export function ModalNovaAvaliacao({
  associadoId,
  veiculos,
  setorPreSelecionado,
  veiculoPreSelecionado,
  setores,
  onClose,
  onSave,
}: {
  associadoId: string;
  veiculos: any[];
  setorPreSelecionado?: string | null;
  veiculoPreSelecionado?: string | null;
  setores: any[];
  onClose: () => void;
  onSave: (resultado?: ResultadoAvaliacao) => void;
}) {
  const [setorId, setSetorId] = useState(setorPreSelecionado || (setores[0]?.id || ''));
  const [veiculoId, setVeiculoId] = useState(veiculoPreSelecionado || veiculos[0]?.id || '');

  const [criterios, setCriterios] = useState<any[]>([]);
  const [notasCriterios, setNotasCriterios] = useState<Record<string, number>>({});
  const [notaGeral, setNotaGeral] = useState<number | null>(null);
  // Permite lançar uma nota única mesmo quando o setor tem critérios
  // cadastrados — pro caso do cliente não ter uma avaliação item a item, só
  // uma impressão geral do atendimento do início ao fim.
  const [avaliacaoGeralAtiva, setAvaliacaoGeralAtiva] = useState(false);

  // Cliente se recusou a avaliar: em vez de nota, registra o motivo (vai pra
  // avaliacoes_recusas, não pra avaliacoes — não conta como NPS).
  const [recusaAtiva, setRecusaAtiva] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');

  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (!setorId) return;
    const fetchCriterios = async () => {
      const { data } = await supabase.from('criterios_avaliacao').select('*').eq('setor_id', setorId).eq('ativo', true).order('ordem', { ascending: true });
      setCriterios(data || []);
      setNotasCriterios({});
      setNotaGeral(null);
      setAvaliacaoGeralAtiva(false);
    };
    fetchCriterios();
  }, [setorId]);

  const temCriterios = criterios.length > 0;
  // Usa nota única sempre que o setor não tem critérios, ou quando o
  // colaborador ativou manualmente a avaliação geral.
  const usarNotaGeral = !temCriterios || avaliacaoGeralAtiva;

  const getMediaCalculada = () => {
    if (usarNotaGeral) return notaGeral;
    const preenchidas = Object.values(notasCriterios);
    if (preenchidas.length === 0) return null;
    const sum = preenchidas.reduce((a, b) => a + b, 0);
    return Math.round((sum / preenchidas.length) * 10) / 10;
  };

  const media = getMediaCalculada();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoId) return toast.error('Nenhum veículo selecionado');

    if (recusaAtiva) {
      if (!motivoRecusa.trim()) return toast.error('Descreva o motivo da recusa');

      const tid = toast.loading('Registrando recusa...');
      const { data: { user } } = await supabase.auth.getUser();
      const { data: recusaData, error } = await supabase.from('avaliacoes_recusas').insert({
        associado_id: associadoId,
        veiculo_id: veiculoId,
        setor_id: setorId,
        motivo: motivoRecusa.trim(),
        usuario_id: user?.id,
      }).select().single();
      if (error) return toast.error('Erro ao registrar: ' + error.message, { id: tid });

      toast.success('Recusa registrada.', { id: tid });
      onSave({ tipo: 'recusa', id: recusaData?.id ?? null });
      onClose();
      return;
    }

    if (!usarNotaGeral) {
      if (Object.keys(notasCriterios).length < criterios.length) {
        return toast.error('Preencha as notas de todos os critérios');
      }
    } else {
      if (notaGeral === null) return toast.error('Selecione uma nota');
    }

    const notaFinal = usarNotaGeral ? notaGeral : media;
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

    if (!usarNotaGeral && avaliacaoData) {
      const notasParaSalvar = Object.entries(notasCriterios).map(([criterio_id, nota_valor]) => ({
        avaliacao_id: avaliacaoData.id,
        criterio_id: criterio_id,
        nota: nota_valor
      }));
      await supabase.from('avaliacao_notas').insert(notasParaSalvar);
    }

    toast.success('Avaliação registrada!', { id: tid });
    onSave({ tipo: 'avaliacao', id: avaliacaoData?.id ?? null });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500"/> Registrar Avaliação</h3>
          <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Setor</label>
              <select required value={setorId} onChange={e=>setSetorId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {setores.map((s:any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Veículo</label>
              <select required value={veiculoId} onChange={e=>setVeiculoId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {veiculos.length === 0 && <option value="">Sem veículos</option>}
                {veiculos.map((v:any) => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
            </div>
          </div>

          {/* Alternância de modo: por critério (padrão, quando o setor tem
              critérios) / avaliação geral (nota única) / cliente recusou.
              Os dois botões somem um no lugar do outro com a recusa porque
              não faz sentido escolher "avaliação geral" depois de já ter
              marcado que o cliente não quer avaliar. */}
          <div className="flex flex-wrap items-center gap-2">
            {temCriterios && !recusaAtiva && (
              <button
                type="button"
                onClick={() => { setAvaliacaoGeralAtiva(v => !v); setNotasCriterios({}); setNotaGeral(null); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${avaliacaoGeralAtiva ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
              >
                Avaliação geral (sem critérios): {avaliacaoGeralAtiva ? 'Ativada' : 'Desativada'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRecusaAtiva(v => !v)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${recusaAtiva ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
            >
              Cliente não quer avaliar
            </button>
          </div>

          {recusaAtiva ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Motivo da recusa *</label>
              <textarea
                required
                value={motivoRecusa}
                onChange={e=>setMotivoRecusa(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={3}
                placeholder="Ex: cliente com pressa, não quis dar nota"
              ></textarea>
            </div>
          ) : (
            <>
              {!usarNotaGeral ? (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2">
                    <h4 className="font-semibold text-slate-700 dark:text-slate-200">Critérios de Avaliação</h4>
                    {media !== null && (
                      <span className={`px-2 py-1 rounded font-bold text-sm ${media >= 9 ? 'bg-green-100 text-green-700' : media >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        Média: {media.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {criterios.map(c => (
                    <div key={c.id}>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">{c.nome}</label>
                      <NotaSelector
                        value={notasCriterios[c.id] ?? null}
                        onChange={(n) => setNotasCriterios(prev => ({...prev, [c.id]: n}))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Nota Geral (0 a 10)</label>
                  <NotaSelector value={notaGeral} onChange={setNotaGeral} />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Comentário (Opcional)</label>
                <textarea value={comentario} onChange={e=>setComentario(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={3}></textarea>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className={`px-5 py-2 font-medium text-white rounded-lg transition-colors shadow-sm ${recusaAtiva ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {recusaAtiva ? 'Registrar recusa' : 'Salvar Avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
