import {
  ArrowsLeftRight,
  ChartBar,
  Hourglass,
  ListChecks,
} from '@phosphor-icons/react/dist/ssr';
import { AppWindow } from '@/components/product/app-window';
import { BreakdownChart } from '@/components/product/breakdown-chart';
import { CostBand, PLAN_SURFACE } from '@/components/product/plan-surface';
import { CARD, ProductCard } from '@/components/product/product-card';
import { TickRuleList } from '@/components/site/landing/tick-rule-list';
import { TradeDetailCard } from '@/components/product/trade-detail-card';
import { TradeRows } from '@/components/product/trade-rows';
import { Chip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { formatMoney, formatPct, formatPnl } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';
import { dayLabel, setupName } from '@/lib/landing/sample-labels';
import { shortTime } from '@/lib/time-format';
import type { ModuleSlug } from '@/content/modules';

/** The trade the sample shows moving its stop: rows open on it, rules grade it. */
const FOCUS = 6;
const ROW_SERIALS = [8, 6, 5];

const Caption = () => (
  <p className="mt-3 text-xs text-faint">Sample data. Not a real account.</p>
);

function trade(view: SampleView, serial: number) {
  const t = view.trades.find((x) => x.serial === serial);
  if (!t) throw new Error(`Sample trade ${serial} is missing`);
  return t;
}

function Journal({ view }: { view: SampleView }) {
  const rows = ROW_SERIALS.map((n) => trade(view, n));
  const focus = trade(view, FOCUS);
  const checks = view.checksFor(focus);
  const shown = [checks.find((c) => c.ok), checks.find((c) => !c.ok)].flatMap(
    (c) => (c ? [c] : []),
  );
  return (
    <>
      <AppWindow account="Futures (live)" range={view.weekLabel} basis="Net">
        <ProductCard
          icon={ArrowsLeftRight}
          title="Recent trades"
          className="pb-1"
        >
          <div className="mt-2">
            <TradeRows
              trades={rows}
              tags={view.tags}
              categories={view.tagCategories}
              maxTags={1}
            />
          </div>
        </ProductCard>
      </AppWindow>
      <div className="relative z-10 mt-4 ml-4 max-w-[300px]">
        <TradeDetailCard trade={focus} checks={shown} />
      </div>
    </>
  );
}

function Analytics({ view }: { view: SampleView }) {
  return (
    <AppWindow account="Futures (live)" range={view.weekLabel} basis="Net">
      <ProductCard icon={ChartBar} tone="accent" title="Net P&L by hour">
        <div className="px-4 pt-5 pb-[18px] sm:px-5">
          <BreakdownChart
            rows={view.breakdowns.net.hour}
            label="Net P&L by hour, sample week"
            monoLabels
          />
        </div>
      </ProductCard>
    </AppWindow>
  );
}

/** The app's "Your plan" card: the trade's rules on ultramarine, and their cost. */
function Strategies({ view }: { view: SampleView }) {
  const graded = trade(view, FOCUS);
  const rules = view
    .checksFor(graded)
    .map((c) => ({ ...c, who: setupName(view, graded) }));
  return (
    <div className={`${PLAN_SURFACE} px-5 pt-4`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <IconTile icon={ListChecks} tone="on-accent" />
        <p className="text-[15px] font-semibold tracking-[-0.015em]">
          Your plan
        </p>
      </div>
      <TickRuleList rules={rules} label={`Rules for trade ${FOCUS}`} onAccent />
      <CostBand label="Broken rules cost" bleed="-mx-5 px-5">
        {formatPnl(graded.net, graded.pnlCurrency)}
      </CostBand>
    </div>
  );
}

const STAT = 'flex items-baseline justify-between gap-4 py-3.5 text-sm';

function PropNumbers({ view }: { view: SampleView }) {
  const { profit, drawdown, consistency } = view.prop;
  return (
    <dl className={`${CARD} divide-y divide-line px-5`}>
      <div className={STAT}>
        <dt className="text-muted">Profit target</dt>
        <dd className="font-semibold tnum">
          {formatPct(profit.progress)} of {formatMoney(profit.target)}
        </dd>
      </div>
      <div className={STAT}>
        <dt className="text-muted">Trailing drawdown</dt>
        <dd
          className={`font-semibold tnum ${drawdown.state === 'clear' ? 'text-gain' : 'text-loss'}`}
        >
          {formatMoney(drawdown.remaining)} left
        </dd>
      </div>
      {consistency && consistency.bestDayShare !== null ? (
        <div className={STAT}>
          <dt className="text-muted">Best day share</dt>
          <dd className="flex items-center gap-2">
            <b className="font-semibold tnum">
              {formatPct(consistency.bestDayShare)}
            </b>
            {!consistency.met ? (
              <Chip tone="loss" className="h-6 px-[9px] font-medium">
                Over {formatPct(consistency.limitPct)} limit
              </Chip>
            ) : null}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Notebook({ view }: { view: SampleView }) {
  const linked = [6, 7].map((n) => trade(view, n));
  return (
    <div className={`${CARD} p-5`}>
      <p className="text-xs text-faint tnum">
        Daily review, {dayLabel(linked[0]!)}
      </p>
      <p className="mt-3 text-[15px] leading-[1.65]">
        Took the NQ breakout early and moved the stop when it came back. Second
        trade went nowhere. Tomorrow: the stop stays put, and I size down after
        a loss.
      </p>
      <ul aria-label="Linked trades" className="mt-4 flex flex-wrap gap-1.5">
        {linked.map((t) => (
          <li key={t.serial}>
            <Chip mono className="font-medium">
              {t.instrument.symbol} {shortTime(t.openedAt).split(' ').pop()}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** No data for what does not exist yet: a plain outline that names the plan. */
function Planned({ name }: { name: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-start justify-center gap-3 rounded-card border border-line-2 bg-surface-1 p-8">
      <IconTile icon={Hourglass} tone="faint" />
      <p className="text-lg font-semibold tracking-[-0.02em]">
        {name} is planned.
      </p>
      <p className="max-w-[40ch] text-[15px] leading-[1.6] text-muted">
        There is nothing to show yet. This page describes the planned shape.
      </p>
    </div>
  );
}

/** The one product component beside each feature page's headline. */
export function FeatureVisual({
  slug,
  name,
  planned,
  view,
}: {
  slug: ModuleSlug;
  name: string;
  planned: boolean;
  view: SampleView;
}) {
  if (planned)
    return (
      <div data-testid="feature-visual">
        <Planned name={name} />
      </div>
    );
  const body =
    slug === 'journal' ? (
      <Journal view={view} />
    ) : slug === 'analytics' ? (
      <Analytics view={view} />
    ) : slug === 'strategies' ? (
      <Strategies view={view} />
    ) : slug === 'prop-firms' ? (
      <PropNumbers view={view} />
    ) : (
      <Notebook view={view} />
    );
  return (
    <div data-testid="feature-visual">
      {body}
      <Caption />
    </div>
  );
}
