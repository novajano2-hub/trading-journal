// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import type { Repository } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { JournalEntry } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { NotebookView } from './notebook-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const entry = (
  e: Partial<JournalEntry> & Pick<JournalEntry, 'id' | 'kind' | 'title'>,
): JournalEntry => ({
  workspaceId: WS,
  body: para(`Body of ${e.title}`),
  linkedTradeIds: [],
  tags: [],
  updatedAt: '2026-11-19T20:00:00.000Z',
  ...e,
});

/**
 * The fixture, with 20 daily notes (the 20 weekdays to 2026-11-19), a
 * pre-market plan, a weekly recap, a note
 * that says "breakout" only in its body, a user folder "Ideas" with a note in
 * it, and a trade on the 19th: net $380.26, a win.
 */
function sample() {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    fx.journal[0]!.kind = 'trade-note';
    fx.journal[0]!.title = 'ESZ5 : 16 Nov 2026';
    const days: string[] = [];
    for (let d = Date.UTC(2026, 10, 19); days.length < 20; d -= 86_400_000) {
      const dow = new Date(d).getUTCDay();
      if (dow !== 0 && dow !== 6)
        days.unshift(new Date(d).toISOString().slice(0, 10));
    }
    for (const date of days)
      fx.journal.push(
        entry({
          id: `daily-${date}`,
          kind: 'daily-review',
          date,
          title: `Daily review, ${date}`,
          linkedTradeIds: date === '2026-11-19' ? ['t-19'] : [],
        }),
      );
    fx.journal.push(
      entry({
        id: 'n-pm',
        kind: 'pre-market',
        date: '2026-11-19',
        title: 'Opening bias',
      }),
      entry({
        id: 'n-wk',
        kind: 'weekly-recap',
        date: '2026-11-13',
        title: 'Week of 9 Nov',
      }),
      entry({
        id: 'n-plan',
        kind: 'note',
        title: 'Retest plan',
        date: '2026-11-18',
        body: para('Wait for the breakout to retest before sizing up.'),
        tags: ['plan'],
      }),
      entry({
        id: 'n-idea',
        kind: 'note',
        title: 'Idea note',
        date: '2026-11-12',
        folderId: 'folder-ideas',
      }),
    );
    fx.trades.push(
      makeTrade({
        id: 't-19',
        serial: 9,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: '2026-11-19T15:00:00.000Z',
        closedAt: '2026-11-19T15:30:00.000Z',
        net: 38_026,
        strategyIds: ['str-1'],
        ruleChecks: [
          { ruleId: 'r-1', followed: true },
          { ruleId: 'r-2', followed: false },
        ],
      }),
    );
    return fx;
  };
}

/** The folder "Ideas" is made first, so the page finds it when it loads. */
async function openWith(
  url: string,
  opts: {
    prefs?: Parameters<
      ReturnType<typeof createLocalRepository>['prefs']['update']
    >[0];
    /** Writes made before the page loads, which would not refresh a page already open. */
    prepare?: (repo: Repository, ideasId: string) => Promise<void>;
  } = {},
) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  const ideas = await repo.folders.create(WS, 'Ideas');
  await repo.prefs.update(opts.prefs ?? {});
  await opts.prepare?.(repo, ideas.id);
  return renderApp(<NotebookView />, { repository: repo, url });
}

const listItems = () =>
  within(screen.getByRole('list', { name: 'Notes' })).queryAllByRole(
    'listitem',
  );
const rail = () => screen.getByRole('navigation', { name: 'Folders' });

