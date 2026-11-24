'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowSquareOut, CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import {
  calendarMonth,
  dayExits,
  dayGrading,
  type DayGrading,
} from '@/data/calendar';
import {
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrade,
  useTrades,
} from '@/data/query/hooks';
import { tradeVolume } from '@/domain/metrics/summary';
import { isTradeUnit, unitKeeps } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import type { PnlBasis, Trade } from '@/domain/types';
import {
  FigureSourceContext,
  tradeFigure,
  useDisplay,
  type FigureSource,
} from '@/lib/display';
import { formatPct, formatQty } from '@/lib/format';
import { InstrumentName, signTone } from '../dashboard/shared';
import { LinkedTrades } from './linked-trades';
import { useFigureSource } from './use-figure-source';

const CARD_BOX = 'mt-3.5 min-w-0 border-y border-line py-3 max-sm:py-2.5';
const KPIS = 'flex flex-wrap items-center gap-y-3';

function Kpi({
  label,
  children,
  tone = '',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  tone?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0 pr-7 max-sm:pr-5">
      <span className="block text-[12.5px] text-faint">{label}</span>
      <b
        className={`mt-0.5 block text-[18px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${tone}`}
      >
        {children}
      </b>
    </div>
  );
}

/** A linked trade as a chip that links it, with what it made on the note's day. */
function TradeChip({
  trade,
  made,
  timeZone,
  currency,
  pctBase,
}: {
  trade: Trade;
  /** What its exits on the day made; undefined when it did not exit that day. */
  made: Made | undefined;
  timeZone: string;
  currency: string;
  pctBase: number | null;
}): React.JSX.Element {
  const display = useDisplay();
  const value = made?.value;
  const figure =
    made === undefined
      ? undefined
      : display.figure(
          {
            money: made.value,
            pct: pctBase ? made.value / pctBase : null,
            r: made.r,
            ticks: made.ticks,
            pips: made.pips,
            points: made.points,
          },
          true,
          currency,
        );
  return (
    <Link
      href={`/app/trades/${encodeURIComponent(trade.id)}`}
      className="inline-flex min-h-[26px] items-center gap-1.5 rounded-[8px] bg-surface-1 px-2.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line-2),var(--shadow-chip)] outline-offset-2 hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_40%,transparent)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
    >
      <InstrumentName
        trade={trade}
        timeZone={timeZone}
        className="font-semibold"
        detailClassName="font-normal text-muted"
      />
      {figure ? (
        <em
          className={`font-semibold not-italic tabular-nums ${signTone(value!)}`}
        >
          <FigureText f={figure} />
        </em>
      ) : trade.status === 'open' ? (
        <em className="font-medium text-faint not-italic">Open</em>
      ) : null}
    </Link>
  );
}

/** What a trade's exits on the day made, in money and in each unit (each exit's own value). */
interface Made extends Units {
  value: number;
  r: number | null;
}
interface Units {
  ticks: number | null;
  pips: number | null;
  points: number | null;
}

interface DayModel extends Units {
  net: number;
  r: number | null;
  trades: number;
  wins: number;
  losses: number;
  rules: DayGrading['rules'];
  /** What each trade with an exit that day made on it. */
  made: Map<string, Made>;
  /** The day's trades: those with an exit that day, and those opened and still open. */
  dayIds: Set<string>;
}

