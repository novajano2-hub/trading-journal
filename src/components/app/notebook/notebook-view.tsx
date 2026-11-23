'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowLeft,
  CalendarX,
  CaretDown,
  NotePencil,
  Plus,
  Warning,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import {
  useDailyNote,
  useFolders,
  useJournal,
  usePrefs,
  useRemoveJournalEntry,
  useRestoreJournalEntry,
  useSaveJournalEntry,
  useTemplates,
  useTrashJournalEntry,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { dayLabel, mondayOf } from '@/data/seed/calendar';
import { localDate } from '@/domain/time';
import type { JournalEntry, JournalKind } from '@/domain/types';
import { plural } from '@/lib/format';
import { ConfirmDialog } from '../confirm-dialog';
import { CARD } from '../dashboard/shared';
import { StateBlock } from '../strategies/strategy-states';
import { EntryList } from './entry-list';
import { EntryPane } from './entry-pane';
import { FolderRail } from './folder-rail';
import {
  BUILT_IN_FOLDERS,
  folderOfKind,
  inFolder,
  isRealDate,
  matchesQuery,
  newestFirst,
  selectionOf,
  textIndex,
  userFolderKey,
  type FolderKey,
} from './notebook-model';
import { TemplatesDialog } from './templates-dialog';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const MENU =
  'z-[60] min-w-[190px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';

/** What a new note of each kind (but a daily note) is called, on `today`. */
function titleFor(kind: JournalKind, today: string): string {
  switch (kind) {
    case 'pre-market':
      return `Plan for ${dayLabel(today)}`;
    case 'weekly-recap':
      return `Week of ${dayLabel(mondayOf(today), false)}`;
    default:
      return 'Untitled note';
  }
}

interface Notice {
  /** The note that went to Trash. */
  id: string;
}

function Skeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading the notebook"
      className="grid gap-4 px-5 pb-5 lg:grid-cols-[200px_300px_minmax(0,1fr)]"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`${CARD} h-[220px] lg:h-[calc(100dvh-100px)]`}
        />
      ))}
    </div>
  );
}

