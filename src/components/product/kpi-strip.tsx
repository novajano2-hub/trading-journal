import type { Summary } from '@/domain/metrics/summary';
import { NumberTicker } from './number-ticker';

/** Four headline figures, straight from the engine summary. */
export function KpiStrip({ summary }: { summary: Summary }) {
  const items = [
    ['Net P&L', summary.netPnl, 'money'],
    ['Win rate', summary.winRate, 'pct'],
    ['Profit factor', summary.profitFactor, 'ratio'],
    ['Expectancy', summary.expectancy, 'money'],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-3.5 px-3.5 pb-1.5 pt-4 sm:grid-cols-4">
      {items.map(([label, value, kind]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-1 text-[22px] font-medium tracking-[-0.02em]">
            {value === null ? (
              <span className="font-mono text-faint">None yet</span>
            ) : (
              <NumberTicker value={value} kind={kind} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
