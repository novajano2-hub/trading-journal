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
import { resolveInstrument } from '@/domain/instruments';
import type { JournalEntry } from '@/domain/types';
import { pasteFiles } from '../__fixtures__/clipboard';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
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
function sample(edit?: (fx: SampleWorkspace) => void) {
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
    edit?.(fx);
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
    /** Changes to the sample before it is stored. */
    edit?: (fx: SampleWorkspace) => void;
  } = {},
) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(opts.edit),
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

test("Trash offers no Restore or Delete forever on a closed day's note, and says why (M3)", async () => {
  await openWith('/app/notebook', {
    prepare: async (r) => {
      await r.journal.trash(WS, 'daily-2026-11-18');
      await r.journal.trash(WS, 'n-idea');
      const tracker = await r.tracker.get(WS);
      await r.days.finish(WS, '2026-11-18', {
        version: tracker.versions[0]!,
        inputs: {},
        ticks: {},
      });
    },
  });
  await screen.findByRole('navigation', { name: 'Folders' });
  fireEvent.click(await within(rail()).findByRole('button', { name: /Trash/ }));
  await waitFor(() => expect(listItems()).toHaveLength(2));
  const closed = listItems().find((li) =>
    li.textContent?.includes('Daily review, 2026-11-18'),
  )!;
  expect(within(closed).queryByRole('button', { name: /Restore/ })).toBeNull();
  expect(within(closed).queryByRole('button', { name: /forever/ })).toBeNull();
  expect(within(closed).getByRole('note').textContent).toContain(
    'This day is closed',
  );
  // The open note keeps both, and the 30-day line still covers it.
  const open = listItems().find((li) => li.textContent?.includes('Idea note'))!;
  expect(within(open).getByRole('button', { name: /Restore/ })).toBeTruthy();
  expect(screen.getByText(/deleted after 30 days/)).toBeTruthy();
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
  const kpi = (label: string) =>
    within(card).getByText(label).closest('div')!.querySelector('b')!
      .textContent;
  expect(kpi('Win rate')).toBe('100%');
  expect(kpi('Trades')).toBe('1');
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

test('a trashed day note shows read-only with Restore', async () => {
  const { repo } = await openWith('/app/notebook/daily/2026-11-19', {
    prepare: (r) => r.journal.trash(WS, 'daily-2026-11-19'),
  });
  await screen.findByText("This day's note is in Trash.");
  expect(
    (
      (await screen.findByRole('textbox', {
        name: 'Note title',
      })) as HTMLInputElement
    ).readOnly,
  ).toBe(true);
  // It is still the date's note: no second one was made.
  expect(
    (await repo.journal.list(WS)).filter(
      (e) => e.date === '2026-11-19' && e.kind === 'daily-review',
    ),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() =>
    expect(screen.queryByText("This day's note is in Trash.")).toBeNull(),
  );
  expect(
    (await repo.journal.get(WS, 'daily-2026-11-19'))!.deletedAt,
  ).toBeUndefined();
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

test("an image pasted into a draft day stores the day's note first, and the note owns it", async () => {
  fakeIntersectionObserver({ auto: true });
  URL.createObjectURL = vi.fn(() => 'blob:draft');
  URL.revokeObjectURL = vi.fn();
  const { repo } = await openWith('/app/notebook/daily/2026-11-21');
  const box = await screen.findByRole('textbox', { name: 'Note' });
  expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(0);
  pasteFiles(box, [
    new File([new Uint8Array([137, 80, 78, 71])], 'open.png', {
      type: 'image/png',
    }),
  ]);
  await waitFor(
    async () => expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(1),
    { timeout: 3000 },
  );
  const note = (await dailyNotes(repo, '2026-11-21'))[0]!;
  await waitFor(async () =>
    expect(await repo.files.list(WS, `note:${note.id}`)).toHaveLength(1),
  );
  // One note, not two, and the picture is in the body it saves.
  await waitFor(
    async () =>
      expect(
        JSON.stringify((await dailyNotes(repo, '2026-11-21'))[0]!.body),
      ).toContain('keel-file:'),
    { timeout: 3000 },
  );
  expect(await dailyNotes(repo, '2026-11-21')).toHaveLength(1);
  expect(await screen.findByRole('img', { name: 'open' })).toBeTruthy();
  vi.unstubAllGlobals();
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

test("a trade's volume counts its quantity once, not every fill", async () => {
  const fill = (
    id: string,
    side: 'buy' | 'sell',
    qty: number,
    price: number,
  ) => ({
    id,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time: '2026-11-16T15:00:00.000Z',
    fees: 0,
    commission: 0,
  });
  await openWith('/app/notebook/j-1', {
    edit: (fx) => {
      // Two in, one more, then all three out: six contracts of fills, three traded.
      Object.assign(fx.trades[0]!, {
        maxPosition: 3,
        executions: [
          fill('e1', 'buy', 2, 6000),
          fill('e2', 'buy', 1, 6000),
          fill('x1', 'sell', 3, 6005),
        ],
      });
    },
  });
  const card = await screen.findByRole('region', { name: "The trade's stats" });
  const volume = (await within(card).findByText('Volume')).closest('div')!;
  expect(volume.querySelector('b')!.textContent).toBe('3');
  expect(
    within(card).getByRole('button', { name: 'Volume' }).dataset.metricTip,
  ).toBe('volume');
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

/** The 19th in ticks: t-19 is an ES long, 4500 to 4502 on two contracts, 16 ticks; a stock trade the same day. */
const tickDay = (fx: SampleWorkspace) => {
  const es = fx.trades.find((t) => t.id === 't-19')!;
  es.avgEntry = 4500;
  es.avgExit = 4502;
  es.maxPosition = 2;
  es.executions = [];
  fx.trades.push(
    makeTrade({
      id: 't-19-stock',
      serial: 11,
      workspaceId: WS,
      accountId: 'acc-a',
      openedAt: '2026-11-19T16:00:00.000Z',
      closedAt: '2026-11-19T16:30:00.000Z',
      net: -1000,
      gross: -1000,
      instrument: resolveInstrument('SPY')!,
    }),
  );
};

test('under Ticks the day card reads ticks, and counts only the futures trades (ruling 67)', async () => {
  await openWith('/app/notebook/daily/2026-11-19', {
    prefs: { displayUnit: 'ticks' },
    edit: tickDay,
  });
  const card = await screen.findByRole('region', { name: "The day's stats" });
  expect((await within(card).findAllByText('+16.0 ticks')).length).toBe(2);
  const kpi = (label: string) =>
    within(card).getByText(label).closest('div')!.querySelector('b')!
      .textContent;
  // The stock trade is left out, as on every page under a unit.
  expect(kpi('Trades')).toBe('1');
  expect(kpi('Win rate')).toBe('100%');
  expect(card.textContent).not.toContain('$');
  // The chip of the linked trade shows what it made in ticks.
  expect(within(card).getByRole('link', { name: /^ES/ }).textContent).toContain(
    '+16.0 ticks',
  );
});

test('under Dollar and Percent the day card is unchanged by the unit work, the stock trade counts', async () => {
  await openWith('/app/notebook/daily/2026-11-19', { edit: tickDay });
  const card = await screen.findByRole('region', { name: "The day's stats" });
  expect((await within(card).findAllByText('+$370.26')).length).toBe(1);
  expect(
    within(card).getByText('Trades').closest('div')!.querySelector('b')!
      .textContent,
  ).toBe('2');
  expect(card.textContent).not.toContain('ticks');
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
  // The app's dropdown: Enter opens it, the arrows move, Enter files the note.
  const select = await screen.findByRole('button', {
    name: 'Move to folder, No folder',
  });
  fireEvent.keyDown(select, { key: 'Enter' });
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: folder.name }),
  );
  await waitFor(async () =>
    expect((await repo.journal.get(WS, 'n-plan'))?.folderId).toBe(folder.id),
  );
});

/**
 * Fixed clocks, 10:00 in New York (the prefs' zone below), so the week is the
 * same on any machine: [name, now, Sunday week start, the Monday inside that week].
 */
const CLOCKS = [
  ['a Saturday', '2026-11-21T15:00:00Z', '2026-11-15', '2026-11-16'],
  ['a Sunday', '2026-11-22T15:00:00Z', '2026-11-22', '2026-11-23'],
  ['a Monday', '2026-11-23T15:00:00Z', '2026-11-22', '2026-11-23'],
] as const;
const NEW_YORK = { timeZone: 'America/New_York' };

afterEach(() => vi.useRealTimers());

async function newWeeklyRecap() {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'New' }), {
    key: 'Enter',
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Weekly recap' }),
  );
}

test.each(CLOCKS)(
  'New > Weekly recap keys a new note on the Sunday week start by default, on %s',
  async (_name, now, sunday) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const { repo } = await openWith('/app/notebook', { prefs: NEW_YORK });
    const before = (await repo.journal.list(WS)).filter(
      (e) => e.kind === 'weekly-recap',
    ).length;
    await newWeeklyRecap();
    await waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/app\/notebook\/[^/]+$/),
    );
    const made = (await repo.journal.list(WS)).filter(
      (e) => e.kind === 'weekly-recap',
    );
    expect(made).toHaveLength(before + 1);
    const fresh = made.find((e) => e.date === sunday)!;
    expect(fresh).toBeTruthy();
    expect(fresh.title).toMatch(/^Week of /);
  },
);

