'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { parseGoalAmount } from '@/data/goals';
import type { Cents, Goals } from '@/domain/types';

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
  attempt,
  hintId,
  inputRef,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  /** Which Save this error came from: a new attempt re-adds the message so it is announced again. */
  attempt: number;
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
        className="mb-1.5 block text-[12.5px] font-medium text-muted"
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
        className="block h-[38px] w-full rounded-control border border-line-2 bg-surface-1 px-3 text-[14px] font-[550] text-text tabular-nums shadow-[var(--shadow-chip)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-glide)] outline-none placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] aria-invalid:border-muted pointer-coarse:h-11"
      />
      {/* Always present, so the polite region exists before a message lands in it. */}
      <div id={errorId} aria-live="polite">
        {error ? (
          // An input problem, not a loss: neutral, never loss red.
          <p
            key={attempt}
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
    </div>
  );
}

/**
 * The goals as a form, in place of the Goals card's rows. Nothing is written
 * until both amounts parse. Escape cancels, as Cancel does, except while a
 * save is in flight.
 */
export function GoalsForm({
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
  const [attempt, setAttempt] = useState(0);
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
    setAttempt((n) => n + 1);
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
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        // A save in flight keeps the form, so its failure still has somewhere to show.
        if (!saving) onClose();
      }}
      className="@container flex flex-col"
    >
      <p id={hintId} className="text-[12.5px] leading-[1.45] text-faint">
        Amounts in {currency}, net of fees. Leave one empty to clear it.
      </p>
      <div className="mt-3 grid gap-3 @[20rem]:grid-cols-2">
        <GoalField
          label="Weekly net goal"
          value={weekly}
          error={errors.weekly}
          attempt={attempt}
          hintId={hintId}
          inputRef={weeklyRef}
          onChange={setWeekly}
        />
        <GoalField
          label="Daily loss limit"
          value={daily}
          error={errors.daily}
          attempt={attempt}
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
          disabled={saving}
          onClick={onClose}
          className="pointer-coarse:h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
