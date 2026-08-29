'use client';

import { useState } from 'react';

// Antes de aplicar um status de reclamação marcado "conta como resolvido",
// exige uma nota de finalização — é o "protocolar o encerramento" do
// processo: fica registrado no histórico o que foi feito, não dá pra
// fechar em silêncio. Usado tanto no Painel de Reclamações quanto na ficha
// do associado (Atendimento).
export default function ModalFinalizarReclamacao({
  statusNome,
  onConfirm,
  onCancel,
}: {
  statusNome: string;
  onConfirm: (nota: string) => void;
  onCancel: () => void;
}) {
  const [nota, setNota] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 mb-1">Finalizar como &quot;{statusNome}&quot;</h3>
        <p className="text-sm text-slate-500 mb-4">Registre o que foi feito e o retorno do associado antes de encerrar — isso fica salvo no histórico da reclamação.</p>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Ex: Retornei contato com o associado, problema resolvido pela oficina X. Associado confirmou satisfação."
          className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
          <button
            onClick={() => nota.trim() && onConfirm(nota.trim())}
            disabled={!nota.trim()}
            className="px-4 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Confirmar e Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}
