'use client';

import { useId, useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import { metricDefinition, type MetricId } from '@/content/metric-definitions';
import { winsVsLosses } from '@/domain/metrics/breakdowns';
import { dayValue } from '@/domain/metrics/days';
import { seriesUnit, timeSeries } from '@/domain/metrics/series';
import { largestTrade, rExpectancy, summarize } from '@/domain/metrics/summary';
import { isClosed } from '@/domain/trade-status';
import type { Trade } from '@/domain/types';
import { formatUnitValue, useDisplay } from '@/lib/display';
import { formatDuration, formatPct, plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import {
  formatterOf,
  periodText,
  ReportChart,
  useExpandSlot,
  type Shade,
} from './report-chart';
import {
  ChoiceRow,
  ChoiceScope,
  ChooseFigures,
  FigureGroup,
  useFigureSlot,
} from './overview-choice';
import { OverviewCosts } from './overview-costs';
import { OverviewDayFigures } from './overview-day-figures';
import { OverviewDayCounts, OverviewTradeCounts } from './overview-counts';
import { OverviewHold } from './overview-hold';
import { OverviewMonths } from './overview-months';
import {
  LinkedFigure,
  NONE,
  Stat,
  StatCard,
  useDayValue,
} from './overview-stat';
import { ReportScope } from './report-scope';
import type { ReportData } from './use-report-data';
import { RatioText } from '../ratio-text';

function Kpi({
  id,
  data,
  tone = '',
  sub,
  href,
  linkLabel,
  children,
}: {
  id: MetricId;
  data: ReportData;
  /** Gain or loss ink for the figure. */
  tone?: string;
  sub: ReactNode;
  /** Makes the figure a link to the trade behind it. */
  href?: string;
  linkLabel?: string;
  /** The figure; null reads "None". */
  children: ReactNode;
}): React.JSX.Element | null {
  const slot = useFigureSlot(id);
  if (slot.mode === 'list')
    return (
      <ChoiceRow figure={id} label={metricDefinition(id, data.basis).label}>
        {children}
      </ChoiceRow>
    );
  if (slot.hidden) return null;
  return (
    <div
      data-kpi={id}
      data-figure={slot.key}
      className="min-w-0 border-r border-b border-line px-4 py-3.5"
    >
      <div className="text-xs leading-4 text-faint pointer-coarse:-my-3.5">
        <MetricTip id={id} basis={data.basis} />
      </div>
      <div
        className={`mt-0.5 text-[20px] leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums ${tone}`}
      >
        <LinkedFigure href={href} label={linkLabel ?? id}>
          {children}
        </LinkedFigure>
      </div>
      <div className="mt-px truncate text-xs text-faint">{sub}</div>
    </div>
  );
}

/** One line of Gross to net: the label, a bar to scale, and the amount. */
function GrossRow({
  id,
  cents,
  fill,
  widest,
  data,
  children,
}: {
  id: 'gross-pnl' | 'fees' | 'net-pnl';
  cents: number;
  fill: string;
  widest: number;
  data: ReportData;
  children: ReactNode;
}): React.JSX.Element | null {
  const slot = useFigureSlot(id);
  if (slot.mode === 'list')
    return (
      <ChoiceRow figure={id} label={metricDefinition(id, data.basis).label}>
        {children}
      </ChoiceRow>
    );
  if (slot.hidden) return null;
  return (
    <div
      data-figure={slot.key}
      className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/70 py-2.5 last:border-b-0"
    >
      <span className="text-[13.5px] text-muted">
        <MetricTip id={id} basis={data.basis} />
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
        {children}
      </span>
    </div>
  );
}

/** One row of the Long and short table; gone when its figure is hidden. */
function SideRow({
  row,
  basis,
}: {
  row: {
    id: MetricId;
    cell(i: number): ReactNode;
    tone?(i: number): string;
  };
  basis: ReportData['basis'];
}): React.JSX.Element | null {
  const slot = useFigureSlot(row.id);
  if (slot.hidden) return null;
  return (
    <tr data-figure={slot.key} className="border-t border-line/70">
      <th scope="row" className="h-10 text-left font-normal text-muted">
        <MetricTip id={row.id} basis={basis} />
      </th>
      {[0, 1].map((i) => (
        <td
          key={i}
          className={`h-10 text-right font-semibold tabular-nums ${row.tone?.(i) ?? ''}`}
        >
          {row.cell(i)}
        </td>
      ))}
    </tr>
  );
}

const tradeHref = (t: Trade | undefined) =>
  t === undefined ? undefined : `/app/trades/${encodeURIComponent(t.id)}`;

const ratio = (n: number | null) =>
  n === null ? null : <RatioText value={n} />;

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
    s.expectancy === null ? null : display.expectancy(s.expectancy);
  const outcomes = useMemo(() => winsVsLosses(p.trades, ctx), [p.trades, ctx]);
  // The trade that is the figure: its own id is the link, never a P&L match.
  const largest = (outcome: 'win' | 'loss') => {
    const t = largestTrade(closed, ctx, outcome);
    return { trade: t, figure: t ? display.ofTrade(t) : null };
  };
  const largestWin = largest('win');
  const largestLoss = largest('loss');
  // Day figures read the display unit when one narrows the trades.
  const dayFigure = useDayValue(data);
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
  const dayOf = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const ends = seriesIn.cumulative[seriesIn.cumulative.length - 1]?.value;
  // The charts plot the display unit's own numbers when one narrows the
  // trades, so the axis, the readout, the header and the names read in it.
  const plotUnit = seriesUnit('net', ctx);
  const fmt = formatterOf(display, currency);
  const plotLabel = (v: number) => fmt.text(plotUnit, v);
  const plotText = (v: number) =>
    plotUnit === 'money'
      ? display.cash(v, true, currency).text
      : fmt.text(plotUnit, v);
  // The max drawdown, from its peak to its low, shaded on the cumulative line.
  const drawdownText =
    drawdown.amount > 0
      ? `Max drawdown by day ${display.cash(-drawdown.amount, true, currency).text}${drawdown.pct === null ? '' : `, ${formatPct(drawdown.pct, 1)}`}`
      : '';
  const shade = useMemo<Shade | undefined>(
    () =>
      drawdown.amount > 0 && drawdown.troughDay
        ? {
            name: 'drawdown',
            // A fall from the starting balance has no peak trade: it runs from the first day.
            from: drawdown.peakDay ?? '',
            to: drawdown.troughDay,
            label: drawdownText,
          }
        : undefined,
    // The label is the unit-aware text of the amount: it changes with these.
    [drawdown, drawdownText],
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
    ends === undefined || ends === null ? '' : ` Ends at ${plotLabel(ends)}.`
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
      ? ` Best ${periodText(topDay.key)} ${plotLabel(topDay.value)}, worst ${periodText(lowDay.key)} ${plotLabel(lowDay.value)}.`
      : ''
  }`;
  const cumulativeId = useId();
  const dailyId = useId();
  const [cumSlot, setCumSlot] = useExpandSlot();
  const [daySlot, setDaySlot] = useExpandSlot();
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
      cell: (i) =>
        sides[i]!.count === 0 ? (
          NONE
        ) : (
          <FigureText f={display.figure(sides[i]!.net, true, currency)} />
        ),
      tone: (i) => signTone(sides[i]!.moneyNet),
    },
    {
      id: 'profit-factor',
      cell: (i) => (sides[i]!.pf === null ? NONE : ratio(sides[i]!.pf)),
    },
  ];

  const keyFigures = (
    <FigureGroup
      id="key"
      frame={(inner) => (
        <section aria-label="Key figures" className={`${CARD} overflow-hidden`}>
          <div className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
            {inner}
          </div>
        </section>
      )}
    >
      <Kpi
        id="pnl"
        data={data}
        tone={signTone(net.money)}
        sub={`${s.closedCount.toLocaleString('en-US')} closed ${plural(s.closedCount, 'trade')}`}
      >
        {fig(net)}
      </Kpi>
      <Kpi id="win-rate" data={data} sub={`${s.wins} won, ${s.losses} lost`}>
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
      <Kpi
        id="largest-win"
        data={data}
        tone="text-gain"
        sub="one trade"
        href={tradeHref(largestWin.trade)}
        linkLabel="Open the largest win"
      >
        {fig(largestWin.figure)}
      </Kpi>
      <Kpi
        id="largest-loss"
        data={data}
        tone="text-loss"
        sub="one trade"
        href={tradeHref(largestLoss.trade)}
        linkLabel="Open the largest loss"
      >
        {fig(largestLoss.figure)}
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
              : `${formatPct(drawdown.pct, 1)} of peak balance`
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
        sub={`${ds.greenDays} green, ${ds.redDays} red, ${ds.flatDays} flat`}
      >
        {ds.greenPct === null ? null : formatPct(ds.greenPct, 1)}
      </Kpi>
      <Kpi id="sharpe" data={data} sub="daily, annualised">
        {ratio(p.risk.sharpe)}
      </Kpi>
      <Kpi id="sortino" data={data} sub="daily, annualised">
        {ratio(p.risk.sortino)}
      </Kpi>
    </FigureGroup>
  );

  const grossToNet = (
    <FigureGroup
      id="gross-net"
      frame={(inner) => (
        <section aria-label="Gross to net" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            headingId={`${cumulativeId}-gross`}
            title="Gross to net"
          />
          <div className="mt-2">{inner}</div>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            {feeShare !== null && s.fees > 0
              ? `Fees took ${formatPct(feeShare, 1)} of gross.`
              : s.fees === 0
                ? 'No fees on these trades.'
                : 'Fees came on top of a gross loss.'}
          </p>
        </section>
      )}
    >
      {(
        [
          ['gross-pnl', s.grossPnl, 'bg-gain-fill'],
          ['fees', -s.fees, 'bg-loss-fill'],
          ['net-pnl', s.netPnl, 'bg-accent'],
        ] as const
      ).map(([id, cents, fill]) => (
        <GrossRow
          key={id}
          id={id}
          cents={cents}
          fill={fill}
          widest={widest}
          data={data}
        >
          <FigureText f={display.cash(cents, true, currency)} />
        </GrossRow>
      ))}
    </FigureGroup>
  );

  const riskInR = (
    <StatCard group="risk" title="Risk in R">
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
    </StatCard>
  );

  const daysAndReturns = (
    <StatCard group="days" title="Days and returns" name="Days">
      <Stat
        id="avg-green-day"
        data={data}
        tone="text-gain"
        sub={`${ds.greenDays} ${plural(ds.greenDays, 'day')}`}
      >
        {dayFigure(ds.avgGreenValue)}
      </Stat>
      <Stat
        id="avg-red-day"
        data={data}
        tone="text-loss"
        sub={`${ds.redDays} ${plural(ds.redDays, 'day')}`}
      >
        {dayFigure(ds.avgRedValue)}
      </Stat>
      <Stat id="trades-per-day" data={data} sub="closed">
        {ds.tradesPerDay === null ? null : ds.tradesPerDay.toFixed(1)}
      </Stat>
      <Stat id="day-streaks" data={data} sub={`${p.dayStreaks.maxLoss} red`}>
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
    </StatCard>
  );

  const longAndShort = (
    <FigureGroup
      id="sides"
      frame={(inner) => (
        <section aria-label="Long and short" className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            headingId={`${cumulativeId}-sides`}
            title="Long and short"
          />
          {inner}
        </section>
      )}
      listChildren={sideRows.map((r) => (
        <ChoiceRow
          key={r.id}
          figure={r.id}
          label={metricDefinition(r.id, basis).label}
        >
          {r.cell(0)} long, {r.cell(1)} short
        </ChoiceRow>
      ))}
    >
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
            <SideRow key={r.id} row={r} basis={basis} />
          ))}
        </tbody>
      </table>
    </FigureGroup>
  );

  const months = <OverviewMonths data={data} />;
  const tradeCounts = <OverviewTradeCounts data={data} />;
  const dayCounts = <OverviewDayCounts data={data} />;
  const dayFigures = <OverviewDayFigures data={data} />;
  const hold = <OverviewHold data={data} />;
  const costs = <OverviewCosts data={data} />;

  return (
    <ChoiceScope>
      <ChooseFigures
        groups={
          <>
            {keyFigures}
            {grossToNet}
            {riskInR}
            {daysAndReturns}
            {longAndShort}
            {months}
            {tradeCounts}
            {dayCounts}
            {dayFigures}
            {hold}
            {costs}
          </>
        }
      />
      {keyFigures}

      <div className="grid gap-4 xl:grid-cols-2 xl:grid-rows-[auto_1fr] xl:gap-y-0">
        <section
          aria-labelledby={cumulativeId}
          className={`${CARD} ${CARD_PAD} min-w-0 xl:row-span-2 xl:grid xl:grid-cols-[minmax(0,1fr)] xl:grid-rows-subgrid xl:gap-y-0`}
        >
          <CardHeader
            headingId={cumulativeId}
            title="Cumulative P&L"
            after={
              <span className="text-[12.5px] text-faint">
                By realization date, {days.length} trading{' '}
                {plural(days.length, 'day')}, {data.caption}
              </span>
            }
            end={
              <>
                {ends === undefined || ends === null ? null : (
                  <span className="mr-2 text-[12.5px] text-faint">
                    Ends at{' '}
                    <b className={`font-semibold ${signTone(ends)}`}>
                      {fmt.node(plotUnit, ends)}
                    </b>
                  </span>
                )}
                <span ref={setCumSlot} className="flex" />
              </>
            }
          />
          <div className="mt-3">
            <ReportChart
              label={cumulativeName}
              expandSlot={cumSlot}
              currency={currency}
              height={280}
              shade={shade}
              extra={[
                {
                  label: 'That day',
                  text: (key) => {
                    const d = dayOf.get(key);
                    return plotText(d ? dayValue(d, ctx) : 0);
                  },
                },
                {
                  label: 'Trades',
                  text: (key) => String(dayOf.get(key)?.tradeCount ?? 0),
                },
              ]}
              series={[
                {
                  label: 'Cumulative P&L',
                  kind: 'line',
                  unit: plotUnit,
                  points: seriesIn.cumulative,
                },
              ]}
            />
          </div>
        </section>

        <section
          aria-labelledby={dailyId}
          className={`${CARD} ${CARD_PAD} min-w-0 xl:row-span-2 xl:grid xl:grid-cols-[minmax(0,1fr)] xl:grid-rows-subgrid xl:gap-y-0`}
        >
          <CardHeader
            headingId={dailyId}
            title="Daily P&L"
            after={
              <span className="text-[12.5px] text-faint">
                {ds.greenDays} green {plural(ds.greenDays, 'day')}, {ds.redDays}{' '}
                red {plural(ds.redDays, 'day')}
              </span>
            }
            end={
              <>
                {ds.best && ds.worst ? (
                  <span className="mr-2 text-[12.5px] text-faint">
                    Best {periodText(ds.best.date)}, worst{' '}
                    {periodText(ds.worst.date)}
                  </span>
                ) : null}
                <span ref={setDaySlot} className="flex" />
              </>
            }
          />
          <div className="mt-3">
            <ReportChart
              label={dailyName}
              expandSlot={daySlot}
              currency={currency}
              height={280}
              labelExtremes
              series={[
                {
                  label: 'Daily P&L',
                  kind: 'bar',
                  unit: plotUnit,
                  points: seriesIn.daily,
                },
              ]}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {grossToNet}
        {riskInR}
        {daysAndReturns}
        {longAndShort}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {months}
        {tradeCounts}
        {dayCounts}
        {dayFigures}
        {hold}
        {costs}
      </div>
    </ChoiceScope>
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
