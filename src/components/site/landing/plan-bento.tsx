import type { ReactNode } from 'react';
import { CostBand, PLAN_SURFACE } from '@/components/product/plan-surface';
import { TickRuleList } from '@/components/site/landing/tick-rule-list';
import { Pill } from '@/components/site/pill';
import { Chip } from '@/components/ui/chip';
import { mistakeTags } from '@/domain/metrics/mistakes';
import { formatMoney, formatPct, formatPnl } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';
import { dayLabel, setupName } from '@/lib/landing/sample-labels';
import { shortTime } from '@/lib/time-format';
import { SectionHeading } from './section-heading';
import { TickIn } from './tick-in';

/** The trade whose rule checks the first cell shows: it moved its stop. */
const RULES_SERIAL = 6;
/** The two trades the review note covers. */
const NOTE_SERIALS = [6, 7];

/** Cells pad 20px on phones, 28px from `sm`; the plan's cost band bleeds through it. */
const PAD = 'p-5 sm:p-7';
const BLEED = '-mx-5 px-5 sm:-mx-7 sm:px-7';
/** A white cell: the app's card. */
const CARD_CELL = `${PAD} rounded-card border border-line bg-surface-1 shadow-[var(--shadow-card)]`;
/** The lead cell is the app's "Your plan" card; its cost band is its foot. */
const PLAN_CELL = `${PLAN_SURFACE} ${PAD} pb-0 sm:pb-0`;
const INNER = 'mt-[22px] border-t border-line';
const STAT = 'flex items-baseline justify-between gap-4 py-3 text-sm';

function CellHead({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        {meta ? (
          <span className="ml-auto shrink-0 pl-2 text-xs text-faint">
            {meta}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 max-w-[44ch] text-[14.5px] leading-[1.55] text-muted">
        {children}
      </p>
    </div>
  );
}

const clock = (iso: string) => shortTime(iso).split(' ').pop();

/** "Hold yourself to your own plan.": rules, prop limits and the notebook, three cells. */
export function PlanBento({ view }: { view: SampleView }) {
  const bySerial = new Map(view.trades.map((t) => [t.serial, t]));
  const ruled = bySerial.get(RULES_SERIAL);
  if (!ruled) throw new Error(`Sample trade ${RULES_SERIAL} is missing`);
  const rules = view
    .checksFor(ruled)
    .map((c) => ({ ...c, who: setupName(view, ruled) }));
  const { profit, drawdown, consistency } = view.prop;

  const noted = NOTE_SERIALS.flatMap((n) => bySerial.get(n) ?? []);
  const mistakeTagsById = new Map(
    mistakeTags(view.tags, view.tagCategories).map((t) => [t.id, t]),
  );
  const mistakes = noted
    .flatMap((t) => t.tagIds)
    .flatMap((id) => mistakeTagsById.get(id) ?? []);

  return (
    <section
      aria-labelledby="plan-title"
      className="mx-auto max-w-[1280px] px-5 pb-28 sm:px-10"
    >
      <SectionHeading id="plan-title" title="Hold yourself to your own plan." />
      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        <div data-testid="bento-cell" className={`${PLAN_CELL} lg:col-span-7`}>
          <CellHead title="Rules, graded on every trade" meta="Sample data">
            Write a strategy once. Each trade is checked against it, and the
            misses add up where you can see them.
          </CellHead>
          <div className="mt-[18px]">
            <TickIn>
              <TickRuleList
                rules={rules}
                label={`Rules for trade ${ruled.serial}`}
                bare
              />
            </TickIn>
          </div>
          {/* What the broken rule cost on this trade, as the app adds it up. */}
          <CostBand label="Broken rules cost" bleed={BLEED}>
            {formatPnl(ruled.net, ruled.pnlCurrency)}
          </CostBand>
        </div>

        <div data-testid="bento-cell" className={`${CARD_CELL} lg:col-span-5`}>
          <CellHead title="Prop rules after every trade" meta="Sample data">
            Static, end-of-day or trailing drawdown, daily loss and consistency,
            as your firm wrote them.
          </CellHead>
          <dl className={`${INNER} divide-y divide-line`}>
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
        </div>

        <div
          data-testid="bento-cell"
          className={`${CARD_CELL} grid items-center gap-8 lg:col-span-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10`}
        >
          <CellHead title="A notebook beside the trades">
            Plan before the open, review after the close. Each entry links to
            the trades it covers.
          </CellHead>
          <div className="rounded-control bg-sunken p-4 sm:p-5">
            <p className="text-xs text-faint tnum">
              Daily review, {dayLabel(ruled)}
            </p>
            <p className="mt-2 text-[15px] leading-[1.65]">
              Took the NQ breakout early and moved the stop when it came back.
              Second trade went nowhere. Tomorrow: the stop stays put, and I
              size down after a loss.
            </p>
            <ul
              aria-label="Linked trades"
              className="mt-3.5 flex flex-wrap gap-1.5"
            >
              {noted.map((t) => (
                <li key={t.serial}>
                  <Pill>
                    {t.instrument.symbol} {clock(t.openedAt)}
                  </Pill>
                </li>
              ))}
              {mistakes.slice(0, 1).map((m) => (
                <li key={m.id}>
                  <Chip tone="warn" className="font-medium">
                    {m.name}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
