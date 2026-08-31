'use client';

import { useEffect, useState } from 'react';

// Nome do evento disparado pelo ThemeToggle sempre que o modo escuro é
// ligado/desligado — permite que qualquer componente (ex: gráficos do
// recharts, que usam estilo inline em JS e não reagem a classes `dark:`
// do Tailwind sozinhos) saiba a hora de recalcular suas próprias cores.
export const THEME_CHANGE_EVENT = 'girow:theme-changed';

export function isDarkAtivo() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

// Hook pra qualquer componente que precise saber o tema atual em
// JavaScript (não só via CSS) — hoje usado pelos gráficos do Dashboard
// Geral, que não tem como usar `dark:` do Tailwind em cor de linha/eixo/
// tooltip do recharts (são props inline, não classes).
export function useIsDark() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    setEscuro(isDarkAtivo());
    const handler = () => setEscuro(isDarkAtivo());
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
  }, []);

  return escuro;
}