test('Daily journal lists the 20 daily reviews and the pre-market plan; Sessions recap the weekly recap only', async () => {
  await openWith('/app/notebook');
  await waitFor(() => expect(listItems()).toHaveLength(21));
  const daily = within(rail()).getByRole('button', { name: /Daily journal/ });
  expect(daily.getAttribute('aria-current')).toBe('true');
  expect(daily.textContent).toContain('21');
  expect(
    listItems().some((li) => li.textContent?.includes('Opening bias')),
  ).toBe(true);
  const recap = within(rail()).getByRole('button', { name: /Sessions recap/ });
  expect(recap.textContent).toContain('1');
  fireEvent.click(recap);
  await waitFor(() => expect(listItems()).toHaveLength(1));
  expect(listItems()[0]!.textContent).toContain('Week of 9 Nov');
  fireEvent.click(daily);
  await waitFor(() => expect(listItems()).toHaveLength(21));
  expect(
    within(rail()).getByRole('button', { name: /Trade notes/ }).textContent,
  ).toContain('1');
  expect(
    within(rail()).getByRole('button', { name: /Favourites/ }).textContent,
  ).toContain('0');
  // Built-in folders have no row menu; a user folder has.
  expect(
    screen.queryByRole('button', { name: 'Folder options: Daily journal' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Folder options: Ideas' }),
  ).toBeTruthy();
});

test('searching "breakout" finds the note whose body says it', async () => {
  await openWith('/app/notebook');
  await waitFor(() => expect(listItems()).toHaveLength(21));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), {
    target: { value: 'breakout' },
  });
  await waitFor(() => expect(listItems()).toHaveLength(1));
  expect(listItems()[0]!.textContent).toContain('Retest plan');
  // Tags are searched too.
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), {
    target: { value: 'plan' },
  });
  await waitFor(() => expect(listItems()).toHaveLength(1));
});

test('starring a note adds it to Favourites', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const star = await screen.findByRole('button', { name: 'Favourite' });
  expect(star.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(star);
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Favourite' })
        .getAttribute('aria-pressed'),
    ).toBe('true'),
  );
  expect((await repo.journal.get(WS, 'n-plan'))?.favorite).toBe(true);
  fireEvent.click(within(rail()).getByRole('button', { name: /Favourites/ }));
  await waitFor(() => expect(listItems()).toHaveLength(1));
  expect(listItems()[0]!.textContent).toContain('Retest plan');
});

test('Delete moves the note to Trash with a notice, and Undo brings it back', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const notice = await screen.findByRole('status', { name: 'Notebook notice' });
  fireEvent.click(await screen.findByRole('button', { name: 'Move to Trash' }));
  await waitFor(() => expect(notice.textContent).not.toBe(''));
  expect(notice.textContent).toContain(
    'Moved to Trash. Notes in Trash are deleted after 30 days.',
  );
  expect((await repo.journal.get(WS, 'n-plan'))?.deletedAt).toBeDefined();
  expect(
    within(rail()).getByRole('button', { name: /Trash/ }).textContent,
  ).toContain('1');
  // The note has left the page it was open on.
  expect(window.location.pathname).toBe('/app/notebook');

  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'Undo moving to Trash' }),
    ).getByRole('button', { name: 'Undo' }),
  );
  await waitFor(async () =>
    expect(await repo.journal.get(WS, 'n-plan')).not.toHaveProperty(
      'deletedAt',
    ),
  );
  expect(window.location.pathname).toBe('/app/notebook/n-plan');
  await waitFor(() => expect(notice.textContent).toBe(''));
  expect(
    screen.queryByRole('group', { name: 'Undo moving to Trash' }),
  ).toBeNull();
});

test('Trash restores, and deletes forever only after a confirmation', async () => {
  const { repo } = await openWith('/app/notebook', {
    prepare: async (r) => {
      await r.journal.trash(WS, 'n-plan');
      await r.journal.trash(WS, 'n-idea');
    },
  });
  await screen.findByRole('navigation', { name: 'Folders' });
  fireEvent.click(await within(rail()).findByRole('button', { name: /Trash/ }));
  await waitFor(() => expect(listItems()).toHaveLength(2));

  const row = listItems().find((li) =>
    li.textContent?.includes('Retest plan'),
  )!;
  fireEvent.click(
    within(row).getByRole('button', { name: 'Restore Retest plan' }),
  );
  await waitFor(() => expect(listItems()).toHaveLength(1));
  expect(await repo.journal.get(WS, 'n-plan')).not.toHaveProperty('deletedAt');

  fireEvent.click(
    within(listItems()[0]!).getByRole('button', {
      name: 'Delete Idea note forever',
    }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Delete Idea note forever?')).toBeTruthy();
  expect(await repo.journal.get(WS, 'n-idea')).toBeDefined();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete forever' }),
  );
  await waitFor(async () =>
    expect(await repo.journal.get(WS, 'n-idea')).toBeUndefined(),
  );
});

test('deleting a user folder moves its notes to My notes', async () => {
  const { repo } = await openWith('/app/notebook', {
    prepare: async (r, ideasId) => {
      await r.journal.save(WS, {
        ...(await r.journal.get(WS, 'n-idea'))!,
        folderId: ideasId,
      });
    },
  });
  await screen.findByRole('navigation', { name: 'Folders' });
  fireEvent.click(
    await within(rail()).findByRole('button', { name: /^Ideas/ }),
  );
  await waitFor(() => expect(listItems()).toHaveLength(1));

  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Folder options: Ideas' }),
    { key: 'Enter' },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Delete folder' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Delete the folder Ideas?')).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete folder' }),
  );

  await waitFor(() =>
    expect(within(rail()).queryByRole('button', { name: /^Ideas/ })).toBeNull(),
  );
  expect(await repo.journal.get(WS, 'n-idea')).not.toHaveProperty('folderId');
  fireEvent.click(within(rail()).getByRole('button', { name: /My notes/ }));
  await waitFor(() =>
    expect(
      listItems()
        .map((li) => li.textContent)
        .join(' '),
    ).toContain('Idea note'),
  );
});