test.each(CLOCKS)(
  "New > Weekly recap opens the week's Monday-keyed note under Sunday weeks, and makes no second one, on %s",
  async (_name, now, _sunday, monday) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const { repo } = await openWith('/app/notebook', {
      prefs: NEW_YORK,
      prepare: async (r) => {
        await r.journal.save(WS, {
          kind: 'weekly-recap',
          date: monday,
          title: 'Legacy week',
          body: { type: 'doc', content: [{ type: 'paragraph' }] },
          linkedTradeIds: [],
          tags: [],
        });
      },
    });
    const before = (await repo.journal.list(WS)).filter(
      (e) => e.kind === 'weekly-recap',
    );
    await newWeeklyRecap();
    const legacy = before.find((e) => e.title === 'Legacy week')!;
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/app/notebook/${legacy.id}`),
    );
    expect(
      (await repo.journal.list(WS)).filter((e) => e.kind === 'weekly-recap'),
    ).toHaveLength(before.length);
  },
);

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

test('New no longer offers Pre-market plan, and an existing pre-market entry still opens', async () => {
  await openWith('/app/notebook');
  expect((await screen.findByText(/Or start one from New/)).textContent).toBe(
    'Or start one from New: a daily note, a weekly recap or a plain note.',
  );
  fireEvent.keyDown(await screen.findByRole('button', { name: 'New' }), {
    key: 'Enter',
  });
  expect(
    (await screen.findAllByRole('menuitem')).map((i) => i.textContent),
  ).toEqual(['Daily note', 'Weekly recap', 'Note']);
  cleanup();
  await openWith('/app/notebook/n-pm');
  expect(await screen.findByDisplayValue('Opening bias')).toBeTruthy();
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

test('opening a note leaves focus alone, not in its title; All notes returns focus to its row', async () => {
  await openWith('/app/notebook/n-plan');
  const title = await screen.findByRole('textbox', { name: 'Note title' });
  await new Promise((r) => setTimeout(r, 50));
  expect(document.activeElement).not.toBe(title);
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

test('the day card win rate is wins over the decided trades, as the Calendar reads it (I4)', async () => {
  await openWith('/app/notebook/daily/2026-11-19', {
    edit: (fx) =>
      fx.trades.push(
        makeTrade({
          id: 't-19-be',
          serial: 10,
          workspaceId: WS,
          accountId: 'acc-a',
          openedAt: '2026-11-19T16:00:00.000Z',
          closedAt: '2026-11-19T16:30:00.000Z',
          net: 0,
        }),
      ),
  });
  const card = await screen.findByRole('region', { name: "The day's stats" });
  // One win and one breakeven: 100%, not 50%.
  const rate = await within(card).findByText('Win rate');
  expect(rate.closest('div')!.querySelector('b')!.textContent).toBe('100%');
  // Every figure's label carries its definition.
  for (const id of ['pnl', 'trades', 'win-rate', 'rule-adherence'])
    expect(card.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('a day with only breakevens says None decided (I4)', async () => {
  await openWith('/app/notebook/daily/2026-11-19', {
    edit: (fx) => {
      fx.trades.find((t) => t.id === 't-19')!.net = 0;
      fx.trades.find((t) => t.id === 't-19')!.gross = 0;
    },
  });
  const card = await screen.findByRole('region', { name: "The day's stats" });
  const rate = await within(card).findByText('Win rate');
  expect(rate.closest('div')!.querySelector('b')!.textContent).toBe(
    'None decided',
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

test('a malformed note row in storage never breaks the Notebook: it lists as an untitled note (re-review N1)', async () => {
  await openWith('/app/notebook', {
    edit: (fx) =>
      fx.journal.push({
        id: 'n-bare',
        workspaceId: WS,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Bare row text' }],
            },
          ],
        },
        updatedAt: '2026-11-19T20:00:00.000Z',
      } as unknown as (typeof fx.journal)[number]),
  });
  const folders = await screen.findByRole('navigation', { name: 'Folders' });
  const listed = () =>
    waitFor(() =>
      expect(
        listItems()
          .map((li) => li.textContent)
          .join(' '),
      ).toContain('Untitled note'),
    );
  // A search looks through every note, so it reaches the bare row.
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), {
    target: { value: 'bare row' },
  });
  await listed();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), {
    target: { value: '' },
  });
  // Read whole, it is a plain note in My notes.
  fireEvent.click(within(folders).getByRole('button', { name: /My notes/ }));
  await listed();
});
