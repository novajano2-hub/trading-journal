// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { LockedDayError, type Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { DayRecord, JournalEntry, Trade, UserPrefs } from '@/domain/types';
import { renderApp as render } from '../../__fixtures__/render-app';
import { DayNoteAction } from './day-note-dialog';
import { TradesDayView } from './day-view';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = fixtureSample().trades[0]!.workspaceId;

const trade = (p: Partial<Trade> & { net: number }): Trade =>
  makeTrade({ workspaceId: WS, accountId: 'acc-a', ...p });

/** Tue 24 Nov: +$100, -$40 and an open trade. Mon 23 Nov: +$25. */
function trades(): Trade[] {
  return [
    trade({
      id: 'a1',
      serial: 1,
      net: 10_000,
      openedAt: '2026-11-24T14:30:00Z',
      closedAt: '2026-11-24T14:50:00Z',
    }),
    trade({
      id: 'a2',
      serial: 2,
      net: -4000,
      openedAt: '2026-11-24T15:00:00Z',
      closedAt: '2026-11-24T15:20:00Z',
    }),
    trade({
      id: 'a3',
      serial: 3,
      status: 'open',
      net: 0,
      openedAt: '2026-11-24T16:00:00Z',
    }),
    trade({
      id: 'b1',
      serial: 4,
      net: 2500,
      openedAt: '2026-11-23T15:00:00Z',
      closedAt: '2026-11-23T15:30:00Z',
    }),
  ];
}

/**
 * A trashed note's `deletedAt`: an hour before now, as the clock really runs
 * (Trash purges a note after 30 days, so a fixed date would one day be purged).
 */
const anHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

const dailyNote = (date: string, extra: Partial<JournalEntry> = {}) =>
  ({
    id: `note-${date}`,
    workspaceId: WS,
    kind: 'daily-review',
    date,
    title: date,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `About ${date}` }],
        },
      ],
    },
    linkedTradeIds: [],
    tags: [],
    updatedAt: '2026-11-25T00:00:00Z',
    ...extra,
  }) satisfies JournalEntry;

async function renderApp(
  opts: {
    journal?: JournalEntry[];
    days?: DayRecord[];
    prefs?: Partial<UserPrefs>;
    url?: string;
    /** More trades on top of the day's own. */
    extra?: Trade[];
    patch?: (repo: Repository) => Partial<Repository>;
  } = {},
): Promise<{ repo: Repository }> {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async (): Promise<SampleWorkspace> => ({
      ...fixtureSample(),
      trades: [...trades(), ...(opts.extra ?? [])],
      journal: opts.journal ?? [dailyNote('2026-11-22')],
      days: opts.days ?? [],
    }),
  });
  await base.prefs.update({ timeZone: 'UTC', ...opts.prefs });
  // `patch` replaces parts of the repository, to hold or fail a write.
  const repository = { ...base, ...opts.patch?.(base) };
  const { repo } = render(
    <TradesDayView noteAction={(date) => <DayNoteAction date={date} />} />,
    { repository, url: opts.url ?? '/app/trades/day' },
  );
  return { repo };
}

const card = async (heading: string) => {
  const all = await screen.findAllByRole('article');
  return all.find(
    (c) => within(c).getByRole('heading').textContent === heading,
  )!;
};

const TUE = 'Tue 24 Nov 2026';
const MON = 'Mon 23 Nov 2026';
const SUN = 'Sun 22 Nov 2026';

