'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Plus, Star, X } from '@phosphor-icons/react/dist/ssr';
import {
  useEnsureTradeNote,
  useJournalEntry,
  useSaveJournalEntry,
} from '@/data/query/hooks';
import type {
  JournalEntry,
  Strategy,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { NoteEditor, type NoteEditorHandle } from '../notes/note-editor';
import { TagPicker } from '../tag-picker';

/** How long typing rests before the note is saved. */
export const NOTE_SAVE_DELAY_MS = 600;

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

/** Five stars as a radio group: "Rating: 4 of 5". Choosing a star saves it; Clear takes it back. */
export function RatingRow({
  rating,
  disabled,
  onChange,
}: {
  rating: number | undefined;
  disabled: boolean;
  onChange(next: 1 | 2 | 3 | 4 | 5 | undefined): void;
}): React.JSX.Element {
  return (
    <div className="mt-1.5 flex items-center gap-3 border-t border-line pt-3">
      <span className="w-[84px] flex-none text-[12.5px] text-faint max-sm:w-[72px]">
        Rating
      </span>
      <div
        role="radiogroup"
        aria-label={`Rating: ${rating === undefined ? 'none' : `${rating} of 5`}`}
        className="flex gap-0.5"
      >
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <label
            key={n}
            className={`group relative grid size-7 place-items-center rounded-[8px] pointer-coarse:size-11 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name="trade-rating"
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
              checked={rating === n}
              disabled={disabled}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <Star
              size={20}
              weight={rating !== undefined && n <= rating ? 'fill' : 'regular'}
              aria-hidden="true"
              className={`${rating !== undefined && n <= rating ? 'text-accent' : 'text-line-2'} ${disabled ? '' : 'group-hover:text-accent/70'}`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[8px] peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
            />
          </label>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="text-[12.5px] whitespace-nowrap text-muted"
      >
        {rating === undefined ? 'Not rated' : `${rating} of 5`}
      </span>
      {rating !== undefined && !disabled ? (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="ml-auto rounded-chip px-1.5 text-[12.5px] font-medium text-faint outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

type NoteStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** The editor and its autosave; mounts once the trade's note (if it has one) has loaded. */
function NoteBody({
  trade,
  entry,
  readOnly,
  handleRef,
  onStatus,
}: {
  trade: Trade;
  entry: JournalEntry | null;
  readOnly: boolean;
  handleRef?: { current: NoteEditorHandle | null };
  onStatus(s: NoteStatus): void;
}): React.JSX.Element {
  const ensure = useEnsureTradeNote();
  const save = useSaveJournalEntry();
  // The editor owns the text from here on: the stored body seeds it once.
  const [seed] = useState(entry?.body);
  const latest = useRef<unknown>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The trade's note: the one it has, or the one the first change makes.
  const note = useRef<Promise<JournalEntry> | null>(
    entry ? Promise.resolve(entry) : null,
  );
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = () => {
    timer.current = undefined;
    const body = latest.current;
    queue.current = queue.current.then(async () => {
      try {
        const current = await note.current!;
        await save.mutateAsync({ ...current, body });
        onStatus('saved');
      } catch {
        onStatus('failed');
      }
    });
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
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

  return (
    <NoteEditor
      label="Trade note"
      value={seed}
      readOnly={readOnly}
      handleRef={handleRef}
      placeholder="What did you see, and what would you do again? Type / for blocks"
      onChange={(doc) => {
        latest.current = doc;
        onStatus('saving');
        // The first change makes the note; later ones reuse it.
        note.current ??= ensure.mutateAsync(trade.id);
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
  onStatus(s: NoteStatus): void;
}): React.JSX.Element {
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
      trade={trade}
      entry={trade.noteId === undefined ? null : (entryQuery.data ?? null)}
      readOnly={readOnly}
      handleRef={handleRef}
      onStatus={onStatus}
    />
  );
}