test('a new folder can be named, and a taken name is refused', async () => {
  await openWith('/app/notebook');
  fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));
  const name = await screen.findByRole('textbox', { name: 'Folder name' });
  fireEvent.change(name, { target: { value: 'ideas' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  expect((await screen.findByRole('alert')).textContent).toContain('already');
  fireEvent.change(name, { target: { value: 'Setups' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  expect(
    await within(rail()).findByRole('button', { name: /^Setups/ }),
  ).toBeTruthy();
});

test("the daily note route shows the day card with that day's net and trades", async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-11-19');
  const card = await screen.findByRole('region', { name: "The day's stats" });
  expect((await within(card).findAllByText('+$380.26')).length).toBe(2);
  expect(within(card).getByText('Win rate').nextSibling?.textContent).toBe(
    '100%',
  );
  const trades = within(card).getByText('Trades');
  expect(trades.nextSibling?.textContent).toBe('1');
  // A chip links the day's trade.
  expect(
    within(card).getByRole('link', { name: /^ES/ }).getAttribute('href'),
  ).toBe('/app/trades/t-19');
  // It opened the day's existing note, and made no second one.
  expect(
    (await repo.journal.list(WS)).filter(
      (e) => e.date === '2026-11-19' && e.kind === 'daily-review',
    ),
  ).toHaveLength(1);
  expect(
    await screen.findByRole('textbox', { name: 'Note title' }),
  ).toBeTruthy();
});

const dailyNotes = async (repo: Repository, date: string) =>
  (await repo.journal.list(WS)).filter(
    (e) => e.kind === 'daily-review' && e.date === date,
  );

test('a day with no trades says so, and visiting it writes nothing until an edit', async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-11-21');
  expect(await screen.findByText('No trades this day.')).toBeTruthy();
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  expect((title as HTMLInputElement).value).toBe('Daily review, Sat 21 Nov');
  // Give any stray write time to land.
  await new Promise((r) => setTimeout(r, 300));
  expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(0);

  // The first change makes the note, from the template, under the same pane.
  fireEvent.change(title, { target: { value: 'Quiet Saturday' } });
  await waitFor(
    async () => expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(1),
    { timeout: 3000 },
  );
  const made = (await dailyNotes(repo, '2026-11-21'))[0]!;
  expect(made.title).toBe('Quiet Saturday');
  expect(screen.getByRole('textbox', { name: 'Note title' })).toBe(title);
  // Further edits go to that one note, not a second.
  fireEvent.change(title, { target: { value: 'Quiet Saturday, again' } });
  await waitFor(
    async () =>
      expect((await dailyNotes(repo, '2026-11-21'))[0]!.title).toBe(
        'Quiet Saturday, again',
      ),
    { timeout: 3000 },
  );
  expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Note title' })).toBe(title);
});

test('a tag on a draft day makes its note too', async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-11-21');
  const input = await screen.findByRole('textbox', { name: 'Add a tag' });
  fireEvent.change(input, { target: { value: 'quiet' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(async () =>
    expect((await dailyNotes(repo, '2026-11-21'))[0]?.tags).toEqual(['quiet']),
  );
  expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(1);
});

test('visiting a future date shows a draft and creates nothing', async () => {
  const { repo } = await openWith('/app/notebook/daily/2027-03-01');
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  expect((title as HTMLInputElement).value).toMatch(/^Daily review, /);
  await new Promise((r) => setTimeout(r, 300));
  expect(await dailyNotes(repo, '2027-03-01')).toHaveLength(0);
  expect(
    (await repo.journal.list(WS)).filter((e) => e.date === '2027-03-01'),
  ).toHaveLength(0);
  // A draft has nothing to move to Trash.
  expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull();
});

test('an invalid date is a not-found state, and makes no note', async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-02-30');
  expect(await screen.findByText('That day does not exist.')).toBeTruthy();
  expect(
    (await repo.journal.list(WS)).some((e) => e.date === '2026-02-30'),
  ).toBe(false);
});

test("a trade note shows the trade's stats and a link to the trade", async () => {
  await openWith('/app/notebook/j-1');
  const card = await screen.findByRole('region', { name: "The trade's stats" });
  for (const label of [
    'Net P&L',
    'Quantity',
    'Volume',
    'Commissions',
    'Net ROI',
    'Gross P&L',
  ])
    expect(await within(card).findByText(label)).toBeTruthy();
  expect(within(card).getByText('+$245.50')).toBeTruthy();
  expect(
    within(card).getByRole('link', { name: 'Open trade' }).getAttribute('href'),
  ).toBe('/app/trades/f-1');
});

test('Privacy hides the day figures', async () => {
  await openWith('/app/notebook/daily/2026-11-19', {
    prefs: { displayUnit: 'privacy' },
  });
  const card = await screen.findByRole('region', { name: "The day's stats" });
  expect(
    (await within(card).findAllByText('hidden amount')).length,
  ).toBeGreaterThan(0);
  expect(card.textContent).not.toMatch(/\$\d/);
});

test('an unknown note is a not-found state', async () => {
  await openWith('/app/notebook/nope');
  expect(await screen.findByText("That note isn't here.")).toBeTruthy();
});

test('the title saves as you type, with a quiet status', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  fireEvent.change(title, { target: { value: 'Retest plan, revised' } });
  expect(screen.getByText('Saving')).toBeTruthy();
  await waitFor(
    async () =>
      expect((await repo.journal.get(WS, 'n-plan'))?.title).toBe(
        'Retest plan, revised',
      ),
    { timeout: 3000 },
  );
  expect(await screen.findByText('Saved')).toBeTruthy();
});

test('tags: Enter adds a lowercase tag and Backspace takes the last one off', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const input = await screen.findByRole('textbox', { name: 'Add a tag' });
  fireEvent.change(input, { target: { value: 'Gap Day' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'n-plan'))?.tags).toEqual([
      'plan',
      'gap day',
    ]),
  );
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Add a tag' }), {
    key: 'Backspace',
  });
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'n-plan'))?.tags).toEqual(['plan']),
  );
});