function DayBody({
  date,
  model,
  basis,
  timeZone,
  currency,
  pctBase,
  linkedTradeIds,
  readOnly,
  onLinkedChange,
}: {
  date: string;
  model: DayModel;
  basis: PnlBasis;
  timeZone: string;
  currency: string;
  pctBase: number | null;
  linkedTradeIds: readonly string[];
  readOnly: boolean;
  onLinkedChange(ids: string[]): void;
}): React.JSX.Element {
  const display = useDisplay();
  const linked = (
    <LinkedTrades
      linkedIds={linkedTradeIds}
      date={date}
      dayIds={model.dayIds}
      readOnly={readOnly}
      onChange={onLinkedChange}
      chip={(t) => (
        <TradeChip
          trade={t}
          made={model.made.get(t.id)}
          timeZone={timeZone}
          currency={currency}
          pctBase={pctBase}
        />
      )}
    />
  );
  if (model.dayIds.size === 0)
    return (
      <>
        <p className="text-[14px] text-muted">No trades this day.</p>
        {linked}
      </>
    );
  // A balance-based figure (the share of the balance) is empty under a unit
  // that narrows the trades; the unit's own number is each exit's own value.
  const net = display.figure(
    {
      money: model.net,
      pct: pctBase && !isTradeUnit(display.unit) ? model.net / pctBase : null,
      r: model.r,
      ticks: model.ticks,
      pips: model.pips,
      points: model.points,
    },
    true,
    currency,
  );
  // Wins over the decided trades, as every other win rate reads it.
  const decided = model.wins + model.losses;
  return (
    <>
      <div className={KPIS}>
        <Kpi
          label={
            <MetricTip
              id="pnl"
              basis={basis}
              note="Here, what the exits of this day made."
            />
          }
          tone={signTone(model.net)}
        >
          <FigureText f={net} />
        </Kpi>
        <Kpi
          label={
            <MetricTip
              id="trades"
              basis={basis}
              note="Here, trades with an exit on this day."
            >
              Trades
            </MetricTip>
          }
        >
          {model.trades}
        </Kpi>
        <Kpi label={<MetricTip id="win-rate" basis={basis} />}>
          {decided === 0
            ? 'None decided'
            : formatPct(
                model.wins / decided,
                model.wins % decided === 0 ? 0 : 1,
              )}
        </Kpi>
        <Kpi
          label={
            <MetricTip
              id="rule-adherence"
              basis={basis}
              note="Here, the checks on the trades that exited this day, for the rules that apply to each."
            >
              Rules kept
            </MetricTip>
          }
        >
          {model.rules.checked === 0
            ? 'None graded'
            : `${model.rules.kept} of ${model.rules.checked}`}
        </Kpi>
        <Link
          href={`/app/calendar?day=${date}`}
          className="inline-flex items-center gap-1.5 self-center ml-auto rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <CalendarBlank size={14} aria-hidden="true" />
          Open the day
        </Link>
      </div>
      {linked}
    </>
  );
}

/**
 * The day's figures, booked by realization as the calendar books them: every
 * trade with an exit that day counts, wherever the rest of it stands. Below
 * them, the trades the note links to (with what each made that day) and the
 * way to link more.
 */
export function DayCard({
  date,
  linkedTradeIds,
  readOnly,
  onLinkedChange,
}: {
  date: string;
  linkedTradeIds: readonly string[];
  readOnly: boolean;
  onLinkedChange(ids: string[]): void;
}): React.JSX.Element {
  const prefs = usePrefs().data;
  const all = useTrades().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const currency = prefs?.baseCurrency ?? 'USD';
  const unit = prefs?.displayUnit ?? 'dollar';
  // A unit that narrows the trades (ticks, pips, points, R) narrows the day too.
  const trades = useMemo(
    () => all?.filter((t) => t.pnlCurrency === currency && unitKeeps(unit, t)),
    [all, currency, unit],
  );
  const noAccounts = useMemo(() => [] as string[], []);
  const source = useFigureSource({
    trades,
    accountIds: noAccounts,
    currency,
    from: date,
  });
  const model = useMemo((): DayModel | undefined => {
    if (!source || !trades || !strategies || !tags || !categories)
      return undefined;
    const { ctx } = source;
    const { weeks } = calendarMonth(trades, [], date.slice(0, 7), ctx);
    const day = weeks.flatMap((w) => w.days).find((d) => d?.date === date);
    const exits = dayExits(trades, date, ctx);
    const made = new Map<string, Made>();
    // A unit sums over the exits that have it; none has it, none is shown.
    const add = (a: number | null | undefined, b: number | null) =>
      b === null ? (a ?? null) : (a ?? 0) + b;
    for (const e of exits) {
      const seen = made.get(e.trade.id);
      made.set(e.trade.id, {
        value: (seen?.value ?? 0) + e.value,
        r: add(seen?.r, e.r),
        ticks: add(seen?.ticks, e.ticks),
        pips: add(seen?.pips, e.pips),
        points: add(seen?.points, e.points),
      });
    }
    const dayIds = new Set(made.keys());
    for (const t of trades)
      if (t.status === 'open' && localDate(t.openedAt, ctx.timeZone) === date)
        dayIds.add(t.id);
    return {
      net: day?.net ?? 0,
      r: day?.r ?? null,
      ticks: day?.ticks ?? null,
      pips: day?.pips ?? null,
      points: day?.points ?? null,
      trades: day?.trades ?? 0,
      wins: day?.wins ?? 0,
      losses: day?.losses ?? 0,
      rules: dayGrading(exits, strategies, tags, categories, ctx).rules,
      made,
      dayIds,
    };
  }, [source, trades, strategies, tags, categories, date]);

  return (
    <section aria-label="The day's stats" className={CARD_BOX}>
      {source && model && prefs ? (
        // The figures read the view's source: they sit under its provider.
        <FigureSourceContext.Provider value={source}>
          <DayBody
            date={date}
            model={model}
            basis={source.ctx.pnlBasis}
            linkedTradeIds={linkedTradeIds}
            readOnly={readOnly}
            onLinkedChange={onLinkedChange}
            timeZone={prefs.timeZone}
            currency={currency}
            pctBase={source.pctBase}
          />
        </FigureSourceContext.Provider>
      ) : (
        <div
          role="status"
          aria-label="Loading the day"
          className="h-[52px] rounded-control bg-sunken"
        />
      )}
    </section>
  );
}

