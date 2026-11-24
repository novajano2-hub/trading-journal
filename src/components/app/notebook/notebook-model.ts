// What the Notebook's folders and list are made of, apart from React: which
// folder an entry is in, the counts, the order and the search.
import type { Icon } from '@phosphor-icons/react';
import {
  CalendarCheck,
  ClipboardText,
  NotePencil,
  Star,
  TrendUp,
} from '@phosphor-icons/react/dist/ssr';
import type { JournalEntry, JournalKind, WeekStart } from '@/domain/types';
import { weekFirstDay } from '@/domain/week';
import { docText } from '@/lib/note-text';

export type BuiltInFolder =
  | 'favourites'
  | 'trade-notes'
  | 'daily-journal'
  | 'sessions-recap'
  | 'my-notes';
/** A built-in folder, Trash, or `folder:{id}` for one of the user's own. */
export type FolderKey = BuiltInFolder | 'trash' | `folder:${string}`;

export const BUILT_IN_FOLDERS: readonly {
  key: BuiltInFolder;
  label: string;
  icon: Icon;
}[] = [
  { key: 'favourites', label: 'Favourites', icon: Star },
  { key: 'trade-notes', label: 'Trade notes', icon: TrendUp },
  { key: 'daily-journal', label: 'Daily journal', icon: CalendarCheck },
  { key: 'sessions-recap', label: 'Sessions recap', icon: ClipboardText },
  { key: 'my-notes', label: 'My notes', icon: NotePencil },
];

export const userFolderKey = (id: string): FolderKey => `folder:${id}`;

export const KIND_LABEL: Record<JournalKind, string> = {
  'daily-review': 'Daily review',
  'pre-market': 'Pre-market plan',
  'weekly-recap': 'Weekly recap',
  note: 'Note',
  'trade-note': 'Trade note',
};

/** Whether the entry is listed in the folder. Trash holds the trashed ones and nothing else does. */
export function inFolder(e: JournalEntry, key: FolderKey): boolean {
  if (key === 'trash') return e.deletedAt !== undefined;
  if (e.deletedAt !== undefined) return false;
  switch (key) {
    case 'favourites':
      return e.favorite === true;
    case 'trade-notes':
      return e.kind === 'trade-note';
    // A day's plan sits with that day's review.
    case 'daily-journal':
      return e.kind === 'daily-review' || e.kind === 'pre-market';
    case 'sessions-recap':
      return e.kind === 'weekly-recap';
    case 'my-notes':
      return e.kind === 'note' && e.folderId === undefined;
    default:
      return e.folderId === key.slice('folder:'.length);
  }
}

/** The built-in folder a kind opens in. */
export function folderOfKind(kind: JournalKind): FolderKey {
  switch (kind) {
    case 'trade-note':
      return 'trade-notes';
    case 'daily-review':
    case 'pre-market':
      return 'daily-journal';
    case 'weekly-recap':
      return 'sessions-recap';
    case 'note':
      return 'my-notes';
  }
}

/**
 * The weekly recap for the week `date` falls in: the live recap keyed on a day
 * of that week, so one keyed on the week's first day under the current setting
 * and one keyed on the Monday inside it (the key notes were stored under) are
 * both found, and a setting changed back finds the same notes. The earliest key
 * wins when there are two.
 */
export function weeklyRecapFor(
  entries: readonly JournalEntry[],
  date: string,
  weekStart?: WeekStart,
): JournalEntry | undefined {
  const first = weekFirstDay(date, weekStart);
  const end = new Date(Date.parse(`${first}T00:00:00Z`) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return entries
    .filter(
      (e) =>
        e.kind === 'weekly-recap' &&
        e.deletedAt === undefined &&
        e.date !== undefined &&
        e.date >= first &&
        e.date <= end,
    )
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
}

/** The day an entry is about: its date, else the day it was last written. */
export const entryDay = (e: JournalEntry): string =>
  e.date ?? e.updatedAt.slice(0, 10);

/** Newest day first, then the most recently written. */
export function newestFirst(a: JournalEntry, b: JournalEntry): number {
  const day = entryDay(b).localeCompare(entryDay(a));
  return day !== 0 ? day : b.updatedAt.localeCompare(a.updatedAt);
}

/** The lowercased text of each entry's body, by id: build it once per change of the journal. */
export function textIndex(
  entries: readonly JournalEntry[],
): Map<string, string> {
  return new Map(entries.map((e) => [e.id, docText(e.body).toLowerCase()]));
}

/** Whether the entry's title, text or tags hold the (lowercased, trimmed) query. */
export function matchesQuery(
  e: JournalEntry,
  query: string,
  text: ReadonlyMap<string, string>,
): boolean {
  return (
    e.title.toLowerCase().includes(query) ||
    (text.get(e.id) ?? '').includes(query) ||
    e.tags.some((t) => t.includes(query))
  );
}

/** Which page of the Notebook the address bar holds. */
export type Selection =
  | { type: 'none' }
  | { type: 'entry'; id: string }
  | { type: 'daily'; date: string };

const decoded = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export function selectionOf(pathname: string): Selection {
  const day = /^\/app\/notebook\/daily\/([^/]+)\/?$/.exec(pathname);
  if (day) return { type: 'daily', date: decoded(day[1]!) };
  const one = /^\/app\/notebook\/([^/]+)\/?$/.exec(pathname);
  return one ? { type: 'entry', id: decoded(one[1]!) } : { type: 'none' };
}

/** A real calendar date written YYYY-MM-DD. */
export function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  return (
    at.getUTCFullYear() === y &&
    at.getUTCMonth() === m - 1 &&
    at.getUTCDate() === d
  );
}
