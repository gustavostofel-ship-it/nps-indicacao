'use client';

import { X, Hash, Star, Clock } from 'lucide-react';
import { diasDesde } from '@/lib/utils';
import { corStatus, DIAS_LIMITE_PARADA, StatusReclamacao } from '@/lib/reclamacoes';
import ReclamacaoTimeline from '@/components/ReclamacaoTimeline';

type Usuario = { id: string; nome: string };

// Modal de detalhe — ocupa a maior parte da tela (em vez do antigo padrão
// "expandir dentro do card/linha") pra dar espaço de verdade ao histórico e
// aos controles de status/responsável, sem a lista ficar espremida.
export default function ReclamacaoDetailModal({
  rec,
  statusTodos,
  usuarios,
  currentUserId,
  supabase,
  onClose,
  onStatusChange,
  onResponsavelChange,
  getNomeUsuario,
}: {
  rec: any;
  statusTodos: StatusReclamacao[];
  usuarios: Usuario[];
  currentUserId: string | undefined;
  supabase: any;
  onClose: () => void;
  onStatusChange: (id: string, statusId: string) => void;
  onResponsavelChange: (id: string, respId: string) => void;
  getNomeUsuario: (id: string) => string;
}) {
  const statusAtivos = statusTodos.filter(s => s.ativo);
  const opcoesStatus = (!rec.status || (rec.status.ativo === false && !statusAtivos.some(s => s.id === rec.status_id)))
    ? [...statusAtivos, ...(statusTodos.find(s => s.id === rec.status_id) ? [statusTodos.find(s => s.id === rec.status_id)!] : [])]
    : statusAtivos;

  const dias = diasDesde(rec.updated_at || rec.data_abertura);
  const parada = !rec.status?.conta_como_resolvido && dias >= DIAS_LIMITE_PARADA;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[85vw] h-[85vh] max-w-5xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Hash className="w-4 h-4 text-slate-400" /> {rec.protocolo || '—'}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{rec.associados?.nome_completo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Motivo</div>
              <div className="text-sm font-semibold text-slate-800">{rec.motivo?.nome || 'Sem motivo definido'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Aberta em</div>
              <div className="text-sm font-medium text-slate-700">
                {new Date(rec.data_abertura).toLocaleDateString('pt-BR')} por {getNomeUsuario(rec.aberto_por)}
              </div>
            </div>
          </div>

          {rec.avaliacao && (
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-lg w-fit">
              <Star className="w-4 h-4" /> Vinculada à avaliação nota {rec.avaliacao.nota} · {rec.avaliacao.setor?.nome}
            </div>
          )}

          {rec.descricao && (
            <div>
              <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Detalhes</div>
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{rec.descricao}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Status</div>
              <select
                value={rec.status_id}
                onChange={(e) => onStatusChange(rec.id, e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold outline-none cursor-pointer border-0 ring-1 ring-inset focus:ring-2 w-full ${corStatus(rec.status?.cor).badge} ${corStatus(rec.status?.cor).ring}`}
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
              <div className="text-xs text-slate-400 mb-1 uppercase font-semibold">Responsável atual</div>
              <select
                value={rec.responsavel_atual_id || ''}
                onChange={(e) => onResponsavelChange(rec.id, e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-full outline-none"
              >
                <option value="">Sem responsável</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">Andamento</div>
            <ReclamacaoTimeline supabase={supabase} reclamacaoId={rec.id} usuarios={usuarios} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </div>
  );
}
