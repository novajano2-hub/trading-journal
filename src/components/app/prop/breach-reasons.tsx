'use client';

import { FieldError } from '@/components/app/settings/settings-ui';
import { BREACH_REASON_LABELS, BREACH_REASONS } from '@/domain/prop/finance';
import type { BreachReason } from '@/domain/types';

/** The ids a form can focus after a refused submit. */
export const breachReasonIds = (idp: string) => ({
  /** The first reason, for "choose why it broke". */
  first: `${idp}-reason-${BREACH_REASONS[0]}`,
  /** The words field, for 'other'. */
  words: `${idp}-words`,
});

/**
 * "Why did it break?": the fixed list of reasons with none chosen at first, and
 * for "Other" a field for the trader's own words (C33). Mark as breached and
 * the new-challenge form's Breached status both ask it.
 */
export function BreachReasons({
  idp,
  reason,
  words,
  onReason,
  onWords,
  reasonError,
  wordsError,
}: {
  /** A prefix that keeps this picker's ids apart on the page. */
  idp: string;
  reason: BreachReason | null;
  words: string;
  onReason(r: BreachReason): void;
  onWords(text: string): void;
  reasonError?: string;
  wordsError?: string;
}): React.JSX.Element {
  const ids = breachReasonIds(idp);
  return (
    <>
      <p id={`${idp}-why`} className="mt-2 mb-2 text-[13.5px] font-medium">
        Why did it break?
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${idp}-why`}
        className="flex flex-col gap-1.5"
      >
        {BREACH_REASONS.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200 has-[:checked]:border-accent/45 has-[:checked]:bg-accent-soft/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
          >
            <input
              id={`${idp}-reason-${r}`}
              type="radio"
              name={`${idp}-reason`}
              value={r}
              checked={reason === r}
              onChange={() => onReason(r)}
              {...(reasonError && {
                'aria-invalid': true as const,
                'aria-describedby': `${idp}-reason-err`,
              })}
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
      {reasonError ? (
        <FieldError id={`${idp}-reason-err`}>{reasonError}</FieldError>
      ) : null}
      {reason === 'other' ? (
        <>
          <textarea
            id={ids.words}
            rows={3}
            value={words}
            aria-label="In your own words"
            onChange={(e) => onWords(e.target.value)}
            {...(wordsError && {
              'aria-invalid': true as const,
              'aria-describedby': `${idp}-words-err`,
            })}
            className="mt-2 w-full rounded-control border border-line bg-surface-1 px-3 py-2 text-[14px] text-text focus-visible:outline-2 focus-visible:outline-accent"
          />
          {wordsError ? (
            <FieldError id={`${idp}-words-err`}>{wordsError}</FieldError>
          ) : null}
        </>
      ) : null}
    </>
  );
}
