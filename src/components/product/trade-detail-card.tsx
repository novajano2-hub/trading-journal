import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';
import type { Trade } from '@/domain/types';
import { formatMoney, formatPnl } from '@/lib/format';
import { fillPrice } from '@/lib/landing/sample-view';
import { shortTime } from '@/lib/time-format';
import { SideChip } from '@/components/ui/chip';

export interface TradeCheck {
  text: string;
  ok: boolean;
}

function grouped(t: Trade, price: number): string {
  const fixed = fillPrice(t, price);
  const digits = fixed.split('.')[1]?.length ?? 0;
  return Number(fixed).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** One trade at a glance: prices, net and fees, then its rule checks. */
export function TradeDetailCard({
  trade,
  checks,
  className = '',
}: {
  trade: Trade;
  checks: readonly TradeCheck[];
  className?: string;
}) {
  const net = trade.net;
  const kv: [string, string, string?][] = [
    ['Entry', grouped(trade, trade.avgEntry)],
    [
      'Exit',
      trade.avgExit === undefined ? 'Open' : grouped(trade, trade.avgExit),
    ],
    [
      'Net P&L',
      formatPnl(net, trade.pnlCurrency),
      net > 0 ? 'text-gain' : net < 0 ? 'text-loss' : undefined,
    ],
    ['Fees', formatMoney(trade.fees, trade.pnlCurrency)],
  ];
  return (
    <div
      className={`rounded-card border border-line bg-surface-1 p-4 shadow-[var(--shadow)] ${className}`}
    >
      <div className="flex items-center justify-between text-[13px]">
        <b className="flex items-center gap-1.5 font-semibold">
          {trade.instrument.symbol}
          <SideChip side={trade.direction} />
        </b>
        <span className="font-mono text-xs text-faint">
          {shortTime(trade.openedAt)}
        </span>
      </div>
      <dl className="my-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono text-xs">
        {kv.map(([k, v, tone]) => (
          <div key={k}>
            <dt className="text-faint">{k}</dt>
            <dd className={`text-[13.5px] font-medium ${tone ?? ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-2 border-t border-line pt-3 text-[12.5px]">
        {checks.map((c) => (
          <li key={c.text} className="flex items-center gap-2">
            {c.ok ? (
              <CheckCircle
                size={16}
                weight="fill"
                className="text-gain"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                size={16}
                weight="fill"
                className="text-loss"
                aria-hidden="true"
              />
            )}
            <span className="sr-only">{c.ok ? 'Kept: ' : 'Broken: '}</span>
            {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
