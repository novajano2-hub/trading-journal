'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import {
  ArrowsLeftRight,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import { Chip, SideChip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import type {
  OpenPosition,
  RecentTrade,
  TradeRulesSummary,
} from '@/data/dashboard';
import { pnlOf } from '@/domain/metrics/context';
import type { PnlBasis } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { FigureText } from '@/components/product/figure-text';
import { formatQty, keepHyphens, plural } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { navHref, navItem } from '../nav';
import { price } from '../trades/columns';
import { TradeLink } from '../trades/cells';
import {
  CARD,
  Caption,
  CardHeader,
  HEADER_LINK,
  InstrumentName,
  signTone,
  TradeTime,
} from './shared';

const TRADES = navItem('trades');

const FIGURE = 'font-[550] tabular-nums';
const TH =
  'h-[34px] border-b border-line align-middle text-left text-xs font-medium text-faint';
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
      <span className="flex items-center gap-[7px] text-muted">
        <CheckCircle
          size={16}
          weight="fill"
          aria-hidden="true"
          className="flex-none text-gain-fill"
        />
        <span>
          <span className="tabular-nums">{rules.kept}</span> of{' '}
          <span className="tabular-nums">{rules.checked}</span> kept
        </span>
      </span>
    );

  const [first, ...rest] = rules.broken;
  const brokenCount = rules.checked - rules.kept;
  // Rule texts can be missing when a check points at a deleted rule.
  const spoken =
    first === undefined
      ? `Broke ${brokenCount} ${plural(brokenCount, 'rule')}`
      : `Broke: ${listOf(rules.broken)}`;
  // From xl one line: icon, rule, then the chip right after it. Below xl the
  // rule keeps the cell's width and the chip sits under its first word.
  return (
    <span
      title={rules.broken.join(', ') || undefined}
      className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-[7px] xl:flex xl:items-center"
    >
      <XCircle
        size={16}
        weight="fill"
        aria-hidden="true"
        className="mt-px flex-none text-loss-fill xl:mt-0"
      />
      <span aria-hidden="true" className="line-clamp-2 min-w-0 xl:truncate">
        {first === undefined ? (
          <span className="font-semibold text-loss">{spoken}</span>
        ) : (
          <>
            <span className="font-semibold text-loss">Broke:</span>{' '}
            <span className="text-text">{keepHyphens(first)}</span>
          </>
        )}
      </span>
      {rest.length > 0 ? (
        <span
          aria-hidden="true"
          className="col-start-2 mt-1 inline-flex h-5 items-center justify-self-start rounded-chip bg-loss-soft px-1.5 text-[11.5px] font-semibold text-loss tabular-nums xl:mt-0 xl:flex-none"
        >
          +{rest.length}
        </span>
      ) : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/** The strategy names: the first, then how many more (all of them in the title and to a screen reader). */
function StrategyCell({ row }: { row: RecentTrade }): React.JSX.Element {
  if (row.strategyNames.length === 0)
    return <span className="text-faint">None</span>;
  const [first, ...rest] = row.strategyNames;
  return (
    <span
      title={row.strategyNames.join(', ')}
      className="flex min-w-0 items-center gap-2"
    >
      <span className="min-w-0 truncate">{first}</span>
      {rest.length > 0 ? (
        <Chip className="flex-none tabular-nums">
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">and {listOf(rest)}</span>
        </Chip>
      ) : null}
    </span>
  );
}

/** The first mistake in a warn chip, then how many more; "None" when the trade has none. */
function MistakeCell({ row }: { row: RecentTrade }): React.JSX.Element {
  const [first, ...rest] = row.mistakes;
  if (first === undefined) return <span className="text-faint">None</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="sr-only">Mistakes:</span>
      <Chip tone="warn" className="max-w-full min-w-0">
        <span className="truncate">{first}</span>
      </Chip>
      {rest.length > 0 ? (
        <span title={rest.join(', ')} className="flex-none">
          <Chip className="tabular-nums">
            <span aria-hidden="true">+{rest.length}</span>
            <span className="sr-only">and {listOf(rest)}</span>
          </Chip>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The open trades: when each opened, what is still held at what average
 * entry, and what its exits so far booked. There is no unrealized P&L (Keel
 * has no live prices), so a trade with no exit yet says None. Below `md` the
 * time folds under the symbol; below `sm` Side hides.
 */
function OpenPositions({
  open,
  basis,
  timeZone,
}: {
  open: readonly OpenPosition[];
  basis: PnlBasis;
  timeZone: string;
}): React.JSX.Element {
  const display = useDisplay();
  if (open.length === 0)
    return (
      <p className="mt-3 pb-4 text-[13.5px] text-muted">No open positions.</p>
    );
  return (
    <table
      aria-label="Open positions"
      className="mt-2 w-full table-fixed border-collapse text-[13.5px]"
    >
      <thead>
        <tr>
          <th scope="col" className={`${TH} w-28 max-md:hidden`}>
            Opened
          </th>
          <th scope="col" className={`${TH} md:pl-4`}>
            Instrument
          </th>
          <th scope="col" className={`${TH} ${GAP} w-[78px] max-sm:hidden`}>
            Side
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} w-[60px] text-right sm:w-24`}
          >
            Quantity
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} w-[84px] text-right sm:w-28`}
          >
            Avg entry
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} w-[92px] text-right sm:w-32`}
          >
            Realized P&L
          </th>
        </tr>
      </thead>
      <tbody>
        {open.map(({ trade: t, openQty, realized }) => {
          const time = shortTime(t.openedAt, timeZone);
          return (
            <tr
              key={t.id}
              className="border-t border-line/70 text-text transition-colors duration-200 ease-[var(--ease-glide)] first:border-t-0 hover:bg-sunken/60 md:h-[34px]"
            >
              <td className="max-md:hidden">
                <TradeTime text={time} />
              </td>
              <td className="py-1.5 md:py-0 md:pl-4">
                <TradeLink id={t.id}>
                  <InstrumentName
                    trade={t}
                    timeZone={timeZone}
                    showExpiry={false}
                  />
                </TradeLink>
                <TradeTime text={time} className="block text-xs md:hidden" />
              </td>
              <td className={`${GAP} max-sm:hidden`}>
                <SideChip side={t.direction} />
              </td>
              <td className={`${GAP} ${FIGURE} text-right`}>
                {formatQty(openQty)}
              </td>
              <td className={`${GAP} ${FIGURE} text-right`}>
                {price(t.avgEntry, t.instrument.tickSize)}
              </td>
              <td
                className={`${GAP} ${FIGURE} text-right whitespace-nowrap ${realized === null ? 'text-faint' : signTone(realized)}`}
              >
                {realized === null ? (
                  'None'
                ) : (
                  <FigureText f={display.cash(realized, true, t.pnlCurrency)} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <caption className="sr-only">
        Realized {basis === 'gross' ? 'gross' : 'net'} P&L from partial exits.
        Unrealized P&L is not shown.
      </caption>
    </table>
  );
}

/**
 * Row 3: the newest closed trades in the filters, each with how it went
 * against its strategy's rules. Rules takes the width the fixed columns
 * leave, at least 280px from `xl`, where every row is one 34px line. Below
 * `md` the time folds under the symbol; below `sm` Side and Strategy hide.
 */
export function RecentTrades({
  recent,
  open,
  basis,
  timeZone,
  caption,
}: {
  recent: readonly RecentTrade[];
  /** The open trades in the filters, newest first. */
  open: readonly OpenPosition[];
  basis: PnlBasis;
  timeZone: string;
  /** The range, e.g. "1-20 Nov". */
  caption: string;
}): React.JSX.Element {
  const headingId = useId();
  const display = useDisplay();
  const [tab, setTab] = useState<'closed' | 'open'>('closed');
  // The Trades page opens on the same filters.
  const allTrades = navHref(TRADES, useSearchParams());
  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} px-5 pt-[18px] pb-1`}
    >
      <CardHeader
        icon={ArrowsLeftRight}
        tone="neutral"
        headingId={headingId}
        title="Recent trades"
        after={<Caption>{caption}</Caption>}
        end={
          <Link href={allTrades} className={HEADER_LINK}>
            All trades
          </Link>
        }
      />
      <Segmented
        label="Recent trades view"
        options={[
          { value: 'closed', label: 'Closed' },
          { value: 'open', label: 'Open positions' },
        ]}
        value={tab}
        onChange={setTab}
        coarseTargets
        className="mt-3"
      />
      {tab === 'open' ? (
        <OpenPositions open={open} basis={basis} timeZone={timeZone} />
      ) : null}
      {tab === 'closed' ? (
        <table
          aria-label="Recent trades"
          className="mt-2 w-full table-fixed border-collapse text-[13.5px]"
        >
          <thead>
            <tr>
              <th scope="col" className={`${TH} w-24 max-md:hidden xl:w-28`}>
                Time
              </th>
              <th
                scope="col"
                className={`${TH} w-[100px] md:w-32 md:pl-4 xl:w-[176px]`}
              >
                Instrument
              </th>
              <th scope="col" className={`${TH} ${GAP} w-[78px] max-sm:hidden`}>
                Side
              </th>
              <th
                scope="col"
                // 90rem, not 1440px: Tailwind orders min-[...] against xl (80rem) only in the same unit.
                className={`${TH} ${GAP} w-28 max-sm:hidden lg:w-32 xl:w-[136px] min-[90rem]:w-[208px]`}
              >
                Strategy
              </th>
              <th
                scope="col"
                className={`${TH} ${GAP} w-28 max-sm:hidden lg:w-32 xl:w-[136px] min-[90rem]:w-[172px]`}
              >
                Mistake
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
                <tr
                  key={t.id}
                  className="border-t border-line/70 text-text transition-colors duration-200 ease-[var(--ease-glide)] first:border-t-0 hover:bg-sunken/60 md:h-[34px]"
                >
                  <td className="max-md:hidden">
                    <TradeTime text={time} />
                  </td>
                  <td className="py-1.5 md:pl-4 xl:py-0">
                    <TradeLink id={t.id}>
                      <InstrumentName
                        trade={t}
                        timeZone={timeZone}
                        className="xl:flex-nowrap"
                        detailClassName="max-md:hidden"
                      />
                    </TradeLink>
                    <TradeTime
                      text={time}
                      className="block text-xs md:hidden"
                    />
                  </td>
                  <td className={`${GAP} max-sm:hidden`}>
                    <SideChip side={t.direction} />
                  </td>
                  <td className={`${GAP} max-sm:hidden`}>
                    <StrategyCell row={row} />
                  </td>
                  <td className={`${GAP} max-sm:hidden`}>
                    <MistakeCell row={row} />
                  </td>
                  <td
                    className={`${GAP} ${FIGURE} text-right whitespace-nowrap ${signTone(pnl)}`}
                  >
                    <FigureText
                      f={display.figure(
                        display.ofTrade(t),
                        true,
                        t.pnlCurrency,
                      )}
                    />
                  </td>
                  <td className={`${GAP} py-1.5`}>
                    <RulesCell rules={row.rules} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
