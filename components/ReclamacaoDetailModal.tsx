'use client';

import { useState, useEffect } from 'react';
import { X, Hash, Star, Clock, Pencil } from 'lucide-react';
import { diasDesde } from '@/lib/utils';
import { corStatus, DIAS_LIMITE_PARADA, StatusReclamacao, MotivoReclamacao } from '@/lib/reclamacoes';
import ReclamacaoTimeline from '@/components/ReclamacaoTimeline';

type Usuario = { id: string; nome: string };

// Modal de detalhe — ocupa a maior parte da tela (em vez do antigo padrão
// "expandir dentro do card/linha") pra dar espaço de verdade ao histórico e
// aos controles de status/responsável, sem a lista ficar espremida.
export default function ReclamacaoDetailModal({
  rec,
  statusTodos,
  motivosTodos,
  usuarios,
  currentUserId,
  supabase,
  onClose,
  onStatusChange,
  onResponsavelChange,
  onSalvarEdicao,
  getNomeUsuario,
}: {
  rec: any;
  statusTodos: StatusReclamacao[];
  motivosTodos: MotivoReclamacao[];
  usuarios: Usuario[];
  currentUserId: string | undefined;
  supabase: any;
  onClose: () => void;
  onStatusChange: (id: string, statusId: string) => void;
  onResponsavelChange: (id: string, respId: string) => void;
  onSalvarEdicao: (id: string, motivoId: string, descricao: string) => Promise<void>;
  getNomeUsuario: (id: string) => string;
}) {
  // Edição de motivo/detalhes — sempre gera evento no histórico (a trigger
  // no banco cuida disso sozinha ao comparar OLD/NEW, então não tem como
  // esquecer de registrar).
  const [editando, setEditando] = useState(false);
  const [motivoId, setMotivoId] = useState(rec.motivo_id || '');
  const [detalhes, setDetalhes] = useState(rec.descricao || '');
  const [salvando, setSalvando] = useState(false);

  // Se o usuário fechar e reabrir noutro item (ou o item mudar por baixo),
  // os campos de edição precisam re-sincronizar com os dados atuais.
  useEffect(() => {
    setMotivoId(rec.motivo_id || '');
    setDetalhes(rec.descricao || '');
    setEditando(false);
  }, [rec.id]);

  // Sempre inclui o motivo atual da reclamação na lista de opções, mesmo que
  // ele tenha sido desativado depois — senão o select ficaria sem a opção
  // que já está selecionada.
  const opcoesMotivo = motivosTodos.filter(m => m.ativo || m.id === rec.motivo_id);

  const handleSalvarEdicao = async () => {
    setSalvando(true);
    await onSalvarEdicao(rec.id, motivoId, detalhes.trim());
    setSalvando(false);
    setEditando(false);
  };
  const statusAtivos = statusTodos.filter(s => s.ativo);
  const opcoesStatus = (!rec.status || (rec.status.ativo === false && !statusAtivos.some(s => s.id === rec.status_id)))
    ? [...statusAtivos, ...(statusTodos.find(s => s.id === rec.status_id) ? [statusTodos.find(s => s.id === rec.status_id)!] : [])]
    : statusAtivos;

  const dias = diasDesde(rec.updated_at || rec.data_abertura);
  const parada = !rec.status?.conta_como_resolvido && dias >= DIAS_LIMITE_PARADA;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[85vw] h-[85vh] max-w-5xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex items-start justify-between bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Hash className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {rec.protocolo || '—'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{rec.associados?.nome_completo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xs text-slate-400 dark:text-slate-500 uppercase font-semibold">Aberta em {new Date(rec.data_abertura).toLocaleDateString('pt-BR')} por {getNomeUsuario(rec.aberto_por)}</div>
            {!editando && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar motivo/detalhes
              </button>
            )}
          </div>

          {rec.avaliacao && (
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-lg w-fit">
              <Star className="w-4 h-4" /> Vinculada à avaliação nota {rec.avaliacao.nota} · {rec.avaliacao.setor?.nome}
            </div>
          )}

          {editando ? (
            <div className="space-y-3 bg-blue-50/50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase font-semibold">Motivo</label>
                <select
                  value={motivoId}
                  onChange={e => setMotivoId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="">Sem motivo definido</option>
                  {opcoesMotivo.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase font-semibold">Detalhes</label>
                <textarea
                  value={detalhes}
                  onChange={e => setDetalhes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Qualquer alteração aqui fica registrada no histórico abaixo.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setEditando(false); setMotivoId(rec.motivo_id || ''); setDetalhes(rec.descricao || ''); }}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarEdicao}
                  disabled={salvando}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Motivo</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{rec.motivo?.nome || 'Sem motivo definido'}</div>
              {rec.descricao && (
                <>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 mt-3 uppercase font-semibold">Detalhes</div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{rec.descricao}</p>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-slate-100 dark:border-slate-700/60">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Status</div>
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
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 uppercase font-semibold">Responsável atual</div>
              <select
                value={rec.responsavel_atual_id || ''}
                onChange={(e) => onResponsavelChange(rec.id, e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 w-full outline-none"
              >
                <option value="">Sem responsável</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Andamento</div>
            <ReclamacaoTimeline supabase={supabase} reclamacaoId={rec.id} usuarios={usuarios} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </div>
  );
}
