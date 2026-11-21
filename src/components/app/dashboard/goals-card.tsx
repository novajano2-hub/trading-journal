'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DashboardModel } from '@/data/dashboard';
import { parseGoalAmount } from '@/data/goals';
import type {
  DailyLossProgress,
  WeeklyGoalProgress,
} from '@/domain/metrics/goals';
import type { Cents, Goals } from '@/domain/types';
import { formatMoney, formatPnl } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import { signTone } from './plan-card';

/** Figures never break, so a minus sign can't end up on the line before its amount. */
const MONO = 'font-mono text-[12.5px] whitespace-nowrap tabular-nums';

/** A figure inside a sentence: mono, at the sentence's size. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

/** "day" for one, "days" otherwise. */
const dayNoun = (n: number) => (n === 1 ? 'day' : 'days');

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
}: {
  daily: DailyLossProgress;
  currency: string;
}): React.JSX.Element {
  const { keptDays: kept, tradingDays: days, brokenDays } = daily;
  const latest = brokenDays[brokenDays.length - 1];
  let sentence: React.ReactNode;
  if (days === 0) sentence = 'No trading days in this range.';
  else if (!latest) sentence = 'Kept every day.';
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
        Kept <Num>{kept}</Num> of <Num>{days}</Num> {dayNoun(days)}.{' '}
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
          {kept} of {days} {dayNoun(days)}
        </span>
      </div>
      <GoalTrack value={days > 0 ? kept / days : 0} tone="accent" />
      <p className="text-[13px] text-faint">{sentence}</p>
    </div>
  );
}

/** A stored amount as the field shows it: '1,500', or '1,500.50' with cents. */
function amountText(cents: Cents | undefined): string {
  if (cents === undefined) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function GoalField({
  label,
  value,
  error,
  hintId,
  inputRef,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  hintId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
}): React.JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-text"
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className="block h-[38px] w-full rounded-control border border-line-2 bg-surface-1 px-3 font-mono text-[13px] text-text tabular-nums placeholder:text-faint aria-invalid:border-muted pointer-coarse:h-11"
      />
      {error ? (
        // An input problem, not a loss: neutral, never loss red.
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-text"
        >
          <Warning
            size={14}
            aria-hidden="true"
            className="mt-px flex-none text-muted"
          />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The goals as a form, in place of the rows. Nothing is written until both amounts parse. */
function GoalsForm({
  set,
  currency,
  onSave,
  onClose,
}: {
  set: Goals;
  currency: string;
  onSave(next: Goals): Promise<void>;
  onClose(): void;
}): React.JSX.Element {
  const hintId = useId();
  const [weekly, setWeekly] = useState(() => amountText(set.weeklyNet));
  const [daily, setDaily] = useState(() => amountText(set.dailyLossLimit));
  const [errors, setErrors] = useState<{ weekly?: string; daily?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const weeklyRef = useRef<HTMLInputElement>(null);
  const dailyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    weeklyRef.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const w = parseGoalAmount(weekly);
    const d = parseGoalAmount(daily);
    setErrors({
      weekly: w.ok ? undefined : w.message,
      daily: d.ok ? undefined : d.message,
    });
    if (!w.ok || !d.ok) {
      (w.ok ? dailyRef : weeklyRef).current?.focus();
      return;
    }
    setSaving(true);
    setFailed(false);
    onSave({ weeklyNet: w.cents, dailyLossLimit: d.cents }).then(
      onClose,
      () => {
        setSaving(false);
        setFailed(true);
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="@container flex flex-col">
      <p id={hintId} className="text-xs leading-4 text-faint">
        Amounts in {currency}, net of fees. Leave one empty to clear it.
      </p>
      <div className="mt-3 grid gap-3 @[20rem]:grid-cols-2">
        <GoalField
          label="Weekly net goal"
          value={weekly}
          error={errors.weekly}
          hintId={hintId}
          inputRef={weeklyRef}
          onChange={setWeekly}
        />
        <GoalField
          label="Daily loss limit"
          value={daily}
          error={errors.daily}
          hintId={hintId}
          inputRef={dailyRef}
          onChange={setDaily}
        />
      </div>
      {failed ? (
        <p
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-[13px] text-text"
        >
          <Warning
            size={16}
            aria-hidden="true"
            className="flex-none text-muted"
          />
          Couldn&apos;t save your goals. Try again.
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={saving}
          className="pointer-coarse:h-11"
        >
          Save
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="pointer-coarse:h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
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
  onSave,
}: {
  goals: DashboardModel['goals'];
  /** The goals as stored (or the sample's defaults), which the form starts from. */
  set: Goals;
  /** The base currency, which goals are kept in. */
  currency: string;
  /** Where the weekly net sits, e.g. "this week, 16-20 Nov". */
  weekLabel: string;
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
            <DailyLossRow daily={goals.dailyLoss} currency={currency} />
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
