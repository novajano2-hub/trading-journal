// @vitest-environment happy-dom
import {
  act,
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
import { KeelDb } from '@/data/local/db';
import { createLocalRepository } from '@/data/local/local-repository';
import {
  STRATEGY_TEMPLATES,
  exampleStats,
  templateById,
} from '@/content/strategy-templates';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView } from './strategies-view';
import { StrategyForm } from './strategy-form';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const LONDON = templateById('london-range-break')!;
const BOX = 'Show templates when I make a strategy';

const here = () => window.location.pathname + window.location.search;
const goTo = (url: string) =>
  act(() => window.history.pushState(null, '', url));

async function templatesTab(url = '/app/strategies?tab=templates') {
  const out = renderApp(<StrategiesView />, { url });
  await screen.findByRole('heading', { name: LONDON.name });
  return out;
}
const cardOf = (name: string) =>
  screen.getByRole('heading', { name }).closest('article')!;
const addButton = (name: string) =>
  within(cardOf(name)).getByRole('button', {
    name: `Add a copy of ${name} to My strategies`,
  });

async function chooser() {
  const out = renderApp(<StrategiesView />, { url: '/app/strategies' });
  fireEvent.click(await screen.findByRole('button', { name: 'New strategy' }));
  const dialog = await screen.findByRole('dialog', { name: 'New strategy' });
  return { ...out, dialog };
}

/** The copies of a template the workspace holds, by when they were made. */
async function copiesOf(
  repo: Awaited<ReturnType<typeof templatesTab>>['repo'],
  id: string,
) {
  return (await repo.strategies.list(WS)).filter((s) => s.templateId === id);
}

test('Strategies has two tabs, My strategies and Templates', async () => {
  renderApp(<StrategiesView />, { url: '/app/strategies' });
  const mine = await screen.findByRole('tab', { name: 'My strategies' });
  expect(mine.getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('tab', { name: 'Shared with me' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
  await screen.findByRole('heading', { name: LONDON.name });
  expect(here()).toBe('/app/strategies?tab=templates');
  fireEvent.click(screen.getByRole('tab', { name: 'My strategies' }));
  await screen.findByText('Opening range breakout');
  expect(here()).toBe('/app/strategies');
});

test('a template card shows its cover, chips, three example figures and its author', async () => {
  await templatesTab();
  const cards = screen
    .getAllByRole('heading', { level: 2 })
    .filter((h) => STRATEGY_TEMPLATES.some((t) => t.name === h.textContent));
  expect(cards.map((h) => h.textContent)).toEqual(
    STRATEGY_TEMPLATES.map((t) => t.name),
  );

  const card = within(cardOf(LONDON.name));
  const s = exampleStats(LONDON);
  expect(card.getByText('by Keel')).toBeTruthy();
  expect(card.getByText(LONDON.description)).toBeTruthy();
  expect(card.getByText('Day trading')).toBeTruthy();
  expect(card.getByText('Forex')).toBeTruthy();
  expect(card.getByRole('img', { name: `${LONDON.name} cover` })).toBeTruthy();
  // The figures say whose they are: the examples', never the trader's.
  expect(cardOf(LONDON.name).textContent).toContain(
    `From its ${s.trades} example trades, not your own`,
  );
  expect(card.getByText('Win rate').closest('div')!.textContent).toContain(
    '50.0%',
  );
  expect(
    card.getByText('Example trades').closest('div')!.textContent,
  ).toContain('4');
  expect(card.getByText('Avg win/loss').closest('div')!.textContent).toContain(
    '2.10',
  );
});

test('the asset and style filters and the search narrow the cards, and an empty result says so', async () => {
  await templatesTab();
  const names = () =>
    screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((n) => STRATEGY_TEMPLATES.some((t) => t.name === n));

  fireEvent.keyDown(screen.getByRole('button', { name: /^Asset/ }), {
    key: 'Enter',
  });
  fireEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: 'Stocks' }),
  );
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(names()).toEqual(['Gap and hold', 'First-hour playbook']);

  fireEvent.keyDown(screen.getByRole('button', { name: /^Style/ }), {
    key: 'Enter',
  });
  fireEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: 'Scalping' }),
  );
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(names()).toEqual(['First-hour playbook']);

  const search = screen.getByRole('searchbox', { name: 'Search templates' });
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(await screen.findByText('No templates match.')).toBeTruthy();
});

