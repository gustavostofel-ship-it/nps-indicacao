'use client';

import { X, Hash, Clock } from 'lucide-react';
import { diasDesde } from '@/lib/utils';
import { corStatus, DIAS_LIMITE_PARADA, StatusIndicacao } from '@/lib/indicacoes';
import IndicacaoTimeline from '@/components/IndicacaoTimeline';

type Usuario = { id: string; nome: string };

// Modal de detalhe — mesma ideia do ReclamacaoDetailModal: ocupa a maior
// parte da tela em vez de expandir dentro da linha/card, dando espaço de
// verdade ao histórico completo.
export default function IndicacaoDetailModal({
  ind,
  statusTodos,
  usuarios,
  currentUserId,
  supabase,
  onClose,
  onStatusChange,
  onResponsavelChange,
  getNomeUsuario,
}: {
  ind: any;
  statusTodos: StatusIndicacao[];
  usuarios: Usuario[];
  currentUserId: string | undefined;
  supabase: any;
  onClose: () => void;
  onStatusChange: (id: string, statusId: string) => void;
  onResponsavelChange: (id: string, respId: string) => void;
  getNomeUsuario: (id: string) => string;
}) {
  const statusAtivos = statusTodos.filter(s => s.ativo);
  const opcoesStatus = (!ind.status || (ind.status.ativo === false && !statusAtivos.some(s => s.id === ind.status_id)))
    ? [...statusAtivos, ...(statusTodos.find(s => s.id === ind.status_id) ? [statusTodos.find(s => s.id === ind.status_id)!] : [])]
    : statusAtivos;

  const dias = diasDesde(ind.updated_at || ind.data_indicacao);
  const parada = !ind.status?.conta_como_fechado && dias >= DIAS_LIMITE_PARADA;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[85vw] h-[85vh] max-w-5xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex items-start justify-between bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Hash className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {ind.protocolo || '—'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{ind.nome_indicado} · {ind.telefone_indicado}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Indicado por</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{ind.associados?.nome_completo}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Data da indicação</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{new Date(ind.data_indicacao).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          {ind.observacoes && (
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Última observação</div>
              <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{ind.observacoes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-slate-100 dark:border-slate-700/60">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Status</div>
              <select
                value={ind.status_id}
                onChange={(e) => onStatusChange(ind.id, e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2 w-full ${corStatus(ind.status?.cor).badge} ${corStatus(ind.status?.cor).ring}`}
              >
                {opcoesStatus.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              {parada && (
                <div className="flex items-center gap-1 text-xs font-bold text-amber-700 mt-1.5">
                  <Clock className="w-3.5 h-3.5" />{Math.floor(dias)} dias parada
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Responsável</div>
              <select
                value={ind.responsavel_id || ''}
                onChange={(e) => onResponsavelChange(ind.id, e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 w-full outline-none"
              >
                <option value="">Sem responsável</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              {!ind.responsavel_id && ind.usuario_id && (
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Criador: {getNomeUsuario(ind.usuario_id)}</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Andamento</div>
            <IndicacaoTimeline supabase={supabase} indicacaoId={ind.id} usuarios={usuarios} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </div>
  );
}
