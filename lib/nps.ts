// Classificação NPS compartilhada entre o dashboard da Fila NPS, o Dashboard
// Geral e as exportações — mesma régua usada em MainDashboard (promotor
// 9-10, neutro 7-8, detrator 0-6), num lugar só pra nenhum relatório contar
// diferente do outro.

export type ClasseNps = 'Promotor' | 'Neutro' | 'Detrator';

export function classificarNota(nota: number): ClasseNps {
  if (nota >= 9) return 'Promotor';
  if (nota >= 7) return 'Neutro';
  return 'Detrator';
}

export type ResumoNotas = {
  total: number;
  promotores: number; // positivas (9-10)
  neutros: number; // neutras (7-8)
  detratores: number; // negativas (0-6)
  media: number | null;
  nps: number | null; // % promotores − % detratores, de -100 a 100
};

export function resumirNotas(notas: number[]): ResumoNotas {
  const total = notas.length;
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  let soma = 0;
  for (const n of notas) {
    soma += n;
    const classe = classificarNota(n);
    if (classe === 'Promotor') promotores++;
    else if (classe === 'Neutro') neutros++;
    else detratores++;
  }
  return {
    total,
    promotores,
    neutros,
    detratores,
    media: total > 0 ? soma / total : null,
    nps: total > 0 ? Math.round(((promotores - detratores) / total) * 100) : null,
  };
}

// Percentual inteiro seguro contra divisão por zero.
export function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}