test('the search reads a template name or its asset class', async () => {
  await templatesTab();
  const search = screen.getByRole('searchbox', { name: 'Search templates' });
  fireEvent.change(search, { target: { value: 'crypto' } });
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: LONDON.name })).toBeNull(),
  );
  expect(
    screen.getByRole('heading', { name: 'Weekly trend pullback' }),
  ).toBeTruthy();
  fireEvent.change(search, { target: { value: 'london' } });
  expect(
    await screen.findByRole('heading', { name: LONDON.name }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('heading', { name: 'Weekly trend pullback' }),
  ).toBeNull();
});

test('+ creates a copy and opens it', async () => {
  const { repo } = await templatesTab();
  expect(await repo.strategies.list(WS)).toHaveLength(1);

  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));

  const [copy, ...rest] = await copiesOf(repo, LONDON.id);
  expect(rest).toHaveLength(0);
  expect(here()).toBe(`/app/strategies/${copy!.id}`);
  // The copy is the trader's own strategy: the template's words, rules and assets.
  expect(copy).toMatchObject({
    name: LONDON.name,
    description: LONDON.description,
    assetClasses: ['forex'],
    status: 'active',
    icon: 'clock',
    templateId: LONDON.id,
  });
  expect(
    copy!.groups.map((g) => ({
      title: g.title,
      rules: g.rules.map((r) => ({ text: r.text, showWhen: r.showWhen })),
    })),
  ).toEqual(LONDON.groups);
  // Its cover is a file the strategy owns, so its photo can be replaced.
  expect(copy!.photoId).toBeDefined();
  const files = await repo.files.list(WS, `strategy:${copy!.id}`);
  expect(files.map((f) => f.id)).toEqual([copy!.photoId]);
  expect(files[0]!.type).toMatch(/^image\/(png|svg\+xml)$/);
  expect(files[0]!.name).toContain(LONDON.id);
  // It has no trades: the examples are not trades.
  expect(
    (await repo.trades.list(WS)).filter((t) =>
      t.strategyIds.includes(copy!.id),
    ),
  ).toEqual([]);
});

test('a copy is one write: one created row, and its cover is its photo from the start', async () => {
  const { repo } = await templatesTab();
  const before = (await repo.history.list(WS)).length;
  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));
  const [copy] = await copiesOf(repo, LONDON.id);
  const rows = (await repo.history.list(WS)).filter(
    (r) => r.entityId === copy!.id,
  );
  expect(rows.map((r) => [r.type, r.action, r.field])).toEqual([
    ['strategy', 'created', undefined],
  ]);
  expect(await repo.history.list(WS)).toHaveLength(before + 1);
  expect(
    (await repo.files.list(WS, `strategy:${copy!.id}`)).map((f) => f.id),
  ).toEqual([copy!.photoId]);
});

test('a copy whose write fails leaves no strategy and no file behind', async () => {
  const indexedDB = new IDBFactory();
  const repository = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  renderApp(<StrategiesView />, {
    repository,
    url: '/app/strategies?tab=templates',
  });
  await screen.findByRole('heading', { name: LONDON.name });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const allFiles = async () =>
    (await db.files.where('workspaceId').equals(WS).toArray()).map(
      (f) => f.owner,
    );
  const before = await allFiles();
  const strategies = (await repository.strategies.list(WS)).length;
  // The history row cannot be written, so the write that makes the copy fails.
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('no row id');
  });
  try {
    fireEvent.click(addButton(LONDON.name));
    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't add a copy",
    );
  } finally {
    ids.mockRestore();
  }
  expect(await repository.strategies.list(WS)).toHaveLength(strategies);
  // No cover is left owned by a strategy that was never made.
  expect(await allFiles()).toEqual(before);
});

test('a copy never leaves a cover its strategy does not point at, whatever a later write does', async () => {
  const indexedDB = new IDBFactory();
  const repository = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  // Any edit of a strategy fails: a copy must not need one.
  repository.strategies.update = async () => {
    throw new Error('no edit');
  };
  renderApp(<StrategiesView />, {
    repository,
    url: '/app/strategies?tab=templates',
  });
  await screen.findByRole('heading', { name: LONDON.name });
  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));
  const [copy] = (await repository.strategies.list(WS)).filter(
    (x) => x.templateId === LONDON.id,
  );
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const covers = await db.files
    .where('[workspaceId+owner]')
    .equals([WS, `strategy:${copy!.id}`])
    .toArray();
  expect(covers.map((f) => f.id)).toEqual([copy!.photoId]);
});

