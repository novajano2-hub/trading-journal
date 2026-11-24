import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategiesView } from '@/components/app/strategies/strategies-view';

export const metadata: Metadata = { title: 'Strategies' };

/** Static: the view fills in on the client once it reads the URL's filters. */
export default function StrategiesPage() {
  return (
    <Suspense fallback={null}>
      <StrategiesView />
    </Suspense>
  );
}
