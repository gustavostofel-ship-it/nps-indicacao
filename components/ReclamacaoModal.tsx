'use client';

// Modal de "Nova Reclamação" — extraído de Dashboard.tsx pra ser
// reaproveitado também pela Fila de Avaliações Pendentes, que precisa
// oferecer "abrir reclamação" logo depois de registrar uma avaliação.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertOctagon, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';

const supabase = createClient();

export function ModalNovaReclamacao({ associadoId, avaliacao, statusList, motivosList, onClose, onSave }: any) {
  const [motivoId, setMotivoId] = useState('');
  const [detalhes, setDetalhes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const statusInicial = statusList?.[0]?.id;
    if (!statusInicial) return toast.error('Nenhum status configurado. Configure os status de reclamação primeiro.');
    if (!motivoId) return toast.error('Selecione o motivo da reclamação.');

    const tid = toast.loading('Abrindo reclamação...');
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('reclamacoes').insert({
      associado_id: associadoId,
      avaliacao_id: avaliacao?.id || null,
      motivo_id: motivoId,
      descricao: detalhes.trim() || null,
      status_id: statusInicial,
      aberto_por: user?.id,
      responsavel_atual_id: user?.id,
    });

    if (error) { toast.error('Erro ao abrir reclamação: ' + error.message, { id: tid }); }
    else { toast.success('Reclamação aberta!', { id: tid }); onSave(); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-red-500" /> Nova Reclamação
          </h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {avaliacao && (
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-lg">
              <Star className="w-4 h-4" /> Esta reclamação vai ficar vinculada à avaliação nota {avaliacao.nota} do setor {avaliacao.setor?.nome}.
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Motivo *</label>
            {motivosList?.length > 0 ? (
              <select required autoFocus value={motivoId} onChange={e => setMotivoId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Selecione...</option>
                {motivosList.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            ) : (
              <p className="text-sm text-red-600">Nenhum motivo configurado. Cadastre em Configurações → Motivos de Reclamação.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Detalhes (opcional)</label>
            <textarea
              value={detalhes}
              onChange={e => setDetalhes(e.target.value)}
              rows={3}
              placeholder="Algum detalhe adicional do relato do associado..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-red-600 font-medium text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm">Abrir Reclamação</button>
          </div>
        </form>
      </div>
    </div>
  );
}