/** A day's note: opens the day's note, or makes it from the default daily template. */
function DailyPane({
  date,
  entries,
  props,
}: {
  date: string;
  entries: readonly JournalEntry[];
  props: Omit<React.ComponentProps<typeof EntryPane>, 'entry'>;
}): React.JSX.Element {
  const { mutateAsync } = useDailyNote();
  const [made, setMade] = useState<JournalEntry | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    mutateAsync(date).then(
      (e) => {
        if (live) setMade(e);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [date, mutateAsync]);

  if (failed)
    return (
      <StateBlock
        role="alert"
        visual={<IconTile icon={Warning} />}
        title="That day's note couldn't open."
        actions={
          <Link href="/app/notebook" className={buttonClasses('secondary')}>
            Back to the notebook
          </Link>
        }
      />
    );
  const current =
    made && made.date === date
      ? (entries.find((e) => e.id === made.id) ?? made)
      : undefined;
  if (!current)
    return (
      <div
        role="status"
        aria-label="Opening the day's note"
        className={`${CARD} min-h-[200px]`}
      />
    );
  return <EntryPane key={current.id} entry={current} {...props} />;
}

/**
 * The Notebook: folders, the notes in view, and the open note. The address bar
 * holds the open note (`/app/notebook/{id}`) or day (`/app/notebook/daily/{date}`);
 * the folder and the search are this view's own, and survive opening a note.
 */
export function NotebookView(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const journal = useJournal();
  const folders = useFolders();
  const templates = useTemplates();
  const prefs = usePrefs().data;
  const save = useSaveJournalEntry();
  const trash = useTrashJournalEntry();
  const restore = useRestoreJournalEntry();
  const remove = useRemoveJournalEntry();

  const [chosen, setChosen] = useState<FolderKey | null>(null);
  const [query, setQuery] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [forever, setForever] = useState<JournalEntry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const selection = selectionOf(pathname);
  const entries = journal.data;
  const userFolders = folders.data;
  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);

  const open: JournalEntry | undefined =
    selection.type === 'entry'
      ? entries?.find((e) => e.id === selection.id)
      : selection.type === 'daily'
        ? entries?.find(
            (e) =>
              e.kind === 'daily-review' &&
              e.date === selection.date &&
              e.deletedAt === undefined,
          )
        : undefined;

  // A folder you picked wins; before that, the one the open note belongs to.
  const known = (key: FolderKey) =>
    !key.startsWith('folder:') ||
    (userFolders ?? []).some((f) => userFolderKey(f.id) === key);
  const current: FolderKey =
    chosen !== null && known(chosen)
      ? chosen
      : open
        ? open.deletedAt !== undefined
          ? 'trash'
          : folderOfKind(open.kind)
        : 'daily-journal';

  const text = useMemo(() => textIndex(entries ?? []), [entries]);
  const counts = useMemo(() => {
    const out = new Map<FolderKey, number>();
    const keys: FolderKey[] = [
      ...BUILT_IN_FOLDERS.map((f) => f.key),
      'trash',
      ...(userFolders ?? []).map((f) => userFolderKey(f.id)),
    ];
    for (const key of keys)
      out.set(key, (entries ?? []).filter((e) => inFolder(e, key)).length);
    return out;
  }, [entries, userFolders]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const all = entries ?? [];
    return (
      q === ''
        ? all.filter((e) => inFolder(e, current))
        : // A search looks through every note (or, in Trash, every trashed one).
          all.filter(
            (e) =>
              (current === 'trash'
                ? e.deletedAt !== undefined
                : e.deletedAt === undefined) && matchesQuery(e, q, text),
          )
    ).sort(newestFirst);
  }, [entries, current, q, text]);

  const folderName =
    BUILT_IN_FOLDERS.find((f) => f.key === current)?.label ??
    (current === 'trash'
      ? 'Trash'
      : ((userFolders ?? []).find((f) => userFolderKey(f.id) === current)
          ?.name ?? 'Notes'));
  const heading =
    q === ''
      ? folderName
      : `${shown.length} ${plural(shown.length, 'match', 'matches')}`;

  const error = journal.error ?? folders.error ?? templates.error ?? null;
  if (error)
    return (
      <StateBlock
        role="alert"
        visual={<IconTile icon={Warning} />}
        title={
          error instanceof StorageUnavailableError
            ? "Keel can't open storage in this browser, so your notes can't load."
            : "Your notes couldn't load."
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              if (error instanceof StorageUnavailableError)
                window.location.reload();
              else void queryClient.resetQueries({ queryKey: ['keel'] });
            }}
          >
            Try again
          </Button>
        }
      />
    );
  if (!entries || !userFolders || !templates.data) return <Skeleton />;

  const moveToTrash = async (entry: JournalEntry) => {
    setProblem(null);
    try {
      await trash.mutateAsync(entry.id);
      setNotice({ id: entry.id });
      router.push('/app/notebook');
    } catch {
      setProblem("Couldn't move that note to Trash. Try again.");
    }
  };
  const undo = async (id: string) => {
    setNotice(null);
    try {
      await restore.mutateAsync(id);
      router.push(`/app/notebook/${encodeURIComponent(id)}`);
    } catch {
      setProblem("Couldn't bring that note back. Try Trash.");
    }
  };
  const restoreNow = async (entry: JournalEntry) => {
    setProblem(null);
    try {
      await restore.mutateAsync(entry.id);
    } catch {
      setProblem("Couldn't restore that note. Try again.");
    }
  };

  const make = async (kind: JournalKind) => {
    if (today === undefined) return;
    setProblem(null);
    if (kind === 'daily-review') {
      router.push(`/app/notebook/daily/${today}`);
      return;
    }
    const template = templates.data.find((t) => t.kind === kind && t.isDefault);
    const inUserFolder = current.startsWith('folder:')
      ? current.slice('folder:'.length)
      : undefined;
    try {
      const made = await save.mutateAsync({
        kind,
        date: today,
        title: titleFor(kind, today),
        body: structuredClone(template?.body ?? EMPTY_DOC),
        linkedTradeIds: [],
        tags: [],
        ...(kind === 'note' && inUserFolder ? { folderId: inUserFolder } : {}),
      });
      setQuery('');
      if (!(kind === 'note' && inUserFolder)) setChosen(folderOfKind(kind));
      router.push(`/app/notebook/${encodeURIComponent(made.id)}`);
    } catch {
      setProblem("Couldn't make that note. Try again.");
    }
  };

  const newMenu = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={today === undefined}
        className={`${buttonClasses('primary', 'sm')} w-full max-lg:w-auto max-lg:px-3.5`}
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
        New
        <CaretDown size={12} weight="bold" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={MENU}>
          {(
            [
              ['daily-review', 'Daily note'],
              ['pre-market', 'Pre-market plan'],
              ['weekly-recap', 'Weekly recap'],
              ['note', 'Note'],
            ] as const
          ).map(([kind, label]) => (
            <DropdownMenu.Item
              key={kind}
              className={MENU_ITEM}
              onSelect={() => void make(kind)}
            >
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const paneProps = {
    folders: userFolders,
    onTrash: () => open && void moveToTrash(open),
    onRestore: () => open && void restoreNow(open),
    onDeleteForever: () => open && setForever(open),
  };

  let pane: React.ReactNode;
  if (selection.type === 'none')
    pane = (
      <StateBlock
        visual={<IconTile icon={NotePencil} />}
        title="Pick a note to read it."
        body="Or start one from New: a daily note, a pre-market plan, a weekly recap or a plain note."
      />
    );
  else if (selection.type === 'daily')
    pane = isRealDate(selection.date) ? (
      <DailyPane
        key={selection.date}
        date={selection.date}
        entries={entries}
        props={paneProps}
      />
    ) : (
      <StateBlock
        visual={<IconTile icon={CalendarX} />}
        title="That day does not exist."
        body="Daily notes are named by a date like 2026-11-19."
        actions={
          <Link href="/app/notebook" className={buttonClasses('secondary')}>
            Back to the notebook
          </Link>
        }
      />
    );
  else if (open) pane = <EntryPane key={open.id} entry={open} {...paneProps} />;
  else
    pane = (
      <StateBlock
        visual={<IconTile icon={NotePencil} />}
        title="That note isn't here."
        body="It may have been deleted for good, or it belongs to another workspace."
        actions={
          <Link href="/app/notebook" className={buttonClasses('secondary')}>
            Back to the notebook
          </Link>
        }
      />
    );

  const browsing = selection.type === 'none';
  return (
    <div className="flex min-w-0 flex-col gap-3 px-5 pt-1 pb-5 lg:pt-0">
      {problem ? (
        <p role="alert" className="text-[13.5px] text-loss">
          {problem}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-3 lg:h-[calc(100dvh-88px)] lg:grid-cols-[200px_300px_minmax(0,1fr)] lg:gap-4">
        <div className={browsing ? 'contents' : 'contents max-lg:hidden'}>
          <FolderRail
            folders={userFolders}
            counts={counts}
            current={current}
            onSelect={(key) => {
              setChosen(key);
              setQuery('');
            }}
            onOpenTemplates={() => setTemplatesOpen(true)}
            newMenu={newMenu}
          />
          <EntryList
            entries={shown}
            selectedId={open?.id}
            trash={current === 'trash'}
            query={query}
            onQuery={setQuery}
            heading={heading}
            thisYear={(today ?? '').slice(0, 4)}
            empty={
              q !== ''
                ? 'No note matches that search.'
                : current === 'trash'
                  ? 'Trash is empty.'
                  : current === 'favourites'
                    ? 'Star a note to keep it here.'
                    : 'Nothing here yet.'
            }
          />
        </div>
        <div
          className={`flex min-h-0 min-w-0 flex-col gap-2 ${browsing ? 'max-lg:hidden' : ''}`}
        >
          <Link
            href="/app/notebook"
            className="inline-flex items-center gap-1.5 self-start rounded-chip text-[13.5px] font-medium text-muted hover:text-text lg:hidden pointer-coarse:min-h-11"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            All notes
          </Link>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col [&>article]:flex-1">
            {selection.type === 'none' ? (
              <div className={`${CARD} min-h-0 flex-1`}>{pane}</div>
            ) : (
              pane
            )}
          </div>
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          aria-label="Notebook notice"
          className="fixed bottom-4 left-1/2 z-40 flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-control border border-line bg-surface-1 py-2.5 pr-2 pl-4 text-[14px] text-text shadow-[var(--shadow)]"
        >
          <NoticeTimer onDone={() => setNotice(null)} />
          <span className="min-w-0 flex-1">
            Moved to Trash. Notes in Trash are deleted after 30 days.
          </span>
          <button
            type="button"
            onClick={() => void undo(notice.id)}
            className="rounded-chip px-2.5 text-[13.5px] font-semibold text-accent-ink outline-offset-0 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="grid size-8 place-items-center rounded-[8px] text-faint hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <ConfirmDialog
        open={forever !== null}
        title={`Delete ${forever?.title ?? ''} forever?`}
        body="The note is deleted for good. It can't be restored."
        confirmLabel="Delete forever"
        danger
        onConfirm={async () => {
          if (!forever) return;
          await remove.mutateAsync(forever.id);
          router.push('/app/notebook');
        }}
        onClose={() => setForever(null)}
      />
    </div>
  );
}

/** Takes the notice down after ten seconds. */
function NoticeTimer({ onDone }: { onDone(): void }): null {
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => latest.current(), 10_000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