function StatsBody({
  trade,
  source,
}: {
  trade: Trade;
  source: FigureSource;
}): React.JSX.Element {
  const display = useDisplay();
  const cur = trade.pnlCurrency;
  const net = display.figure(
    tradeFigure(trade, { ...source.ctx, pnlBasis: 'net' }),
    true,
    cur,
  );
  const gross = display.figure(
    tradeFigure(trade, { ...source.ctx, pnlBasis: 'gross' }),
    true,
    cur,
  );
  // Counted once, as the trade's quantity: not every fill.
  const volume = tradeVolume(trade);
  const base =
    tradeFigure(trade, { ...source.ctx, pnlBasis: 'net' }).pct ?? null;
  return (
    <>
      <div className={KPIS}>
        <Kpi label="Net P&L" tone={signTone(trade.net)}>
          <FigureText f={net} />
        </Kpi>
        <Kpi label="Quantity">{formatQty(trade.maxPosition)}</Kpi>
        <Kpi
          label={
            <MetricTip
              id="volume"
              basis={source.ctx.pnlBasis}
              className="pointer-coarse:-my-3.5"
            />
          }
        >
          {formatQty(volume)}
        </Kpi>
        <Kpi label="Commissions">
          <FigureText f={display.cash(trade.fees, false, cur)} />
        </Kpi>
        <Kpi label="Net ROI" tone={base === null ? '' : signTone(base)}>
          {base === null || trade.status !== 'closed'
            ? 'None'
            : `${base > 0 ? '+' : ''}${formatPct(base, 2)}`}
        </Kpi>
        <Kpi label="Gross P&L" tone={signTone(trade.gross)}>
          <FigureText f={gross} />
        </Kpi>
        <Link
          href={`/app/trades/${encodeURIComponent(trade.id)}`}
          className="inline-flex items-center gap-1.5 self-center ml-auto rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <ArrowSquareOut size={14} aria-hidden="true" />
          Open trade
        </Link>
      </div>
    </>
  );
}

/** A trade note's header: the trade's own figures, and the way to the trade. */
export function TradeStatsCard({
  tradeId,
}: {
  tradeId: string;
}): React.JSX.Element | null {
  const trade = useTrade(tradeId).data;
  const trades = useMemo(() => (trade ? [trade] : undefined), [trade]);
  const accountIds = useMemo(() => (trade ? [trade.accountId] : []), [trade]);
  const prefs = usePrefs().data;
  const source = useFigureSource({
    trades,
    accountIds,
    currency: trade?.pnlCurrency ?? 'USD',
    from: trade && prefs ? localDate(trade.openedAt, prefs.timeZone) : '',
  });
  if (trade === null) return null;
  return (
    <section aria-label="The trade's stats" className={CARD_BOX}>
      {trade && source ? (
        <FigureSourceContext.Provider value={source}>
          <StatsBody trade={trade} source={source} />
        </FigureSourceContext.Provider>
      ) : (
        <div
          role="status"
          aria-label="Loading the trade"
          className="h-[52px] rounded-control bg-sunken"
        />
      )}
    </section>
  );
}
