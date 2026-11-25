import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropView } from '@/components/app/prop/prop-view';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firms' };

/** PropView reads the address (?new=challenge), so it waits for it inside a boundary. */
export default function PropFirmsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropView />
    </Suspense>
  );
}
