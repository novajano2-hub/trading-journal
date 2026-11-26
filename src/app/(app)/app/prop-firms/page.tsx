import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropDashboard } from '@/components/app/prop/prop-dashboard';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firms' };

/** The Dashboard tab. PropTabs and the dashboard read the address (?new=challenge, the filters), so they wait for it inside a boundary. */
export default function PropFirmsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropTabs active="dashboard">
        <PropDashboard />
      </PropTabs>
    </Suspense>
  );
}
