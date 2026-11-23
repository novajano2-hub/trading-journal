'use client';

import { ChartLineDown, Target } from '@phosphor-icons/react/dist/ssr';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import { drawdownSeries } from '@/domain/metrics/equity';
import { rDistribution } from '@/domain/metrics/breakdowns';
import { isClosed } from '@/domain/trade-status';
import { useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import { BreakdownCards } from './breakdown-report';
import { ReportChart } from './report-chart';
import { ReportScope } from './report-scope';
import { SubTabs } from './sub-tabs';
import type { ReportData } from './use-report-data';

type Tab = 'r' | 'size' | 'dist';
const TABS: { value: Tab; label: string }[] = [
  { value: 'r', label: 'R-multiple' },
  { value: 'size', label: 'Position size' },
  { value: 'dist', label: 'R distribution' },
];

/** The axis label of a bin: where it starts, or the tail's own words. */
function binAxis(label: string): string {
  const to = label.indexOf(' to ');
  if (to !== -1) return label.slice(0, to);
  return label.startsWith('+') ? '\u2265+5R' : '\u2264\u22125R';
}

function Distribution({ data }: { data: ReportData }): React.JSX.Element {
  const id = useId();
  const { partition: p, basis } = data;
  const bins = useMemo(
    () => rDistribution(p.trades, 0.5, basis),
    [p.trades, basis],
  );
  const noStop = p.summary.noRiskCount;
  const labels = new Map(bins.map((b) => [b.label, b.label]));
  const withStop = bins.reduce((n, b) => n + b.count, 0);
  return (
    <section aria-labelledby={id} className={`${CARD} ${CARD_PAD}`}>
      <CardHeader
        icon={Target}
        tone="accent"
        headingId={id}
        title="R distribution"
        after={
          <span className="text-[12.5px] text-faint">
            Trades per half R, clamped at five R either way
          </span>
        }
      />
      <div className="mt-3">
        <ReportChart
          label={`R multiples, trades per half R, ${data.caption}. ${withStop} ${plural(withStop, 'trade')} with a stop, ${noStop} without.`}
          series={[
            {
              label: 'Trades',
              kind: 'bar',
              unit: 'count',
              points: bins.map((b) => ({ key: b.label, value: b.count })),
            },
          ]}
          height={240}
          xLabel={(key) => binAxis(labels.get(key) ?? key)}
          periodLabel={(key) => key}
        />
      </div>
      {noStop > 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          {noStop} {plural(noStop, 'trade')} {noStop === 1 ? 'has' : 'have'} no
          stop and {noStop === 1 ? 'is' : 'are'} left out of every R figure.
        </p>
      ) : null}
    </section>
  );
}

function DrawdownCard({ data }: { data: ReportData }): React.JSX.Element {
  const id = useId();
  const display = useDisplay();
  const { partition: p, ctx, currency } = data;
  const points = useMemo(
    () => drawdownSeries(p.equity, p.startingBalance, ctx.timeZone),
    [p.equity, p.startingBalance, ctx.timeZone],
  );
  const dd = p.drawdown;
  const name = `Drawdown from the equity peak, by day, ${data.caption}. Max drawdown ${display.cash(-dd.amount, true, currency).label}.`;
  return (
    <section aria-labelledby={id} className={`${CARD} ${CARD_PAD}`}>
      <CardHeader
        icon={ChartLineDown}
        tone="loss"
        headingId={id}
        title="Drawdown"
        after={
          <span className="text-[12.5px] text-faint">
            How far under its peak the equity line sat, deepest each day
          </span>
        }
        end={
          <span className="text-[12.5px] text-faint">
            <MetricTip id="max-drawdown" basis={data.basis}>
              Max drawdown
            </MetricTip>{' '}
            <b className="font-semibold text-loss">
              <FigureText f={display.cash(-dd.amount, true, currency)} />
            </b>
            {dd.pct !== null && dd.amount > 0
              ? `, ${formatPct(dd.pct, 1)} of peak`
              : ''}
          </span>
        }
      />
      <div className="mt-3">
        <ReportChart
          label={name}
          currency={currency}
          height={200}
          series={[
            {
              label: 'Drawdown',
              kind: 'line',
              unit: 'money',
              points,
            },
          ]}
        />
      </div>
    </section>
  );
}

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const params = useSearchParams();
  const tab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'r';
  const closed = useMemo(
    () => data.partition.trades.filter(isClosed).length,
    [data.partition.trades],
  );
  return (
    <>
      <SubTabs label="Risk view" param="tab" options={TABS} value={tab}>
        {tab === 'r' ? (
          <BreakdownCards
            key="r"
            data={data}
            by="r"
            chartLabel="Net P&L by R multiple"
            tableName="R multiple summary"
            rowTitle="R multiple"
            plural="R multiples"
            title="By R multiple"
            caption={`One R each, from \u22125R to +5R, over ${closed} closed ${plural(closed, 'trade')}`}
            visible="ends"
            chartVisible="ends"
          />
        ) : tab === 'size' ? (
          <BreakdownCards
            key="size"
            data={data}
            by="size"
            chartLabel="Net P&L by position size"
            tableName="Position size summary"
            rowTitle="Position size"
            plural="Position sizes"
            title="By position size"
            caption="The largest position each trade held"
            visible="ends"
            chartVisible="ends"
          />
        ) : (
          <Distribution data={data} />
        )}
      </SubTabs>
      <DrawdownCard data={data} />
    </>
  );
}

/**
 * Reports, Risk: net and win rate by R multiple (one R a bucket), by the
 * largest position held, or the distribution of R multiples, with the drawdown
 * curve beneath every one. R is the P&L over the risk at the planned stop, so
 * trades without a stop are apart. Render inside `<Suspense>`.
 */
export function RiskView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-risk">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}