async function open(heading: string, name: 'Add note' | 'View note') {
  const c = await card(heading);
  fireEvent.click(within(c).getByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Day note' });
}

const tiptapOf = (box: HTMLElement) =>
  (
    box as unknown as {
      editor: { commands: { insertContent(text: string): boolean } };
    }
  ).editor;

const dailyOn = async (repo: Repository, date: string) =>
  (await repo.journal.list(WS)).find(
    (e) => e.kind === 'daily-review' && e.date === date,
  );

test('the note action reads Add note, or View note once the date has a note, a trashed one too', async () => {
  const trashed = dailyNote('2026-11-23', {
    deletedAt: anHourAgo(),
  });
  await renderApp({ journal: [dailyNote('2026-11-22'), trashed] });
  expect(
    within(await card(TUE)).getByRole('button', { name: 'Add note' }),
  ).toBeTruthy();
  // E109: a note in Trash is still the date's note, so the dialog shows it with Restore.
  expect(
    within(await card(MON)).getByRole('button', { name: 'View note' }),
  ).toBeTruthy();
  expect(
    within(await card(SUN)).getByRole('button', { name: 'View note' }),
  ).toBeTruthy();
});

test('the dialog autosaves, and Save flushes and closes', async () => {
  const { repo } = await renderApp();
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Waited for the open');
  // Autosave: the note is stored without pressing Save.
  await waitFor(
    async () =>
      expect(
        JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body),
      ).toContain('Waited for the open'),
    { timeout: 3000 },
  );
  await within(dialog).findByText(/^Saved /, undefined, { timeout: 3000 });
  // Save flushes what is still waiting, then closes.
  tiptapOf(box).commands.insertContent(' and the retest');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body)).toContain(
    'and the retest',
  );
});

test('closing with the X flushes a pending edit too (Keel: autosave leaves nothing to discard)', async () => {
  const { repo } = await renderApp();
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Closed in a hurry');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(
    async () =>
      expect(
        JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body),
      ).toContain('Closed in a hurry'),
    { timeout: 3000 },
  );
});

