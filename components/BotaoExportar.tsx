'use client';

// Botão "Exportar" com menu de opções — usado no Dashboard Geral e na Fila
// NPS. Cada opção roda uma função assíncrona (buscar dados + gerar arquivo);
// enquanto roda, mostra o spinner e trava o botão pra não disparar duas
// exportações iguais (a busca completa pode levar alguns segundos).

import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export type OpcaoExportar = {
  rotulo: string;
  descricao?: string;
  formato: 'excel' | 'csv';
  executar: () => Promise<void>;
};

export type GrupoExportar = {
  titulo?: string;
  opcoes: OpcaoExportar[];
};

export function BotaoExportar({ rotulo = 'Exportar', grupos, className = '' }: {
  rotulo?: string;
  grupos: GrupoExportar[];
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  // O menu se alinha à direita do botão por padrão; quando o botão está
  // perto da borda esquerda da tela (cabeçalho quebrado em duas linhas, tela
  // estreita) isso cortava o menu pra fora — nesse caso alinha à esquerda.
  const [alinharEsquerda, setAlinharEsquerda] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const alternarMenu = () => {
    if (!aberto && raiz.current) {
      const caixa = raiz.current.getBoundingClientRect();
      const LARGURA_MENU = 288; // w-72
      setAlinharEsquerda(caixa.right - LARGURA_MENU < 8);
    }
    setAberto(v => !v);
  };

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const rodar = async (opcao: OpcaoExportar) => {
    setAberto(false);
    setGerando(opcao.rotulo);
    const tid = toast.loading('Gerando arquivo... pode levar alguns segundos.');
    try {
      await opcao.executar();
      toast.success('Arquivo gerado!', { id: tid });
    } catch (e: any) {
      console.error('Erro ao exportar:', e);
      toast.error('Erro ao gerar o arquivo: ' + (e?.message || 'tente novamente'), { id: tid });
    } finally {
      setGerando(null);
    }
  };

  return (
    <div ref={raiz} className={`relative ${className}`}>
      <button
        type="button"
        onClick={alternarMenu}
        disabled={!!gerando}
        className="h-10 flex items-center gap-1.5 text-xs font-semibold px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
      >
        {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {gerando ? 'Gerando...' : rotulo}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {aberto && (
        <div className={`absolute ${alinharEsquerda ? 'left-0' : 'right-0'} mt-1.5 w-72 max-w-[calc(100vw-1rem)] z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1.5 animate-in fade-in`}>
          {grupos.map((g, gi) => (
            <div key={gi} className={gi > 0 ? 'border-t border-slate-100 dark:border-slate-700/60 mt-1 pt-1' : ''}>
              {g.titulo && (
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{g.titulo}</p>
              )}
              {g.opcoes.map(o => (
                <button
                  key={o.rotulo}
                  type="button"
                  onClick={() => rodar(o)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  {o.formato === 'excel'
                    ? <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    : <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{o.rotulo}</span>
                    {o.descricao && <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{o.descricao}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
