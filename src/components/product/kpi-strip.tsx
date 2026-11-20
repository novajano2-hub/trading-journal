import type { Summary } from '@/domain/metrics/summary';
import { NumberTicker } from './number-ticker';

/**
 * Four headline figures, straight from the engine summary. Sized by the space
 * it is given, not the viewport: two by two when narrow, then one row whose
 * figures scale with the strip so a long P&L never runs into its neighbour.
 */
export function KpiStrip({
  summary,
  tickerDelay = 0,
}: {
  summary: Summary;
  /** Seconds before the figures count, so they can follow an entrance. */
  tickerDelay?: number;
}) {
  const items = [
    ['Net P&L', summary.netPnl, 'money'],
    ['Win rate', summary.winRate, 'pct'],
    ['Profit factor', summary.profitFactor, 'ratio'],
    ['Expectancy', summary.expectancy, 'money'],
  ] as const;
  return (
    <div className="@container">
      <dl
        data-testid="kpi-strip"
        className="grid grid-cols-2 gap-x-2 gap-y-3.5 px-3.5 pt-4 pb-1.5 @md:grid-cols-4"
      >
        {items.map(([label, value, kind]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 text-[22px] font-medium tracking-[-0.02em] @md:text-[clamp(15px,3.6cqi,22px)]">
              {value === null ? (
                <span className="font-mono text-faint">None yet</span>
              ) : (
                <NumberTicker value={value} kind={kind} delay={tickerDelay} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
