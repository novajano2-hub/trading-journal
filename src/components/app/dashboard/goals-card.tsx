'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react/dist/ssr';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DashboardModel } from '@/data/dashboard';
import type {
  DailyLossProgress,
  WeeklyGoalProgress,
} from '@/domain/metrics/goals';
import type { Cents, Goals } from '@/domain/types';
import { formatMoney, formatPnl, plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import { GoalsForm } from './goals-form';
import { signTone } from './shared';

/** Figures never break, so a minus sign can't end up on the line before its amount. */
const MONO = 'font-mono text-[12.5px] whitespace-nowrap tabular-nums';

/** A figure inside a sentence: mono, at the sentence's size. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

/** 'Thu 19 Nov' for a local trading date. */
const dayLabel = (date: string) =>
  onTradingDate(date, { weekday: 'short', day: 'numeric', month: 'short' });

/** A goal's 6px track; `line` rail as on the rule tracks. */
function GoalTrack({
  value,
  tone,
}: {
  value: number;
  tone: 'accent' | 'gain';
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="mt-2.5 mb-1.5 block h-1.5 overflow-hidden rounded-full bg-line"
    >
      <span
        className={`block h-full rounded-full ${tone === 'gain' ? 'bg-gain' : 'bg-accent'}`}
        style={{ width: `${value * 100}%` }}
      />
    </span>
  );
}

/** The label line every goal row opens with: the metric and its amount. */
function GoalLabel({
  id,
  amount,
  currency,
}: {
  id: 'weekly-goal' | 'daily-loss-limit';
  amount: Cents;
  currency: string;
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-text">
      {/* Goals are always net, whatever the Gross/Net switch says. */}
      <MetricTip id={id} basis="net" />
      <span className={MONO}>{formatMoney(amount, currency)}</span>
    </span>
  );
}

/** The whole percent reached, rounded down in integer cents (0.29 * 100 is 28.999… in floats), so a week short of its goal never reads 100%. */
function percentOfGoal(w: WeeklyGoalProgress): number {
  return Math.min(100, Math.max(0, Math.floor((w.net * 100) / w.target)));
}

function WeeklyRow({
  weekly,
  currency,
  weekLabel,
}: {
  weekly: WeeklyGoalProgress;
  currency: string;
  weekLabel: string;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <GoalLabel
          id="weekly-goal"
          amount={weekly.target}
          currency={currency}
        />
        {weekly.reached ? (
          <Chip tone="gain" className="flex-none">
            <Check size={13} aria-hidden="true" />
            Reached
          </Chip>
        ) : (
          <span className={`flex-none text-faint ${MONO}`}>
            {percentOfGoal(weekly)}% of goal
          </span>
        )}
      </div>
      <GoalTrack
        value={weekly.fraction}
        tone={weekly.reached ? 'gain' : 'accent'}
      />
      <p className="text-[13px] text-faint">
        <span className={`${MONO} ${signTone(weekly.net)}`}>
          {formatPnl(weekly.net, currency)}
        </span>{' '}
        {weekLabel}
      </p>
    </div>
  );
}

function DailyLossRow({
  daily,
  currency,
  period,
}: {
  daily: DailyLossProgress;
  currency: string;
  /** The range the days come from, e.g. "all time", so it never reads as the goal week. */
  period: string;
}): React.JSX.Element {
  const { keptDays: kept, tradingDays: days, brokenDays } = daily;
  const latest = brokenDays[brokenDays.length - 1];
  let sentence: React.ReactNode;
  if (days === 0) sentence = 'No trading days in this range.';
  else if (!latest) sentence = `Kept every day, ${period}.`;
  else {
    const at = (
      <>
        {dayLabel(latest.date)} at{' '}
        <span className={`${MONO} ${signTone(latest.net)}`}>
          {formatPnl(latest.net, currency)}
        </span>
      </>
    );
    sentence = (
      <>
        Kept <Num>{kept}</Num> of <Num>{days}</Num> {plural(days, 'day')},{' '}
        {period}.{' '}
        {brokenDays.length === 1 ? (
          <>Broken {at}.</>
        ) : (
          <>
            Broken, latest {at}, <Num>{brokenDays.length}</Num> days in all.
          </>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <GoalLabel
          id="daily-loss-limit"
          amount={daily.limit}
          currency={currency}
        />
        <span className={`flex-none text-faint ${MONO}`}>
          {kept} of {days} {plural(days, 'day')}
        </span>
      </div>
      <GoalTrack value={days > 0 ? kept / days : 0} tone="accent" />
      <p className="text-[13px] text-faint">{sentence}</p>
    </div>
  );
}

/**
 * Row 2's Goals card: this week's net against the weekly goal and the days
 * that kept the daily loss limit, both always on net P&L and only in the
 * base currency. "Edit goals" turns the card into a form in place.
 */
export function GoalsCard({
  goals,
  set,
  currency,
  weekLabel,
  rangeLabel,
  onSave,
}: {
  goals: DashboardModel['goals'];
  /** The goals as stored (or the sample's defaults), which the form starts from. */
  set: Goals;
  /** The base currency, which goals are kept in. */
  currency: string;
  /** Where the weekly net sits, e.g. "this week, 16-20 Nov". */
  weekLabel: string;
  /** The dashboard's range, e.g. "all time": the daily loss limit's period. */
  rangeLabel: string;
  onSave(next: Goals): Promise<void>;
}): React.JSX.Element {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // The form's buttons are gone once it closes: focus goes back to the one that opened it.
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const none = set.weeklyNet === undefined && set.dailyLossLimit === undefined;
  const close = () => {
    refocus.current = true;
    setEditing(false);
  };

  let body: React.ReactNode;
  if (editing)
    body = (
      <GoalsForm
        set={set}
        currency={currency}
        onSave={onSave}
        onClose={close}
      />
    );
  else if (goals.unavailable !== null)
    body = <p className="text-[13px] text-muted">{goals.unavailable}</p>;
  else
    body = (
      <div className="flex flex-col gap-3">
        {goals.weekly ? (
          <WeeklyRow
            weekly={goals.weekly}
            currency={currency}
            weekLabel={weekLabel}
          />
        ) : (
          <p className="text-[13px] text-muted">
            {set.weeklyNet === undefined
              ? 'No weekly net goal set.'
              : 'Your range starts after today.'}
          </p>
        )}
        <div className="border-t border-line pt-3">
          {goals.dailyLoss ? (
            <DailyLossRow
              daily={goals.dailyLoss}
              currency={currency}
              period={rangeLabel}
            />
          ) : (
            <p className="text-[13px] text-muted">No daily loss limit set.</p>
          )}
        </div>
      </div>
    );

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col rounded-card border border-line bg-surface-1 px-5 py-4"
    >
      <div className="mb-2.5 flex items-center gap-3">
        <h2
          id={headingId}
          className="text-[14px] leading-snug font-semibold text-text"
        >
          Goals
        </h2>
        {editing ? null : (
          <button
            ref={editButton}
            type="button"
            onClick={() => setEditing(true)}
            // Negative margins keep the header the height of its title, as in the other cards.
            className="-my-1.5 -mr-2 ml-auto h-8 rounded-chip px-2 text-[13px] font-medium text-muted transition-colors duration-120 hover:bg-sunken hover:text-text pointer-coarse:-my-3 pointer-coarse:h-11"
          >
            {none ? 'Set goals' : 'Edit goals'}
          </button>
        )}
      </div>
      {body}
    </section>
  );
}
