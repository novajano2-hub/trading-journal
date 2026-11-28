'use client';

import {
  MagnifyingGlass,
  SlidersHorizontal,
} from '@phosphor-icons/react/dist/ssr';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { MorphDialog } from '@/components/ui/morph-dialog';

/** One stat of the trade page's Execution card, as the chooser lists it. */
export interface StatChoice {
  id: string;
  label: string;
  /** What the stat reads on this trade now, drawn as the page draws it. */
  value: ReactNode;
  /**
   * False for a stat this trade has no cell for (a forex trade has no Points).
   * It is not listed, and the choice keeps whatever state it has.
   */
  listed: boolean;
}

/**
 * "Choose stats": a button on the Execution card that opens a dialog with a
 * search over the stats, a box and the current value on each row, Reset to
 * default, Cancel and Save. The choice is held in the dialog and saved only by
 * Save; Cancel, Escape and the close button drop it. The order never changes.
 *
 * `rows` is every stat in page order; `shown` the ids on now. `onSave` gets the
 * ids to show, or `undefined` when all of them are (the default, so the saved
 * choice is cleared and later stats show without being asked for). A rejected
 * save keeps the dialog open.
 */
export function StatsChooser({
  rows,
  shown,
  onSave,
}: {
  rows: readonly StatChoice[];
  shown: readonly string[];
  onSave(next: string[] | undefined): void | Promise<void>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchId = useId();

  const needle = query.trim().toLowerCase();
  const listed = rows.filter((r) => r.listed);
  const matching = listed.filter(
    (r) => needle === '' || r.label.toLowerCase().includes(needle),
  );

  const toggle = (id: string) =>
    setDraft((d) => {
      const next = new Set(d);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const save = async () => {
    const next = rows.map((r) => r.id).filter((id) => draft.has(id));
    setBusy(true);
    setFailed(false);
    try {
      await onSave(next.length === rows.length ? undefined : next);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(new Set(shown));
          setQuery('');
          setFailed(false);
          setOpen(true);
        }}
        className={`${buttonClasses('secondary', 'sm')} gap-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Choose stats
      </button>
      <MorphDialog
        open={open}
        onOpenChange={setOpen}
        origin={trigger}
        returnFocus={trigger}
        title="Choose stats"
        description="Pick what the Execution card shows on every trade. The order stays as it is."
        size="medium"
        footer={
          <>
            {failed ? (
              <p role="alert" className="mb-2 text-[13px] text-loss">
                Couldn&apos;t save. Try again.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setDraft(new Set(rows.map((r) => r.id)))}
                className="mr-auto -ml-2 !text-accent-ink"
              >
                Reset to default
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </>
        }
      >
        <div className="relative mt-1">
          <MagnifyingGlass
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            id={searchId}
            type="search"
            aria-label="Search stats"
            placeholder="Search stats"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-[8px] border border-line-2 bg-surface-1 pr-3 pl-9 text-[13.5px] text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
        </div>
        {matching.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted">No stat matches.</p>
        ) : (
          <div className="mt-3 grid gap-x-5 gap-y-0.5 sm:grid-cols-2">
            {matching.map((r) => (
              <ChoiceRow
                key={r.id}
                row={r}
                on={draft.has(r.id)}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-faint">
          Net P&amp;L, Net ROI and Realized R at the top of the trade always
          show.
        </p>
      </MorphDialog>
    </>
  );
}

function ChoiceRow({
  row,
  on,
  onToggle,
}: {
  row: StatChoice;
  on: boolean;
  onToggle(): void;
}): React.JSX.Element {
  const labelId = useId();
  const valueId = useId();
  return (
    <label
      data-stat={row.id}
      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-[13.5px] hover:bg-sunken pointer-coarse:min-h-11"
    >
      <input
        type="checkbox"
        checked={on}
        onChange={onToggle}
        aria-labelledby={labelId}
        aria-describedby={valueId}
        className="size-4 flex-none accent-[var(--accent)]"
      />
      <span
        id={labelId}
        className={`min-w-0 flex-1 ${on ? 'text-text' : 'text-muted'}`}
      >
        {row.label}
      </span>
      <span
        id={valueId}
        className="flex-none text-[12.5px] whitespace-nowrap text-faint tabular-nums"
      >
        {row.value}
      </span>
    </label>
  );
}
