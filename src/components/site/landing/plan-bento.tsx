import type { ReactNode } from 'react';
import { RuleList } from '@/components/product/rule-list';
import { Chip } from '@/components/ui/chip';
import { formatMoney, formatPct } from '@/lib/format';
import type { SampleView } from '@/lib/landing/sample-view';
import { dayLabel, setupName } from '@/lib/landing/sample-labels';
import { shortTime } from '@/lib/time-format';
import { SectionHeading } from './section-heading';
import { TickIn } from './tick-in';

/** The trade whose rule checks the first cell shows: it moved its stop. */
const RULES_SERIAL = 6;
/** The two trades the review note covers. */
const NOTE_SERIALS = [6, 7];

const CELL = 'rounded-card border p-7';
const INNER = 'mt-[22px] rounded-control border border-line bg-surface-1 px-4';
const STAT = 'flex items-baseline justify-between gap-4 py-3 text-sm';

function CellHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-[44ch] text-[14.5px] leading-[1.55] text-muted">
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
  const mistakes = noted
    .flatMap((t) => t.tagIds)
    .flatMap(
      (id) =>
        view.tags.find((x) => x.id === id && x.category === 'mistake') ?? [],
    );

  return (
    <section
      aria-labelledby="plan-title"
      className="mx-auto max-w-[1280px] px-5 pb-28 sm:px-10"
    >
      <SectionHeading id="plan-title" title="Hold yourself to your own plan." />
      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        <div
          data-testid="bento-cell"
          className={`${CELL} border-transparent bg-accent-soft lg:col-span-7`}
        >
          <CellHead title="Rules, graded on every trade">
            Write a strategy once. Each trade is checked against it, and the
            misses add up where you can see them.
          </CellHead>
          <div className="mt-[22px]">
            <TickIn>
              <RuleList
                rules={rules}
                label={`Rules for trade ${ruled.serial}`}
              />
            </TickIn>
          </div>
        </div>

        <div
          data-testid="bento-cell"
          className={`${CELL} border-line bg-surface-1 lg:col-span-5`}
        >
          <div className="flex items-start justify-between gap-4">
            <CellHead title="Prop rules after every trade">
              Static, end-of-day or trailing drawdown, daily loss and
              consistency, as your firm wrote them.
            </CellHead>
            <span className="shrink-0 pt-1.5 text-xs text-faint">
              Sample data
            </span>
          </div>
          <dl className={`${INNER} divide-y divide-line`}>
            <div className={STAT}>
              <dt className="text-muted">Profit target</dt>
              <dd className="font-mono font-medium">
                {formatPct(profit.progress)} of {formatMoney(profit.target)}
              </dd>
            </div>
            <div className={STAT}>
              <dt className="text-muted">Trailing drawdown</dt>
              <dd
                className={`font-mono font-medium ${drawdown.state === 'clear' ? 'text-gain' : 'text-loss'}`}
              >
                {formatMoney(drawdown.remaining)} left
              </dd>
            </div>
            {consistency && consistency.bestDayShare !== null ? (
              <div className={STAT}>
                <dt className="text-muted">Best day share</dt>
                <dd className="flex items-center gap-2">
                  <b className="font-mono font-medium">
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
          className={`${CELL} grid items-center gap-8 border-transparent bg-sunken lg:col-span-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10`}
        >
          <CellHead title="A notebook beside the trades">
            Plan before the open, review after the close. Each entry links to
            the trades it covers.
          </CellHead>
          <div className="rounded-control border border-line bg-surface-1 p-4">
            <p className="font-mono text-xs text-faint">
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
                  <Chip mono>
                    {t.instrument.symbol} {clock(t.openedAt)}
                  </Chip>
                </li>
              ))}
              {mistakes.slice(0, 1).map((m) => (
                <li key={m.id}>
                  <Chip tone="loss">{m.name}</Chip>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
