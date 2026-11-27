'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';
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
import { formatQty, keepHyphens, plural, price } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { TradeLink } from '../trades/cells';
import { InstrumentName, signTone, TradeTime } from './shared';

const FIGURE = 'font-[550] tabular-nums';
const TH =
  'h-[34px] border-b border-line align-middle text-left text-xs font-medium text-faint';
/**
 * Cells after the first: 16px apart from the card's width at 36rem, 12px
 * under it. The table answers to the width of its card (a container query),
 * not the screen's: the widget is a third of the page at most, so by default it
 * reads time, instrument and result, as the comp does, and takes the side, the
 * rules (36rem), the strategy and the mistake (56rem) only where there is room.
 */
const GAP = 'pl-3 @[36rem]:pl-4';

/** "a and b", "a, b and c". */
function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The Rules cell: kept, broken (the first rule, then a "+n" chip for the
 * rest) or not graded. A broken rule reads on one line where the card is 64rem
 * wide, cut short with its whole text in the title; narrower it wraps to two
 * lines rather than cutting to a stub (touch and keyboard can't reach the title).
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
  // From a 64rem card one line: icon, rule, then the chip right after it. Narrower the
  // rule keeps the cell's width and the chip sits under its first word.
  return (
    <span
      title={rules.broken.join(', ') || undefined}
      className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-[7px] @[64rem]:flex @[64rem]:items-center"
    >
      <XCircle
        size={16}
        weight="fill"
        aria-hidden="true"
        className="mt-px flex-none text-loss-fill @[64rem]:mt-0"
      />
      <span
        aria-hidden="true"
        className="line-clamp-2 min-w-0 @[64rem]:truncate"
      >
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
          className="col-start-2 mt-1 inline-flex h-5 items-center justify-self-start rounded-chip bg-loss-soft px-1.5 text-[11.5px] font-semibold text-loss tabular-nums @[64rem]:mt-0 @[64rem]:flex-none"
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

/** Realized P&L as the display unit reads it; None before the first exit. */
function useRealized(p: OpenPosition): { text: React.ReactNode; tone: string } {
  const display = useDisplay();
  if (p.realized === null) return { text: 'None', tone: 'text-faint' };
  const f =
    display.unit === 'percent' || display.unit === 'privacy'
      ? display.cash(p.realized, true, p.trade.pnlCurrency)
      : display.figure(
          { money: p.realized, ...p.realizedUnits },
          true,
          p.trade.pnlCurrency,
        );
  return { text: <FigureText f={f} />, tone: signTone(p.realized) };
}

function OpenRow({
  p,
  timeZone,
}: {
  p: OpenPosition;
  timeZone: string;
}): React.JSX.Element {
  const t = p.trade;
  const time = shortTime(t.openedAt, timeZone);
  const realized = useRealized(p);
  return (
    <tr className="border-t border-line/70 text-text transition-colors duration-200 ease-[var(--ease-glide)] first:border-t-0 hover:bg-sunken/60">
      <td className="h-[34px]">
        <TradeTime text={time} />
      </td>
      <td className="pl-4">
        <TradeLink id={t.id}>
          <InstrumentName trade={t} timeZone={timeZone} showExpiry={false} />
        </TradeLink>
      </td>
      <td className={`${GAP}`}>
        <SideChip side={t.direction} />
      </td>
      <td className={`${GAP} ${FIGURE} text-right`}>{formatQty(p.openQty)}</td>
      <td className={`${GAP} ${FIGURE} text-right`}>
        {price(t.avgEntry, t.instrument.tickSize)}
      </td>
      <td
        className={`${GAP} ${FIGURE} text-right whitespace-nowrap ${realized.tone}`}
      >
        {realized.text}
      </td>
    </tr>
  );
}

/** One open position on a phone: instrument, time and realized P&L, then side, quantity and entry. */
function OpenPhoneRow({
  p,
  timeZone,
}: {
  p: OpenPosition;
  timeZone: string;
}): React.JSX.Element {
  const t = p.trade;
  const realized = useRealized(p);
  const search = useSearchParams().toString();
  return (
    <li className="border-t border-line/70 first:border-t-0">
      <Link
        href={`/app/trades/${encodeURIComponent(t.id)}${search ? `?${search}` : ''}`}
        className="flex min-h-[60px] min-w-0 flex-col justify-center gap-1 py-2 text-[13px] no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent active:bg-sunken/60"
      >
        <span
          data-line="1"
          className="flex min-w-0 items-baseline justify-between gap-3"
        >
          <span className="flex min-w-0 items-baseline gap-2.5">
            <InstrumentName
              trade={t}
              timeZone={timeZone}
              showExpiry={false}
              className="flex-nowrap! text-[14px]"
            />
            <TradeTime
              text={shortTime(t.openedAt, timeZone)}
              className="text-[12.5px]"
            />
          </span>
          <span
            className={`flex-none text-[14px] ${FIGURE} whitespace-nowrap ${realized.tone}`}
          >
            {realized.text}
          </span>
        </span>
        <span
          data-line="2"
          className="flex min-h-5 min-w-0 items-center gap-3 text-[12.5px] text-muted"
        >
          <span className="flex-none">
            {t.direction === 'long' ? 'Long' : 'Short'}
          </span>
          <span className="flex-none tabular-nums">
            {formatQty(p.openQty)} open
          </span>
          <span className="min-w-0 truncate tabular-nums">
            at {price(t.avgEntry, t.instrument.tickSize)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The open trades: when each opened, what is still held at what average
 * entry, and what its exits so far booked, in the unit shown. There is no
 * unrealized P&L (Keel has no live prices), so a trade with no exit yet says
 * None. Where the card is narrower than 48rem each is a two-line row, as the
 * trade log's; from there a table.
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
  if (open.length === 0)
    return (
      <p className="mt-3 pb-4 text-[13.5px] text-muted">No open positions.</p>
    );
  return (
    <>
      <ul
        aria-label="Open positions"
        className="m-0 mt-2 list-none p-0 @[48rem]:hidden"
      >
        {open.map((p) => (
          <OpenPhoneRow key={p.trade.id} p={p} timeZone={timeZone} />
        ))}
      </ul>
      <table
        aria-label="Open positions"
        className="mt-2 w-full table-fixed border-collapse text-[13.5px] @max-[48rem]:hidden"
      >
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-28`}>
              Opened
            </th>
            <th scope="col" className={`${TH} pl-4`}>
              Instrument
            </th>
            <th scope="col" className={`${TH} ${GAP} w-[78px]`}>
              Side
            </th>
            <th scope="col" className={`${TH} ${GAP} w-24 text-right`}>
              Quantity
            </th>
            <th scope="col" className={`${TH} ${GAP} w-28 text-right`}>
              Avg entry
            </th>
            <th scope="col" className={`${TH} ${GAP} w-40 text-right`}>
              Realized, {basis === 'gross' ? 'gross' : 'net'}
            </th>
          </tr>
        </thead>
        <tbody>
          {open.map((p) => (
            <OpenRow key={p.trade.id} p={p} timeZone={timeZone} />
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The closed trades' table, with the Rules column. */
function ClosedTrades({
  recent,
  basis,
  timeZone,
}: {
  recent: readonly RecentTrade[];
  basis: PnlBasis;
  timeZone: string;
}): React.JSX.Element {
  const display = useDisplay();
  if (recent.length === 0)
    return (
      <p className="mt-3 pb-4 text-[13.5px] text-muted">
        No closed trades in this range.
      </p>
    );
  return (
    <table
      aria-label="Recent trades"
      className="mt-2 w-full table-fixed border-collapse text-[13.5px]"
    >
      <thead>
        <tr>
          <th scope="col" className={`${TH} w-[104px] @max-[20rem]:hidden`}>
            Time
          </th>
          <th scope="col" className={`${TH} @[20rem]:pl-4 @[36rem]:w-[168px]`}>
            Instrument
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} hidden w-[78px] @[36rem]:table-cell`}
          >
            Side
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} hidden w-32 @[56rem]:table-cell`}
          >
            Strategy
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} hidden w-32 @[56rem]:table-cell`}
          >
            Mistake
          </th>
          <th
            scope="col"
            className={`${TH} ${GAP} w-[88px] text-right @[36rem]:w-[104px]`}
          >
            {basis === 'gross' ? 'Gross P&L' : 'Net P&L'}
          </th>
          <th scope="col" className={`${TH} ${GAP} hidden @[36rem]:table-cell`}>
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
              className="border-t border-line/70 text-text transition-colors duration-200 ease-[var(--ease-glide)] first:border-t-0 hover:bg-sunken/60 @[20rem]:h-[34px]"
            >
              <td className="@max-[20rem]:hidden">
                <TradeTime text={time} />
              </td>
              <td className="py-1.5 @[20rem]:pl-4">
                <TradeLink id={t.id}>
                  <InstrumentName
                    trade={t}
                    timeZone={timeZone}
                    className="@[36rem]:flex-nowrap"
                    detailClassName="@max-[20rem]:hidden"
                  />
                </TradeLink>
                <TradeTime
                  text={time}
                  className="block text-xs @[20rem]:hidden"
                />
              </td>
              <td className={`${GAP} hidden @[36rem]:table-cell`}>
                <SideChip side={t.direction} />
              </td>
              <td className={`${GAP} hidden @[56rem]:table-cell`}>
                <StrategyCell row={row} />
              </td>
              <td className={`${GAP} hidden @[56rem]:table-cell`}>
                <MistakeCell row={row} />
              </td>
              <td
                className={`${GAP} ${FIGURE} text-right whitespace-nowrap ${signTone(pnl)}`}
              >
                <FigureText
                  f={display.figure(display.ofTrade(t), true, t.pnlCurrency)}
                />
              </td>
              <td className={`${GAP} hidden py-1.5 @[36rem]:table-cell`}>
                <RulesCell rules={row.rules} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The recent trades widget's body: the newest closed trades in the filters,
 * each with how it went against its strategy's rules, and the open positions
 * on a tab beside them; a row opens its trade. The widget's frame draws the
 * card, its title and its info tip. The closed table answers to the width of its
 * card: time, instrument and result (the time folds under the symbol below
 * 20rem), then side and rules from 36rem, then strategy and mistake from 56rem.
 */
export function RecentTrades({
  recent,
  open,
  basis,
  timeZone,
  tab,
  onTab,
}: {
  recent: readonly RecentTrade[];
  /** The open trades in the filters, newest first. */
  open: readonly OpenPosition[];
  /** Kept by the widget, so a filter change doesn't reset it. */
  tab: 'closed' | 'open';
  onTab: (tab: 'closed' | 'open') => void;
  basis: PnlBasis;
  timeZone: string;
}): React.JSX.Element {
  return (
    <div className="@container min-w-0">
      <Segmented
        label="Recent trades view"
        options={[
          { value: 'closed', label: 'Closed' },
          { value: 'open', label: 'Open positions' },
        ]}
        value={tab}
        onChange={onTab}
        coarseTargets
        className="mt-3"
      />
      {tab === 'open' ? (
        <OpenPositions open={open} basis={basis} timeZone={timeZone} />
      ) : (
        <ClosedTrades recent={recent} basis={basis} timeZone={timeZone} />
      )}
    </div>
  );
}
