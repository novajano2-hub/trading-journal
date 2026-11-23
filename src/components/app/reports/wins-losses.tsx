'use client';

import { ArrowDown, ArrowUp } from '@phosphor-icons/react/dist/ssr';
import { useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import { winsVsLosses, type WinLossSide } from '@/domain/metrics/breakdowns';
import { formatUnitValue, useDisplay } from '@/lib/display';
import { formatDuration, formatPct } from '@/lib/format';
import { CARD, CARD_PAD, signTone } from '../dashboard/shared';
import { ReportScope } from './report-scope';
import type { ReportData } from './use-report-data';

const NONE = <span className="font-medium text-faint">None</span>;

function Stat({
  id,
  label,
  data,
  tone = '',
  children,
}: {
  id: MetricId;
  label?: string;
  data: ReportData;
  tone?: string;
  /** The figure; null reads None. */
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
      </span>
    </div>
  );
}

function Side({
  name,
  side,
  data,
}: {
  name: 'Wins' | 'Losses';
  side: WinLossSide;
  data: ReportData;
}): React.JSX.Element {
  const display = useDisplay();
  const { currency } = data;
  const win = name === 'Wins';
  const cash = (cents: number | null, tone = true) =>
    cents === null ? null : (
      <span className={tone ? signTone(cents) : undefined}>
        <FigureText f={display.cash(cents, true, currency)} />
      </span>
    );
  return (
    <section
      aria-label={name}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <div className="flex min-h-7 items-center gap-2.5">
        <IconTile
          icon={win ? ArrowUp : ArrowDown}
          tone={win ? 'gain' : 'loss'}
        />
        <h2 className="text-[15px] leading-snug font-semibold tracking-[-0.015em] text-text">
          {name}
        </h2>
      </div>
      <div className="mt-1">
        <Stat id="trades" data={data}>
          {side.count}
        </Stat>
        <Stat id="pnl" data={data} tone={win ? 'text-gain' : 'text-loss'}>
          <FigureText
            f={display.figure(
              display.ofTrades(side.tradeIds, side.net),
              true,
              currency,
            )}
          />
        </Stat>
        <Stat
          id={win ? 'avg-win' : 'avg-loss'}
          data={data}
          tone={win ? 'text-gain' : 'text-loss'}
        >
          {side.avgNet === null ? null : (
            <FigureText
              f={display.figure(
                display.meanOfTrades(side.tradeIds, side.avgNet),
                true,
                currency,
              )}
            />
          )}
        </Stat>
        <Stat id="avg-duration" data={data}>
          {side.avgDurationMin === null
            ? null
            : formatDuration(side.avgDurationMin * 60_000)}
        </Stat>
        <Stat id="realized-r" label="Average R" data={data}>
          {side.avgR === null
            ? null
            : formatUnitValue('r', side.avgR, { currency, signed: true })}
        </Stat>
        <Stat id="avg-size" data={data}>
          {side.avgSize === null
            ? null
            : String(Number(side.avgSize.toFixed(2)))}
        </Stat>
        <Stat id="mae" label="Average MAE" data={data}>
          {cash(side.avgMae)}
        </Stat>
        <Stat id="mfe" label="Average MFE" data={data}>
          {cash(side.avgMfe)}
        </Stat>
        <Stat id="long-share" data={data}>
          {side.longShare === null ? null : formatPct(side.longShare, 1)}
        </Stat>
      </div>
    </section>
  );
}

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const result = useMemo(
    () => winsVsLosses(data.partition.trades, data.ctx),
    [data.partition.trades, data.ctx],
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Side name="Wins" side={result.wins} data={data} />
      <Side name="Losses" side={result.losses} data={data} />
    </div>
  );
}

/**
 * Reports, Wins vs losses: the winners and the losers side by side, each with
 * its count, P&L, averages, time held, R, size, MAE and MFE and how many were
 * long. Wins and losses are `classify`'s, so they agree with every other figure;
 * breakeven trades are in neither. Render inside `<Suspense>`.
 */
export function WinsLossesView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-wins-losses">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}