test('reopening shows the saved text, and the card now offers View note', async () => {
  await renderApp();
  const first = await open(TUE, 'Add note');
  const box = await within(first).findByRole('textbox', { name: 'Daily note' });
  tiptapOf(box).commands.insertContent('Kept for later');
  fireEvent.click(within(first).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const again = await open(TUE, 'View note');
  await within(
    await within(again).findByRole('textbox', { name: 'Daily note' }),
  ).findByText(/Kept for later/);
});

const FINISHED_MON: DayRecord = {
  id: '2026-11-23',
  workspaceId: WS,
  finishedAt: '2026-11-23T22:00:00Z',
};
const FINISHED_TUE: DayRecord = {
  id: '2026-11-24',
  workspaceId: WS,
  finishedAt: '2026-11-24T22:00:00Z',
};

/** Done, then Escape: each closes the dialog. */
async function closeBothWays(heading: string, name: 'Add note' | 'View note') {
  const first = await open(heading, name);
  fireEvent.click(within(first).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const second = await open(heading, name);
  fireEvent.keyDown(second, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

/** The "..." menu of a note that cannot change: export and import stay, Move to Trash is not there. */
async function menuKeeps(dialog: HTMLElement) {
  fireEvent.keyDown(within(dialog).getByRole('button', { name: 'More' }), {
    key: 'Enter',
  });
  const menu = await screen.findByRole('menu');
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Export as PDF', 'Export as Keel note', 'Import a Keel note']);
  // It fades over a dialog: a closing menu takes no pointer (`!` beats Radix's inline value).
  expect(menu.className).toContain('data-[state=closed]:pointer-events-none!');
  fireEvent.keyDown(menu, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

test('it is read-only with the lock line on a finished day (no Template, star or Move to Trash), and refuses every write', async () => {
  const { repo } = await renderApp({
    journal: [dailyNote('2026-11-23')],
    days: [FINISHED_MON],
  });
  const before = await repo.journal.list(WS);
  const dialog = await open(MON, 'View note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  expect(box.getAttribute('contenteditable')).toBe('false');
  expect(within(dialog).getByRole('note').textContent).toBe(
    'This day is closed. Its note is locked.',
  );
  expect(
    within(dialog).queryByRole('button', { name: 'Insert a template' }),
  ).toBeNull();
  expect(
    within(dialog).queryByRole('button', { name: 'Favourite' }),
  ).toBeNull();
  // The menu keeps the note's export and import, and has no Move to Trash.
  await menuKeeps(dialog);
  // Nothing to save: the footer button closes.
  expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await closeBothWays(MON, 'View note');
  // Opening and closing, Done or Escape, wrote nothing.
  expect(await repo.journal.list(WS)).toEqual(before);
});

test('a finished day with no note stays without one: nothing is created by opening or closing', async () => {
  const { repo } = await renderApp({ days: [FINISHED_TUE] });
  const before = await repo.journal.list(WS);
  expect(await dailyOn(repo, '2026-11-24')).toBeUndefined();
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  expect(box.getAttribute('contenteditable')).toBe('false');
  expect(within(dialog).getAllByText(/This day is closed/)).toHaveLength(1);
  // The star and the notebook link have no note to act on.
  expect(
    within(dialog).queryByRole('link', { name: 'Open in Notebook' }),
  ).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await closeBothWays(TUE, 'Add note');
  expect(await repo.journal.list(WS)).toEqual(before);
  expect(
    JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body ?? {}),
  ).not.toContain('Text');
});

test('a finished day with a note in Trash has no Restore and exactly one lock line, and writes nothing', async () => {
  const { repo } = await renderApp({
    journal: [dailyNote('2026-11-23', { deletedAt: anHourAgo() })],
    days: [FINISHED_MON],
  });
  const before = await repo.journal.list(WS);
  const dialog = await open(MON, 'View note');
  expect(
    await within(dialog).findByText("This day's note is in Trash."),
  ).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: 'Restore' })).toBeNull();
  expect(within(dialog).getAllByText(/This day is closed/)).toHaveLength(1);
  expect(
    (
      await within(dialog).findByRole('textbox', { name: 'Daily note' })
    ).getAttribute('contenteditable'),
  ).toBe('false');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await closeBothWays(MON, 'View note');
  expect(await repo.journal.list(WS)).toEqual(before);
});

test('Move to Trash sits in its menu, and the dialog then shows the trashed note with Restore (R26)', async () => {
  const { repo } = await renderApp({ journal: [dailyNote('2026-11-23')] });
  const dialog = await open(MON, 'View note');
  // It is not a button of its own in the header.
  expect(
    within(dialog).queryByRole('button', { name: 'Move to Trash' }),
  ).toBeNull();
  fireEvent.keyDown(within(dialog).getByRole('button', { name: 'More' }), {
    key: 'Enter',
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to Trash' }),
  );
  await waitFor(async () =>
    expect((await dailyOn(repo, '2026-11-23'))?.deletedAt).toBeDefined(),
  );
  // R26: the dialog stays, showing the trashed state.
  expect(
    await within(dialog).findByText("This day's note is in Trash."),
  ).toBeTruthy();
  expect(
    (
      await within(dialog).findByRole('textbox', { name: 'Daily note' })
    ).getAttribute('contenteditable'),
  ).toBe('false');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
  await waitFor(async () =>
    expect((await dailyOn(repo, '2026-11-23'))?.deletedAt).toBeUndefined(),
  );
  await waitFor(() =>
    expect(
      (
        within(dialog).getByRole('textbox', {
          name: 'Daily note',
        }) as HTMLElement
      ).getAttribute('contenteditable'),
    ).toBe('true'),
  );
});

test('a note in Trash opens with Restore, read-only', async () => {
  await renderApp({
    journal: [dailyNote('2026-11-23', { deletedAt: anHourAgo() })],
  });
  const dialog = await open(MON, 'View note');
  expect(
    await within(dialog).findByText("This day's note is in Trash."),
  ).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Restore' })).toBeTruthy();
  await menuKeeps(dialog);
});

test('the star and Open in Notebook wait for the note, then the star favourites it and the link opens it', async () => {
  const { repo } = await renderApp();
  const dialog = await open(TUE, 'Add note');
  const star = within(dialog).getByRole('button', { name: 'Favourite' });
  expect(star.getAttribute('aria-disabled')).toBe('true');
  // The link needs the note too: it is not a link until there is one.
  expect(
    within(dialog).queryByRole('link', { name: 'Open in Notebook' }),
  ).toBeNull();
  expect(
    within(dialog)
      .getByRole('button', { name: 'Open in Notebook' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  fireEvent.click(star);
  expect(await dailyOn(repo, '2026-11-24')).toBeUndefined();

  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Worth keeping');
  await waitFor(
    async () => expect(await dailyOn(repo, '2026-11-24')).toBeDefined(),
    {
      timeout: 3000,
    },
  );
  await waitFor(() =>
    expect(
      within(dialog)
        .getByRole('button', { name: 'Favourite' })
        .getAttribute('aria-disabled'),
    ).toBeNull(),
  );
  const note = (await dailyOn(repo, '2026-11-24'))!;
  expect(
    within(dialog)
      .getByRole('link', { name: 'Open in Notebook' })
      .getAttribute('href'),
  ).toBe(`/app/notebook/${encodeURIComponent(note.id)}`);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Favourite' }));
  await waitFor(async () =>
    expect((await dailyOn(repo, '2026-11-24'))?.favorite).toBe(true),
  );
  // The star keeps the text.
  expect(JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body)).toContain(
    'Worth keeping',
  );
  await waitFor(() =>
    expect(
      within(dialog)
        .getByRole('button', { name: 'Favourite' })
        .getAttribute('aria-pressed'),
    ).toBe('true'),
  );
});

test('Template, in the editor toolbar, inserts a template at the cursor', async () => {
  const { repo } = await renderApp();
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  fireEvent.keyDown(
    await within(dialog).findByRole('button', { name: 'Insert a template' }),
    {
      key: 'Enter',
    },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Daily game plan' }),
  );
  await within(box).findByText('What I will trade');
  await waitFor(
    async () =>
      expect(
        JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body),
      ).toContain('What I will trade'),
    { timeout: 3000 },
  );
});

test('Escape in full screen leaves full screen and keeps the dialog open', async () => {
  await renderApp();
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Full screen' }),
  );
  await screen.findByRole('dialog', { name: 'Daily note, full screen' });

  // The dialog's own Escape listener is on the document, ahead of the editor's:
  // the editor's has to run first, take the key, and leave the dialog alone.
  const escape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    box.dispatchEvent(escape);
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Daily note, full screen' }),
    ).toBeNull(),
  );
  expect(screen.getByRole('dialog', { name: 'Day note' })).toBeTruthy();
  expect(escape.defaultPrevented).toBe(true);

  // With nothing in full screen, the same key is the dialog's: it closes.
  act(() => {
    box.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('after a restore, the star saves on top of the restored text, not the copy the dialog opened with', async () => {
  const earlier = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'An earlier day' }],
      },
    ],
  };
  const { repo } = await renderApp({ journal: [dailyNote('2026-11-23')] });
  await repo.noteVersions.keep(WS, 'note-2026-11-23', earlier, 'auto');
  const dialog = await open(MON, 'View note');
  await within(dialog).findByRole('textbox', { name: 'Daily note' });
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Version history' }),
  );
  const history = await screen.findByRole('dialog', {
    name: 'Version history',
  });
  fireEvent.click(
    await within(history).findByRole('button', {
      name: 'Restore this version',
    }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  // The journal is read back as it was before the restore (a read that has
  // not caught up): the restore's own answer is what is newer.
  const stale = await repo.journal.list(WS);
  vi.spyOn(repo.journal, 'list').mockResolvedValue(stale);
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'note-2026-11-23'))!.body).toEqual(
      earlier,
    ),
  );
  await within(dialog).findByText(/^Restored the version from/);

  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Favourite' }),
  );
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'note-2026-11-23'))!.favorite).toBe(
      true,
    ),
  );
  // Starring did not bring the old text back.
  expect((await repo.journal.get(WS, 'note-2026-11-23'))!.body).toEqual(
    earlier,
  );
});

