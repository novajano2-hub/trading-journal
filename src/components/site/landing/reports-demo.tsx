import { formatMoney, formatPct } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';
import { ReportsPanel } from './reports-panel';
import { SectionHeading } from './section-heading';

function breakevenText(b: SampleView['breakeven']): string {
  return b.unit === 'amount'
    ? `${formatMoney(b.from)} to ${formatMoney(b.to)}`
    : `${formatPct(b.from, 1)} to ${formatPct(b.to, 1)}`;
}

/** "See where the money comes from.": the engine's breakdowns, interactive. */
export function ReportsDemo({ view }: { view: SampleView }) {
  return (
    <section aria-labelledby="reports-title" className="py-28">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
        <SectionHeading
          id="reports-title"
          title="See where the money comes from."
        >
          Break results down by hour, session, setup, symbol or mistake, on
          gross or net, with a breakeven range you set.
        </SectionHeading>
        <ReportsPanel
          breakdowns={view.breakdowns}
          breakeven={breakevenText(view.breakeven)}
        />
      </div>
    </section>
  );
}