test('a copied template is marked added and can be copied again', async () => {
  const { repo } = await templatesTab();
  expect(within(cardOf(LONDON.name)).queryByText('Added')).toBeNull();

  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));
  // Back on the Templates tab, as Back would land.
  goTo('/app/strategies?tab=templates');
  await screen.findByRole('heading', { name: LONDON.name });
  await waitFor(() =>
    expect(within(cardOf(LONDON.name)).getByText('Added')).toBeTruthy(),
  );
  // Only the copied template is marked.
  expect(within(cardOf('Gap and hold')).queryByText('Added')).toBeNull();

  // "+" is still there, and adds another copy.
  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));
  const [a, b] = await copiesOf(repo, LONDON.id);
  expect(await copiesOf(repo, LONDON.id)).toHaveLength(2);
  expect(a!.id).not.toBe(b!.id);
  expect(a!.photoId).not.toBe(b!.photoId);
});

test('a copy that cannot be made says so, and the card stays as it was', async () => {
  const { repo } = await templatesTab();
  repo.strategies.create = async () => {
    throw new Error('no room');
  };
  fireEvent.click(addButton(LONDON.name));
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Couldn't add a copy",
  );
  expect(within(cardOf(LONDON.name)).queryByText('Added')).toBeNull();
  expect(here()).toBe('/app/strategies?tab=templates');
});

test('the chooser opens on New strategy, and closing it returns to the list', async () => {
  const { dialog } = await chooser();
  expect(here()).toBe('/app/strategies?choose=1');
  expect(within(dialog).getByText('Start blank')).toBeTruthy();
  for (const t of STRATEGY_TEMPLATES)
    expect(within(dialog).getByText(t.name)).toBeTruthy();
  expect(within(dialog).getAllByText('Keel').length).toBe(6);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(here()).toBe('/app/strategies');
  expect(await screen.findByText('Opening range breakout')).toBeTruthy();
});

test('the chooser filters by asset class and searches name and asset class; Start blank stays', async () => {
  const { dialog } = await chooser();
  const d = within(dialog);
  fireEvent.click(d.getByRole('radio', { name: 'Forex' }));
  expect(d.getByText(LONDON.name)).toBeTruthy();
  expect(d.queryByText('Gap and hold')).toBeNull();
  fireEvent.click(d.getByRole('radio', { name: 'All' }));

  const search = d.getByRole('searchbox', { name: 'Search templates' });
  fireEvent.change(search, { target: { value: 'option' } });
  expect(d.getByText('Defined-risk earnings')).toBeTruthy();
  expect(d.queryByText(LONDON.name)).toBeNull();
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(d.getByText('No templates match.')).toBeTruthy();
  expect(d.getByText('Start blank')).toBeTruthy();
});

test('the chooser opens fresh each time: no filter or search kept from before', async () => {
  const { dialog } = await chooser();
  const d = within(dialog);
  fireEvent.click(d.getByRole('radio', { name: 'Forex' }));
  fireEvent.change(d.getByRole('searchbox', { name: 'Search templates' }), {
    target: { value: 'london' },
  });
  fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  fireEvent.click(await screen.findByRole('button', { name: 'New strategy' }));
  const again = within(
    await screen.findByRole('dialog', { name: 'New strategy' }),
  );
  expect(
    (
      again.getByRole('searchbox', {
        name: 'Search templates',
      }) as HTMLInputElement
    ).value,
  ).toBe('');
  expect(
    (again.getByRole('radio', { name: 'All' }) as HTMLInputElement).checked,
  ).toBe(true);
  for (const t of STRATEGY_TEMPLATES)
    expect(again.getByText(t.name)).toBeTruthy();
});

test('Start blank opens the empty form', async () => {
  const { dialog } = await chooser();
  fireEvent.click(within(dialog).getByRole('button', { name: /Start blank/ }));
  expect(here()).toBe('/app/strategies/new');
});

