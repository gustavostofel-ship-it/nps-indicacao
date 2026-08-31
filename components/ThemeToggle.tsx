'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { THEME_CHANGE_EVENT } from '@/lib/theme';

const THEME_KEY = 'girow:theme';

function aplicarTema(escuro: boolean) {
  document.documentElement.classList.toggle('dark', escuro);
  try {
    localStorage.setItem(THEME_KEY, escuro ? 'dark' : 'light');
  } catch {
    // localStorage indisponível (modo privado, etc.) — só não persiste a escolha
  }
  // Avisa componentes que dependem de saber o tema em JS (gráficos do
  // recharts, etc.) — classes `dark:` do Tailwind já reagem sozinhas via
  // CSS, isso aqui é só pra quem não pode usar CSS pra essa cor.
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

// Botão sol/lua no menu — alterna a classe "dark" na tag <html> (ver o
// @custom-variant em app/globals.css) e lembra a escolha entre sessões.
// O estado inicial já vem certo do script anti-flash no layout raiz, que
// roda antes da página pintar — aqui só lemos o que ele já deixou pronto.
export function ThemeToggle() {
  const [escuro, setEscuro] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setEscuro(document.documentElement.classList.contains('dark'));
    setMontado(true);
  }, []);

  const toggle = () => {
    const novoValor = !escuro;
    setEscuro(novoValor);
    aplicarTema(novoValor);
  };

  // Evita um "pulo" visual do ícone entre o HTML gerado no servidor (que
  // não sabe o tema) e o valor real lido do navegador logo após montar.
  if (!montado) {
    return <div className="w-9 h-9" aria-hidden="true" />;
  }

  return (
    <button
      onClick={toggle}
      title={escuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      aria-label={escuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-colors"
    >
      {escuro ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
