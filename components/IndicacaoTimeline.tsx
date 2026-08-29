'use client';

import { useState, useEffect } from 'react';
import { PlusCircle, RefreshCw, UserCog, MessageSquare, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  IndicacaoEvento,
  buscarEventosIndicacao,
  descreverEvento,
  registrarObservacao,
} from '@/lib/indicacoes';

const ICONS: Record<string, any> = {
  criacao: PlusCircle,
  status_alterado: RefreshCw,
  responsavel_alterado: UserCog,
  observacao: MessageSquare,
};

const DOT_CLASSES: Record<string, string> = {
  criacao: 'bg-blue-100 text-blue-600',
  status_alterado: 'bg-amber-100 text-amber-600',
  responsavel_alterado: 'bg-green-100 text-green-600',
  observacao: 'bg-slate-100 text-slate-500',
};

type Usuario = { id: string; nome: string };

export default function IndicacaoTimeline({
  supabase,
  indicacaoId,
  usuarios = [],
  currentUserId,
}: {
  supabase: any;
  indicacaoId: string;
  usuarios?: Usuario[];
  currentUserId?: string;
}) {
  const [eventos, setEventos] = useState<IndicacaoEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaNota, setNovaNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const data = await buscarEventosIndicacao(supabase, indicacaoId);
    setEventos(data);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicacaoId]);

  const getNome = (id: string | null) => {
    if (!id) return 'Sistema';
    const u = usuarios.find((x) => x.id === id);
    return u ? u.nome : 'Usuário';
  };

  const handleEnviar = async () => {
    if (!novaNota.trim()) return;
    setEnviando(true);
    const tid = toast.loading('Registrando observação...');
    const error = await registrarObservacao(supabase, indicacaoId, novaNota.trim(), currentUserId);
    if (error) {
      toast.error('Erro ao registrar observação', { id: tid });
    } else {
      toast.success('Observação registrada no histórico', { id: tid });
      setNovaNota('');
      await carregar();
    }
    setEnviando(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
          Nova observação
        </label>
        <div className="flex gap-2">
          <textarea
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            className="flex-1 w-full p-3 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            rows={2}
            placeholder="Registre uma ligação, retorno ou anotação sobre o andamento..."
          />
          <button
            onClick={handleEnviar}
            disabled={enviando || !novaNota.trim()}
            className="bg-blue-600 disabled:bg-blue-300 hover:bg-blue-700 text-white px-3 rounded-lg transition-colors flex items-center justify-center"
            title="Adicionar ao histórico"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">
          Histórico
        </div>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-10 bg-slate-100 rounded-lg" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="space-y-0">
            {eventos.map((ev, idx) => {
              const Icon = ICONS[ev.tipo] || MessageSquare;
              const isLast = idx === eventos.length - 1;
              return (
                <li key={ev.id} className="flex gap-3 relative">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${DOT_CLASSES[ev.tipo] || 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
                  </div>
                  <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4 mb-4 border-b border-slate-100'}`}>
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">
                        {ev.tipo === 'responsavel_alterado'
                          ? (ev.valor_novo
                              ? `Responsável reatribuído: ${ev.valor_anterior ? getNome(ev.valor_anterior) : 'Ninguém'} → ${getNome(ev.valor_novo)}`
                              : `Responsável removido: ${getNome(ev.valor_anterior)}`)
                          : descreverEvento(ev)}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{getNome(ev.autor_id)}</div>
                    {ev.tipo === 'observacao' && ev.descricao && (
                      <div className="mt-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-600 whitespace-pre-wrap">
                        {ev.descricao}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