test('the chooser box turns the chooser off and the Templates tab turns it back on', async () => {
  const { repo, dialog } = await chooser();
  const box = within(dialog).getByRole('checkbox', {
    name: BOX,
  }) as HTMLInputElement;
  expect(box.checked).toBe(true);

  fireEvent.click(box);
  await waitFor(async () =>
    expect((await repo.prefs.get()).strategyChooser).toBe(false),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // With the box off, New strategy goes straight to the blank form.
  const link = await screen.findByRole('link', { name: 'New strategy' });
  expect(link.getAttribute('href')).toBe('/app/strategies/new');
  expect(screen.queryByRole('button', { name: 'New strategy' })).toBeNull();

  // The Templates tab carries the same box, now off.
  fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
  const tabBox = (await screen.findByRole('checkbox', {
    name: BOX,
  })) as HTMLInputElement;
  expect(tabBox.checked).toBe(false);
  fireEvent.click(tabBox);
  await waitFor(async () =>
    expect((await repo.prefs.get()).strategyChooser).toBe(true),
  );

  // New strategy opens the chooser again.
  fireEvent.click(await screen.findByRole('button', { name: 'New strategy' }));
  expect(
    await screen.findByRole('dialog', { name: 'New strategy' }),
  ).toBeTruthy();
});

test('with no strategies, New strategy in the empty state opens the chooser too', async () => {
  renderApp(<StrategiesView />, {
    sample: async () => ({ ...fixtureSample(), strategies: [] }),
    url: '/app/strategies',
  });
  await screen.findByText('No strategies yet.');
  // The Templates tab is there even before the first strategy.
  expect(screen.getByRole('tab', { name: 'Templates' })).toBeTruthy();
  const buttons = screen.getAllByRole('button', { name: 'New strategy' });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[1]!);
  expect(
    await screen.findByRole('dialog', { name: 'New strategy' }),
  ).toBeTruthy();
});

test('picking a template opens the create form for it', async () => {
  const { dialog } = await chooser();
  fireEvent.click(
    within(dialog).getByRole('button', { name: new RegExp(LONDON.name) }),
  );
  expect(here()).toBe(`/app/strategies/new?template=${LONDON.id}`);
});

test('picking a template fills the form unsaved', async () => {
  const { repo } = renderApp(<StrategyForm />, {
    url: `/app/strategies/new?template=${LONDON.id}`,
  });
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
  expect(name.value).toBe(LONDON.name);
  expect(
    (screen.getByLabelText('Description') as HTMLTextAreaElement).value,
  ).toBe(LONDON.description);
  expect(
    (screen.getByRole('radio', { name: 'Clock' }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (screen.getByRole('checkbox', { name: 'Forex' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole('checkbox', { name: 'Stocks' }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  // The groups and rules are the template's, in order, ready to edit.
  const groups = LONDON.groups.map((g) =>
    within(screen.getByRole('group', { name: g.title })),
  );
  LONDON.groups.forEach((g, i) => {
    expect(
      groups[i]!.getAllByLabelText('Rule text').map(
        (r) => (r as HTMLInputElement).value,
      ),
    ).toEqual(g.rules.map((r) => r.text));
    expect(
      groups[i]!.getAllByLabelText('Show when').map(
        (r) => (r as HTMLSelectElement).value,
      ),
    ).toEqual(g.rules.map((r) => r.showWhen));
  });
  expect(
    screen.getByText(/Filled from the London range break template/),
  ).toBeTruthy();
  expect(screen.getByText(/Nothing is saved until you create it/)).toBeTruthy();

  // Unsaved: nothing is stored, and it stays so until Create strategy.
  expect(await repo.strategies.list(WS)).toHaveLength(1);
  expect(await repo.files.list(WS, 'strategy:anything')).toEqual([]);
});

test('creating from the filled form keeps the link to the template and its cover', async () => {
  const { repo } = renderApp(<StrategyForm />, {
    url: `/app/strategies/new?template=${LONDON.id}`,
  });
  await screen.findByLabelText('Name');
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'London break, mine' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  await waitFor(async () =>
    expect(await copiesOf(repo, LONDON.id)).toHaveLength(1),
  );
  const [copy] = await copiesOf(repo, LONDON.id);
  expect(copy!.name).toBe('London break, mine');
  expect(copy!.templateId).toBe(LONDON.id);
  await waitFor(async () =>
    expect((await repo.strategies.get(WS, copy!.id))!.photoId).toBeDefined(),
  );
  // And it opens the new strategy.
  await waitFor(() => expect(here()).toBe(`/app/strategies/${copy!.id}`));
  expect(
    (await repo.files.list(WS, `strategy:${copy!.id}`)).map((f) => f.id),
  ).toEqual([(await repo.strategies.get(WS, copy!.id))!.photoId]);
});

test('an unknown template id leaves the empty form, as a blank start does', async () => {
  renderApp(<StrategyForm />, {
    url: '/app/strategies/new?template=not-a-template',
  });
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
  expect(name.value).toBe('');
  expect(screen.queryByText(/Filled from/)).toBeNull();
  expect(
    screen
      .getAllByLabelText('Group name')
      .map((g) => (g as HTMLInputElement).value),
  ).toEqual(['Entry', 'Exit', 'Risk', 'Management']);
});

test('Cancel on the create form returns to the chooser', async () => {
  renderApp(<StrategyForm />, {
    url: `/app/strategies/new?template=${LONDON.id}`,
  });
  await screen.findByLabelText('Name');
  expect(
    screen.getByRole('link', { name: 'Cancel' }).getAttribute('href'),
  ).toBe('/app/strategies?choose=1');
});

test('with the chooser off, Cancel on the create form returns to the list', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ strategyChooser: false });
  renderApp(<StrategyForm />, { repository, url: '/app/strategies/new' });
  await screen.findByLabelText('Name');
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'Cancel' }).getAttribute('href'),
    ).toBe('/app/strategies'),
  );
});

