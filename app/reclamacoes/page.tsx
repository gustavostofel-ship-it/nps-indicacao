import { Suspense } from 'react';
import PainelReclamacoes from '@/components/PainelReclamacoes';

export default function ReclamacoesPage() {
  return (
    <Suspense fallback={null}>
      <PainelReclamacoes />
    </Suspense>
  );
}