test('a failed write followed by a restore does not flush the old text over the restored note, and the failure is let go', async () => {
  const earlier = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'An earlier day' }],
      },
    ],
  };
  const { repo } = await renderApp({ journal: [dailyNote('2026-11-23')] });
  await repo.noteVersions.keep(WS, 'note-2026-11-23', earlier, 'auto');
  const dialog = await open(MON, 'View note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  // Typed text whose write fails: the dialog says so, and holds the text.
  vi.spyOn(repo.journal, 'save').mockRejectedValueOnce(new Error('disk full'));
  const editor = (box as unknown as { editor: Editor }).editor;
  act(() => {
    editor.commands.insertContent(' and then some typed text');
  });
  expect(
    await within(dialog).findByText("Couldn't save. Press Save to try again.", {
      exact: false,
    }),
  ).toBeTruthy();

  // A restore lands (it is its own write, and it succeeds).
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Version history' }),
  );
  const history = await screen.findByRole('dialog', {
    name: 'Version history',
  });
  fireEvent.click(
    await within(history).findByRole('button', {
      name: 'Restore this version',
    }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });
  await within(dialog).findByText(/^Restored the version from/);
  // The failure is let go with the text it was about.
  await waitFor(() =>
    expect(
      within(dialog).queryByText("Couldn't save. Press Save to try again."),
    ).toBeNull(),
  );

  // Save writes what is waiting: nothing is, so the restored note stands.
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await repo.journal.get(WS, 'note-2026-11-23'))!.body).toEqual(
    earlier,
  );
});

