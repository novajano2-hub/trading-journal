'use client';

import Link from 'next/link';
import { useId, useMemo, useState, type RefObject } from 'react';
import { FieldError, focusField } from '@/components/app/settings/settings-ui';
import { INPUT, LABEL } from '@/components/app/import/styles';
import { SelectField } from '@/components/app/import/select-field';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { useChallenges, useLogPayout, usePrefs } from '@/data/query/hooks';
import { NotFoundError, PayoutRefusedError } from '@/data/repository';
import { canLogPayout, parseAmount } from '@/domain/prop/transactions';
import { localDate } from '@/domain/time';
import type { Challenge } from '@/domain/types';
import { symbolOf } from '@/lib/display';

const NO_REF: RefObject<HTMLElement | null> = { current: null };
const ACCOUNTS_HREF = '/app/prop-firms/accounts';

/** What a refused or failed write says, in plain words. */
function failureText(e: unknown): string {
  if (e instanceof PayoutRefusedError)
    return e.reason === 'breached'
      ? "That challenge has breached, so a payout can't be logged on it."
      : "That challenge isn't in its funded phase, so a payout can't be logged on it.";
  if (e instanceof NotFoundError) return "That challenge isn't here any more.";
  return "Couldn't save that. Try again.";
}

/**
 * Log a payout (C29, comp 07): the funded account, the amount and the date
 * received. It writes a payout transaction linked to the challenge, so it
 * counts in total earned at once; it writes no withdrawal. Only funded
 * challenges that have not breached are listed, the repository's own rule;
 * with none, the dialog says so and links to Accounts. The amount is in the
 * base currency, like every prop figure (C72).
 */
export function LogPayout({
  origin = NO_REF,
  returnFocus = NO_REF,
  onClose,
}: {
  /** What the dialog grows from, and where focus goes back to; neither is needed. */
  origin?: RefObject<HTMLElement | null>;
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
}): React.JSX.Element | null {
  const challenges = useChallenges();
  const prefs = usePrefs();
  const failed = challenges.error ?? prefs.error;
  if (failed)
    return (
      <PayoutDialog origin={origin} returnFocus={returnFocus} onClose={onClose}>
        <p role="alert" className="mt-2 text-[13.5px] text-loss">
          Couldn&apos;t load your challenges. Close this and try again.
        </p>
      </PayoutDialog>
    );
  if (!challenges.data || !prefs.data) return null;
  return (
    <PayoutForm
      challenges={challenges.data}
      today={localDate(new Date().toISOString(), prefs.data.timeZone)}
      currency={prefs.data.baseCurrency}
      origin={origin}
      returnFocus={returnFocus}
      onClose={onClose}
    />
  );
}

function PayoutDialog({
  origin,
  returnFocus,
  onClose,
  description,
  footer,
  children,
}: {
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
  /** The line under the title; the states with nothing to add have none. */
  description?: string;
  /** Pinned under the body; the states with nothing to add have none, and the close button leaves. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <MorphDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      origin={origin}
      returnFocus={returnFocus}
      title="Log a payout"
      {...(description && { description })}
      size="form"
      footer={footer}
    >
      {children}
    </MorphDialog>
  );
}

function PayoutForm({
  challenges,
  today,
  currency,
  origin,
  returnFocus,
  onClose,
}: {
  challenges: readonly Challenge[];
  today: string;
  currency: string;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
}): React.JSX.Element {
  const ids = useId();
  const logPayout = useLogPayout();
  const payable = useMemo(
    () =>
      challenges
        .filter(canLogPayout)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [challenges],
  );
  const [challengeId, setChallengeId] = useState(payable[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const symbol = symbolOf(currency);

  async function save() {
    const cents = parseAmount(amount);
    const next: typeof errors = {};
    if (cents === null || cents <= 0)
      next.amount = 'Enter an amount above zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      next.date = 'Pick the date it was received.';
    setErrors(next);
    setFailure(null);
    if (cents === null || cents <= 0 || next.date) {
      focusField(next.amount ? `${ids}-amount` : `${ids}-date`);
      return;
    }
    setBusy(true);
    try {
      await logPayout.mutateAsync({
        challengeId,
        amount: cents,
        date,
        description: 'Payout',
      });
      onClose();
    } catch (e) {
      setFailure(failureText(e));
      setBusy(false);
    }
  }

  if (payable.length === 0)
    return (
      <PayoutDialog origin={origin} returnFocus={returnFocus} onClose={onClose}>
        <p className="mt-2 text-[14px] font-medium">
          No challenge is funded yet.
        </p>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-muted">
          A payout is logged on a challenge in its funded phase. Move one to
          funded on the Accounts tab, then log it here.
        </p>
        <Link
          href={ACCOUNTS_HREF}
          onClick={onClose}
          className="mt-3 inline-flex min-h-8 items-center rounded-chip text-[13.5px] font-semibold text-accent-ink underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Go to Accounts
        </Link>
      </PayoutDialog>
    );

  return (
    <PayoutDialog
      origin={origin}
      returnFocus={returnFocus}
      onClose={onClose}
      description="It counts in total earned at once."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Add payout
          </Button>
        </div>
      }
    >
      <form
        noValidate
        aria-label="Log a payout"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void save();
        }}
        className="mt-3 flex flex-col gap-3.5"
      >
        <div>
          <label htmlFor={`${ids}-challenge`} className={LABEL}>
            Funded account
          </label>
          <SelectField
            id={`${ids}-challenge`}
            value={challengeId}
            onChange={(e) => setChallengeId(e.target.value)}
          >
            {payable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.firm}
              </option>
            ))}
          </SelectField>
        </div>
        <div>
          <label htmlFor={`${ids}-amount`} className={LABEL}>
            Amount
          </label>
          <div className="relative">
            <span
              data-currency=""
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13.5px] text-faint"
            >
              {symbol}
            </span>
            <input
              id={`${ids}-amount`}
              // The amount is what is asked for first. The dialog's own focus
              // scope leaves a focused field alone, else it takes the close button.
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? `${ids}-amount-err` : undefined}
              className={`${INPUT} ${symbol.length > 1 ? 'pl-11' : 'pl-7'}`}
            />
          </div>
          {errors.amount ? (
            <FieldError id={`${ids}-amount-err`}>{errors.amount}</FieldError>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-date`} className={LABEL}>
            Date received
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${ids}-date-err` : undefined}
            className={INPUT}
          />
          {errors.date ? (
            <FieldError id={`${ids}-date-err`}>{errors.date}</FieldError>
          ) : null}
        </div>
        {failure ? (
          <p role="alert" className="text-[13px] font-medium text-loss">
            {failure}
          </p>
        ) : null}
        {/* Enter in a field adds the payout; the footer button is outside the form. */}
        <button type="submit" hidden />
      </form>
    </PayoutDialog>
  );
}
