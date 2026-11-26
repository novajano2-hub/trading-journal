'use client';

import { Info } from '@phosphor-icons/react/dist/ssr';
import { useId, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { useMarkBreached } from '@/data/query/hooks';
import { ChallengeBreachedError } from '@/data/repository';
import type { ChallengeCheck } from '@/domain/prop/challenge';
import { BREACH_REASON_LABELS, BREACH_REASONS } from '@/domain/prop/finance';
import type { BreachReason, Challenge } from '@/domain/types';
import { phaseName, shownPhase } from './challenge-card';

const NO_REF: RefObject<HTMLElement | null> = { current: null };

/**
 * Mark a challenge as breached (C33): why it broke, from a fixed list with
 * nothing chosen at first, then the confirmation. "Other" asks for the
 * trader's own words. The breach is final, and the dialog says so. It is dated
 * the day the rule check found the rule broken, else `today` (C34), so the date
 * is the rule's whenever the trader confirms.
 */
export function MarkBreached({
  challenge: c,
  check,
  today,
  origin = NO_REF,
  returnFocus = NO_REF,
  onClose,
}: {
  challenge: Challenge;
  check: ChallengeCheck;
  /** The trader's local date: the breach's date when no rule finding gives one. */
  today: string;
  /** What the dialog grows from, and where focus goes back to; neither is needed. */
  origin?: RefObject<HTMLElement | null>;
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
}): React.JSX.Element {
  const ids = useId();
  const markBreached = useMarkBreached();
  const [reason, setReason] = useState<BreachReason | null>(null);
  const [words, setWords] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phase = shownPhase(c, check);
  const ready =
    reason !== null && (reason !== 'other' || words.trim().length > 0);

  async function confirm() {
    if (reason === null || !ready) return;
    setBusy(true);
    setFailed(null);
    try {
      await markBreached.mutateAsync({
        id: c.id,
        reason,
        ...(reason === 'other' && { note: words.trim() }),
        on: check.finding?.date ?? today,
      });
      onClose();
    } catch (e) {
      setFailed(
        e instanceof ChallengeBreachedError
          ? 'This challenge is already breached.'
          : "Couldn't save that. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <MorphDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      origin={origin}
      returnFocus={returnFocus}
      title={`Mark ${c.name} as breached`}
      description={`${phase ? phaseName(c, phase.step) : 'Evaluation'}, ${c.firm}`}
      size="list"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={!ready || busy} onClick={() => void confirm()}>
            Mark as breached
          </Button>
        </div>
      }
    >
      <p id={`${ids}-why`} className="mt-2 mb-2 text-[13.5px] font-medium">
        Why did it break?
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${ids}-why`}
        className="flex flex-col gap-1.5"
      >
        {BREACH_REASONS.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
          >
            <input
              type="radio"
              name={`${ids}-reason`}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="mt-px size-[18px] flex-none rounded-full border-[1.5px] border-line-2 bg-surface-1 peer-checked:border-[5px] peer-checked:border-accent"
            />
            <span>
              {BREACH_REASON_LABELS[r]}
              {r === 'other' ? (
                <small className="mt-0.5 block text-[12.5px] font-normal text-muted">
                  In your own words.
                </small>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {reason === 'other' ? (
        <textarea
          rows={3}
          value={words}
          aria-label="In your own words"
          onChange={(e) => setWords(e.target.value)}
          className="mt-2 w-full rounded-control border border-line bg-surface-1 px-3 py-2 text-[14px] text-text focus-visible:outline-2 focus-visible:outline-accent"
        />
      ) : null}
      <p className="mt-3.5 flex items-start gap-2.5 rounded-[10px] bg-sunken px-3 py-2.5 text-[13px] leading-[1.5] text-muted">
        <Info
          size={16}
          aria-hidden="true"
          className="mt-px flex-none text-muted"
        />
        <span>
          A breach is final. The challenge moves to Breached, stays in your
          history and in the breach insights, and can&apos;t return to
          evaluation or funded.
        </span>
      </p>
      {failed ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-loss">
          {failed}
        </p>
      ) : null}
    </MorphDialog>
  );
}