/**
 * Holds the editor's 600 ms save timer, so typed text stays waiting until
 * something else writes it; every other timer runs as it would.
 */
const realSetTimeout = globalThis.setTimeout;
function holdSaveTimer() {
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    fn: () => void,
    ms?: number,
    ...rest: unknown[]
  ) =>
    ms === 600
      ? (0 as unknown as ReturnType<typeof setTimeout>)
      : realSetTimeout(fn, ms, ...rest)) as typeof setTimeout);
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
}

const textOf = (body: unknown) => JSON.stringify(body);

test('text still waiting to save is saved before a restore, and kept as the version before it', async () => {
  const earlier = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'An earlier day' }],
      },
    ],
  };
  const { repo } = await renderApp({ journal: [dailyNote('2026-11-23')] });
  await repo.noteVersions.keep(WS, 'note-2026-11-23', earlier, 'auto');
  const dialog = await open(MON, 'View note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  holdSaveTimer();
  const editor = (box as unknown as { editor: Editor }).editor;
  act(() => {
    editor.commands.insertContent(' and the typed close');
  });
  // The typing is on screen and not yet stored.
  expect(
    textOf((await repo.journal.get(WS, 'note-2026-11-23'))!.body),
  ).not.toContain('the typed close');

  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Version history' }),
  );
  const history = await screen.findByRole('dialog', {
    name: 'Version history',
  });
  fireEvent.click(
    await within(history).findByRole('button', {
      name: 'Restore this version',
    }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });
  await within(dialog).findByText(/^Restored the version from/);
  expect((await repo.journal.get(WS, 'note-2026-11-23'))!.body).toEqual(
    earlier,
  );
  // The text on screen before the restore is the version kept before it.
  const [before] = await repo.noteVersions.list(WS, 'note-2026-11-23');
  expect(before!.kind).toBe('before-restore');
  expect(textOf(before!.body)).toContain('the typed close');
});

test('a restore whose waiting text cannot be saved first restores nothing, and says so', async () => {
  const earlier = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'An earlier day' }],
      },
    ],
  };
  const { repo } = await renderApp({ journal: [dailyNote('2026-11-23')] });
  await repo.noteVersions.keep(WS, 'note-2026-11-23', earlier, 'auto');
  const dialog = await open(MON, 'View note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  holdSaveTimer();
  const editor = (box as unknown as { editor: Editor }).editor;
  act(() => {
    editor.commands.insertContent(' and the typed close');
  });
  vi.spyOn(repo.journal, 'save').mockRejectedValue(new Error('disk full'));
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Version history' }),
  );
  const history = await screen.findByRole('dialog', {
    name: 'Version history',
  });
  fireEvent.click(
    await within(history).findByRole('button', {
      name: 'Restore this version',
    }),
  );
  const ask = await screen.findByRole('dialog', {
    name: 'Restore this version?',
  });
  await act(async () => {
    fireEvent.click(within(ask).getByRole('button', { name: 'Restore' }));
  });
  expect(
    await within(ask).findByText(
      "Couldn't save the text you typed, so nothing was restored. Try again.",
    ),
  ).toBeTruthy();
  // The stored note and its versions are as they were.
  expect(
    textOf((await repo.journal.get(WS, 'note-2026-11-23'))!.body),
  ).toContain('About 2026-11-23');
  expect(await repo.noteVersions.list(WS, 'note-2026-11-23')).toHaveLength(1);
  expect(textOf(editor.getJSON())).toContain('the typed close');
});