test('editing a strategy keeps its Cancel and its link to the template', async () => {
  const { repo } = renderApp(<StrategyForm strategyId="str-1" />, {
    url: '/app/strategies/str-1/edit',
  });
  await screen.findByLabelText('Name');
  expect(
    screen.getByRole('link', { name: 'Cancel' }).getAttribute('href'),
  ).toBe('/app/strategies/str-1');
  expect(screen.queryByText(/Filled from/)).toBeNull();
  await repo.strategies.update(WS, 'str-1', { templateId: LONDON.id });
});

test('examples never reach a figure', async () => {
  const { repo } = await templatesTab();
  const { summarize } = await import('@/domain/metrics/summary');
  const { breakdown } = await import('@/domain/metrics/breakdowns');
  const { defaultMetricContext } = await import('@/domain/metrics/context');
  const ctx = {
    ...defaultMetricContext('UTC'),
    strategyNames: { 'str-1': 'Opening range breakout' },
  };
  const figures = async () => {
    const trades = await repo.trades.list(WS);
    const strategies = await repo.strategies.list(WS);
    return {
      count: trades.length,
      summary: summarize(trades, ctx),
      byStrategy: breakdown(trades, 'strategy', ctx),
      // Every strategy's own trades.
      perStrategy: strategies.map((s) => [
        s.id,
        summarize(
          trades.filter((t) => t.strategyIds.includes(s.id)),
          ctx,
        ),
      ]),
    };
  };
  const before = await figures();

  fireEvent.click(addButton(LONDON.name));
  await waitFor(() => expect(here()).toMatch(/^\/app\/strategies\/[^/?]+$/));
  const [copy] = await copiesOf(repo, LONDON.id);

  const after = await figures();
  // The workspace's trades, its summary and its by-strategy report are as they were.
  expect(after.count).toBe(before.count);
  expect(after.summary).toEqual(before.summary);
  expect(after.byStrategy).toEqual(before.byStrategy);
  // The old strategies' figures are as they were; the copy has no trades behind it.
  expect(after.perStrategy.filter(([id]) => id !== copy!.id)).toEqual(
    before.perStrategy,
  );
  const mine = after.perStrategy.find(([id]) => id === copy!.id)![1] as Awaited<
    ReturnType<typeof summarize>
  >;
  expect(mine.closedCount).toBe(0);
  expect(mine.winRate).toBeNull();
  expect(mine.wins + mine.losses).toBe(0);
  // None of its examples is a trade: no trade carries a symbol the examples use.
  const symbols = new Set(LONDON.examples.map((e) => e.symbol));
  expect(
    (await repo.trades.list(WS)).filter((t) =>
      symbols.has(t.instrument.symbol),
    ),
  ).toEqual([]);
});
