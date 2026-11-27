'use client';

import { useId, useMemo, useState } from 'react';
import { dateTicks } from '@/components/charts/chart-kit';
import {
  DualAxisChart,
  type DualSeries,
} from '@/components/charts/dual-axis-chart';
import { Segmented } from '@/components/ui/segmented';
import { formatterOf, periodText } from '@/components/app/reports/report-chart';
import {
  phaseBalance,
  type BalanceMode,
  type PhasePoint,
} from '@/domain/prop/phase';
import type { Account, CashFlow, Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatCount, plural } from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { zoneLabel } from '@/lib/time-zone-label';
import { CARD, CARD_PAD, Caption, CardHeader } from '../dashboard/shared';
import { TipGlyph } from '../dashboard/widgets/frame';

const MODES = [
  { value: 'day', label: 'Day' },
  { value: 'hour', label: 'Hour' },
  { value: 'trade', label: 'Trade' },
] as const;

const MODE_WORD: Record<BalanceMode, string> = {
  day: 'day',
  hour: 'hour',
  trade: 'trade',
};

/** "13:00". */
const hourText = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`;

/** The x axis of an hour chart: a label where each new day begins (the chart drops any that would touch). */
function hourTicks(
  points: readonly PhasePoint[],
): { at: number; text: string }[] {
  const firsts: number[] = [];
  points.forEach((p, i) => {
    if (i === 0 || points[i - 1]!.date !== p.date) firsts.push(i);
  });
  const days = firsts.map((i) => points[i]!.date);
  // Few days: each is labelled. Many: the first day of each month.
  return dateTicks(days).map((t) => ({ at: firsts[t.at]!, text: t.text }));
}

/** The x axis of a trade chart: the trade numbers, a round step (1, 2, 5, 10, 20, 50...) apart so about ten are named. */
function tradeTicks(n: number): { at: number; text: string }[] {
  const nice = [1, 2, 5] as const;
  let k = 0;
  let step = 1;
  while (n / step > 10) {
    k += 1;
    step = nice[k % 3]! * 10 ** Math.floor(k / 3);
  }
  const ticks: { at: number; text: string }[] = [];
  for (let i = 0; i < n; i += 1)
    if (i === 0 || (i + 1) % step === 0)
      ticks.push({ at: i, text: String(i + 1) });
  return ticks;
}

/**
 * The phase's balance (C65), by day, hour or trade: what the phase's trading
 * account holds at each point, from the phase's start. A line chart with a
 * hover and focus readout and a table for assistive technology; money reads in
 * the account's own currency through the display, so Privacy hides it.
 */
export function BalanceCard({
  label,
  account,
  flows,
  trades,
  startDate,
  timeZone,
}: {
  /** The phase's name: "Step 1", "Step 2" or "Funded". */
  label: string;
  /** The phase's account; none until one is linked. */
  account: Account | undefined;
  flows: readonly CashFlow[];
  /** The account's trades (`accountTrades`). */
  trades: readonly Trade[];
  startDate?: string;
  timeZone: string;
}): React.JSX.Element {
  const headingId = useId();
  const display = useDisplay();
  const [mode, setMode] = useState<BalanceMode>('day');
  const currency = account?.currency ?? 'USD';
  const points = useMemo(
    () =>
      account
        ? phaseBalance(mode, {
            account,
            flows,
            trades,
            ...(startDate !== undefined && { startDate }),
            timeZone,
          })
        : [],
    [account, flows, trades, startDate, timeZone, mode],
  );
  const xs = useMemo(() => points.map((_, i) => i), [points]);
  const xAxis = useMemo(
    () => ({
      lo: -0.5,
      hi: points.length - 0.5,
      ticks:
        mode === 'day'
          ? dateTicks(points.map((p) => p.date))
          : mode === 'hour'
            ? hourTicks(points)
            : tradeTicks(points.length),
    }),
    [points, mode],
  );
  const series = useMemo<DualSeries[]>(
    () => [
      {
        key: 'balance',
        label: 'Balance',
        kind: 'line',
        axis: 'left',
        unit: 'balance',
        values: points.map((p) => p.balance),
      },
    ],
    [points],
  );
  const fmt = useMemo(
    () => formatterOf(display, currency, true),
    // `display` is rebuilt on every render; what it reads is the unit and the currency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.unit, currency],
  );

  const first = points[0];
  const last = points[points.length - 1];
  const pointLabel = (i: number): string => {
    const p = points[i]!;
    if (mode === 'hour') return `${periodText(p.date)}, ${hourText(p.hour!)}`;
    if (mode === 'trade')
      return `Trade ${i + 1}, ${shortTime(p.at!, timeZone)}`;
    return periodText(p.date);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <CardHeader
        headingId={headingId}
        title="Balance"
        after={
          <>
            <TipGlyph id="phase-balance" basis="net" name="Balance" />
            {account ? (
              <Caption>
                {label} account, {account.name}
                {account.status === 'archived' ? ', archived' : ''}
              </Caption>
            ) : null}
          </>
        }
        end={
          account ? (
            <Segmented<BalanceMode>
              label="Balance by"
              value={mode}
              options={MODES}
              coarseTargets
              onChange={setMode}
            />
          ) : undefined
        }
      />
      {!account ? (
        <p className="flex flex-1 items-center justify-center px-2 py-10 text-center text-[13.5px] leading-[1.5] text-muted">
          No account linked to this phase yet. Link one with Edit.
        </p>
      ) : !first || !last ? (
        <p className="flex flex-1 items-center justify-center px-2 py-10 text-center text-[13.5px] leading-[1.5] text-muted">
          No closed trades in this phase yet.
        </p>
      ) : (
        <div className="mt-3">
          <DualAxisChart
            label={`Balance by ${MODE_WORD[mode]}, ${label} account. ${formatCount(points.length)} ${plural(points.length, mode)}, from ${
              mode === 'trade'
                ? shortTime(first.at!, timeZone)
                : periodText(first.date)
            } to ${
              mode === 'trade'
                ? shortTime(last.at!, timeZone)
                : periodText(last.date)
            }. Ends at ${fmt.text('balance', last.balance)}.`}
            currency={currency}
            xs={xs}
            xHeading={
              mode === 'trade' ? 'Trade' : mode === 'hour' ? 'Hour' : 'Day'
            }
            pointLabel={pointLabel}
            xAxis={xAxis}
            series={series}
            legend={false}
            dollars
            height={220}
            {...(mode === 'hour' && {
              note: `Hours in ${zoneLabel(timeZone)}`,
            })}
            {...(mode === 'trade' && {
              note: 'Trade number, in the order the trades closed',
            })}
          />
        </div>
      )}
    </section>
  );
}