test('the summary row reads the date, the net and the count with the win rate, and expands to the trades', async () => {
  await renderApp();
  const dialog = await open(TUE, 'Add note');
  const summary = within(dialog).getByRole('button', { name: /Show trades/ });
  expect(summary.textContent).toContain('Tue 24 Nov');
  expect(summary.textContent).toContain('+$60.00');
  expect(summary.textContent).toContain('3 trades, 50% win rate');
  expect(summary.getAttribute('aria-expanded')).toBe('false');
  expect(within(dialog).queryByRole('table')).toBeNull();
  fireEvent.click(summary);
  expect(summary.getAttribute('aria-expanded')).toBe('true');
  const table = await within(dialog).findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  fireEvent.click(within(dialog).getByRole('button', { name: /Hide trades/ }));
  expect(within(dialog).queryByRole('table')).toBeNull();
});

test('the summary of a day with no trades says so', async () => {
  await renderApp();
  const note = await open(SUN, 'View note');
  const summary = within(note).getByRole('button', { name: /Show trades/ });
  expect(summary.textContent).toContain('Sun 22 Nov');
  expect(summary.textContent).toContain('No trades this day');
});

test('under Privacy the summary hides the amount, keeps the sign, count and win rate', async () => {
  await renderApp({ prefs: { displayUnit: 'privacy' } });
  const dialog = await open(TUE, 'Add note');
  const summary = within(dialog).getByRole('button', { name: /Show trades/ });
  expect(summary.textContent).toContain('+$•••');
  expect(summary.textContent).not.toMatch(/\$\d/);
  expect(summary.textContent).toContain('3 trades, 50% win rate');
});

test('the note action on a phone is a glyph that names the day', async () => {
  const match = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  await renderApp();
  // Below sm the header drops the year; the glyph's name keeps it.
  const c = (await screen.findAllByRole('article'))[0]!;
  const button = within(c).getByRole('button', {
    name: 'Add note Tue 24 Nov 2026',
  });
  expect(button.textContent).toBe('');
  match.mockRestore();
});

test('a day with trades and none closed reads "win rate None", not "None win rate"', async () => {
  await renderApp({
    extra: [
      trade({
        id: 'o1',
        serial: 9,
        status: 'open',
        net: 0,
        openedAt: '2026-11-21T15:00:00Z',
      }),
    ],
  });
  const dialog = await open('Sat 21 Nov 2026', 'Add note');
  const summary = within(dialog).getByRole('button', { name: /Show trades/ });
  expect(summary.textContent).toContain('1 trade, win rate None');
  expect(summary.textContent).not.toContain('None win rate');
});

test('a day with base and other-currency trades names the other ones, as the week tile does', async () => {
  await renderApp({
    extra: [
      trade({
        id: 'e1',
        serial: 9,
        net: 5000,
        pnlCurrency: 'EUR',
        openedAt: '2026-11-23T13:00:00Z',
        closedAt: '2026-11-23T13:10:00Z',
      }),
    ],
  });
  const dialog = await open(MON, 'Add note');
  const summary = within(dialog).getByRole('button', { name: /Show trades/ });
  expect(summary.textContent).toContain(
    '1 trade, 100% win rate, 1 in other currencies, listed apart',
  );
  cleanup();
  // A day of other currencies only keeps its own line.
  await renderApp({
    extra: [
      trade({
        id: 'e2',
        serial: 9,
        net: 5000,
        pnlCurrency: 'EUR',
        openedAt: '2026-11-21T13:00:00Z',
        closedAt: '2026-11-21T13:10:00Z',
      }),
    ],
  });
  const only = await open('Sat 21 Nov 2026', 'Add note');
  expect(
    within(only).getByRole('button', { name: /Show trades/ }).textContent,
  ).toContain('1 trade in other currencies, listed apart');
});

/** A failing write: on while `failing.on`, then the real one. */
function failingSaves(failing: { on: boolean }) {
  return (r: Repository): Partial<Repository> => ({
    journal: {
      ...r.journal,
      save: (ws, draft) =>
        failing.on
          ? Promise.reject(new Error('boom'))
          : r.journal.save(ws, draft),
    },
  });
}

