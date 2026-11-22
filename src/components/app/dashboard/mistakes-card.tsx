'use client';

import { useId, type RefObject } from 'react';
import { Warning } from '@phosphor-icons/react/dist/ssr';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MistakeCost } from '@/domain/metrics/mistakes';
import type { PnlBasis } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { CARD, CARD_PAD, Caption, CardHeader, signTone } from './shared';

/**
 * Row 2's first card: what each mistake tag cost, costliest first, as a depth
 * ladder. Under each row a bar, anchored right like an order book's depth,
 * whose length is that mistake's share of the largest. A trade with two
 * mistakes counts in both. Each row opens its trades.
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
  const display = useDisplay();
  const largest = Math.max(0, ...mistakes.map((m) => Math.abs(m.pnl)));
  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex flex-col`}
    >
      <CardHeader
        icon={Warning}
        tone="warn"
        headingId={headingId}
        // "cost" opens its definition, as every metric's label does.
        title={
          <>
            Mistakes by{' '}
            <MetricTip
              id="mistake-cost"
              basis={basis}
              className="pointer-coarse:-my-3.5"
            >
              cost
            </MetricTip>
          </>
        }
        after={<Caption>{caption}</Caption>}
      />
      {mistakes.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          No mistakes tagged in this range.
        </p>
      ) : (
        <ul ref={listRef} tabIndex={-1} className="mt-3 outline-none">
          {mistakes.map((m) => {
            const amount = display.figure(
              display.ofTrades(m.tradeIds, m.pnl),
              true,
              currency,
            ).label;
            const trades = `${m.tradeCount} ${plural(m.tradeCount, 'trade')}`;
            const share = largest > 0 ? Math.abs(m.pnl) / largest : 0;
            return (
              <li key={m.tagId}>
                {/* The row's hover fill reaches 10px past the text on each side. */}
                <button
                  type="button"
                  aria-label={`${m.name}. ${trades}, ${amount}. Show the trades.`}
                  onClick={(e) => onOpenMistake(m.tagId, e.currentTarget)}
                  className="group relative -mx-2.5 flex h-[35px] w-[calc(100%+20px)] items-center gap-2 rounded-lg px-2.5 pb-1.5 text-left transition-colors duration-200 ease-[var(--ease-glide)] outline-offset-[-2px] hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
                >
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-text">
                    {m.name}
                  </span>
                  <span className="flex-none text-[12.5px] whitespace-nowrap text-faint tabular-nums">
                    {trades}
                  </span>
                  <span
                    className={`ml-auto flex-none pl-2 text-[13.5px] font-semibold whitespace-nowrap tabular-nums ${signTone(m.pnl)}`}
                  >
                    {amount}
                  </span>
                  {share > 0 ? (
                    <span
                      aria-hidden="true"
                      className={`absolute right-2.5 bottom-[3px] h-1 rounded-[2px] opacity-80 transition-opacity duration-200 ease-[var(--ease-glide)] group-hover:opacity-100 ${
                        m.pnl < 0
                          ? 'bg-[linear-gradient(270deg,var(--loss-fill),color-mix(in_oklab,var(--loss-fill)_18%,transparent))]'
                          : 'bg-[linear-gradient(270deg,var(--gain-fill),color-mix(in_oklab,var(--gain-fill)_18%,transparent))]'
                      }`}
                      style={{ width: `calc((100% - 20px) * ${share})` }}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
