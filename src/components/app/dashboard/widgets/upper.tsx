'use client';

import { format, parseISO } from 'date-fns';
import { useContext, useMemo, type ReactNode } from 'react';
import { SplitBar } from '@/components/charts/split-bar';
import { FigureText } from '@/components/product/figure-text';
import { Chip } from '@/components/ui/chip';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import { usePrefs } from '@/data/query/hooks';
import { WIDGETS } from '@/domain/dashboard/widgets';
import { winsVsLosses } from '@/domain/metrics/breakdowns';
import { isTradeUnit } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import { isClosed } from '@/domain/trade-status';
import type { DisplayUnit, WidgetKey } from '@/domain/types';
import {
  FigureSourceContext,
  shownUnit,
  unitValue,
  useDisplay,
  type Figure,
} from '@/lib/display';
import { formatCount, formatPct, plural } from '@/lib/format';
import { noBalanceIn, STARTING_BALANCE_PROMPT } from './balance-states';
import { useWidgetPage, useWidgetValue } from './context';
import { WidgetFrame } from './frame';
import type { WidgetRender } from './registry';

/**
 * The twelve upper widgets (#46, C16 to C18, C67): each a small card with one
 * figure, as comps 01 and 03 draw them, and only what the widget shows. They
 * read their series from the page (`useWidgetValue`) and every amount through
 * `useDisplay()`, so the display unit and Privacy apply; counts, percentages
 * and streaks are not amounts and stay as they are. Each draws its skeleton
 * until its series is in, and "None" when the filters leave it nothing.
 */

const NONE = 'None';

/** The widget's name on its card: the P&L widget follows the Gross or Net basis. */
function titleOf(key: WidgetKey, basis: 'net' | 'gross'): string {
  return key === 'net-pnl'
    ? `${basis === 'gross' ? 'Gross' : 'Net'} P&L`
    : WIDGET_TITLES[key];
}

