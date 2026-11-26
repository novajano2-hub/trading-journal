import { ChartLineUp } from '@phosphor-icons/react/dist/ssr';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropTabs } from '@/components/app/prop/prop-tabs';
import {
  StateBlock,
  StrategySkeleton,
} from '@/components/app/strategies/strategy-states';
import { StateGlyph } from '@/components/ui/state-glyph';

export const metadata: Metadata = { title: 'Prop firms' };

/** The Dashboard tab. PropTabs reads the address (?new=challenge), so it waits for it inside a boundary. */
export default function PropFirmsPage() {
  return (
    <Suspense fallback={<StrategySkeleton label="Loading your challenges" />}>
      <PropTabs active="dashboard">
        {/* A frame until the dashboard's figures are built. */}
        <StateBlock
          visual={<StateGlyph icon={ChartLineUp} />}
          title="The dashboard arrives with the figures."
          body="Your accounts and their rules are on the Accounts tab."
        />
      </PropTabs>
    </Suspense>
  );
}
