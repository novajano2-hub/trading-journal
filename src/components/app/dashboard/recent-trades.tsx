'use client';

import { useId } from 'react';
import { XCircle } from '@phosphor-icons/react/dist/ssr';
import { Chip, SideChip } from '@/components/ui/chip';
import type { RecentTrade, TradeRulesSummary } from '@/data/dashboard';
import { pnlOf } from '@/domain/metrics/context';
import type { PnlBasis, Trade } from '@/domain/types';
import { formatInstrument, formatPnl, keepHyphens } from '@/lib/format';
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

/**
 * The Rules cell: kept, broken (the first rule, then a "+n" chip for the
 * rest) or not graded. A broken rule reads on one line from `xl`, cut short
 * with its whole text in the title; below `xl` it wraps to two lines rather
 * than cutting to a stub (touch and keyboard can't reach the title).
 */
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
  // From xl one line: icon, rule, then the chip right after it. Below xl the
  // rule keeps the cell's width and the chip sits under its first word.
  return (
    <span
      title={rules.broken.join(', ') || undefined}
      className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)] items-start gap-x-1.5 text-loss xl:flex xl:items-center"
    >
      <XCircle
        size={14}
        weight="fill"
        aria-hidden="true"
        className="mt-[3px] xl:mt-0 xl:flex-none"
      />
      <span aria-hidden="true" className="line-clamp-2 min-w-0 xl:truncate">
        {first === undefined ? spoken : `Broke: ${keepHyphens(first)}`}
      </span>
      {rest.length > 0 ? (
        <span
          aria-hidden="true"
          className="col-start-2 mt-1 inline-flex h-5 items-center justify-self-start rounded-chip bg-loss-soft px-1.5 font-mono text-[11.5px] tabular-nums xl:mt-0 xl:flex-none"
        >
          +{rest.length}
        </span>
      ) : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * The instrument in words, "TSLA 370 Put" with its expiry faint beside it, or
 * "ES Dec 26". The title keeps the symbol as traded. Where a table folds the
 * trade's time under the symbol, `detailClassName` hides the expiry, so the
 * two dates never stack.
 */
export function InstrumentName({
  trade,
  className = '',
  detailClassName = '',
}: {
  trade: Trade;
  className?: string;
  detailClassName?: string;
}): React.JSX.Element {
  const { name, detail } = formatInstrument(trade.instrument, trade.openedAt);
  return (
    <span
      title={trade.instrument.symbol}
      className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${className}`}
    >
      <span className="whitespace-nowrap">{name}</span>
      {detail !== undefined ? (
        <span
          className={`min-w-0 truncate text-xs text-faint ${detailClassName}`}
        >
          <span className="sr-only">expires </span>
          {detail}
        </span>
      ) : null}
    </span>
  );
}

/** Strategy name (or "No strategy"), then the first mistake and how many more. */
function StrategyCell({ row }: { row: RecentTrade }): React.JSX.Element {
  const [first, ...rest] = row.mistakes;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {row.strategyName !== null ? (
        <span title={row.strategyName} className="min-w-0 truncate">
          {row.strategyName}
        </span>
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
 * against its strategy's rules. Rules takes the width the fixed columns
 * leave, at least 280px from `xl`, where every row is one 32px line. Below
 * `md` the time folds under the symbol; below `sm` Side and Strategy hide.
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
            <th scope="col" className={`${TH} w-24 max-md:hidden xl:w-[104px]`}>
              Time
            </th>
            <th
              scope="col"
              className={`${TH} w-[100px] md:w-32 md:pl-4 xl:w-[176px]`}
            >
              Symbol
            </th>
            <th scope="col" className={`${TH} ${GAP} w-[72px] max-sm:hidden`}>
              Side
            </th>
            <th
              scope="col"
              // 90rem, not 1440px: Tailwind orders min-[...] against xl (80rem) only in the same unit.
              className={`${TH} ${GAP} w-32 max-sm:hidden lg:w-36 xl:w-[180px] min-[90rem]:w-[272px]`}
            >
              Strategy
            </th>
            <th
              scope="col"
              className={`${TH} ${GAP} w-[92px] text-right sm:w-[104px]`}
            >
              {basis === 'gross' ? 'Gross P&L' : 'Net P&L'}
            </th>
            <th scope="col" className={`${TH} ${GAP}`}>
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
                <td className={`${MONO} py-1.5 md:pl-4 xl:py-0`}>
                  <InstrumentName
                    trade={t}
                    className="xl:flex-nowrap"
                    detailClassName="max-md:hidden"
                  />
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
                <td className={`${GAP} py-1.5`}>
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
