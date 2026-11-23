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
import { DRAFT_ID, EntryPane } from './entry-pane';
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

const NOTICE_TEXT = 'Moved to Trash. Notes in Trash are deleted after 30 days.';
/** The notice stays this long (WCAG 2.2.1 asks for at least 20 s) unless dismissed. */
const NOTICE_MS = 30_000;

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

/**
 * A day's note. A day with a note opens it; a day without one opens a draft
 * from the default daily template, which writes nothing. Its first change
 * makes the note, and the pane (keyed by the date either way) stays put.
 */
function DailyPane({
  date,
  entries,
  template,
  props,
}: {
  date: string;
  entries: readonly JournalEntry[];
  template: JournalEntry['body'];
  props: Omit<React.ComponentProps<typeof EntryPane>, 'entry' | 'ensure'>;
}): React.JSX.Element {
  const { mutateAsync } = useDailyNote();
  const existing = entries.find(
    (e) =>
      e.kind === 'daily-review' && e.date === date && e.deletedAt === undefined,
  );
  const draft = useMemo(
    (): JournalEntry => ({
      id: DRAFT_ID,
      workspaceId: '',
      kind: 'daily-review',
      date,
      title: `Daily review, ${dayLabel(date)}`,
      body: structuredClone(template),
      linkedTradeIds: [],
      tags: [],
      updatedAt: '',
    }),
    [date, template],
  );
  return (
    <EntryPane
      key={date}
      entry={existing ?? draft}
      ensure={() => mutateAsync(date)}
      {...props}
    />
  );
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
  // The note "All notes" just left, whose row takes the focus back.
  const returnTo = useRef<string | null>(null);
  const listArea = useRef<HTMLDivElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  const selection = selectionOf(pathname);
  const entries = journal.data;
  const userFolders = folders.data;
  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);

  const browsingNow = selection.type === 'none';
  useEffect(() => {
    const id = returnTo.current;
    if (!browsingNow || id === null) return;
    const row = [
      ...(listArea.current?.querySelectorAll<HTMLElement>('[data-note-id]') ??
        []),
    ].find((a) => a.dataset.noteId === id);
    row?.focus();
    returnTo.current = null;
  }, [browsingNow]);
  // Trashing leaves the toolbar's button behind: Undo takes the focus.
  const noticeId = notice?.id;
  useEffect(() => {
    if (noticeId !== undefined) undoButton.current?.focus();
  }, [noticeId]);

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

  const moveToTrash = async (id: string) => {
    setProblem(null);
    try {
      await trash.mutateAsync(id);
      setNotice({ id });
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

  const dailyTemplate =
    templates.data.find((t) => t.kind === 'daily-review' && t.isDefault)
      ?.body ?? EMPTY_DOC;

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
    onTrash: (id: string) => void moveToTrash(id),
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
        template={dailyTemplate}
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
      {/* Always mounted, so a screen reader hears it fill. */}
      <div role="status" aria-label="Notebook notice" className="sr-only">
        {notice ? NOTICE_TEXT : ''}
      </div>
      {notice ? (
        <div
          role="group"
          aria-label="Undo moving to Trash"
          className="flex w-full max-w-[560px] items-center gap-3 rounded-control border border-line bg-surface-1 py-2 pr-2 pl-4 text-[14px] text-text shadow-[var(--shadow)]"
        >
          <NoticeTimer onDone={() => setNotice(null)} />
          <span aria-hidden="true" className="min-w-0 flex-1">
            {NOTICE_TEXT}
          </span>
          <button
            ref={undoButton}
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
      <div
        className={`grid min-w-0 gap-3 ${notice ? 'lg:h-[calc(100dvh-150px)]' : 'lg:h-[calc(100dvh-88px)]'} lg:grid-cols-[200px_300px_minmax(0,1fr)] lg:gap-4`}
      >
        <div
          ref={listArea}
          className={browsing ? 'contents' : 'contents max-lg:hidden'}
        >
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
            onClick={() => {
              // Keep the folder the note sat in, so its row is there to focus.
              setChosen(current);
              returnTo.current = open?.id ?? null;
            }}
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

/** Takes the notice down after `NOTICE_MS`. */
function NoticeTimer({ onDone }: { onDone(): void }): null {
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => latest.current(), NOTICE_MS);
    return () => clearTimeout(id);
  }, []);
  return null;
}
