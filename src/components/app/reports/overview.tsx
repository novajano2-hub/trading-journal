'use client';

import {
  ArrowsLeftRight,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  Receipt,
  Target,
} from '@phosphor-icons/react/dist/ssr';
import { useId, useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { winsVsLosses } from '@/domain/metrics/breakdowns';
import { pnlOf } from '@/domain/metrics/context';
import { timeSeries } from '@/domain/metrics/series';
import { rExpectancy, summarize } from '@/domain/metrics/summary';
import { localDate } from '@/domain/time';
import { isClosed } from '@/domain/trade-status';
import { formatUnitValue, useDisplay } from '@/lib/display';
import { formatDuration, formatPct, plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import { periodText, ReportChart, type Shade } from './report-chart';
import { ReportScope } from './report-scope';
import type { ReportData } from './use-report-data';

const NONE = <span className="font-medium text-faint">None yet</span>;

function Kpi({
  id,
  data,
  tone = '',
  sub,
  children,
}: {
  id: MetricId;
  data: ReportData;
  /** Gain or loss ink for the figure. */
  tone?: string;
  sub: ReactNode;
  /** The figure; null reads "None yet". */
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-kpi={id}
      className="min-w-0 border-r border-b border-line px-4 py-3.5"
    >
      <div className="text-xs leading-4 text-faint pointer-coarse:-my-3.5">
        <MetricTip id={id} basis={data.basis} />
      </div>
      <div
        className={`mt-0.5 text-[20px] leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums ${tone}`}
      >
        {children ?? NONE}
      </div>
      <div className="mt-px truncate text-xs text-faint">{sub}</div>
    </div>
  );
}

function Stat({
  id,
  label,
  data,
  tone = '',
  sub,
  children,
}: {
  id: MetricId;
  /** The visible label, where the card words it differently from the definition's. */
  label?: string;
  data: ReportData;
  tone?: string;
  sub?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 last:border-b-0">
      <span className="text-[13.5px] text-muted">
        <MetricTip id={id} basis={data.basis}>
          {label}
        </MetricTip>
      </span>
      <span
        data-stat={id}
        className={`text-right font-semibold tabular-nums ${tone}`}
      >
        {children ?? NONE}
        {sub ? (
          <small className="ml-1.5 text-xs font-normal text-faint">{sub}</small>
        ) : null}
      </span>
    </div>
  );
}

const ratio = (n: number | null) => (n === null ? null : n.toFixed(2));

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const { partition: p, ctx, basis, currency } = data;
  const display = useDisplay();
  const s = p.summary;
  const closed = useMemo(() => p.trades.filter(isClosed), [p.trades]);
  const money = (cents: number, signed = true) =>
    display.figure({ money: cents }, signed, currency);
  const gross = basis === 'gross';

  const net = display.ofAll(gross ? s.grossPnl : s.netPnl);
  const expectancy =
    s.expectancy === null ? null : display.meanOfAll(s.expectancy);
  const outcomes = useMemo(() => winsVsLosses(p.trades, ctx), [p.trades, ctx]);
  const trade = (cents: number | null) => {
    if (cents === null) return null;
    const t = closed.find((c) => pnlOf(c, basis) === cents);
    return t ? display.ofTrade(t) : { money: cents };
  };
  const largestWin = trade(s.largestWin);
  const largestLoss = trade(s.largestLoss);
  const fig = (f: { money: number } | null) =>
    f === null ? null : <FigureText f={display.figure(f, true, currency)} />;
  const drawdown = p.drawdown;
  const days = p.days;
  const ds = p.daySummary;
  const seriesIn = useMemo(
    () => ({
      cumulative: timeSeries(p.dayTrades, ctx, 'cumulative-net', 'day'),
      daily: timeSeries(p.dayTrades, ctx, 'net', 'day'),
    }),
    [p.dayTrades, ctx],
  );
  const ends = seriesIn.cumulative[seriesIn.cumulative.length - 1]?.value;
  // The max drawdown, from its peak to its low, shaded on the cumulative line.
  const drawdownText =
    drawdown.amount > 0
      ? `Max drawdown after each trade ${display.cash(-drawdown.amount, true, currency).text}${drawdown.pct === null ? '' : `, ${formatPct(drawdown.pct, 1)}`}`
      : '';
  const shade = useMemo<Shade | undefined>(
    () =>
      drawdown.amount > 0 && drawdown.troughAt
        ? {
            name: 'drawdown',
            // A fall from the starting balance has no peak trade: it runs from the first day.
            from: drawdown.peakAt
              ? localDate(drawdown.peakAt, ctx.timeZone)
              : '',
            to: localDate(drawdown.troughAt, ctx.timeZone),
            label: drawdownText,
          }
        : undefined,
    // The label is the unit-aware text of the amount: it changes with these.
    [drawdown, ctx.timeZone, drawdownText],
  );
  const rExp = useMemo(() => rExpectancy(p.trades, ctx), [p.trades, ctx]);
  const r = (v: number, signed: boolean) =>
    formatUnitValue('r', v, { currency, signed });
  const feeShare = s.grossPnl > 0 ? s.fees / s.grossPnl : null;
  const widest = Math.max(1, Math.abs(s.grossPnl), s.fees, Math.abs(s.netPnl));

  const long = closed.filter((t) => t.direction === 'long');
  const short = closed.filter((t) => t.direction === 'short');
  const sides = [long, short].map((trades) => {
    const sum = summarize(trades, ctx);
    return {
      count: sum.closedCount,
      winRate: sum.winRate,
      net: display.ofTrades(
        trades.map((t) => t.id),
        gross ? sum.grossPnl : sum.netPnl,
      ),
      moneyNet: gross ? sum.grossPnl : sum.netPnl,
      pf: sum.profitFactor,
    };
  });

  const cumulativeName = `Cumulative ${basis} P&L by day, ${data.caption}.${
    ends === undefined || ends === null
      ? ''
      : ` Ends at ${display.cash(ends, true, currency).label}.`
  }`;
  const extremes = seriesIn.daily.filter(
    (d): d is { key: string; value: number } => d.value !== null,
  );
  const topDay = extremes.reduce<(typeof extremes)[number] | undefined>(
    (a, d) => (a === undefined || d.value > a.value ? d : a),
    undefined,
  );
  const lowDay = extremes.reduce<(typeof extremes)[number] | undefined>(
    (a, d) => (a === undefined || d.value < a.value ? d : a),
    undefined,
  );
  const dailyName = `Daily ${basis} P&L bars, ${days.length} ${plural(days.length, 'day')}, ${data.caption}.${
    topDay && lowDay
      ? ` Best ${periodText(topDay.key)} ${display.cash(topDay.value, true, currency).label}, worst ${periodText(lowDay.key)} ${display.cash(lowDay.value, true, currency).label}.`
      : ''
  }`;
  const cumulativeId = useId();
  const dailyId = useId();
  const durations = p.dayDurations;
  const sideRows: {
    id: MetricId;
    cell(i: number): ReactNode;
    tone?(i: number): string;
  }[] = [
    { id: 'trades', cell: (i) => sides[i]!.count },
    {
      id: 'win-rate',
      cell: (i) =>
        sides[i]!.winRate === null ? NONE : formatPct(sides[i]!.winRate!, 1),
    },
    {
      id: 'pnl',
      cell: (i) => (
        <FigureText f={display.figure(sides[i]!.net, true, currency)} />
      ),
      tone: (i) => signTone(sides[i]!.moneyNet),
    },
    {
      id: 'profit-factor',
      cell: (i) => (sides[i]!.pf === null ? NONE : ratio(sides[i]!.pf)),
    },
  ];

  return (
    <>
      <section aria-label="Key figures" className={`${CARD} overflow-hidden`}>
        <div className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
          <Kpi
            id="pnl"
            data={data}
            tone={signTone(net.money)}
            sub={`${s.closedCount.toLocaleString('en-US')} closed ${plural(s.closedCount, 'trade')}`}
          >
            {fig(net)}
          </Kpi>
          <Kpi
            id="win-rate"
            data={data}
            sub={`${s.wins} won, ${s.losses} lost`}
          >
            {s.winRate === null ? null : formatPct(s.winRate, 1)}
          </Kpi>
          <Kpi id="profit-factor" data={data} sub="total won over total lost">
            {ratio(s.profitFactor)}
          </Kpi>
          <Kpi
            id="expectancy"
            data={data}
            tone={signTone(expectancy?.money ?? 0)}
            sub="per trade"
          >
            {fig(expectancy)}
          </Kpi>
          <Kpi
            id="avg-win"
            data={data}
            tone="text-gain"
            sub={`${s.wins} winning ${plural(s.wins, 'trade')}`}
          >
            {s.avgWin === null
              ? null
              : fig(display.meanOfTrades(outcomes.wins.tradeIds, s.avgWin))}
          </Kpi>
          <Kpi
            id="avg-loss"
            data={data}
            tone="text-loss"
            sub={`${s.losses} losing ${plural(s.losses, 'trade')}`}
          >
            {s.avgLoss === null
              ? null
              : fig(display.meanOfTrades(outcomes.losses.tradeIds, s.avgLoss))}
          </Kpi>
          <Kpi id="largest-win" data={data} tone="text-gain" sub="one trade">
            {fig(largestWin)}
          </Kpi>
          <Kpi id="largest-loss" data={data} tone="text-loss" sub="one trade">
            {fig(largestLoss)}
          </Kpi>
          <Kpi
            id="max-drawdown"
            data={data}
            tone={drawdown.amount > 0 ? 'text-loss' : ''}
            sub={
              drawdown.amount === 0
                ? 'no fall from a peak'
                : drawdown.pct === null
                  ? 'from a peak'
                  : `${formatPct(drawdown.pct, 1)} of peak`
            }
          >
            <FigureText f={money(-drawdown.amount)} />
          </Kpi>
          <Kpi id="win-streak" data={data} sub="winning trades in a row">
            {p.tradeStreaks.maxWin}
          </Kpi>
          <Kpi id="loss-streak" data={data} sub="losing trades in a row">
            {p.tradeStreaks.maxLoss}
          </Kpi>
          <Kpi
            id="green-days"
            data={data}
            sub={`${ds.greenDays} of ${days.length} trading ${plural(days.length, 'day')}`}
          >
            {ds.greenPct === null ? null : formatPct(ds.greenPct, 1)}
          </Kpi>
          <Kpi id="sharpe" data={data} sub="daily, annualised">
            {ratio(p.risk.sharpe)}
          </Kpi>
          <Kpi id="sortino" data={data} sub="daily, annualised">
            {ratio(p.risk.sortino)}
          </Kpi>
        </div>
      </section>

      <section aria-labelledby={cumulativeId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          icon={ChartLineUp}
          tone="accent"
          headingId={cumulativeId}
          title="Cumulative P&L"
          after={
            <span className="text-[12.5px] text-faint">
              By realization date, {days.length} trading{' '}
              {plural(days.length, 'day')}, {data.caption}
            </span>
          }
          end={
            ends === undefined || ends === null ? undefined : (
              <span className="text-[12.5px] text-faint">
                Ends at{' '}
                <b className={`font-semibold ${signTone(ends)}`}>
                  <FigureText f={display.cash(ends, true, currency)} />
                </b>
              </span>
            )
          }
        />
        <div className="mt-3">
          <ReportChart
            label={cumulativeName}
            currency={currency}
            height={280}
            shade={shade}
            series={[
              {
                label: 'Cumulative P&L',
                kind: 'line',
                unit: 'money',
                points: seriesIn.cumulative,
              },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby={dailyId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          icon={ChartBar}
          tone="accent"
          headingId={dailyId}
          title="Daily P&L"
          after={
            <span className="text-[12.5px] text-faint">
              {ds.greenDays} green {plural(ds.greenDays, 'day')}, {ds.redDays}{' '}
              red {plural(ds.redDays, 'day')}
            </span>
          }
          end={
            ds.best && ds.worst ? (
              <span className="text-[12.5px] text-faint">
                Best {periodText(ds.best.date)}, worst{' '}
                {periodText(ds.worst.date)}
              </span>
            ) : undefined
          }
        />
        <div className="mt-3">
          <ReportChart
            label={dailyName}
            currency={currency}
            height={220}
            series={[
              {
                label: 'Daily P&L',
                kind: 'bar',
                unit: 'money',
                points: seriesIn.daily,
              },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Gross to net" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={Receipt}
            tone="neutral"
            headingId={`${cumulativeId}-gross`}
            title="Gross to net"
          />
          <div className="mt-2">
            {(
              [
                ['gross-pnl', s.grossPnl, 'bg-gain-fill'],
                ['fees', -s.fees, 'bg-loss-fill'],
                ['net-pnl', s.netPnl, 'bg-accent'],
              ] as const
            ).map(([id, cents, fill]) => (
              <div
                key={id}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/70 py-2.5 last:border-b-0"
              >
                <span className="text-[13.5px] text-muted">
                  <MetricTip id={id} basis={basis} />
                </span>
                <span
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-sunken"
                >
                  <span
                    className={`block h-full rounded-full ${fill}`}
                    style={{
                      width: `${cents === 0 ? 0 : Math.max(2, (Math.abs(cents) / widest) * 100)}%`,
                    }}
                  />
                </span>
                <span
                  data-stat={id}
                  className={`text-right font-semibold tabular-nums ${signTone(cents)}`}
                >
                  <FigureText f={display.cash(cents, true, currency)} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            {feeShare !== null && s.fees > 0
              ? `Fees took ${formatPct(feeShare, 1)} of gross.`
              : s.fees === 0
                ? 'No fees on these trades.'
                : 'Fees came on top of a gross loss.'}
          </p>
        </section>

        <section aria-label="Risk in R" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={Target}
            tone="accent"
            headingId={`${cumulativeId}-risk`}
            title="Risk in R"
          />
          <div className="mt-1">
            <Stat
              id="planned-r"
              label="Average planned R"
              data={data}
              sub={
                s.plannedRTradeCount === 0
                  ? undefined
                  : `${s.plannedRTradeCount} ${plural(s.plannedRTradeCount, 'trade')}`
              }
            >
              {s.avgPlannedR === null ? null : r(s.avgPlannedR, false)}
            </Stat>
            <Stat
              id="realized-r"
              label="Average realized R"
              data={data}
              tone={signTone(s.avgRealizedR ?? 0)}
              sub={
                s.realizedRTradeCount === 0
                  ? undefined
                  : `${s.realizedRTradeCount} ${plural(s.realizedRTradeCount, 'trade')}`
              }
            >
              {s.avgRealizedR === null ? null : r(s.avgRealizedR, true)}
            </Stat>
            <Stat
              id="r-expectancy"
              data={data}
              tone={signTone(rExp.value ?? 0)}
              sub={
                rExp.count === 0
                  ? undefined
                  : `${rExp.count} ${plural(rExp.count, 'trade')}`
              }
            >
              {rExp.value === null ? null : r(rExp.value, true)}
            </Stat>
            <Stat id="no-stop" data={data} sub={`left out of R`}>
              {s.noRiskCount}
            </Stat>
          </div>
        </section>

        <section aria-label="Days" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={CalendarBlank}
            tone="neutral"
            headingId={`${dailyId}-days`}
            title="Days and returns"
          />
          <div className="mt-1">
            <Stat id="avg-daily-win-rate" data={data}>
              {p.avgDailyWinRate === null
                ? null
                : formatPct(p.avgDailyWinRate, 1)}
            </Stat>
            <Stat
              id="day-streaks"
              data={data}
              sub={`${p.dayStreaks.maxLoss} red`}
            >
              {`${p.dayStreaks.maxWin} green`}
            </Stat>
            <Stat
              id="longest-day"
              data={data}
              sub={
                durations.average === null
                  ? undefined
                  : `${formatDuration(durations.average * 60000)} on average`
              }
            >
              {durations.longest === null
                ? null
                : formatDuration(durations.longest * 60000)}
            </Stat>
            <Stat id="net-roi" data={data}>
              {s.netRoi === null
                ? null
                : formatUnitValue('percent', s.netRoi, {
                    currency,
                    signed: true,
                  })}
            </Stat>
          </div>
        </section>

        <section aria-label="Long and short" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={ArrowsLeftRight}
            tone="neutral"
            headingId={`${cumulativeId}-sides`}
            title="Long and short"
          />
          <table
            aria-label="Long and short"
            className="mt-2 w-full border-collapse text-[13.5px]"
          >
            <thead>
              <tr>
                <td className="h-8" />
                {['Long', 'Short'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="h-8 text-right text-xs font-medium text-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sideRows.map((r) => (
                <tr key={r.id} className="border-t border-line/70">
                  <th
                    scope="row"
                    className="h-10 text-left font-normal text-muted"
                  >
                    <MetricTip id={r.id} basis={basis} />
                  </th>
                  {[0, 1].map((i) => (
                    <td
                      key={i}
                      className={`h-10 text-right font-semibold tabular-nums ${r.tone?.(i) ?? ''}`}
                    >
                      {r.cell(i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

/**
 * Reports, Overview: the figures that sum up the filtered trades, then the
 * cumulative P&L line and the daily bars, both booked by the date of each exit.
 * Trade-level figures read the filtered trades; day-level ones (green days,
 * Sharpe, Sortino, the two charts) read the trades with every filter but the
 * date, clipped to the date range. Render inside `<Suspense>`.
 */
export function OverviewView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-overview">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}
