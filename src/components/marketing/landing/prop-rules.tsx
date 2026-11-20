import type { ReactNode } from 'react';
import type { DayStat } from '@/domain/metrics/days';
import type { PropStatus, RuleState } from '@/domain/prop/evaluate';
import { formatMoney, formatPct, formatPnl } from '@/lib/format';
import { SAMPLE_PROP_RULES, SAMPLE_START } from '@/lib/landing/sample-view';
import { RubberStamp } from '../rubber-stamp';
import { AFTER_HEAD, SECTION, SectionHead } from './section-head';

const STATE: Record<RuleState, string> = {
  clear: 'Clear',
  near: 'Near',
  breached: 'Breached',
};

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });

function Rule({
  name,
  status,
  children,
}: {
  name: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-b border-rule py-5 last:border-b-0 md:grid-cols-[170px_minmax(0,1fr)_auto] md:gap-x-6">
      <dt className="font-display text-[24px] leading-none font-black uppercase md:pt-0.5">
        {name}
      </dt>
      <dd className="col-span-2 row-start-2 min-w-0 text-[17px] leading-snug font-medium md:col-span-1 md:col-start-2 md:row-start-1">
        {children}
      </dd>
      <dd className="col-start-2 row-start-1 self-start text-right font-display text-[22px] leading-none font-black uppercase md:col-start-3">
        {status}
      </dd>
    </div>
  );
}

/** The sample evaluation account, identified by its trader badge, with the firm's rules checked. */
export function PropRulesSection({
  prop,
  days,
}: {
  prop: PropStatus;
  days: readonly DayStat[];
}) {
  const rules = SAMPLE_PROP_RULES;
  const consistency = prop.consistency;
  const best = days.reduce<DayStat | null>(
    (b, d) => (b === null || d.net > b.net ? d : b),
    null,
  );
  const progress = Math.min(prop.profit.progress, 1);
  const tradingDays = Array.from(
    { length: prop.tradingDays.min },
    (_, i) => i < prop.tradingDays.count,
  );

  return (
    <section aria-labelledby="prop-title" className={SECTION}>
      <div className="grid gap-x-16 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SectionHead
          id="prop-title"
          title="Prop rules, checked after every trade."
        >
          The same sample week, run against a sample {formatMoney(SAMPLE_START)}{' '}
          evaluation. Each rule shows how much room is left.
        </SectionHead>

        <div
          className={`relative pt-14 md:pt-16 xl:mt-2 ${AFTER_HEAD} xl:pt-16`}
        >
          <div className="trader-badge absolute top-0 left-3 z-10 flex h-[104px] w-[168px] -rotate-[4deg] flex-col items-center justify-center rounded-lg bg-stock text-ink md:left-6">
            <span
              aria-hidden="true"
              className="absolute top-2 h-[6px] w-8 rounded-[3px] bg-ink/30"
            />
            <span className="mt-2 font-display text-[52px] leading-none font-black tracking-[0.02em] uppercase">
              {rules.phase === 'evaluation' ? 'Eval' : 'Fund'}
            </span>
            <span className="text-[11px] leading-none font-bold tracking-[0.24em] uppercase">
              {rules.firm} account
            </span>
          </div>

          <dl className="ticket-stock m-0 rounded-[3px] px-4 pt-14 pb-2 text-ink md:px-8 md:pt-16">
            <Rule name="Profit target" status={formatPct(progress)}>
              <span className="block">
                {formatPnl(prop.profit.current)} of{' '}
                {formatPnl(prop.profit.target)}
              </span>
              <span
                aria-hidden="true"
                className="slot-mouth mt-3 block h-2.5 overflow-hidden rounded-[5px]"
              >
                <span
                  className="block h-full rounded-[5px] bg-gold"
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
            </Rule>

            <Rule name="Trailing floor" status={STATE[prop.drawdown.state]}>
              Floor {formatMoney(prop.drawdown.floor)}, with{' '}
              {formatMoney(prop.drawdown.remaining)} remaining above it.
            </Rule>

            <Rule
              name="Trading days"
              status={prop.tradingDays.met ? 'Met' : 'Not yet'}
            >
              <span className="block">
                {prop.tradingDays.count} of {prop.tradingDays.min}
              </span>
              <span aria-hidden="true" className="mt-2.5 flex gap-2.5">
                {tradingDays.map((punched, i) => (
                  <span
                    key={i}
                    className={`size-[18px] rounded-full ${
                      punched
                        ? 'day-punch'
                        : 'border-[1.5px] border-dashed border-ink/45'
                    }`}
                  />
                ))}
              </span>
            </Rule>

            {consistency ? (
              <Rule
                name="Consistency"
                status={
                  consistency.met ? (
                    'Met'
                  ) : (
                    <RubberStamp
                      tone="sell"
                      size="sm"
                      className="-rotate-[6deg]"
                    >
                      Not met
                    </RubberStamp>
                  )
                }
              >
                <span className="block">
                  Best day{' '}
                  {consistency.bestDayShare === null
                    ? '—'
                    : formatPct(consistency.bestDayShare)}{' '}
                  of profit, against a {formatPct(consistency.limitPct)} limit.
                </span>
                {best && !consistency.met ? (
                  <span className="mt-1.5 block text-[15px] text-ink/75">
                    {weekday(best.date)}’s {formatPnl(best.net)} is more than
                    the limit allows, so the evaluation can’t pass until other
                    days bring it back under.
                  </span>
                ) : null}
              </Rule>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}
