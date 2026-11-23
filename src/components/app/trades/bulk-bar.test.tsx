// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { renderApp } from '../__fixtures__/render-app';
import { splitDeletable } from './bulk-bar';
import { TradesView } from './trades-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = fixtureSample().trades[0]!.workspaceId;
const START = Date.UTC(2026, 10, 2, 14, 0);

/**
 * 60 closed trades (serial 1 to 60, newest open first in the log). Trade 59
 * and 60 carry the breakout tag; trade 58 follows str-1 with a rule check.
 * `open` imported open trades, serials 201 up.
 */
function sample(opts: { openImported?: number; archived?: number } = {}) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const closed = Array.from({ length: 60 }, (_, i) => {
      const n = i + 1;
      const at = START + i * 600_000;
      return makeTrade({
        id: `t-${n}`,
        serial: n,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: new Date(at).toISOString(),
        closedAt: new Date(at + 300_000).toISOString(),
        net: 1000,
        tagIds: n >= 59 ? ['tag-setup'] : [],
        strategyIds: n === 58 ? ['str-1'] : [],
        ruleChecks: n === 58 ? [{ ruleId: 'r-1', followed: true }] : [],
      });
    });
    const open = Array.from({ length: opts.openImported ?? 0 }, (_, i) =>
      makeTrade({
        id: `o-${i + 1}`,
        serial: 201 + i,
        workspaceId: WS,
        accountId: 'acc-a',
        status: 'open',
        importId: 'imp-1',
        openedAt: new Date(START + (201 + i) * 600_000).toISOString(),
        net: 0,
      }),
    );
    // Trades of the archived account (acc-b), serials 61 up: newest in the log.
    const archived = Array.from({ length: opts.archived ?? 0 }, (_, i) => {
      const n = 61 + i;
      const at = START + i * 600_000 + 40_000_000;
      return makeTrade({
        id: `t-${n}`,
        serial: n,
        workspaceId: WS,
        accountId: 'acc-b',
        openedAt: new Date(at).toISOString(),
        closedAt: new Date(at + 300_000).toISOString(),
        net: 1000,
      });
    });
    return { ...fx, trades: [...closed, ...open, ...archived] };
  };
}

const table = () => screen.findByRole('table', { name: 'Trades' });
const rows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
/** Ticks the checkboxes of the first `n` rows, newest first (serials 60, 59, 58...). */
async function select(n: number) {
  const t = await table();
  rows(t)
    .slice(0, n)
    .forEach((r) => fireEvent.click(within(r).getByRole('checkbox')));
  return t;
}
const bar = () => screen.findByRole('toolbar');

test('three selected rows show the bar; the header box selects the page', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  await select(3);
  const toolbar = await bar();
  expect(toolbar.textContent).toContain('3 selected');
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  // 60 closed, 50 on the page.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
  expect((await bar()).textContent).toContain('50 selected');
  fireEvent.click(
    screen.getByRole('button', { name: 'Select all 60 matching trades' }),
  );
  expect((await bar()).textContent).toContain('60 selected');
});

test('on a narrow screen the bar wraps to more rows instead of scrolling, so Delete and Clear stay on screen', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  await select(3);
  const toolbar = await bar();
  expect(toolbar.className).toContain('flex-wrap');
  expect(toolbar.className).not.toContain('overflow-x');
  expect(within(toolbar).getByRole('button', { name: 'Delete' })).toBeTruthy();
  expect(
    within(toolbar).getByRole('button', { name: 'Clear selection' }),
  ).toBeTruthy();
});

test('selection clears when a filter changes', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  await select(2);
  await bar();
  fireEvent.click(screen.getByRole('radio', { name: /^Reviewed/ }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
});

test('Tag adds a tag to the three trades and keeps their old tags', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  // Rows newest first: serials 60, 59 (tagged breakout) and 58.
  await select(3);
  fireEvent.click(within(await bar()).getByRole('button', { name: /^Tag/ }));
  const input = await screen.findByRole('combobox', { name: 'Tags to add' });
  fireEvent.change(input, { target: { value: 'fomo' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Add to 3 trades' }));
  await waitFor(async () => {
    const t58 = await repo.trades.get(WS, 't-58');
    expect(t58?.tagIds).toEqual(['tag-fomo']);
  });
  const get = async (id: string) => (await repo.trades.get(WS, id))!.tagIds;
  expect((await get('t-59')).sort()).toEqual(['tag-fomo', 'tag-setup']);
  expect((await get('t-60')).sort()).toEqual(['tag-fomo', 'tag-setup']);
  expect(await get('t-57')).toEqual([]);
});

test('Mark reviewed sets reviewed on exactly the selected trades', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  await select(3);
  fireEvent.click(
    within(await bar()).getByRole('button', { name: 'Mark reviewed' }),
  );
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-60'))?.reviewed).toBe(true),
  );
  const all = await repo.trades.list(WS);
  expect(
    all
      .filter((t) => t.reviewed === true)
      .map((t) => t.serial)
      .sort(),
  ).toEqual([58, 59, 60]);
});

test('Add to strategy and Remove from strategy change strategyIds', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  await select(3);
  // Radix opens a menu on pointer-down or a key, not on click.
  fireEvent.keyDown(
    within(await bar()).getByRole('button', { name: /^Add to strategy/ }),
    { key: 'Enter' },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /Opening range breakout/ }),
  );
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-60'))?.strategyIds).toEqual(['str-1']),
  );
  expect((await repo.trades.get(WS, 't-59'))?.strategyIds).toEqual(['str-1']);
  expect((await repo.trades.get(WS, 't-58'))?.strategyIds).toEqual(['str-1']);

  fireEvent.keyDown(
    within(await bar()).getByRole('button', { name: /^Remove from strategy/ }),
    { key: 'Enter' },
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /Opening range breakout/ }),
  );
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-60'))?.strategyIds).toEqual([]),
  );
  // Leaving the strategy drops the checks of its rules.
  expect((await repo.trades.get(WS, 't-58'))?.ruleChecks).toEqual([]);
});

