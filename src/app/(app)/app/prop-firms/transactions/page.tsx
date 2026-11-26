import { Receipt } from '@phosphor-icons/react/dist/ssr';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import {
  StateBlock,
  StrategySkeleton,
} from '@/components/app/strategies/strategy-states';
import { StateGlyph } from '@/components/ui/state-glyph';

export const metadata: Metadata = { title: 'Prop firm transactions' };

/** The Transactions tab. */
export default function PropTransactionsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropTabs active="transactions">
        {/* A frame until the transaction log is built. */}
        <StateBlock
          visual={<StateGlyph icon={Receipt} />}
          title="The transactions arrive with the log."
          body="Your fees, payouts and other prop firm money will be listed here."
        />
      </PropTabs>
    </Suspense>
  );
}
