'use client';

import { useState, useEffect } from 'react';
import { History } from 'lucide-react';
import { AssociadoEvento, buscarEventosAssociado, descreverEventoAssociado } from '@/lib/associados';

type Usuario = { id: string; nome: string };

export default function AssociadoHistorico({
  supabase,
  associadoId,
  usuarios = [],
}: {
  supabase: any;
  associadoId: string;
  usuarios?: Usuario[];
}) {
  const [eventos, setEventos] = useState<AssociadoEvento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    buscarEventosAssociado(supabase, associadoId).then((data) => {
      if (ativo) {
        setEventos(data);
        setLoading(false);
      }
    });
    return () => { ativo = false; };
  }, [supabase, associadoId]);

  const getNome = (id: string | null) => {
    if (!id) return 'Sistema';
    const u = usuarios.find((x) => x.id === id);
    return u ? u.nome : 'Usuário';
  };

  if (loading) {
    return <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />;
  }

  if (eventos.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum evento registrado ainda.</p>;
  }

  return (
    <ul className="space-y-2">
      {eventos.map((ev) => (
        <li key={ev.id} className="flex items-start gap-2 text-xs">
          <History className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-slate-600 dark:text-slate-300">{descreverEventoAssociado(ev)}</span>
            <div className="text-slate-400 dark:text-slate-500 mt-0.5">
              {getNome(ev.autor_id)} · {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
