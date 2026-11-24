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
        className="grid grid-cols-2 gap-y-3.5 px-4 pt-3.5 pb-1 @md:grid-cols-4"
      >
        {items.map(([label, value, kind], i) => (
          <div
            key={label}
            // The app's KPI row: hairlines between figures once they share a line.
            className={`min-w-0 ${i % 2 ? 'border-l border-line pl-3.5' : ''} ${i === 2 ? '@md:border-l @md:border-line @md:pl-3.5' : ''}`}
          >
            <dt className="text-xs text-faint">{label}</dt>
            <dd className="mt-1 text-[22px] font-semibold tracking-[-0.03em] @md:text-[clamp(15px,3.6cqi,22px)]">
              {value === null ? (
                <span className="font-mono text-[15px] font-normal tracking-normal text-faint">
                  None
                </span>
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
