'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Plus, X } from '@phosphor-icons/react/dist/ssr';
import {
  useDailyNote,
  useEnsureTradeNote,
  useJournal,
  useTemplates,
  useJournalEntry,
  useRestoreJournalEntry,
  useSaveJournalEntry,
} from '@/data/query/hooks';
import type {
  JournalEntry,
  Strategy,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { localDate } from '@/domain/time';
import { dayLabel } from './trade-time';
import type { TemplateSlot } from '../notes/editor-toolbar';
import { NoteEditor, type NoteEditorHandle } from '../notes/note-editor';
import { TagPicker } from '../tag-picker';
import { findDailyEntry } from '../notebook/notebook-model';
import { LockLine, useDayFinished } from '../day/day-lock';

/** How long typing rests before the note is saved. */
export const NOTE_SAVE_DELAY_MS = 600;

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const CHIP =
  'inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11';

/**
 * Every strategy the trade follows, as chips that press on and off. A strategy
 * left out of the trade takes its rule checks with it (the page does that).
 */
export function StrategyPicker({
  strategies,
  selected,
  disabled,
  onChange,
}: {
  strategies: readonly Strategy[];
  selected: readonly string[];
  disabled: boolean;
  onChange(ids: string[]): void;
}): React.JSX.Element {
  const listed = strategies.filter(
    (s) => s.status === 'active' || selected.includes(s.id),
  );
  if (listed.length === 0)
    return (
      <p className="text-[13.5px] text-muted">
        No strategies yet.{' '}
        <Link
          href="/app/strategies/new"
          className="font-semibold text-accent-ink hover:text-accent-hover"
        >
          Create one
        </Link>{' '}
        to grade its rules on your trades.
      </p>
    );
  return (
    <div
      role="group"
      aria-label="Strategies"
      className="flex flex-wrap gap-1.5"
    >
      {listed.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() =>
              onChange(
                on ? selected.filter((x) => x !== s.id) : [...selected, s.id],
              )
            }
            className={`${CHIP} ${on ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_22%,transparent)]' : 'bg-transparent text-muted shadow-[inset_0_0_0_1px_var(--line-2)] hover:text-text'}`}
          >
            {s.name}
            {s.status === 'archived' ? (
              <span className="text-xs font-normal text-faint">archived</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A tag in its category's colour, with its own remove button unless the trade is read-only. */
function TagToken({
  tag,
  category,
  readOnly,
  onRemove,
}: {
  tag: Tag;
  category: TagCategory;
  readOnly: boolean;
  onRemove(): void;
}): React.JSX.Element {
  const mistake = category.role === 'mistake';
  const style = {
    backgroundColor: `color-mix(in srgb, ${category.color} 16%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${category.color} 38%, transparent)`,
  };
  return (
    <span
      style={mistake ? undefined : style}
      className={`inline-flex h-[26px] items-center rounded-full pl-2.5 text-[12.5px] font-[550] ${readOnly ? 'pr-2.5' : 'pr-1'} ${mistake ? 'bg-warn-soft text-warn' : 'text-text'}`}
    >
      {tag.name}
      {readOnly ? null : (
        <button
          type="button"
          aria-label={`Remove ${tag.name}`}
          onClick={onRemove}
          className="ml-0.5 grid size-5 place-items-center rounded-full outline-offset-0 hover:bg-text/10 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
        >
          <X size={11} weight="bold" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** One category's tags on the trade, and a button that opens a picker scoped to it. */
function CategoryRow({
  category,
  tags,
  tagIds,
  readOnly,
  onChange,
}: {
  category: TagCategory;
  tags: readonly Tag[];
  tagIds: readonly string[];
  readOnly: boolean;
  onChange(ids: string[]): void;
}): React.JSX.Element {
  const mine = tags.filter(
    (t) => t.categoryId === category.id && tagIds.includes(t.id),
  );
  return (
    <div
      role="group"
      aria-label={category.name}
      className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-2.5 border-b border-line/70 py-2.5 last:border-b-0 max-sm:grid-cols-[88px_minmax(0,1fr)]"
    >
      <span className="min-w-0 truncate pt-1 text-[12.5px] text-faint">
        {category.name}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {mine.map((tag) => (
          <TagToken
            key={tag.id}
            tag={tag}
            category={category}
            readOnly={readOnly}
            onRemove={() => onChange(tagIds.filter((id) => id !== tag.id))}
          />
        ))}
        {readOnly ? (
          mine.length === 0 ? (
            <span className="pt-0.5 text-[13px] text-faint">None</span>
          ) : null
        ) : (
          <Popover.Root>
            <Popover.Trigger
              aria-label={`Add to ${category.name}`}
              className="inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-faint shadow-[inset_0_0_0_1px_var(--line-2)] outline-offset-2 hover:text-text hover:shadow-[inset_0_0_0_1px_var(--faint)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3"
            >
              <Plus size={11} weight="bold" aria-hidden="true" />
              {category.name}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className="z-[60] w-[300px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
              >
                <TagPicker
                  label={`${category.name} tags`}
                  autoFocus
                  categories={[category]}
                  selected={[...tagIds]}
                  onChange={onChange}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
}

/** The trade's tags, a row per category (name and colour). */
export function TagRows({
  categories,
  tags,
  tagIds,
  readOnly,
  onChange,
}: {
  categories: readonly TagCategory[];
  tags: readonly Tag[];
  tagIds: readonly string[];
  readOnly: boolean;
  onChange(ids: string[]): void;
}): React.JSX.Element {
  return (
    <div className="mt-1.5">
      {categories.map((c) => (
        <CategoryRow
          key={c.id}
          category={c}
          tags={tags}
          tagIds={tagIds}
          readOnly={readOnly}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** What a bound note editor offers the page around it. */
export interface NoteControl {
  /**
   * Writes what is waiting (or tries again after a failed write), then waits
   * for everything already on its way; `onStatus` says whether it landed.
   */
  settle(): Promise<void>;
  /**
   * Changes the stored note's fields (the star), in the editor's own queue and
   * after what is waiting, so the text and the change never write over each
   * other. `update` reads the note as stored just before. Rejects when the
   * write fails.
   */
  patch(
    update: (current: JournalEntry) => Partial<JournalEntry>,
  ): Promise<void>;
}

/** The editor and its autosave; mounts once the trade's note (if it has one) has loaded. */
function NoteBody({
  label,
  placeholder,
  entry,
  fallback,
  ensure,
  readOnly,
  handleRef,
  stamp,
  controlRef,
  templateSlot,
  onStatus,
}: {
  label: string;
  placeholder: string;
  entry: JournalEntry | null;
  /** What the editor opens with when there is no entry yet. */
  fallback?: JournalEntry['body'];
  /** Makes (or finds) the entry the first change belongs to. */
  ensure(): Promise<JournalEntry>;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
  /** Fields the next save writes with the body (the template a body came from). */
  stamp?: { current: Partial<JournalEntry> | undefined };
  /** Receives the editor's `NoteControl`. */
  controlRef?: { current: NoteControl | null };
  /** The host's template menu, drawn in the editor's toolbar. */
  templateSlot?: TemplateSlot;
  onStatus(s: NoteStatus, error?: unknown): void;
}): React.JSX.Element {
  const save = useSaveJournalEntry();
  // The editor owns the text from here on: the stored body seeds it once.
  const [seed] = useState(entry?.body ?? fallback);
  const latest = useRef<unknown>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The trade's note: the one it has, or the one the first change makes.
  const note = useRef<Promise<JournalEntry> | null>(
    entry ? Promise.resolve(entry) : null,
  );
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Saves queued and not yet written. While none is, the note follows the
  // stored one (another tab may have renamed, moved or trashed it), so a save
  // builds on what is stored, never on the copy this editor opened with, as
  // the Notebook's pane does. A note gone from the store (trashed or deleted)
  // is let go: the next change makes a new one rather than bring it back. (A
  // daily note in Trash is not let go: its date keeps it, read-only, E109.)
  const waiting = useRef(0);
  // The last write failed: the text on screen is not the stored one.
  const failed = useRef(false);
  useEffect(() => {
    if (waiting.current === 0)
      note.current = entry ? Promise.resolve(entry) : null;
  }, [entry]);
  // The latest `ensure`, for a save whose note was let go during the delay.
  const ensureRef = useRef(ensure);
  useEffect(() => {
    ensureRef.current = ensure;
  });

  const flush = () => {
    timer.current = undefined;
    const body = latest.current;
    waiting.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        // Always a whole note: one let go during the delay (trashed or
        // deleted elsewhere) is made or found again, never saved as a body alone.
        const pending = (note.current ??= ensureRef.current());
        let current: JournalEntry;
        try {
          current = await pending;
        } catch (e) {
          if (note.current === pending) note.current = null;
          throw e;
        }
        const saved = await save.mutateAsync({
          ...current,
          ...stamp?.current,
          body,
        });
        note.current = Promise.resolve(saved);
        failed.current = false;
        onStatus('saved');
      } catch (e) {
        failed.current = true;
        onStatus('failed', e);
      } finally {
        waiting.current -= 1;
      }
    });
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  // Writes what is waiting now (or tries again after a failed write), then
  // waits for everything already on its way.
  const settle = async () => {
    if (timer.current !== undefined || failed.current) {
      if (timer.current !== undefined) clearTimeout(timer.current);
      flush();
    }
    await queue.current;
  };
  // A change to the note's fields joins the same queue, behind what is waiting,
  // and builds on the note the last save returned.
  const patch: NoteControl['patch'] = async (update) => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      flush();
    }
    waiting.current += 1;
    const job = queue.current.then(async () => {
      try {
        const current = await (note.current ??= ensureRef.current());
        const saved = await save.mutateAsync({
          ...current,
          ...update(current),
        });
        note.current = Promise.resolve(saved);
      } finally {
        waiting.current -= 1;
      }
    });
    // The queue goes on whatever this write does; the caller hears of a failure.
    queue.current = job.then(
      () => {},
      () => {},
    );
    await job;
  };
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = { settle, patch };
    return () => {
      controlRef.current = null;
    };
  });

  // Leaving the trade (or the page) saves what is still waiting.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        flushRef.current();
      }
    },
    [],
  );

  // The note owns its images (`note:<id>`), so an image needs a note: the one
  // the trade or day has, or the one the first change would make.
  const ensureNoteId = async () => {
    const pending = (note.current ??= ensureRef.current());
    pending.catch(() => {
      if (note.current === pending) note.current = null;
    });
    return (await pending).id;
  };
  return (
    <NoteEditor
      label={label}
      value={seed}
      readOnly={readOnly}
      handleRef={handleRef}
      placeholder={placeholder}
      noteId={entry?.id}
      ensureNoteId={ensureNoteId}
      templateSlot={templateSlot}
      onChange={(doc) => {
        latest.current = doc;
        onStatus('saving');
        // The first change makes the note; later ones reuse it.
        note.current ??= ensure();
        note.current.catch(() => {
          note.current = null;
        });
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = setTimeout(flush, NOTE_SAVE_DELAY_MS);
      }}
    />
  );
}

/** The trade note: Tiptap bound to the trade's own journal entry, saved as you type. */
export function TradeNote({
  trade,
  readOnly,
  handleRef,
  onStatus,
}: {
  trade: Trade;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
  onStatus(s: NoteStatus, error?: unknown): void;
}): React.JSX.Element {
  const ensureNote = useEnsureTradeNote();
  const entryQuery = useJournalEntry(trade.noteId ?? '');
  const waiting = trade.noteId !== undefined && !entryQuery.isSuccess;
  // Once the body has mounted for this trade it stays: the first edit links a
  // new note, and that must not swap the live editor for the skeleton.
  const [mountedFor, setMountedFor] = useState<string | null>(null);
  if (!waiting && mountedFor !== trade.id) setMountedFor(trade.id);
  if (waiting && mountedFor !== trade.id)
    return (
      <div
        role="status"
        aria-label="Loading the note"
        className="mt-3 h-[120px] rounded-control bg-sunken"
      />
    );
  return (
    <NoteBody
      key={trade.id}
      label="Trade note"
      placeholder="What did you see, and what would you do again? Type / for blocks"
      ensure={() => ensureNote.mutateAsync(trade.id)}
      entry={trade.noteId === undefined ? null : (entryQuery.data ?? null)}
      readOnly={readOnly}
      handleRef={handleRef}
      onStatus={onStatus}
    />
  );
}

/** The day note's date: the trade's last exit (its open date while it is open), on the trader's clock. */
export function dayNoteDate(trade: Trade, timeZone: string): string {
  return localDate(trade.closedAt ?? trade.openedAt, timeZone);
}

/**
 * The day note's editor and autosave, bound to the daily entry of a date: no
 * header, so a page can lay out its own. The entry is made on the first
 * change (as the Notebook makes it), never by looking. A note in Trash shows
 * read-only with Restore (E109). One editor per date. `stamp` is written with
 * the next save, to record the template a replaced body came from.
 */
export function DayNoteBinding({
  date,
  readOnly,
  handleRef,
  stamp,
  controlRef,
  templateSlot,
  onStatus,
}: {
  date: string;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
  stamp?: { current: Partial<JournalEntry> | undefined };
  /** Receives the editor's `NoteControl`: settle what is waiting, or change the note's fields in its queue. */
  controlRef?: { current: NoteControl | null };
  /** The host's template menu, drawn in the editor's toolbar. */
  templateSlot?: TemplateSlot;
  onStatus(s: NoteStatus, error?: unknown): void;
}): React.JSX.Element {
  const journal = useJournal();
  const templates = useTemplates();
  const daily = useDailyNote();
  const restore = useRestoreJournalEntry();
  const [problem, setProblem] = useState<string | null>(null);
  const entry = findDailyEntry(journal.data, date);
  const trashed = entry?.deletedAt !== undefined;
  // A finished date's trashed note stays where it is: no Restore.
  const closed = useDayFinished(date).finished;
  // As in TradeNote: once mounted for this date the editor stays, even though
  // the first change adds the entry to the journal.
  const [mountedFor, setMountedFor] = useState<string | null>(null);
  const waiting = !journal.isSuccess || !templates.isSuccess;
  if (!waiting && mountedFor !== date) setMountedFor(date);
  if (waiting && mountedFor !== date)
    return (
      <div
        role="status"
        aria-label="Loading the day note"
        className="mt-3 h-[120px] rounded-control bg-sunken"
      />
    );
  // The Notebook's rule: with no entry the day opens from the default daily template.
  const template =
    templates.data?.find((t) => t.kind === 'daily-review' && t.isDefault)
      ?.body ?? EMPTY_DOC;
  return (
    <>
      {entry && trashed ? (
        <div
          role="note"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-3 py-2 text-[13.5px] text-text"
        >
          <span className="mr-auto">This day&apos;s note is in Trash.</span>
          {closed ? null : (
            <>
              {problem ? (
                <span role="alert" className="text-loss">
                  {problem}
                </span>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  setProblem(null);
                  try {
                    await restore.mutateAsync(entry.id);
                  } catch {
                    setProblem("Couldn't restore that note. Try again.");
                  }
                }}
                disabled={restore.isPending}
                className="inline-flex h-8 items-center rounded-control border border-line bg-surface-1 px-3 text-[13px] font-semibold text-text outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
              >
                Restore
              </button>
            </>
          )}
        </div>
      ) : null}
      {entry && trashed && closed ? <LockLine className="mt-3" /> : null}
      <NoteBody
        key={date}
        label="Daily note"
        placeholder="How did the day go? Type / for blocks"
        ensure={() => daily.mutateAsync(date)}
        entry={entry ?? null}
        fallback={template}
        readOnly={readOnly || trashed}
        handleRef={handleRef}
        stamp={stamp}
        controlRef={controlRef}
        templateSlot={templateSlot}
        onStatus={onStatus}
      />
    </>
  );
}

/**
 * The day note on the trade page: a date row with a link to the Notebook,
 * then the day note's editor.
 */
export function DayNote({
  date,
  readOnly,
  handleRef,
  onStatus,
}: {
  date: string;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
  onStatus(s: NoteStatus, error?: unknown): void;
}): React.JSX.Element {
  const journal = useJournal();
  const entry = findDailyEntry(journal.data, date);
  // A finished date's note is frozen with the day (K3).
  const closed = useDayFinished(date).finished;
  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px] text-faint">
        <span className="tabular-nums">
          {dayLabel(`${date}T12:00:00Z`, 'UTC')}
        </span>
        <Link
          href={
            entry
              ? `/app/notebook/${encodeURIComponent(entry.id)}`
              : `/app/notebook/daily/${date}`
          }
          className="rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-3"
        >
          Open in the Notebook
        </Link>
      </div>
      {closed && entry?.deletedAt === undefined ? (
        <LockLine className="mt-3" />
      ) : null}
      <DayNoteBinding
        date={date}
        readOnly={readOnly || closed}
        handleRef={handleRef}
        onStatus={onStatus}
      />
    </>
  );
}
