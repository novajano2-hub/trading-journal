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
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView } from './strategies-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

/** str-1 (active) on two trades, plus an archived "Old swing". */
function sample(withArchived = true) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    fx.trades[1]!.strategyIds = ['str-1'];
    if (withArchived)
      fx.strategies.push({
        id: 'str-old',
        workspaceId: SAMPLE_WORKSPACE.id,
        name: 'Old swing',
        description: 'Retired.',
        assetClasses: ['stock'],
        groups: [{ id: 'g-o', title: 'Entry', rules: [] }],
        checklist: [],
        status: 'archived',
      });
    return fx;
  };
}

test('lists the active strategies, then only the archived ones with the switch', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  expect(await screen.findByText('Opening range breakout')).toBeTruthy();
  expect(screen.queryByText('Old swing')).toBeNull();

  fireEvent.click(screen.getByRole('radio', { name: 'Archived' }));
  expect(await screen.findByText('Old swing')).toBeTruthy();
  expect(screen.queryByText('Opening range breakout')).toBeNull();
});

test('a card shows its rule count, trades and a link to the strategy', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  const card = (await screen.findByText('Opening range breakout')).closest(
    'article',
  )!;
  expect(within(card).getByText('Rules').nextSibling?.textContent).toBe('2');
  expect(within(card).getByText('in 2 groups')).toBeTruthy();
  expect(
    within(card)
      .getByRole('link', { name: 'Opening range breakout' })
      .getAttribute('href'),
  ).toBe('/app/strategies/str-1');
});

test('deleting asks first, names the trades that lose the strategy, then removes it', async () => {
  const { repo } = renderApp(<StrategiesView />, {
    sample: sample(),
    url: '/app/strategies',
  });
  await screen.findByText('Opening range breakout');
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'More for Opening range breakout' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText('Delete Opening range breakout?'),
  ).toBeTruthy();
  expect(
    within(dialog).getByText(
      'Its 2 trades keep their data and lose this strategy.',
    ),
  ).toBeTruthy();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await repo.strategies.get(SAMPLE_WORKSPACE.id, 'str-1')).toBe(
      undefined,
    ),
  );
});

test('with no strategies it says so and offers the first one', async () => {
  renderApp(<StrategiesView />, {
    sample: async () => ({ ...fixtureSample(), strategies: [] }),
    url: '/app/strategies',
  });
  expect(await screen.findByText('No strategies yet.')).toBeTruthy();
  const links = screen.getAllByRole('link', { name: 'New strategy' });
  expect(links[0]!.getAttribute('href')).toBe('/app/strategies/new');
});

test('a card says when trades in another currency are left out of its figures', async () => {
  renderApp(<StrategiesView />, {
    sample: async () => {
      const fx = await sample()();
      fx.trades[2]!.strategyIds = ['str-1'];
      fx.trades[2]!.pnlCurrency = 'EUR';
      fx.trades[2]!.accountId = 'acc-a';
      return fx;
    },
    url: '/app/strategies',
  });
  const card = (await screen.findByText('Opening range breakout')).closest(
    'article',
  )!;
  expect(
    within(card).getByText(
      '1 trade in another currency is left out of these figures.',
    ),
  ).toBeTruthy();
});

test('a card has no left-out note when every trade is in the base currency', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  await screen.findByText('Opening range breakout');
  expect(screen.queryByText(/left out of these figures/)).toBeNull();
});

test("a card's equity line is an image with its range, count and end value, and reads a point on focus", async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const name = line.getAttribute('aria-label')!;
  expect(name).toContain('16 Nov 2026 to 17 Nov 2026');
  expect(name).toContain('2 closed trades');
  fireEvent.focus(line.closest('[data-equity-points]')!);
  expect(
    screen.getByRole('status', { name: 'Equity readout' }).textContent,
  ).toContain('17 Nov 2026');
});

test('if archiving fails the list says so, neutrally', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  repository.strategies.update = async () => {
    throw new Error('quota');
  };
  renderApp(<StrategiesView />, { repository, url: '/app/strategies' });
  await screen.findByText('Opening range breakout');
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'More for Opening range breakout' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("couldn't be archived");
});

