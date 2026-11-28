'use client';

// A note's version history (B39). A list beside a read-only preview: Current,
// then the kept versions by day, newest first, with the one saved just before
// a restore marked. Restore asks first, keeps the current text as a version,
// and brings back the body only: the title, tags and folder stay as they are.
// On a finished day's daily note (6A's lock) it is read-only: the list and the
// preview read, and nothing restores.
import { Fragment, useState, type ReactNode, type RefObject } from 'react';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useJournalEntry,
  useNoteVersions,
  usePrefs,
  useRestoreVersion,
} from '@/data/query/hooks';
import { LockedDayError } from '@/data/repository';
import { localDate } from '@/domain/time';
import type { JournalEntry, NoteVersion } from '@/domain/types';
import { clock, dayLabel } from '@/lib/time-format';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';

const CURRENT = 'current';
const CLOSED_DAY = "This day is closed, so its note can't be restored.";
const READ_ONLY = "This note is read only, so a version can't be restored.";
const UNSAVED =
  "Couldn't save the text you typed, so nothing was restored. Try again.";

const ROW =
  'flex min-h-10 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13.5px] font-medium text-text outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:bg-accent-soft aria-[current=true]:font-semibold aria-[current=true]:text-accent-ink pointer-coarse:min-h-11';

interface Group {
  key: string;
  label: string;
  items: NoteVersion[];
}