test('Move to folder files the note in a user folder', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const folder = (await repo.folders.list(WS))[0]!;
  const select = await screen.findByRole('combobox', {
    name: 'Move to folder',
  });
  fireEvent.change(select, { target: { value: folder.id } });
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'n-plan'))?.folderId).toBe(folder.id),
  );
});

test('New > Note makes a note and opens it', async () => {
  const { repo } = await openWith('/app/notebook');
  fireEvent.keyDown(await screen.findByRole('button', { name: 'New' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Note' }));
  await waitFor(() =>
    expect(window.location.pathname).toMatch(/^\/app\/notebook\/[^/]+$/),
  );
  const made = (await repo.journal.list(WS)).filter(
    (e) => e.kind === 'note' && e.title === 'Untitled note',
  );
  expect(made).toHaveLength(1);
});

test('typing a title and moving to Trash at once leaves the note in Trash with the new title', async () => {
  const { repo } = await openWith('/app/notebook/n-plan');
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  fireEvent.change(title, { target: { value: 'Retest plan v2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
  await screen.findByRole('status', { name: 'Notebook notice' });
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'n-plan'))?.title).toBe(
      'Retest plan v2',
    ),
  );
  // Let any late flush land, then check Trash still holds it.
  await new Promise((r) => setTimeout(r, 900));
  const stored = await repo.journal.get(WS, 'n-plan');
  expect(stored?.deletedAt).toBeDefined();
  expect(stored?.title).toBe('Retest plan v2');
});

test('opening a note focuses its title; All notes returns focus to its row', async () => {
  await openWith('/app/notebook/n-plan');
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  await waitFor(() => expect(document.activeElement).toBe(title));
  fireEvent.click(screen.getByRole('link', { name: /All notes/ }));
  // The test router does not follow links; the address bar moves as Next's would.
  act(() => window.history.pushState(null, '', '/app/notebook'));
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('href')).toBe(
      '/app/notebook/n-plan',
    ),
  );
});

