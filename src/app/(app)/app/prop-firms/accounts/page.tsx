import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountsTab } from '@/components/app/prop/accounts-tab';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firm accounts' };

/** The Accounts tab. */
export default function PropAccountsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropTabs active="accounts">
        <AccountsTab />
      </PropTabs>
    </Suspense>
  );
}