/** The widget's frame with its name, its tip and the state it is in. */
function Card({
  k,
  state = 'ready',
  empty,
  end,
  children,
}: {
  k: WidgetKey;
  state?: 'ready' | 'loading' | 'empty';
  empty?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  return (
    <WidgetFrame
      widgetKey={k}
      title={titleOf(k, basis)}
      tip={WIDGETS[k].metric}
      end={end}
      state={state}
      empty={empty}
    >
      {children}
    </WidgetFrame>
  );
}

const Loading = ({ k }: { k: WidgetKey }) => <Card k={k} state="loading" />;
const Nothing = ({ k }: { k: WidgetKey }) => (
  <Card k={k} state="empty" empty={NONE} />
);

/**
 * The figure: 22px (18px on a phone), or smaller when its characters would
 * not fit the card, so a long figure in ticks never spills out of it (the card
 * is the container, and `share` is the part of its width the figure has).
 */
function Fig({
  chars,
  share = 1,
  flush = false,
  className = '',
  children,
}: {
  /** How many characters the figure shows. */
  chars: number;
  share?: number;
  /** No margin above it, where something else sets the gap. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={`${flush ? '' : 'mt-1 '}block leading-[1.25] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums [--fig:22px] max-sm:[--fig:18px] ${className}`}
      style={{
        fontSize: `min(var(--fig), max(13px, calc(100cqi * ${share} / ${Math.max(chars, 1)} / 0.6)))`,
      }}
    >
      {children}
    </span>
  );
}

/** A figure with no value: "None", quiet. */
const NoFig = (): React.JSX.Element => (
  <span className="mt-1 block text-[15px] leading-[1.25] font-medium text-faint">
    {NONE}
  </span>
);

/** The line under the figure, pushed to the card's foot so a row of cards lines up. */
function Sub({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="mt-auto block pt-2 text-[12.5px] leading-[1.35] text-faint max-sm:text-xs">
      {children}
    </span>
  );
}

/** A count and its word, which never splits across lines. */
const Counted = ({ n, word }: { n: number; word: string }) => (
  <span className="whitespace-nowrap">
    {formatCount(n)} {word}
  </span>
);

/** Gain, loss or neither, by a figure's sign in the unit it shows in. */
function toneOf(f: Figure, unit: DisplayUnit): string {
  const v = unitValue(f, shownUnit(f, unit));
  return v === null || v === 0 ? '' : v > 0 ? 'text-gain' : 'text-loss';
}

/** The closed trades the page's figures read (0 outside the page). */
function useClosedCount(): number {
  const source = useContext(FigureSourceContext);
  return useMemo(
    () =>
      source ? [...source.tradesById.values()].filter(isClosed).length : 0,
    [source],
  );
}

/** "9 Oct", with the year when it is not this year's. */
function dayText(date: string, thisYear: string | undefined): string {
  const day = format(parseISO(date), 'd MMM');
  return thisYear !== undefined && date.slice(0, 4) !== thisYear
    ? `${day} ${date.slice(0, 4)}`
    : day;
}

/** This year, in the profile's time zone. */
function useThisYear(): string | undefined {
  const timeZone = usePrefs().data?.timeZone;
  return timeZone === undefined
    ? undefined
    : localDate(new Date().toISOString(), timeZone).slice(0, 4);
}

/** Closed net P&L, with how many trades it is over. */
export function NetPnl(): React.JSX.Element {
  const s = useWidgetValue('net-pnl');
  const currency = useWidgetPage()?.currency;
  const display = useDisplay();
  if (!s || currency === undefined) return <Loading k="net-pnl" />;
  if (s.closedCount === 0) return <Nothing k="net-pnl" />;
  const f = display.ofAll(s.basis === 'gross' ? s.grossPnl : s.netPnl);
  const shown = display.figure(f, true, currency);
  return (
    <Card
      k="net-pnl"
      end={
        // A phone has no room for it (comp 01).
        <span className="max-sm:hidden">
          <Chip>
            {formatCount(s.closedCount)} {plural(s.closedCount, 'trade')}
          </Chip>
        </span>
      }
    >
      <Fig chars={shown.text.length} className={toneOf(f, display.unit)}>
        <FigureText f={shown} />
      </Fig>
    </Card>
  );
}

/** The balance at the range's end, and the closed net under it (C17). */
export function BalanceAndPnl(): React.JSX.Element {
  const s = useWidgetValue('balance-pnl');
  const page = useWidgetPage();
  const display = useDisplay();
  if (!s || !page) return <Loading k="balance-pnl" />;
  // A balance is an amount of money: it has no value in R, ticks, pips or points.
  if (isTradeUnit(display.unit))
    return (
      <Card k="balance-pnl" state="empty" empty={noBalanceIn(display.unit)} />
    );
  if (s.unfunded)
    return (
      <Card k="balance-pnl" state="empty" empty={STARTING_BALANCE_PROMPT} />
    );
  // A balance is an amount, never a return: dollars, or hidden.
  const balance = display.figure({ money: s.balance }, false, page.currency);
  const net = display.ofAll(s.net);
  return (
    <Card k="balance-pnl">
      <Fig chars={balance.text.length}>
        <FigureText f={balance} />
      </Fig>
      <Sub>
        <span className={`tabular-nums ${toneOf(net, display.unit)}`}>
          <FigureText f={display.figure(net, true, page.currency)} />
        </span>{' '}
        net P&L, {page.caption}
      </Sub>
    </Card>
  );
}

/** The share of decided trades that won, over a split of won, breakeven and lost. */
export function TradeWin(): React.JSX.Element {
  const s = useWidgetValue('trade-win');
  if (!s) return <Loading k="trade-win" />;
  if (s.closedCount === 0) return <Nothing k="trade-win" />;
  const rate = s.winRate === null ? null : formatPct(s.winRate, 1);
  return (
    <Card k="trade-win">
      {rate === null ? <NoFig /> : <Fig chars={rate.length}>{rate}</Fig>}
      <SplitBar
        className="mt-2.5"
        segments={[
          { tone: 'gain', value: s.wins },
          { tone: 'neutral', value: s.breakevens },
          { tone: 'loss', value: s.losses },
        ]}
      />
      <Sub>
        <Counted n={s.wins} word="won" />,{' '}
        <Counted n={s.breakevens} word="breakeven" />,{' '}
        <Counted n={s.losses} word="lost" />
      </Sub>
    </Card>
  );
}

/**
 * Total won over total lost, over a split of the two. The ratio is the
 * split, so the bar needs no amount, and under Privacy, which hides the ratio,
 * the bar shows none either.
 */
export function ProfitFactor(): React.JSX.Element {
  const s = useWidgetValue('profit-factor');
  const display = useDisplay();
  if (!s) return <Loading k="profit-factor" />;
  if (s.closedCount === 0) return <Nothing k="profit-factor" />;
  const pf = s.profitFactor;
  const shown = pf === null ? null : display.ratio(pf);
  return (
    <Card k="profit-factor">
      {shown === null ? (
        <NoFig />
      ) : (
        <Fig chars={shown.text.length}>
          <FigureText f={shown} />
        </Fig>
      )}
      <SplitBar
        className="mt-2.5"
        segments={
          pf === null || display.unit === 'privacy'
            ? []
            : [
                { tone: 'gain', value: pf },
                { tone: 'loss', value: 1 },
              ]
        }
      />
    </Card>
  );
}

/** The share of trading days that ended green, over a split of green, flat and red days. */
export function DayWin(): React.JSX.Element {
  const s = useWidgetValue('day-win');
  if (!s) return <Loading k="day-win" />;
  if (s.greenPct === null) return <Nothing k="day-win" />;
  const rate = formatPct(s.greenPct, 1);
  return (
    <Card k="day-win">
      <Fig chars={rate.length}>{rate}</Fig>
      <SplitBar
        className="mt-2.5"
        segments={[
          { tone: 'gain', value: s.greenDays },
          { tone: 'neutral', value: s.flatDays },
          { tone: 'loss', value: s.redDays },
        ]}
      />
      <Sub>
        <Counted n={s.greenDays} word="green" />,{' '}
        <Counted n={s.flatDays} word="flat" />,{' '}
        <Counted n={s.redDays} word="red" />
      </Sub>
    </Card>
  );
}

/** The average winning trade over the size of the average losing one, with both amounts. */
export function WinLossRatio(): React.JSX.Element {
  const s = useWidgetValue('win-loss-ratio');
  const currency = useWidgetPage()?.currency;
  const display = useDisplay();
  const source = useContext(FigureSourceContext);
  // The trades behind each average, so a display unit reads them in its own terms.
  const sides = useMemo(
    () =>
      source ? winsVsLosses([...source.tradesById.values()], source.ctx) : null,
    [source],
  );
  if (!s || currency === undefined) return <Loading k="win-loss-ratio" />;
  if (s.closedCount === 0) return <Nothing k="win-loss-ratio" />;
  const ratio = s.winLossRatio;
  const shown = ratio === null ? null : display.ratio(ratio);
  const win =
    s.avgWin === null || !sides
      ? null
      : display.figure(
          display.meanOfTrades(sides.wins.tradeIds, s.avgWin),
          true,
          currency,
        );
  const loss =
    s.avgLoss === null || !sides
      ? null
      : display.figure(
          display.meanOfTrades(sides.losses.tradeIds, s.avgLoss),
          true,
          currency,
        );
  return (
    <Card k="win-loss-ratio">
      {shown === null ? (
        <NoFig />
      ) : (
        <Fig chars={shown.text.length}>
          <FigureText f={shown} />
        </Fig>
      )}
      <SplitBar
        className="mt-2.5"
        segments={
          ratio === null || display.unit === 'privacy'
            ? []
            : [
                { tone: 'gain', value: ratio },
                { tone: 'loss', value: 1 },
              ]
        }
      />
      {win !== null && loss !== null ? (
        <Sub>
          <span className="whitespace-nowrap text-gain tabular-nums">
            <FigureText f={win} />
          </span>{' '}
          /{' '}
          <span className="whitespace-nowrap text-loss tabular-nums">
            <FigureText f={loss} />
          </span>
        </Sub>
      ) : null}
    </Card>
  );
}

/** What an average closed trade made or lost, over the decided trades. */
export function Expectancy(): React.JSX.Element {
  const s = useWidgetValue('expectancy');
  const currency = useWidgetPage()?.currency;
  const display = useDisplay();
  if (!s || currency === undefined) return <Loading k="expectancy" />;
  if (s.closedCount === 0) return <Nothing k="expectancy" />;
  const f = s.expectancy === null ? null : display.expectancy(s.expectancy);
  const shown = f === null ? null : display.figure(f, true, currency);
  return (
    <Card k="expectancy">
      {f === null || shown === null ? (
        <NoFig />
      ) : (
        <Fig chars={shown.text.length} className={toneOf(f, display.unit)}>
          <FigureText f={shown} />
        </Fig>
      )}
    </Card>
  );
}

/** A run's length and its word: "3 days", "1 trade". */
function Run({
  n,
  word,
}: {
  n: number;
  word: 'day' | 'trade';
}): React.JSX.Element {
  return (
    <>
      {formatCount(n)}{' '}
      <small className="ml-[3px] text-[15px] font-medium tracking-normal text-muted">
        {plural(n, word)}
      </small>
    </>
  );
}

const runChars = (n: number, word: 'day' | 'trade'): number =>
  formatCount(n).length + 1 + plural(n, word).length * 0.75;

/** Winning days in a row, up to the range's last trading day (C16). */
export function DayStreak(): React.JSX.Element {
  const n = useWidgetValue('day-streak');
  const closed = useClosedCount();
  if (n === undefined) return <Loading k="day-streak" />;
  if (closed === 0) return <Nothing k="day-streak" />;
  return (
    <Card k="day-streak">
      <Fig chars={runChars(n, 'day')}>
        <Run n={n} word="day" />
      </Fig>
      <Sub>winning days in a row</Sub>
    </Card>
  );
}

/** Winning trades in a row, up to the last closed trade (C16). */
export function TradeStreak(): React.JSX.Element {
  const n = useWidgetValue('trade-streak');
  const closed = useClosedCount();
  if (n === undefined) return <Loading k="trade-streak" />;
  if (closed === 0) return <Nothing k="trade-streak" />;
  return (
    <Card k="trade-streak">
      <Fig chars={runChars(n, 'trade')}>
        <Run n={n} word="trade" />
      </Fig>
      <Sub>winning trades in a row</Sub>
    </Card>
  );
}

/** Both runs, side by side; one above the other on a phone, as comp 03 draws them. */
export function Streaks(): React.JSX.Element {
  const s = useWidgetValue('streaks');
  const closed = useClosedCount();
  if (s === undefined) return <Loading k="streaks" />;
  if (closed === 0) return <Nothing k="streaks" />;
  return (
    <Card k="streaks">
      <div className="mt-1 grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Fig chars={runChars(s.day, 'day')} share={0.48} flush>
            <Run n={s.day} word="day" />
          </Fig>
          <span className="block pt-0.5 text-[12.5px] leading-[1.35] text-faint max-sm:text-xs">
            winning days in a row
          </span>
        </div>
        <div className="min-w-0">
          <Fig chars={runChars(s.trade, 'trade')} share={0.48} flush>
            <Run n={s.trade} word="trade" />
          </Fig>
          <span className="block pt-0.5 text-[12.5px] leading-[1.35] text-faint max-sm:text-xs">
            winning trades in a row
          </span>
        </div>
      </div>
    </Card>
  );
}

/** The deepest fall of the cumulative daily P&L from a high, with its share of the high and the day it bottomed (E70). */
export function MaxDrawdown(): React.JSX.Element {
  const s = useWidgetValue('max-drawdown');
  const currency = useWidgetPage()?.currency;
  const display = useDisplay();
  const closed = useClosedCount();
  const thisYear = useThisYear();
  if (!s || currency === undefined) return <Loading k="max-drawdown" />;
  if (closed === 0) return <Nothing k="max-drawdown" />;
  const shown = display.cash(-s.amount, true, currency);
  const where = [
    // No share when a unit narrowed the trades, or when no balance was ever above 0.
    s.pct !== null && s.amount > 0
      ? `${formatPct(s.pct, 1)} of the high`
      : null,
    s.troughDay !== undefined && s.amount > 0
      ? `on ${dayText(s.troughDay, thisYear)}`
      : null,
  ].filter((part) => part !== null);
  return (
    <Card k="max-drawdown">
      <Fig
        chars={shown.text.length}
        className={s.amount > 0 ? 'text-loss' : ''}
      >
        <FigureText f={shown} />
      </Fig>
      <Sub>{where.length > 0 ? where.join(', ') : 'no fall from a high'}</Sub>
    </Card>
  );
}

/**
 * The mean drawdown of the days that closed under a high; with no date range
 * set, today's drawdown from the all-time high (C18).
 */
export function AvgDrawdown(): React.JSX.Element {
  const s = useWidgetValue('avg-drawdown');
  const currency = useWidgetPage()?.currency;
  const display = useDisplay();
  const source = useContext(FigureSourceContext);
  const closed = useClosedCount();
  if (!s || currency === undefined) return <Loading k="avg-drawdown" />;
  if (closed === 0) return <Nothing k="avg-drawdown" />;
  const range = source?.ctx.range;
  const noRange = range?.from === undefined && range?.to === undefined;
  // `current` is how far under the high the last day closed: 0 or below.
  const depth = noRange ? s.current : s.amount === null ? null : -s.amount;
  if (depth === null)
    return (
      <Card k="avg-drawdown">
        <NoFig />
        <Sub>no day closed under a high</Sub>
      </Card>
    );
  const shown = display.cash(depth, true, currency);
  return (
    <Card k="avg-drawdown">
      <Fig chars={shown.text.length} className={depth < 0 ? 'text-loss' : ''}>
        <FigureText f={shown} />
      </Fig>
      {noRange ? (
        <Sub>{`today, ${depth < 0 ? 'from' : 'at'} the high; no date range set`}</Sub>
      ) : null}
    </Card>
  );
}

/** What draws each upper widget, by its key. */
export const UPPER_RENDER: Record<
  | 'net-pnl'
  | 'balance-pnl'
  | 'trade-win'
  | 'profit-factor'
  | 'day-win'
  | 'win-loss-ratio'
  | 'expectancy'
  | 'day-streak'
  | 'trade-streak'
  | 'streaks'
  | 'max-drawdown'
  | 'avg-drawdown',
  WidgetRender
> = {
  'net-pnl': NetPnl,
  'balance-pnl': BalanceAndPnl,
  'trade-win': TradeWin,
  'profit-factor': ProfitFactor,
  'day-win': DayWin,
  'win-loss-ratio': WinLossRatio,
  expectancy: Expectancy,
  'day-streak': DayStreak,
  'trade-streak': TradeStreak,
  streaks: Streaks,
  'max-drawdown': MaxDrawdown,
  'avg-drawdown': AvgDrawdown,
};
