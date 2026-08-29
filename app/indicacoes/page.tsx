import { Suspense } from 'react';
import PainelIndicacoes from '@/components/PainelIndicacoes';

export default function IndicacoesPage() {
  return (
    <Suspense fallback={null}>
      <PainelIndicacoes />
    </Suspense>
  );
}
