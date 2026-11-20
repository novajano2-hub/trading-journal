import { formatMoney, formatPct } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';
import { ReportsPanel } from './reports-panel';

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
        <h2
          id="reports-title"
          className="max-w-[20ch] text-[42px] leading-[1.08] font-semibold tracking-[-0.035em]"
        >
          See where the money comes from.
        </h2>
        <p className="mt-4 max-w-[56ch] text-[17px] leading-[1.6] text-muted">
          Break results down by hour, session, setup, symbol or mistake, on
          gross or net, with a breakeven range you set.
        </p>
        <ReportsPanel
          breakdowns={view.breakdowns}
          breakeven={breakevenText(view.breakeven)}
        />
      </div>
    </section>
  );
}