test('after a failed write the X and Escape keep the dialog open with the alert, and close once the retry lands', async () => {
  const failing = { on: true };
  const { repo } = await renderApp({ patch: failingSaves(failing) });
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Text the store refused');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  // Save stays open; so do the X and Escape, which used to lose the text.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
  expect(screen.queryByRole('dialog', { name: 'Day note' })).not.toBeNull();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
  expect(screen.queryByRole('dialog', { name: 'Day note' })).not.toBeNull();
  expect(within(dialog).getByRole('alert')).toBeTruthy();
  // The store works again: closing retries, and the text is kept.
  failing.on = false;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body)).toContain(
    'Text the store refused',
  );
});

test('after a failed write, "Close without saving" lets the text go', async () => {
  const failing = { on: true };
  const { repo } = await renderApp({ patch: failingSaves(failing) });
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Text the store refused');
  expect(
    within(dialog).queryByRole('button', { name: 'Close without saving' }),
  ).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Close without saving' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body ?? {}),
  ).not.toContain('Written');
});

test('a day closed meanwhile closes the dialog at once, whatever the retry', async () => {
  const { repo } = await renderApp({
    patch: (r) => ({
      journal: {
        ...r.journal,
        save: () => Promise.reject(new LockedDayError()),
      },
    }),
  });
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Written as the day closed');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body ?? {}),
  ).not.toContain('Written');
});

test("the star writes in the editor's queue: star, then type, then Save keeps both", async () => {
  // The star's write is held; the text typed after it must not land first and be written over, or the star lost.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { repo } = await renderApp({
    journal: [dailyNote('2026-11-23')],
    patch: (r) => ({
      journal: {
        ...r.journal,
        save: async (ws, draft) => {
          if (draft.favorite === true) await held;
          return r.journal.save(ws, draft);
        },
      },
    }),
  });
  const dialog = await open(MON, 'View note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Favourite' }));
  tiptapOf(box).commands.insertContent(' Added after the star.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  setTimeout(release, 120);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
    timeout: 3000,
  });
  const stored = (await dailyOn(repo, '2026-11-23'))!;
  expect(stored.favorite).toBe(true);
  expect(JSON.stringify(stored.body)).toContain('Added after the star.');
});

test('a failed star says so and leaves the note as it was', async () => {
  const failing = { on: true };
  const { repo } = await renderApp({
    journal: [dailyNote('2026-11-23')],
    patch: failingSaves(failing),
  });
  const dialog = await open(MON, 'View note');
  await within(dialog).findByRole('textbox', { name: 'Daily note' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Favourite' }));
  expect((await within(dialog).findByRole('alert')).textContent).toContain(
    "Couldn't favourite the note",
  );
  expect((await dailyOn(repo, '2026-11-23'))?.favorite).toBeUndefined();
});

test('Move to Trash stops while the editor holds text the store refused, and trashes once it is stored', async () => {
  const failing = { on: true };
  const { repo } = await renderApp({ patch: failingSaves(failing) });
  const dialog = await open(TUE, 'Add note');
  const box = await within(dialog).findByRole('textbox', {
    name: 'Daily note',
  });
  tiptapOf(box).commands.insertContent('Not stored yet');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  const trashViaMenu = async () => {
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'More' }), {
      key: 'Enter',
    });
    const item = await screen.findByRole('menuitem', {
      name: 'Move to Trash',
    });
    await waitFor(() => expect(item.getAttribute('data-disabled')).toBeNull());
    fireEvent.click(item);
  };
  await trashViaMenu();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
  // Nothing was trashed: the text on screen was never stored.
  expect((await dailyOn(repo, '2026-11-24'))?.deletedAt).toBeUndefined();
  expect(within(dialog).getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Day note' })).not.toBeNull();
  // The store works again: the retry lands the text, then the note is trashed.
  failing.on = false;
  await trashViaMenu();
  await waitFor(async () =>
    expect((await dailyOn(repo, '2026-11-24'))?.deletedAt).toBeDefined(),
  );
  expect(JSON.stringify((await dailyOn(repo, '2026-11-24'))?.body)).toContain(
    'Not stored yet',
  );
});