test('Delete removes closed trades; open imported ones stay, with the E33 note', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample({ openImported: 1 }),
    url: '/app/trades',
  });
  const t = await table();
  fireEvent.click(screen.getByRole('radio', { name: /^Open/ }));
  await waitFor(() => expect(rows(t)).toHaveLength(1));
  fireEvent.click(within(rows(t)[0]!).getByRole('checkbox'));
  fireEvent.click(within(await bar()).getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain("Delete 1 trade? This can't be undone.");
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  const note = await screen.findByRole('status', { name: 'Result' });
  expect(note.textContent).toContain(
    "1 open imported trade wasn't deleted. Undo their import in Import history to remove them.",
  );
  expect(
    within(note)
      .getByRole('link', { name: 'Import history' })
      .getAttribute('href'),
  ).toBe('/app/settings/import-history');
  expect(await repo.trades.get(WS, 'o-1')).toBeTruthy();
});

test('Delete of closed trades removes them and says how many', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample({ openImported: 1 }),
    url: '/app/trades',
  });
  await select(2);
  fireEvent.click(within(await bar()).getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain(
    "Delete 2 trades? This can't be undone.",
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await repo.trades.get(WS, 't-60')).toBeUndefined(),
  );
  expect(await repo.trades.get(WS, 't-59')).toBeUndefined();
  expect(await repo.trades.get(WS, 't-58')).toBeTruthy();
  expect(
    (await screen.findByRole('status', { name: 'Result' })).textContent,
  ).toContain('2 trades deleted');
});

test('open imported trades are split off a delete, whatever else is chosen', () => {
  const closed = makeTrade({
    net: 0,
    id: 'c',
    status: 'closed',
    importId: 'i',
  });
  const openManual = makeTrade({ net: 0, id: 'm', status: 'open' });
  const openImported = makeTrade({
    net: 0,
    id: 'o',
    status: 'open',
    importId: 'i',
  });
  const { deletable, kept } = splitDeletable([
    closed,
    openManual,
    openImported,
  ]);
  expect(deletable.map((t) => t.id)).toEqual(['c', 'm']);
  expect(kept.map((t) => t.id)).toEqual(['o']);
});

const BOTH = '/app/trades?account=acc-a&account=acc-b';

test("Mark reviewed leaves an archived account's trades out and says so", async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample({ archived: 2 }),
    url: BOTH,
  });
  // Newest first: 62 and 61 (archived), then 60.
  await select(3);
  const toolbar = await bar();
  expect(toolbar.textContent).toContain(
    "2 trades in archived accounts won't be changed.",
  );
  fireEvent.click(
    within(toolbar).getByRole('button', { name: 'Mark reviewed' }),
  );
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-60'))?.reviewed).toBe(true),
  );
  expect((await repo.trades.get(WS, 't-61'))?.reviewed).toBeUndefined();
  expect((await repo.trades.get(WS, 't-62'))?.reviewed).toBeUndefined();
  expect(
    (await screen.findByRole('status', { name: 'Result' })).textContent,
  ).toContain("2 trades in archived accounts weren't changed.");
});

test('with only archived trades selected, nothing is edited or deleted', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample({ archived: 1 }),
    url: BOTH,
  });
  await select(1);
  const toolbar = await bar();
  expect(toolbar.textContent).toContain(
    "1 trade in an archived account won't be changed.",
  );
  expect(
    within(toolbar).getByRole('button', { name: 'Mark reviewed' }),
  ).toHaveProperty('disabled', true);
  expect(
    within(toolbar).getByRole('button', { name: 'Delete' }),
  ).toHaveProperty('disabled', true);
  expect(await repo.trades.get(WS, 't-61')).toBeTruthy();
});

test("Delete leaves an archived account's trades in place", async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample({ archived: 1 }),
    url: BOTH,
  });
  await select(2); // 61 (archived) and 60
  fireEvent.click(within(await bar()).getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain("Delete 1 trade? This can't be undone.");
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await repo.trades.get(WS, 't-60')).toBeUndefined(),
  );
  expect(await repo.trades.get(WS, 't-61')).toBeTruthy();
  expect(
    (await screen.findByRole('status', { name: 'Result' })).textContent,
  ).toContain("1 trade in an archived account wasn't changed.");
});
