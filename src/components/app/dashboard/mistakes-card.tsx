'use client';

import { useId, type RefObject } from 'react';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MistakeCost } from '@/domain/metrics/mistakes';
import type { PnlBasis } from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { signTone } from './plan-card';

/** "trade" for one, "trades" otherwise. */
export function tradeNoun(n: number): string {
  return n === 1 ? 'trade' : 'trades';
}

/** "1 trade", "2 trades". */
export function tradeCount(n: number): string {
  return `${n} ${tradeNoun(n)}`;
}

/** Mistake, trades and cost: the header and every row share these columns. */
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] items-center gap-2';

/**
 * Row 2's first card: what each mistake tag cost, costliest first. A trade
 * with two mistakes counts in both. Each row opens its trades.
 */
export function MistakesCard({
  mistakes,
  basis,
  currency,
  caption,
  listRef,
  onOpenMistake,
}: {
  mistakes: readonly MistakeCost[];
  basis: PnlBasis;
  currency: string;
  /** The range, e.g. "1-20 Nov". */
  caption: string;
  /** The list, which takes focus when a drill-down's opener is gone. */
  listRef: RefObject<HTMLUListElement | null>;
  onOpenMistake(tagId: string, button: HTMLButtonElement): void;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-card border border-line bg-surface-1 px-5 py-4"
    >
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2
          id={headingId}
          className="text-[14px] leading-snug font-semibold text-text"
        >
          Mistakes, by cost
        </h2>
        <span className="ml-auto text-xs text-faint">{caption}</span>
      </div>
      {mistakes.length === 0 ? (
        <p className="border-t border-line pt-3 text-[13px] text-muted">
          No mistakes tagged in this range.
        </p>
      ) : (
        <>
          {/* The header row: Cost's definition sits outside the row buttons, 8px clear of them. */}
          <div
            className={`${COLUMNS} items-end pb-2 text-xs leading-4 text-faint`}
          >
            <span>Mistake</span>
            <span className="text-right">Trades</span>
            <span className="text-right">
              <MetricTip id="mistake-cost" basis={basis} />
            </span>
          </div>
          <ul ref={listRef} tabIndex={-1} className="outline-none">
            {mistakes.map((m) => {
              const amount = formatPnl(m.pnl, currency);
              return (
                // The divider stops at the content edge; the button's hover fill reaches 8px past it.
                <li key={m.tagId} className="border-t border-line">
                  <button
                    type="button"
                    aria-label={`${m.name}. ${tradeCount(m.tradeCount)}, ${amount}. Show the trades.`}
                    onClick={(e) => onOpenMistake(m.tagId, e.currentTarget)}
                    className={`${COLUMNS} -mx-2 h-10 w-[calc(100%+16px)] px-2 text-left transition-colors duration-120 outline-offset-[-2px] hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11`}
                  >
                    <span className="min-w-0">
                      <Chip tone="loss" className="max-w-full">
                        <span className="truncate">{m.name}</span>
                      </Chip>
                    </span>
                    <span className="text-right font-mono text-[12.5px] text-muted tabular-nums">
                      {tradeCount(m.tradeCount)}
                    </span>
                    <span
                      className={`text-right font-mono text-[12.5px] tabular-nums ${signTone(m.pnl)}`}
                    >
                      {amount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
