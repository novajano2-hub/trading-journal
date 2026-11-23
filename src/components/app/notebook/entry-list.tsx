'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowCounterClockwise,
  LinkSimple,
  MagnifyingGlass,
  Star,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import {
  useRemoveJournalEntry,
  useRestoreJournalEntry,
} from '@/data/query/hooks';
import type { JournalEntry } from '@/domain/types';
import { dayLabel } from '@/data/seed/calendar';
import { plural } from '@/lib/format';
import { docExcerpt } from '@/lib/note-text';
import { ConfirmDialog } from '../confirm-dialog';
import { KIND_LABEL, entryDay } from './notebook-model';

/** "Fri 20 Nov", or "20 Nov 2025" for another year. */
function when(e: JournalEntry, thisYear: string): string {
  const day = entryDay(e);
  return day.startsWith(thisYear)
    ? dayLabel(day)
    : `${dayLabel(day, false)} ${day.slice(0, 4)}`;
}

const ACTION =
  'inline-flex h-7 items-center gap-1 rounded-chip px-2 text-[12.5px] font-medium text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/**
 * The notes in view, newest first: title, day, a 120-character excerpt, kind
 * and tags. The open note is marked `aria-current`. In Trash a row restores or
 * deletes forever instead of opening.
 */
export function EntryList({
  entries,
  selectedId,
  trash,
  query,
  onQuery,
  heading,
  thisYear,
  empty,
}: {
  entries: readonly JournalEntry[];
  selectedId: string | undefined;
  trash: boolean;
  query: string;
  onQuery(q: string): void;
  heading: string;
  thisYear: string;
  empty: React.ReactNode;
}): React.JSX.Element {
  const restore = useRestoreJournalEntry();
  const remove = useRemoveJournalEntry();
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <section
      aria-label="Entries"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface-1 shadow-[var(--shadow-card)]"
    >
      <div className="relative mx-3.5 mt-3.5 mb-1.5">
        <MagnifyingGlass
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          aria-label="Search notes"
          placeholder="Search notes"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="h-[34px] w-full rounded-[10px] border border-line-2 bg-surface-1 pr-2.5 pl-8 text-[14px] text-text outline-none placeholder:text-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
        />
      </div>
      <div className="flex justify-between gap-2 px-[18px] pt-2 pb-1.5 text-[12.5px] text-faint">
        <span aria-live="polite">{heading}</span>
        <span>Newest first</span>
      </div>
      {trash ? (
        <p className="px-[18px] pb-1.5 text-[12.5px] leading-snug text-muted">
          Notes in Trash are deleted after 30 days.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="px-[18px] pb-1.5 text-[12.5px] text-loss">
          {failed}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <div className="px-[18px] py-8 text-center text-[14px] text-muted">
          {empty}
        </div>
      ) : (
        <ul
          aria-label="Notes"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 max-lg:max-h-[60dvh]"
        >
          {entries.map((e) => {
            const on = e.id === selectedId;
            const excerpt = docExcerpt(e.body, 120);
            const linked = e.linkedTradeIds.length;
            const body = (
              <>
                <span className="flex items-start gap-1.5">
                  <b className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold text-text">
                    {e.title || 'Untitled note'}
                  </b>
                  {e.favorite ? (
                    <Star
                      size={13}
                      weight="fill"
                      aria-label="Favourite"
                      className="mt-0.5 flex-none text-accent"
                    />
                  ) : null}
                </span>
                {excerpt ? (
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {excerpt}
                  </span>
                ) : null}
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-faint">
                  <span>{when(e, thisYear)}</span>
                  <span>{KIND_LABEL[e.kind]}</span>
                  {linked > 0 && e.kind !== 'trade-note' ? (
                    <span className="inline-flex items-center gap-1">
                      <LinkSimple size={12} aria-hidden="true" />
                      {linked} {plural(linked, 'trade')}
                    </span>
                  ) : null}
                  {e.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-sunken px-1.5 text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </>
            );
            return (
              <li
                key={e.id}
                className={`mb-0.5 rounded-[10px] ${on ? 'bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'hover:bg-sunken'}`}
              >
                {trash ? (
                  <div className="px-2.5 pt-2.5 pb-2">
                    {body}
                    <span className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        aria-label={`Restore ${e.title}`}
                        disabled={restore.isPending}
                        onClick={() =>
                          restore.mutate(e.id, {
                            onError: () =>
                              setFailed("Couldn't restore that note."),
                          })
                        }
                        className={ACTION}
                      >
                        <ArrowCounterClockwise size={14} aria-hidden="true" />
                        Restore
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${e.title} forever`}
                        onClick={() => setDeleting(e)}
                        className={`${ACTION} hover:text-loss`}
                      >
                        <Trash size={14} aria-hidden="true" />
                        Delete forever
                      </button>
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/app/notebook/${encodeURIComponent(e.id)}`}
                    aria-current={on ? 'page' : undefined}
                    className="block rounded-[10px] px-2.5 pt-2.5 pb-2.5 outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? ''} forever?`}
        body="The note is deleted for good. It can't be restored."
        confirmLabel="Delete forever"
        danger
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
