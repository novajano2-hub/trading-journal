'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Target } from '@phosphor-icons/react/dist/ssr';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DashboardModel } from '@/data/dashboard';
import type { DayStat } from '@/domain/metrics/days';
import type {
  DailyLossProgress,
  WeeklyGoalProgress,
} from '@/domain/metrics/goals';
import type { Cents, Goals } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import { GoalsForm } from './goals-form';
import { CARD, CARD_PAD, CardHeader, HEADER_LINK, signTone } from './shared';

/** Figures never break, so a minus sign can't end up on the line before its amount. */
const FIGURE = 'whitespace-nowrap tabular-nums';

/** A figure inside a sentence, at the sentence's size. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

/** 'Thu 19 Nov' for a local trading date. */
const dayLabel = (date: string) =>
  onTradingDate(date, { weekday: 'short', day: 'numeric', month: 'short' });

/** The label line every goal opens with: the metric and its amount. */
function GoalLabel({
  id,
  amount,
  currency,
}: {
  id: 'weekly-goal' | 'daily-loss-limit';
  amount: Cents;
  currency: string;
}): React.JSX.Element {
  const display = useDisplay();
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-faint">
      {/* Goals are always net, whatever the Gross/Net switch says. */}
      <MetricTip id={id} basis="net" />
      <span className={`font-[550] text-muted ${FIGURE}`}>
        {display.figure({ money: amount }, false, currency).text}
      </span>
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
  const display = useDisplay();
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <GoalLabel
          id="weekly-goal"
          amount={weekly.target}
          currency={currency}
        />
        {weekly.reached ? (
          <Chip tone="gain" className="-my-0.5 flex-none">
            <Check size={13} weight="bold" aria-hidden="true" />
            Reached
          </Chip>
        ) : (
          <span
            className={`flex-none text-[12.5px] font-semibold text-info ${FIGURE}`}
          >
            {percentOfGoal(weekly)}% of goal
          </span>
        )}
      </div>
      <p className="mt-[3px] flex flex-wrap items-baseline gap-x-2">
        <span
          className={`text-[22px] leading-[1.25] font-semibold tracking-[-0.03em] ${FIGURE} ${signTone(weekly.net)}`}
        >
          {display.cash(weekly.net, true, currency).text}
        </span>{' '}
        <span className="text-[12.5px] text-muted">{weekLabel}</span>
      </p>
      {/* Progress toward the goal: cyan, or gain once reached. */}
      <span
        aria-hidden="true"
        className="mt-[9px] block h-1.5 overflow-hidden rounded-[3px] bg-line"
      >
        <span
          className={`block h-full rounded-[3px] ${
            weekly.reached
              ? 'bg-gain-fill'
              : 'bg-[linear-gradient(90deg,color-mix(in_oklab,var(--info-fill)_70%,white),var(--info-fill))]'
          }`}
          style={{ width: `${weekly.fraction * 100}%` }}
        />
      </span>
    </div>
  );
}

/** Days the grid draws at most: four rows of 32. Older days stay in the sentence's count. */
const GRID_DAYS = 128;

/**
 * One square per trading day, oldest first, left to right then down: kept
 * days soft green, broken days loss red. A day's date and net ride in its
 * title for a pointer; the grid's label says the totals.
 */
function DayGrid({
  days,
  limit,
  currency,
}: {
  days: readonly DayStat[];
  limit: Cents;
  currency: string;
}): React.JSX.Element | null {
  const display = useDisplay();
  if (days.length === 0) return null;
  const shown = days.slice(-GRID_DAYS);
  const broken = shown.filter((d) => d.net < -limit).length;
  const label =
    shown.length < days.length
      ? `Latest ${shown.length} of ${days.length} trading days: ${shown.length - broken} kept, ${broken} broken`
      : `${shown.length} trading ${plural(shown.length, 'day')}: ${shown.length - broken} kept, ${broken} broken`;
  return (
    <span
      role="img"
      aria-label={label}
      className="mt-[9px] grid grid-cols-[repeat(32,minmax(0,1fr))] gap-[2px]"
    >
      {shown.map((d) => {
        const kept = d.net >= -limit;
        return (
          <span
            key={d.date}
            title={`${dayLabel(d.date)}, ${display.cash(d.net, true, currency).text}${kept ? '' : ', broke the limit'}`}
            className={`aspect-square rounded-[1.5px] ${kept ? 'bg-gain-fill/35' : 'bg-loss-fill'}`}
          />
        );
      })}
    </span>
  );
}

function DailyLossRow({
  daily,
  days,
  currency,
  period,
}: {
  daily: DailyLossProgress;
  /** Every trading day in the range on net, oldest first. */
  days: readonly DayStat[];
  currency: string;
  /** The range the days come from, e.g. "all time", so it never reads as the goal week. */
  period: string;
}): React.JSX.Element {
  const display = useDisplay();
  const { keptDays: kept, tradingDays: count, brokenDays } = daily;
  const latest = brokenDays[brokenDays.length - 1];
  let sentence: React.ReactNode;
  if (count === 0) sentence = 'No trading days in this range.';
  else if (!latest) sentence = `Kept every day, ${period}.`;
  else {
    const at = (
      <>
        {dayLabel(latest.date)} at{' '}
        <span className={`${FIGURE} ${signTone(latest.net)}`}>
          {display.cash(latest.net, true, currency).text}
        </span>
      </>
    );
    // The kept count sits beside the label; the sentence names the breaks and the period.
    sentence =
      brokenDays.length === 1 ? (
        <>
          Broken once, {period}: {at}.
        </>
      ) : (
        <>
          Last broken {at}. <Num>{brokenDays.length}</Num> days broken, {period}
          .
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
        {count > 0 ? (
          <span className={`flex-none text-[12.5px] text-muted ${FIGURE}`}>
            <span className="font-semibold text-gain">Kept</span> {kept} of{' '}
            {count} {plural(count, 'day')}
          </span>
        ) : null}
      </div>
      <DayGrid days={days} limit={daily.limit} currency={currency} />
      <p className="mt-2 text-[12.5px] leading-[1.45] text-muted">{sentence}</p>
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
  days,
  set,
  currency,
  weekLabel,
  rangeLabel,
  onSave,
}: {
  goals: DashboardModel['goals'];
  /** The range's trading days on net, oldest first, for the daily loss limit's grid. */
  days: readonly DayStat[];
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
      <div className="flex flex-col">
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
        <div className="mt-4 border-t border-line pt-3">
          {goals.dailyLoss ? (
            <DailyLossRow
              daily={goals.dailyLoss}
              days={days}
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
      className={`${CARD} ${CARD_PAD} flex h-full flex-col`}
    >
      <CardHeader
        icon={Target}
        tone="info"
        headingId={headingId}
        title="Goals"
        className="mb-3"
        end={
          editing ? undefined : (
            <button
              ref={editButton}
              type="button"
              onClick={() => setEditing(true)}
              className={HEADER_LINK}
            >
              {none ? 'Set goals' : 'Edit goals'}
            </button>
          )
        }
      />
      {body}
    </section>
  );
}
