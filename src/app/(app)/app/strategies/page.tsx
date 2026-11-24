import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';
import { StrategiesView } from '@/components/app/strategies/strategies-view';

export const metadata: Metadata = { title: 'Strategies' };

/** Static: the view fills in on the client once it reads the URL's filters; the skeleton holds its place until then. */
export default function StrategiesPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your strategies" />}>
      <StrategiesView />
    </Suspense>
  );
}
