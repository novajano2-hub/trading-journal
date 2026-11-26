'use client';

import { Info } from '@phosphor-icons/react/dist/ssr';
import { useId, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { useMarkBreached } from '@/data/query/hooks';
import { ChallengeBreachedError } from '@/data/repository';
import type { ChallengeCheck } from '@/domain/prop/challenge';
import type { BreachReason, Challenge } from '@/domain/types';
import { BreachReasons } from './breach-reasons';
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
      <BreachReasons
        idp={ids}
        reason={reason}
        words={words}
        onReason={setReason}
        onWords={setWords}
      />
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