/** "yyyy-MM-dd" minus one calendar day, on the calendar and not the clock (a day with 23 or 25 hours is still one day). */
function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The versions by the day they were kept, in the person's time zone; the list is already newest first. */
function groupByDay(
  versions: readonly NoteVersion[],
  timeZone: string,
  now: Date,
): Group[] {
  const today = localDate(now.toISOString(), timeZone);
  const yesterday = dayBefore(today);
  const groups: Group[] = [];
  for (const v of versions) {
    const date = localDate(v.savedAt, timeZone);
    let group = groups.at(-1);
    if (group?.key !== date) {
      group = {
        key: date,
        label:
          date === today
            ? 'Today'
            : date === yesterday
              ? 'Yesterday'
              : dayLabel(date, {
                  year: date.slice(0, 4) !== today.slice(0, 4),
                }),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(v);
  }
  return groups;
}

export interface VersionHistoryProps {
  /** The stored note; none for a note that is not stored yet (it has no versions). */
  noteId: string | undefined;
  /** A finished day's note: the history reads, and nothing restores. */
  readOnly: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** What the dialog grows out of, and where focus goes on closing. */
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  /** The note's text as the editor holds it now: what "Current" shows. */
  current: unknown;
  /** Draws a body read-only (the editor does; this file does not import it). */
  preview(body: unknown): ReactNode;
  /** The note as stored after a restore, the version it came from, and that version's time as the dialog shows it ("Wed 25 Nov, 14:20"). */
  onRestored(entry: JournalEntry, version: NoteVersion, when: string): void;
  /**
   * Runs first when a restore is confirmed: the host saves the text it still
   * holds (typing on its way, or held after a failed write), so the version the
   * restore keeps as "before restore" is the text on screen. A rejection stops
   * the restore, and the dialog says so.
   */
  beforeRestore?: () => Promise<void>;
}

export function VersionHistory({
  noteId,
  readOnly,
  open,
  onOpenChange,
  origin,
  returnFocus,
  current,
  preview,
  onRestored,
  beforeRestore,
}: VersionHistoryProps): React.JSX.Element | null {
  const timeZone = usePrefs().data?.timeZone ?? 'UTC';
  const title = useJournalEntry(noteId ?? '').data?.title;
  const versions = useNoteVersions(noteId);
  const restore = useRestoreVersion();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Each opening starts on the newest version.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setConfirming(false);
    }
  }

  const list = versions.data ?? [];
  const chosen =
    picked === CURRENT
      ? CURRENT
      : (list.find((v) => v.id === picked)?.id ?? list[0]?.id ?? CURRENT);
  const version = list.find((v) => v.id === chosen);
  const groups = groupByDay(list, timeZone, new Date());
  const when = (v: NoteVersion) =>
    `${dayLabel(localDate(v.savedAt, timeZone), { year: false })}, ${clock(v.savedAt, timeZone, false)}`;
  const canRestore = !readOnly && version !== undefined;

  const empty = versions.isSuccess && list.length === 0;
  const list_ = (
    <nav
      aria-label="Versions"
      className="overflow-y-auto pt-1 pr-3 pb-4 pl-5 max-sm:max-h-[210px] max-sm:border-b max-sm:border-line sm:border-r sm:border-line sm:pl-6"
    >
      <button
        type="button"
        aria-current={chosen === CURRENT}
        onClick={() => setPicked(CURRENT)}
        className={ROW}
      >
        <span>Current</span>
        <small className="ml-auto text-[12px] font-normal text-faint">
          Now
        </small>
      </button>
      {groups.map((g) => (
        <Fragment key={g.key}>
          <p className="px-2.5 pt-3 pb-1 text-[12.5px] text-faint">{g.label}</p>
          {g.items.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-current={chosen === v.id}
              onClick={() => setPicked(v.id)}
              className={ROW}
            >
              <span className="tabular-nums">
                {clock(v.savedAt, timeZone, false)}
              </span>
              {v.kind === 'before-restore' ? (
                <Chip className="ml-auto">Before restore</Chip>
              ) : null}
            </button>
          ))}
        </Fragment>
      ))}
    </nav>
  );

  const body =
    chosen === CURRENT || version === undefined ? current : version.body;
  const heading = version === undefined ? 'Current' : when(version);

  return (
    <>
      <MorphDialog
        open={open}
        onOpenChange={onOpenChange}
        origin={origin}
        returnFocus={returnFocus}
        title="Version history"
        description={`${title ? `${title}. ` : ''}Versions are kept for 30 days.`}
        size="large"
        footer={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] text-faint max-sm:basis-full">
              {readOnly
                ? READ_ONLY
                : empty
                  ? ''
                  : 'Restoring saves the current note as a version first.'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {canRestore ? (
                <Button onClick={() => setConfirming(true)}>
                  <ClockCounterClockwise size={16} aria-hidden="true" />
                  Restore this version
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        {versions.isError ? (
          <p role="alert" className="mt-3 text-[13.5px] text-loss">
            Couldn&apos;t load the versions. Close this and try again.
          </p>
        ) : versions.isPending && noteId !== undefined ? (
          <p
            role="status"
            aria-busy="true"
            className="mt-3 text-[13.5px] text-muted"
          >
            Loading the versions
          </p>
        ) : empty || noteId === undefined ? (
          <div role="status" className="grid place-items-center px-4 py-14">
            <div className="max-w-[360px] text-center">
              <p className="text-[15px] font-semibold text-text">
                No earlier versions yet
              </p>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted">
                Keel keeps a version of a note after 5 minutes of editing, when
                you leave it, and before a restore. They stay for 30 days.
              </p>
            </div>
          </div>
        ) : (
          <div className="-mx-5 -mt-2 -mb-4 grid min-h-0 sm:-mx-6 sm:h-[min(480px,calc(80dvh-190px))] sm:grid-cols-[240px_minmax(0,1fr)]">
            {list_}
            <div className="px-5 pt-3 pb-5 sm:overflow-y-auto sm:px-6">
              <p className="mb-2 flex items-center gap-2 text-[12.5px] text-faint">
                <b className="text-[13.5px] font-semibold text-text">
                  {heading}
                </b>
                <span>Read only</span>
              </p>
              <div key={chosen}>{preview(body)}</div>
            </div>
          </div>
        )}
      </MorphDialog>
      <ConfirmDialog
        open={confirming}
        title="Restore this version?"
        body={
          version
            ? `The note's text goes back to how it was on ${when(version)}. Its title and tags stay as they are. The text it has now is kept as a version first, so you can come back to it.`
            : ''
        }
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!noteId || !version) return;
          if (beforeRestore) {
            try {
              await beforeRestore();
            } catch {
              throw new ConfirmFailure(UNSAVED);
            }
          }
          let entry: JournalEntry;
          try {
            entry = await restore.mutateAsync({
              noteId,
              versionId: version.id,
            });
          } catch (e) {
            if (e instanceof LockedDayError)
              throw new ConfirmFailure(CLOSED_DAY);
            throw e;
          }
          onRestored(entry, version, when(version));
          onOpenChange(false);
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
