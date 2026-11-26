'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Star,
  Trash,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { MenuSelect } from '@/components/ui/menu-select';
import { useSaveJournalEntry } from '@/data/query/hooks';
import type { JournalEntry, NoteFolder } from '@/domain/types';
import { dayLabel } from '@/data/seed/calendar';
import { LockLine, useDayFinished } from '../day/day-lock';
import { NOTE_SAVE_DELAY_MS } from '../trades/trade-journal';
import { NoteEditor } from '../notes/note-editor';
import { DayCard, TradeStatsCard } from './day-card';
import { LinkedTrades } from './linked-trades';
import { KIND_LABEL } from './notebook-model';

/** The id of a note that is not stored yet: a day's draft. */
export const DRAFT_ID = 'draft';

type Status = 'idle' | 'saving' | 'saved' | 'failed';

/** The folder control, a sunken 26px pill among the entry's meta chips. */
const FOLDER_FIELD =
  'inline-flex h-[26px] max-w-[180px] min-w-0 cursor-pointer items-center gap-1 rounded-[7px] bg-sunken pr-1.5 pl-2 text-[12.5px] font-medium text-muted hover:text-text disabled:cursor-default disabled:opacity-60 pointer-coarse:h-11';

const BAR_BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/** Lowercase, with a leading # dropped. */
const tagOf = (raw: string): string =>
  raw.trim().replace(/^#+/, '').trim().toLowerCase();

/**
 * One open note: title, the day's or the trade's figures, tags, the body.
 * The editor is keyed by the note's id by the caller, so the first save of a
 * note never remounts it; it owns the text from the first render. Title and
 * body save 600 ms after typing stops; the star, tags, links and folder save at
 * once. A draft (id `DRAFT_ID`) is a note not stored yet: its first change
 * asks `ensure` for the stored note and builds on that, under the same pane.
 */
export function EntryPane({
  entry,
  folders,
  ensure,
  onTrash,
  onRestore,
  onDeleteForever,
}: {
  entry: JournalEntry;
  folders: readonly NoteFolder[];
  /** For a draft: the stored note, made if need be. */
  ensure?(): Promise<JournalEntry>;
  /** Moves the stored note with this id to Trash, once the pane has written what it held. */
  onTrash(id: string): void;
  onRestore(): void;
  onDeleteForever(): void;
}): React.JSX.Element {
  const save = useSaveJournalEntry();
  const trashed = entry.deletedAt !== undefined;
  // A daily note of a finished date is frozen with the day (K3).
  const closed = useDayFinished(
    entry.kind === 'daily-review' ? entry.date : undefined,
  ).finished;
  const frozen = trashed || closed;
  const isDraft = entry.id === DRAFT_ID;
  const [seed] = useState(entry.body);
  const [title, setTitle] = useState(entry.title);
  const [tagText, setTagText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  // What the toolbar shows: your change at once, then the stored note's.
  const [shown, setShown] = useState(entry);
  const [seen, setSeen] = useState(entry);
  if (entry !== seen) {
    setSeen(entry);
    if (status !== 'saving') setShown(entry);
  }

  // The last version this pane wrote (or was given while nothing was waiting),
  // so two quick changes build on each other, not on a stale copy.
  const base = useRef(entry);
  const waiting = useRef(0);
  useEffect(() => {
    if (waiting.current === 0) base.current = entry;
  }, [entry]);
  const draft = useRef<{ title?: string; body?: unknown }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const commit = (extra: Partial<JournalEntry> = {}) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    const patch = { ...draft.current, ...extra };
    draft.current = {};
    waiting.current += 1;
    setStatus('saving');
    if (Object.keys(extra).length > 0) setShown((s) => ({ ...s, ...extra }));
    queue.current = queue.current.then(async () => {
      try {
        if (base.current.id === DRAFT_ID && ensure) {
          // The first change of a draft stores the day's note.
          base.current = await ensure();
        }
        const next: JournalEntry = { ...base.current, ...patch };
        // An unset field is left out, not stored as undefined.
        for (const k of Object.keys(next) as (keyof JournalEntry)[])
          if (next[k] === undefined) delete next[k];
        base.current = await save.mutateAsync(next);
        waiting.current -= 1;
        if (waiting.current === 0) setStatus('saved');
      } catch {
        waiting.current -= 1;
        setStatus('failed');
      }
    });
  };
  const later = () => {
    setStatus('saving');
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(commit, NOTE_SAVE_DELAY_MS);
  };

  // Writes what is waiting and everything already on its way, in order.
  const flush = async () => {
    if (timer.current !== undefined) commit();
    await queue.current;
  };
  const trashNow = async () => {
    // Trashing first would let the leave-flush write the old copy back.
    await flush();
    onTrash(base.current.id);
  };

  // Leaving the note saves what is still waiting.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(
    () => () => {
      if (timer.current !== undefined) commitRef.current();
    },
    [],
  );

  const addTag = (raw: string) => {
    const tag = tagOf(raw);
    setTagText('');
    if (tag === '' || base.current.tags.includes(tag)) return;
    commit({ tags: [...base.current.tags, tag] });
  };

  const day = entry.date;
  return (
    <article
      aria-label={entry.title || 'Untitled note'}
      className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-card border border-line bg-surface-1 px-[26px] pt-5 pb-[18px] shadow-[var(--shadow-card)] max-sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-faint">
        <span className="inline-flex h-[26px] items-center rounded-[7px] bg-sunken px-2 font-medium text-muted">
          {KIND_LABEL[entry.kind]}
        </span>
        {day ? <span className="max-sm:hidden">{dayLabel(day)}</span> : null}
        <MenuSelect
          label="Move to folder"
          value={shown.folderId ?? ''}
          disabled={frozen}
          onChange={(id) => commit({ folderId: id === '' ? undefined : id })}
          options={[
            { value: '', label: 'No folder' },
            ...folders.map((f) => ({ value: f.id, label: f.name })),
          ]}
          triggerClassName={FOLDER_FIELD}
        />
        <span
          aria-live="polite"
          className="ml-auto inline-flex items-center gap-1.5"
        >
          {status === 'saving' ? (
            'Saving'
          ) : status === 'saved' ? (
            <>
              <CheckCircle
                size={14}
                weight="fill"
                aria-hidden="true"
                className="text-gain"
              />
              Saved
            </>
          ) : status === 'failed' ? (
            <span className="text-loss">
              Couldn&apos;t save. Keep typing to retry.
            </span>
          ) : null}
        </span>
        {frozen ? null : (
          <>
            <button
              type="button"
              aria-label="Favourite"
              aria-pressed={shown.favorite === true}
              onClick={() => commit({ favorite: shown.favorite !== true })}
              className={`${BAR_BUTTON} px-2 ${shown.favorite ? 'text-accent' : ''}`}
            >
              <Star
                size={16}
                weight={shown.favorite ? 'fill' : 'regular'}
                aria-hidden="true"
              />
            </button>
            {isDraft ? null : (
              <button
                type="button"
                aria-label="Move to Trash"
                onClick={() => void trashNow()}
                className={`${BAR_BUTTON} px-2 hover:text-loss`}
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      {closed && !trashed ? <LockLine className="mt-3" /> : null}
      {trashed ? (
        <div
          role="note"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-3 py-2 text-[13.5px] text-text"
        >
          <span className="mr-auto">
            {entry.kind === 'daily-review' && entry.date !== undefined
              ? "This day's note is in Trash."
              : 'This note is in Trash. It is deleted for good after 30 days.'}
          </span>
          {closed ? null : (
            <>
              <button type="button" onClick={onRestore} className={BAR_BUTTON}>
                <ArrowCounterClockwise size={15} aria-hidden="true" />
                Restore
              </button>
              <button
                type="button"
                onClick={onDeleteForever}
                className={`${BAR_BUTTON} hover:text-loss`}
              >
                Delete forever
              </button>
            </>
          )}
        </div>
      ) : null}
      {closed && trashed ? <LockLine className="mt-3" /> : null}

      <input
        aria-label="Note title"
        value={title}
        readOnly={frozen}
        placeholder="Untitled note"
        onChange={(e) => {
          setTitle(e.target.value);
          draft.current.title = e.target.value;
          later();
        }}
        className="mt-3 w-full min-w-0 bg-transparent text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-text outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent max-sm:text-[22px]"
      />

      {entry.kind === 'daily-review' && day ? (
        <DayCard
          date={day}
          linkedTradeIds={shown.linkedTradeIds}
          readOnly={frozen}
          onLinkedChange={(ids) => commit({ linkedTradeIds: ids })}
        />
      ) : entry.kind === 'trade-note' ? (
        entry.linkedTradeIds[0] ? (
          <TradeStatsCard tradeId={entry.linkedTradeIds[0]} />
        ) : null
      ) : (
        <LinkedTrades
          linkedIds={shown.linkedTradeIds}
          date={day}
          readOnly={frozen}
          onChange={(ids) => commit({ linkedTradeIds: ids })}
        />
      )}

      <div
        role="group"
        aria-label="Tags"
        className="mt-3 flex flex-wrap items-center gap-1.5"
      >
        {shown.tags.map((t) => (
          <span
            key={t}
            className={`inline-flex h-[26px] items-center rounded-full bg-sunken pl-2.5 text-[12.5px] font-[550] text-text ${frozen ? 'pr-2.5' : 'pr-1'}`}
          >
            {t}
            {frozen ? null : (
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() =>
                  commit({ tags: base.current.tags.filter((x) => x !== t) })
                }
                className="ml-0.5 grid size-5 place-items-center rounded-full outline-offset-0 hover:bg-text/10 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
              >
                <X size={11} weight="bold" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {frozen ? null : (
          <input
            aria-label="Add a tag"
            placeholder={shown.tags.length === 0 ? 'Add a tag' : 'Add another'}
            value={tagText}
            maxLength={40}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagText);
              } else if (
                e.key === 'Backspace' &&
                tagText === '' &&
                shown.tags.length > 0
              ) {
                commit({ tags: base.current.tags.slice(0, -1) });
              }
            }}
            onBlur={() => {
              if (tagOf(tagText) !== '') addTag(tagText);
            }}
            className="h-[26px] min-w-[110px] flex-1 bg-transparent px-1 text-[13px] text-text outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
        )}
      </div>

      <div className="mt-2 min-h-[160px] flex-1">
        <NoteEditor
          label="Note"
          value={seed}
          readOnly={frozen}
          placeholder="Write here, or type / for blocks"
          // A draft has no id to own an image yet: its first image stores it.
          noteId={isDraft ? undefined : entry.id}
          ensureNoteId={
            isDraft && ensure
              ? async () => {
                  if (base.current.id === DRAFT_ID)
                    base.current = await ensure();
                  return base.current.id;
                }
              : undefined
          }
          onChange={(doc) => {
            draft.current.body = doc;
            later();
          }}
        />
      </div>
    </article>
  );
}
