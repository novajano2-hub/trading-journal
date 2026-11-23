'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowSquareOut, CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { calendarMonth, dayExits } from '@/data/calendar';
import { usePrefs, useTrade, useTrades } from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import type { Trade } from '@/domain/types';
import {
  FigureSourceContext,
  tradeFigure,
  useDisplay,
  type FigureSource,
} from '@/lib/display';
import { formatPct } from '@/lib/format';
import { InstrumentName, signTone } from '../dashboard/shared';
import { useFigureSource } from './use-figure-source';

const CARD_BOX = 'mt-3.5 min-w-0 border-y border-line py-3 max-sm:py-2.5';
const KPIS = 'flex flex-wrap items-center gap-y-3';

function Kpi({
  label,
  children,
  tone = '',
}: {
  label: string;
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

/** One of the day's trades, as a chip that links it with what it made that day. */
function TradeChip({
  trade,
  value,
  r,
  timeZone,
  currency,
  pctBase,
}: {
  trade: Trade;
  /** What its exits on the day made; undefined for a trade still open. */
  value: number | undefined;
  r: number | null;
  timeZone: string;
  currency: string;
  pctBase: number | null;
}): React.JSX.Element {
  const display = useDisplay();
  const figure =
    value === undefined
      ? undefined
      : display.figure(
          { money: value, pct: pctBase ? value / pctBase : null, r },
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
      ) : (
        <em className="font-medium text-faint not-italic">Open</em>
      )}
    </Link>
  );
}

interface DayModel {
  net: number;
  r: number | null;
  trades: number;
  wins: number;
  chips: { trade: Trade; value: number | undefined; r: number | null }[];
}

function DayBody({
  date,
  model,
  timeZone,
  currency,
  pctBase,
}: {
  date: string;
  model: DayModel;
  timeZone: string;
  currency: string;
  pctBase: number | null;
}): React.JSX.Element {
  const display = useDisplay();
  if (model.chips.length === 0)
    return <p className="text-[14px] text-muted">No trades this day.</p>;
  const net = display.figure(
    { money: model.net, pct: pctBase ? model.net / pctBase : null, r: model.r },
    true,
    currency,
  );
  return (
    <>
      <div className={KPIS}>
        <Kpi label="Net P&L" tone={signTone(model.net)}>
          <FigureText f={net} />
        </Kpi>
        <Kpi label="Trades">{model.trades}</Kpi>
        <Kpi label="Win rate">
          {model.trades === 0
            ? '-'
            : formatPct(
                model.wins / model.trades,
                model.wins % model.trades === 0 ? 0 : 1,
              )}
        </Kpi>
        <Link
          href={`/app/calendar?day=${date}`}
          className="inline-flex items-center gap-1.5 self-center ml-auto rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <CalendarBlank size={14} aria-hidden="true" />
          Open the day
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12.5px] text-faint">Linked trades</span>
        {model.chips.map((c) => (
          <TradeChip
            key={c.trade.id}
            trade={c.trade}
            value={c.value}
            r={c.r}
            timeZone={timeZone}
            currency={currency}
            pctBase={pctBase}
          />
        ))}
      </div>
    </>
  );
}

/**
 * The day's figures, booked by realization as the calendar books them: every
 * trade with an exit that day counts, wherever the rest of it stands. Trades
 * still open that opened the day are chips too, without a figure.
 */
export function DayCard({ date }: { date: string }): React.JSX.Element {
  const prefs = usePrefs().data;
  const all = useTrades().data;
  const currency = prefs?.baseCurrency ?? 'USD';
  const trades = useMemo(
    () => all?.filter((t) => t.pnlCurrency === currency),
    [all, currency],
  );
  const noAccounts = useMemo(() => [] as string[], []);
  const source = useFigureSource({
    trades,
    accountIds: noAccounts,
    currency,
    from: date,
  });
  const model = useMemo((): DayModel | undefined => {
    if (!source || !trades) return undefined;
    const { ctx } = source;
    const { weeks } = calendarMonth(trades, [], date.slice(0, 7), ctx);
    const day = weeks.flatMap((w) => w.days).find((d) => d?.date === date);
    const exits = dayExits(trades, date, ctx);
    const byTrade = new Map<string, DayModel['chips'][number]>();
    for (const e of exits) {
      const seen = byTrade.get(e.trade.id);
      byTrade.set(e.trade.id, {
        trade: e.trade,
        value: (seen?.value ?? 0) + e.value,
        r:
          e.r === null && seen?.r === undefined
            ? null
            : (seen?.r ?? 0) + (e.r ?? 0),
      });
    }
    for (const t of trades)
      if (
        t.status === 'open' &&
        !byTrade.has(t.id) &&
        localDate(t.openedAt, ctx.timeZone) === date
      )
        byTrade.set(t.id, { trade: t, value: undefined, r: null });
    return {
      net: day?.net ?? 0,
      r: day?.r ?? null,
      trades: day?.trades ?? 0,
      wins: day?.wins ?? 0,
      chips: [...byTrade.values()],
    };
  }, [source, trades, date]);

  return (
    <section aria-label="The day's stats" className={CARD_BOX}>
      {source && model && prefs ? (
        // The figures read the view's source: they sit under its provider.
        <FigureSourceContext.Provider value={source}>
          <DayBody
            date={date}
            model={model}
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
  const volume = trade.executions.reduce((n, e) => n + e.qty, 0);
  const base =
    tradeFigure(trade, { ...source.ctx, pnlBasis: 'net' }).pct ?? null;
  return (
    <>
      <div className={KPIS}>
        <Kpi label="Net P&L" tone={signTone(trade.net)}>
          <FigureText f={net} />
        </Kpi>
        <Kpi label="Quantity">{trade.maxPosition}</Kpi>
        <Kpi label="Volume">{volume}</Kpi>
        <Kpi label="Commissions">
          <FigureText f={display.cash(trade.fees, false, cur)} />
        </Kpi>
        <Kpi label="Net ROI" tone={base === null ? '' : signTone(base)}>
          {base === null || trade.status !== 'closed'
            ? '-'
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
