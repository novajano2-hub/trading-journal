'use client';

import { useId } from 'react';
import { XCircle } from '@phosphor-icons/react/dist/ssr';
import { Chip, SideChip } from '@/components/ui/chip';
import type { RecentTrade, TradeRulesSummary } from '@/data/dashboard';
import { pnlOf } from '@/domain/metrics/context';
import type { PnlBasis } from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { signTone } from './plan-card';

const MONO = 'font-mono text-[12.5px] tabular-nums';
const TH = 'h-5 pb-1.5 align-bottom text-left text-xs font-normal text-faint';
/** Cells after the first: 16px apart from sm, 12px on phones. */
const GAP = 'pl-3 sm:pl-4';

/** "a and b", "a, b and c". */
function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The Rules cell: kept, broken (the first rule, then how many more) or not graded. */
function RulesCell({ rules }: { rules: TradeRulesSummary }): React.JSX.Element {
  if (rules.kind === 'ungraded')
    return <span className="text-faint">Not graded</span>;
  if (rules.kind === 'kept')
    return (
      <span className="text-faint">
        <span className="font-mono tabular-nums">{rules.kept}</span> of{' '}
        <span className="font-mono tabular-nums">{rules.checked}</span> kept
      </span>
    );

  const [first, ...rest] = rules.broken;
  const brokenCount = rules.checked - rules.kept;
  // Rule texts can be missing when a check points at a deleted rule.
  const spoken =
    first === undefined
      ? `Broke ${brokenCount} ${brokenCount === 1 ? 'rule' : 'rules'}`
      : `Broke: ${listOf(rules.broken)}`;
  // One line from xl. Narrower, "and n more" drops under the rule, so the rule text keeps the cell's width.
  return (
    <span
      title={rules.broken.join(', ') || undefined}
      className="flex min-w-0 flex-wrap items-center text-loss xl:flex-nowrap"
    >
      <XCircle
        size={14}
        weight="fill"
        aria-hidden="true"
        className="mr-1.5 flex-none"
      />
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 truncate xl:flex-initial"
      >
        {first === undefined ? spoken : `Broke: ${first}`}
      </span>
      {rest.length > 0 ? (
        <span
          aria-hidden="true"
          className="basis-full pl-5 whitespace-nowrap xl:basis-auto xl:pl-1"
        >
          and {rest.length} more
        </span>
      ) : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/** Strategy name (or "No strategy"), then the first mistake and how many more. */
function StrategyCell({ row }: { row: RecentTrade }): React.JSX.Element {
  const [first, ...rest] = row.mistakes;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {row.strategyName !== null ? (
        <span className="min-w-0 truncate">{row.strategyName}</span>
      ) : (
        <span className="min-w-0 truncate text-faint">No strategy</span>
      )}
      {first !== undefined ? (
        <>
          <span className="sr-only">Mistakes:</span>
          <Chip tone="loss" className="max-w-[55%] flex-none">
            <span className="truncate">{first}</span>
          </Chip>
        </>
      ) : null}
      {rest.length > 0 ? (
        <span title={rest.join(', ')} className="flex-none">
          <Chip mono>
            <span aria-hidden="true">+{rest.length}</span>
            <span className="sr-only">and {listOf(rest)}</span>
          </Chip>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Row 3: the newest closed trades in the filters, each with how it went
 * against its strategy's rules. Below `xl` a broken row's "and n more" sits
 * under the rule; below `md` the time folds under the symbol; below `sm` Side
 * and Strategy hide.
 */
export function RecentTrades({
  recent,
  basis,
  timeZone,
  caption,
}: {
  recent: readonly RecentTrade[];
  basis: PnlBasis;
  timeZone: string;
  /** The range, e.g. "1-20 Nov". */
  caption: string;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface-1 px-5 pt-4 pb-2"
    >
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2
          id={headingId}
          className="text-[14px] leading-snug font-semibold text-text"
        >
          Recent trades
        </h2>
        <span className="ml-auto text-xs text-faint">{caption}</span>
      </div>
      <table
        aria-label="Recent trades"
        className="w-full table-fixed border-collapse text-[13px]"
      >
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-[104px] max-md:hidden`}>
              Time
            </th>
            <th
              scope="col"
              className={`${TH} w-[100px] md:w-[88px] md:pl-4 xl:w-[168px]`}
            >
              Symbol
            </th>
            <th scope="col" className={`${TH} ${GAP} w-[72px] max-sm:hidden`}>
              Side
            </th>
            <th scope="col" className={`${TH} ${GAP} max-sm:hidden`}>
              Strategy
            </th>
            <th
              scope="col"
              className={`${TH} ${GAP} w-[92px] text-right sm:w-[104px]`}
            >
              {basis === 'gross' ? 'Gross P&L' : 'Net P&L'}
            </th>
            <th
              scope="col"
              // 90rem, not 1440px: Tailwind orders min-[...] against xl (80rem) only in the same unit.
              className={`${TH} ${GAP} sm:w-40 lg:w-[200px] xl:w-[240px] min-[90rem]:w-[280px]`}
            >
              Rules
            </th>
          </tr>
        </thead>
        <tbody>
          {recent.map((row) => {
            const t = row.trade;
            const time = shortTime(t.closedAt ?? t.openedAt, timeZone);
            const pnl = pnlOf(t, basis);
            return (
              <tr key={t.id} className="border-t border-line text-text md:h-8">
                <td className={`${MONO} whitespace-nowrap max-md:hidden`}>
                  {time}
                </td>
                <td className={`${MONO} py-1.5 md:py-0 md:pl-4`}>
                  {/* A long option symbol truncates; the title carries it whole. */}
                  <span title={t.instrument.symbol} className="block truncate">
                    {t.instrument.symbol}
                  </span>
                  <span className="block whitespace-nowrap text-faint md:hidden">
                    {time}
                  </span>
                </td>
                <td className={`${GAP} max-sm:hidden`}>
                  <SideChip side={t.direction} />
                </td>
                <td className={`${GAP} max-sm:hidden`}>
                  <StrategyCell row={row} />
                </td>
                <td
                  className={`${GAP} ${MONO} text-right whitespace-nowrap ${signTone(pnl)}`}
                >
                  {formatPnl(pnl, t.pnlCurrency)}
                </td>
                <td className={GAP}>
                  <RulesCell rules={row.rules} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