test('the trash notice: an always-mounted live region, Undo focused, kept at least 20 s', async () => {
  await openWith('/app/notebook/n-plan');
  // The live region is there before anything is trashed, and empty.
  const live = await screen.findByRole('status', { name: 'Notebook notice' });
  expect(live.textContent).toBe('');
  const timers = vi.spyOn(window, 'setTimeout');
  fireEvent.click(await screen.findByRole('button', { name: 'Move to Trash' }));
  await waitFor(() => expect(live.textContent).toContain('Moved to Trash'));
  // The same node, filled, not a new one.
  expect(screen.getByRole('status', { name: 'Notebook notice' })).toBe(live);
  const group = screen.getByRole('group', { name: 'Undo moving to Trash' });
  const undo = within(group).getByRole('button', { name: 'Undo' });
  await waitFor(() => expect(document.activeElement).toBe(undo));
  // It waits at least 20 s before it goes.
  const waits = timers.mock.calls.map(([, ms]) => ms as number);
  expect(waits.some((ms) => ms >= 20_000)).toBe(true);
  timers.mockRestore();
  // Dismissing takes it down at once.
  fireEvent.click(within(group).getByRole('button', { name: 'Dismiss' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('group', { name: 'Undo moving to Trash' }),
    ).toBeNull(),
  );
  expect(live.textContent).toBe('');
});

test('a favourite note in the list carries the text "Favourite"', async () => {
  await openWith('/app/notebook', {
    prepare: async (r) => {
      await r.journal.save(WS, {
        ...(await r.journal.get(WS, 'n-plan'))!,
        favorite: true,
      });
    },
  });
  await screen.findByRole('navigation', { name: 'Folders' });
  fireEvent.click(
    await within(rail()).findByRole('button', { name: /Favourites/ }),
  );
  await waitFor(() => expect(listItems()).toHaveLength(1));
  expect(within(listItems()[0]!).getByText('Favourite').className).toContain(
    'sr-only',
  );
});

test('the day card shows Rules kept with a metric tip', async () => {
  await openWith('/app/notebook/daily/2026-11-19');
  const card = await screen.findByRole('region', { name: "The day's stats" });
  const label = await within(card).findByText('Rules kept');
  expect(label.closest('[data-metric-tip="rule-adherence"]')).not.toBeNull();
  expect(label.closest('div')!.textContent).toContain('1 of 2');
});

test('+ Link picks from the day first, searches all trades, and links and unlinks', async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-11-19');
  const card = await screen.findByRole('region', { name: "The day's stats" });
  fireEvent.click(
    await within(card).findByRole('button', { name: 'Link a trade' }),
  );
  const box = await screen.findByRole('combobox', { name: 'Find a trade' });
  // That day's trade is listed before any search; another day's is not.
  const list = screen.getByRole('listbox', { name: 'Find a trade list' });
  expect(within(list).getAllByRole('option')).toHaveLength(1);
  expect(within(list).getByRole('option').textContent).toContain('ES');
  // Search reaches every trade.
  fireEvent.change(box, { target: { value: 'NQ' } });
  const nq = await within(list).findByRole('option', { name: /NQ/ });
  fireEvent.click(nq);
  // Picking links the trade to the day's note.
  await waitFor(
    async () =>
      expect((await dailyNotes(repo, '2026-11-19'))[0]!.linkedTradeIds).toEqual(
        ['t-19', 'f-3'],
      ),
    { timeout: 3000 },
  );
  const unlink = await screen.findByRole('button', { name: /^Unlink NQ/ });
  fireEvent.click(unlink);
  await waitFor(async () =>
    expect((await dailyNotes(repo, '2026-11-19'))[0]!.linkedTradeIds).toEqual([
      't-19',
    ]),
  );
  expect(screen.queryByRole('button', { name: /^Unlink NQ/ })).toBeNull();
});
