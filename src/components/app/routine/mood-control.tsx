'use client';

import { CaretDown, Smiley } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import type { DayRecord } from '@/domain/types';

type Mood = NonNullable<DayRecord['mood']>;

/** The five moods, very negative to very positive (the record's scale). */
export const MOODS: readonly { value: Mood['value']; word: string }[] = [
  { value: 1, word: 'Rough' },
  { value: 2, word: 'Low' },
  { value: 3, word: 'Steady' },
  { value: 4, word: 'Good' },
  { value: 5, word: 'Great' },
];

export const MOOD_NOTE_MAX = 280;

export const moodWord = (value: Mood['value']): string =>
  MOODS.find((m) => m.value === value)?.word ?? '';

const PANEL =
  'z-[60] w-[280px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/**
 * A day's mood: the five words and an optional note of up to 280 characters,
 * saved with Save. Read-only on a finished day (the word as text, nothing at
 * all when none was logged: Keel's call, TradeZella unknown). `compact` is the
 * phone's 44px glyph; its name carries the word.
 */
export function MoodControl({
  value,
  note,
  readOnly = false,
  compact = false,
  onChange,
}: {
  value: Mood['value'] | undefined;
  note: string | undefined;
  readOnly?: boolean;
  compact?: boolean;
  onChange(next: DayRecord['mood']): void;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Mood['value'] | undefined>(value);
  const [text, setText] = useState(note ?? '');
  const group = useId();
  const word = value === undefined ? undefined : moodWord(value);

  if (readOnly) {
    if (word === undefined) return null;
    return compact ? (
      <span
        role="img"
        aria-label={`Mood, ${word}`}
        className="inline-grid size-11 place-items-center text-muted"
      >
        <Smiley size={20} aria-hidden="true" />
      </span>
    ) : (
      <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px] text-muted">
        Mood <b className="font-semibold text-text">{word}</b>
      </span>
    );
  }

  const name = word === undefined ? 'Add mood' : `Mood, ${word}`;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Each opening starts from what is saved.
        if (next) {
          setDraft(value);
          setText(note ?? '');
        }
        setOpen(next);
      }}
    >
      {compact ? (
        <Popover.Trigger
          aria-label={name}
          className="inline-grid size-11 place-items-center rounded-control text-muted outline-offset-[-2px] hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Smiley
            size={20}
            weight={word === undefined ? 'regular' : 'fill'}
            aria-hidden="true"
          />
        </Popover.Trigger>
      ) : (
        <Popover.Trigger
          aria-label={name}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-sunken pointer-coarse:h-11"
        >
          {word === undefined ? (
            'Add mood'
          ) : (
            <span>
              Mood <b className="font-semibold text-text">{word}</b>
            </span>
          )}
          <CaretDown
            size={12}
            weight="bold"
            aria-hidden="true"
            className="text-faint"
          />
        </Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Content
          aria-label="Mood"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={PANEL}
        >
          <div
            role="radiogroup"
            aria-label="How the day felt"
            className="flex flex-col"
          >
            {MOODS.map((m) => (
              <label
                key={m.value}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-[13.5px] hover:bg-sunken has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name={group}
                  checked={draft === m.value}
                  onChange={() => setDraft(m.value)}
                  className="size-4 flex-none accent-[var(--accent)]"
                />
                {m.word}
              </label>
            ))}
          </div>
          <label className="mt-2 block text-[12.5px] text-faint">
            Note, optional
            <textarea
              value={text}
              maxLength={MOOD_NOTE_MAX}
              rows={3}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full resize-none rounded-control border border-line bg-surface-1 px-2.5 py-2 text-[13.5px] text-text hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <p className="mt-1 text-right text-[12px] text-faint tabular-nums">
            {text.length} of {MOOD_NOTE_MAX}
          </p>
          <div className="mt-2 flex justify-end">
            <Button
              disabled={draft === undefined}
              onClick={() => {
                if (draft === undefined) return;
                const trimmed = text.trim();
                onChange({
                  value: draft,
                  ...(trimmed === '' ? {} : { note: trimmed }),
                });
                setOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
