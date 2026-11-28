'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { SelectField } from '@/components/app/import/select-field';
import { LABEL } from '@/components/app/import/styles';
import { Button } from '@/components/ui/button';
import { BUTTON_SIZE } from '@/components/ui/button-styles';
import { usePrefs, useUnsetPrefs, useUpdatePrefs } from '@/data/query/hooks';
import {
  DEFAULT_NOTE_TYPE,
  NOTE_SIZE_KEYS,
  NOTE_SIZE_MAX,
  NOTE_SIZE_MIN,
  noteTypeOf,
  sameNoteType,
} from '@/domain/note-type';
import type { NoteType } from '@/domain/types';
import '../notes/note-prose.css';
import { noteTypeStyle } from '../notes/note-type-style';

type Size = (typeof NOTE_SIZE_KEYS)[number];

const FIELDS: readonly { key: Size; label: string }[] = [
  { key: 'h1', label: 'Heading 1' },
  { key: 'h2', label: 'Heading 2' },
  { key: 'h3', label: 'Heading 3' },
  { key: 'body', label: 'Body' },
];

/** What the last save, or the last return to Keel's settings, did, until the next change. */
type Said = '' | 'Saved' | "Using Keel's settings" | 'failed';

const SIZES = Array.from(
  { length: NOTE_SIZE_MAX - NOTE_SIZE_MIN + 1 },
  (_, i) => NOTE_SIZE_MIN + i,
);

/**
 * A sample note drawn with the note styles, at the sizes chosen (not yet
 * saved). It is a picture of a note, not a note: nothing in it takes the
 * focus, and a screen reader is told the sizes in words instead.
 */
function Preview({ type }: { type: NoteType }): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Preview"
      style={noteTypeStyle(type)}
      className="min-w-0 rounded-[10px] border border-line px-5 pt-4 pb-[18px] max-sm:px-4 max-sm:py-3.5"
    >
      <p aria-hidden="true" className="mb-2.5 text-[12px] text-faint">
        Preview
      </p>
      <div aria-hidden="true" className="note-prose note-preview">
        <h1>Pre-market plan</h1>
        <h2>Levels</h2>
        <h3>ES Dec 26</h3>
        <p>
          Overnight range 6,598.50 to 6,611.75. No entries before 09:45, and
          none in the 5 minutes around the 10:00 release.
        </p>
        <ul data-type="taskList">
          <li data-checked="true">
            <label>
              <input type="checkbox" checked disabled readOnly tabIndex={-1} />
            </label>
            <div>
              <p>Mark the overnight high and low</p>
            </div>
          </li>
          <li data-checked="false">
            <label>
              <input type="checkbox" disabled readOnly tabIndex={-1} />
            </label>
            <div>
              <p>Set size for the open</p>
            </div>
          </li>
        </ul>
      </div>
      <p className="sr-only">
        {`A sample note. Heading 1 at ${type.h1} px, Heading 2 at ${type.h2} px, Heading 3 at ${type.h3} px, body text at ${type.body} px. Ticked checklist items are ${type.strikeChecked ? 'crossed out' : 'not crossed out'}.`}
      </p>
    </div>
  );
}

