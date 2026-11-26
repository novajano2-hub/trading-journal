import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import { Transactions } from '@/components/app/prop/transactions';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Prop firm transactions' };

/** The Transactions tab. */
export default function PropTransactionsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your transactions" />}>
      <PropTabs active="transactions">
        <Transactions />
      </PropTabs>
    </Suspense>
  );
}
