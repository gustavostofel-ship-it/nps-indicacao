import { Suspense } from 'react';
import PainelPendencias from '@/components/PainelPendencias';

export default function PendenciasPage() {
  return (
    <Suspense fallback={null}>
      <PainelPendencias />
    </Suspense>
  );
}
