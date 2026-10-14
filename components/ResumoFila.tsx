'use client';

// Dashboard da Fila NPS: dois cartões lado a lado, sempre com quantidade E
// porcentagem.
// 1) Resultado do contato — sucesso (o associado avaliou) x sem sucesso
//    (recusou avaliar ou esgotou as tentativas sem retorno). A porcentagem é
//    sobre os atendimentos JÁ TRATADOS; o que ainda está em aberto aparece à
//    parte, senão a taxa de sucesso ficaria artificialmente baixa só porque
//    ainda dá pra ligar pra muita gente.
// 2) Avaliações obtidas — positivas (promotores, 9-10), neutras (7-8) e
//    negativas (detratores, 0-6), com NPS e nota média.

import { CheckCircle2, XCircle, PhoneOff, Inbox, ThumbsUp, Minus, ThumbsDown, PhoneCall, Star } from 'lucide-react';
import { ResumoPendencias } from '@/lib/pendencias';
import { percentual } from '@/lib/nps';

function BarraEmpilhada({ segmentos, total }: { segmentos: { valor: number; cor: string; titulo: string }[]; total: number }) {
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700/60">
      {total > 0 && segmentos.map(s => (
        <div key={s.titulo} title={`${s.titulo}: ${s.valor}`} className={`${s.cor} h-full transition-all duration-500`} style={{ width: `${(s.valor / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Linha({ icone: Icone, corIcone, rotulo, valor, total, recuo = false }: {
  icone?: any; corIcone?: string; rotulo: string; valor: number; total: number; recuo?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between text-sm ${recuo ? 'pl-6 text-xs' : ''}`}>
      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        {Icone && <Icone className={`w-4 h-4 ${corIcone || ''}`} />}
        {rotulo}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-bold text-slate-800 dark:text-slate-100">{valor}</span>
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-10 text-right">{percentual(valor, total)}%</span>
      </span>
    </div>
  );
}

export function ResumoFila({ resumo, carregando }: { resumo: ResumoPendencias | null; carregando: boolean }) {
  if (!resumo) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
        <div className="h-64 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60" />
        <div className="h-64 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60" />
      </div>
    );
  }

  const r = resumo;
  const n = r.notas;
  const corTaxa = r.taxaSucesso === null ? 'bg-slate-100 text-slate-500' : r.taxaSucesso >= 50 ? 'bg-green-100 text-green-700' : r.taxaSucesso >= 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const corNps = n.nps === null ? 'bg-slate-100 text-slate-500' : n.nps >= 50 ? 'bg-green-100 text-green-700' : n.nps >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
      {/* Resultado do contato */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <PhoneCall className="w-4 h-4 text-blue-500" /> Resultado do contato
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Porcentagem sobre as {r.tratados} pendência(s) já tratadas
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className={`inline-block text-lg font-bold px-3 py-1 rounded-xl ${corTaxa}`}>
              {r.taxaSucesso === null ? '—' : `${r.taxaSucesso}%`}
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mt-1">taxa de sucesso</p>
          </div>
        </div>

        <BarraEmpilhada
          total={r.tratados}
          segmentos={[
            { valor: r.sucesso, cor: 'bg-green-500', titulo: 'Avaliaram' },
            { valor: r.recusaram, cor: 'bg-orange-400', titulo: 'Recusaram' },
            { valor: r.semRetorno, cor: 'bg-red-500', titulo: 'Sem retorno' },
          ]}
        />

        <div className="space-y-2 mt-4">
          <Linha icone={CheckCircle2} corIcone="text-green-500" rotulo="Sucesso — avaliaram" valor={r.sucesso} total={r.tratados} />
          <Linha icone={XCircle} corIcone="text-red-500" rotulo="Sem sucesso" valor={r.semSucesso} total={r.tratados} />
          <Linha rotulo="• Recusaram avaliar" valor={r.recusaram} total={r.tratados} recuo />
          <Linha rotulo="• Sem retorno (esgotou as tentativas)" valor={r.semRetorno} total={r.tratados} recuo />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5" />
            <strong className="text-slate-700 dark:text-slate-200">{r.emAberto}</strong> em aberto ({percentual(r.emAberto, r.totalFila)}% da fila)
          </span>
          <span className="flex items-center gap-1.5">
            <PhoneOff className="w-3.5 h-3.5" />
            {r.descartados} descartada(s) · {r.totalFila} na fila
          </span>
        </div>
      </div>

      {/* Avaliações obtidas */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <Star className="w-4 h-4 text-yellow-500" /> Avaliações obtidas
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {n.total} avaliação(ões) · nota média {n.media === null ? '—' : n.media.toFixed(1).replace('.', ',')}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className={`inline-block text-lg font-bold px-3 py-1 rounded-xl ${corNps}`}>{n.nps === null ? '—' : n.nps}</span>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mt-1">NPS</p>
          </div>
        </div>

        {n.total === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            Nenhuma avaliação obtida com os filtros atuais.
          </div>
        ) : (
          <>
            <BarraEmpilhada
              total={n.total}
              segmentos={[
                { valor: n.promotores, cor: 'bg-green-500', titulo: 'Positivas' },
                { valor: n.neutros, cor: 'bg-yellow-400', titulo: 'Neutras' },
                { valor: n.detratores, cor: 'bg-red-500', titulo: 'Negativas' },
              ]}
            />
            <div className="space-y-2 mt-4">
              <Linha icone={ThumbsUp} corIcone="text-green-500" rotulo="Positivas (nota 9-10)" valor={n.promotores} total={n.total} />
              <Linha icone={Minus} corIcone="text-yellow-500" rotulo="Neutras (nota 7-8)" valor={n.neutros} total={n.total} />
              <Linha icone={ThumbsDown} corIcone="text-red-500" rotulo="Negativas (nota 0-6)" valor={n.detratores} total={n.total} />
            </div>
            <p className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-400 dark:text-slate-500">
              NPS = % positivas − % negativas (vai de -100 a 100).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
