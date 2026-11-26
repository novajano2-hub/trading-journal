import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import { PropView } from '@/components/app/prop/prop-view';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firm accounts' };

/** The Accounts tab. */
export default function PropAccountsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropTabs active="accounts">
        <PropView />
      </PropTabs>
    </Suspense>
  );
}