/** One size: its label and a select from 10 to 40 px. */
function SizeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(px: number): void;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <SelectField
        id={id}
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {SIZES.map((px) => (
          <option key={px} value={px}>
            {px} px
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** What a save or a return to Keel's settings did, for the eye and for a screen reader. */
function Status({ said }: { said: Said }): React.JSX.Element {
  const failed = said === 'failed';
  return (
    <p
      role="status"
      aria-live="polite"
      aria-label="Save status"
      className={`min-h-5 text-[12.5px] ${failed ? 'font-medium text-loss' : 'text-faint'}`}
    >
      {failed ? "Couldn't save that. Try again." : said}
    </p>
  );
}

/**
 * Settings > Notebook: the sizes every note is drawn at, whether a ticked
 * checklist item is crossed out, a preview that follows the choices before
 * they are saved, Use Keel's settings (which forgets the saved setting) and
 * Save, which waits for a change (B41).
 */
export function NotebookSettings(): React.JSX.Element {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const unset = useUnsetPrefs();
  const boxId = useId();
  // What is chosen belongs to the setting it was chosen over: once a save or a
  // reset lands, the setting is new and the choice is stale.
  const [held, setHeld] = useState<{ key: string; draft: NoteType } | null>(
    null,
  );
  const [said, setSaid] = useState<Said>('');

  if (!prefs)
    return (
      <section className={`${CARD} px-5 pt-[18px] pb-5`}>
        <p role="status" className="text-[13.5px] text-muted">
          Loading your note settings...
        </p>
      </section>
    );

  const saved = noteTypeOf(prefs.noteType);
  const key = JSON.stringify(saved);
  const draft = held?.key === key ? held.draft : saved;
  const changed = !sameNoteType(draft, saved);
  const busy = update.isPending || unset.isPending;
  const edit = (patch: Partial<NoteType>) => {
    setSaid('');
    setHeld({ key, draft: { ...draft, ...patch } });
  };

  const save = () => {
    setSaid('');
    update.mutate(
      { noteType: draft },
      {
        onSuccess: () => setSaid('Saved'),
        onError: () => setSaid('failed'),
      },
    );
  };
  const reset = () => {
    setSaid('');
    // The choices go back at once; the saved setting is forgotten behind them.
    setHeld({ key, draft: { ...DEFAULT_NOTE_TYPE } });
    // Nothing saved means nothing to forget.
    if (prefs.noteType === undefined) return setSaid("Using Keel's settings");
    unset.mutate(['noteType'], {
      onSuccess: () => setSaid("Using Keel's settings"),
      onError: () => setSaid('failed'),
    });
  };

  return (
    <section
      aria-labelledby="note-text-heading"
      className={`${CARD} px-5 pt-[18px] pb-5`}
    >
      <CardHeader
        headingId="note-text-heading"
        title="Note text"
        after={
          <span className="text-[12.5px] text-faint">
            Every note, in the Notebook, on trades and on the day page
          </span>
        }
      />
      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)] items-start gap-7 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-3.5">
            {FIELDS.map(({ key: size, label }) => (
              <SizeField
                key={size}
                label={label}
                value={draft[size]}
                onChange={(px) => edit({ [size]: px })}
              />
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-faint">
            Each size runs from {NOTE_SIZE_MIN} to {NOTE_SIZE_MAX} px.
          </p>
          <label
            htmlFor={boxId}
            className="mt-[18px] flex w-fit cursor-pointer items-center gap-2.5 rounded-[8px] text-[13.5px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent pointer-coarse:min-h-11"
          >
            <span className="relative flex-none">
              <input
                id={boxId}
                type="checkbox"
                checked={draft.strikeChecked}
                onChange={(e) =>
                  edit({ strikeChecked: e.currentTarget.checked })
                }
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span
                aria-hidden="true"
                className={`grid size-4 place-items-center rounded-[5px] border text-accent-fg shadow-[var(--shadow-chip)] transition-colors duration-200 ease-(--ease-glide) motion-reduce:transition-none ${draft.strikeChecked ? 'border-accent bg-accent' : 'border-line-2 bg-surface-1'}`}
              >
                {draft.strikeChecked ? <Check size={11} weight="bold" /> : null}
              </span>
            </span>
            Cross out ticked checklist items
          </label>
        </div>
        <Preview type={draft} />
      </div>
      <div className="mt-[18px] flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3.5">
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className={`${BUTTON_SIZE.md} -ml-[15px] inline-flex items-center justify-center rounded-control text-accent-ink transition-colors duration-120 hover:bg-sunken disabled:opacity-50`}
        >
          Use Keel&apos;s settings
        </button>
        <div className="ml-auto flex items-center gap-3">
          <Status said={said} />
          <Button onClick={save} disabled={!changed || busy}>
            Save
          </Button>
        </div>
      </div>
    </section>
  );
}
