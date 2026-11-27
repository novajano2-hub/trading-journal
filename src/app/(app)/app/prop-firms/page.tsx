import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropHome } from '@/components/app/prop/prop-home';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firms' };

/** The Dashboard tab, or the first run before it (C71). PropHome reads the address (?new=challenge, the filters), so it waits for it inside a boundary. */
export default function PropFirmsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropHome />
    </Suspense>
  );
}
