import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategyForm } from '@/components/app/strategies/strategy-form';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'New strategy' };

/** Static: the form reads the template the address names once it is on the client; the skeleton holds its place until then. */
export default function NewStrategyPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading the form" rows={2} />}>
      <StrategyForm />
    </Suspense>
  );
}