test('the unassigned-trades note follows the display unit', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const fx = await sample()();
      fx.trades[2]!.accountId = 'acc-a';
      return fx;
    },
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<StrategiesView />, { repository, url: '/app/strategies' });
  const note = (
    await screen.findByText(/has no strategy|have no strategy/)
  ).closest('p')!;
  expect(note.textContent).toMatch(/ticks/);
  expect(note.textContent).not.toMatch(/\$\d/);
});

/** str-1 with +$245.50 then -$129.50, and str-2 with +$1.00 then -$0.50. */
async function twoScales(): Promise<SampleWorkspace> {
  const fx = fixtureSample();
  fx.trades[1]!.strategyIds = ['str-1'];
  fx.strategies.push({
    ...fx.strategies[0]!,
    id: 'str-2',
    name: 'Pullback',
    groups: [{ id: 'g-p', title: 'Entry', rules: [] }],
  });
  const base = fx.trades[1]!;
  fx.trades.push(
    {
      ...base,
      id: 'sm-1',
      serial: 90,
      net: 100,
      gross: 100,
      fees: 0,
      strategyIds: ['str-2'],
      ruleChecks: [],
      tagIds: [],
    },
    {
      ...base,
      id: 'sm-2',
      serial: 91,
      net: -50,
      gross: -50,
      fees: 0,
      strategyIds: ['str-2'],
      ruleChecks: [],
      tagIds: [],
      closedAt: '2026-11-18T15:30:00.000Z',
      openedAt: '2026-11-18T15:00:00.000Z',
    },
  );
  return fx;
}

test('every card draws its line on one scale, so a small strategy reads small beside a big one', async () => {
  renderApp(<StrategiesView />, { sample: twoScales, url: '/app/strategies' });
  const extent = async (name: string) => {
    const card = (await screen.findByText(name)).closest('article')!;
    const d = card
      .querySelector('svg path[stroke="var(--accent)"]')!
      .getAttribute('d')!;
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    return Math.max(...ys) - Math.min(...ys);
  };
  const big = await extent('Opening range breakout');
  const small = await extent('Pullback');
  // On their own scales both would span the whole box (67 units).
  expect(big).toBeGreaterThan(40);
  expect(small).toBeLessThan(big / 3);
});

/** str-1 on f-1 (16 Nov) and f-2 (17 Nov) in acc-a. */
const cardAt = async (query: string) => {
  renderApp(<StrategiesView />, {
    sample: sample(false),
    url: `/app/strategies${query}`,
  });
  return (await screen.findByText('Opening range breakout')).closest(
    'article',
  )!;
};

test('a date range narrows each card to the trades inside it', async () => {
  const card = await cardAt('?from=2026-11-17&to=2026-11-17');
  const trades = () =>
    card.querySelector('[data-metric-tip="trades"]')!.closest('div')!;
  await waitFor(() =>
    expect(trades().querySelector('b')!.textContent).toBe('1'),
  );
  expect(trades().querySelector('small')!.textContent).toBe('none open');
  expect(within(card).getByText('0 won, 1 lost')).toBeTruthy();
});

test('Assign them in Trades opens the log on the same filters, with the trades that have no strategy (I7)', async () => {
  renderApp(<StrategiesView />, {
    sample: sample(false),
    url: '/app/strategies?from=2026-11-16&to=2026-11-18&account=acc-a,acc-b',
  });
  const link = await screen.findByRole('link', {
    name: 'Assign them in Trades',
  });
  // f-3 in acc-b has no strategy: one trade, and the link holds the page's filters.
  expect(link.closest('p')!.textContent).toContain(
    '1 closed trade has no strategy',
  );
  const params = new URLSearchParams(link.getAttribute('href')!.split('?')[1]);
  expect(params.get('nostrat')).toBe('1');
  expect(params.get('from')).toBe('2026-11-16');
  expect(params.get('to')).toBe('2026-11-18');
  expect(params.get('account')).toBe('acc-a,acc-b');
});

test('an account filter that holds none of its trades says the filters hide them', async () => {
  const card = await cardAt('?account=acc-b');
  expect(
    await within(card).findByText("Your filters hide this strategy's trades."),
  ).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(within(card).getByText('1 won, 1 lost')).toBeTruthy(),
  );
});

test('the caption says figures follow the filters', async () => {
  await cardAt('');
  expect(
    screen.getByText(/Figures follow the date range and accounts/),
  ).toBeTruthy();
});
