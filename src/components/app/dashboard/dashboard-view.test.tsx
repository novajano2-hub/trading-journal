// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { strategyRules } from '@/domain/types';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { StorageUnavailableError, type Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { keepHyphens } from '@/lib/format';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { DashboardView } from './dashboard-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// happy-dom rejects a cancelled animation's `finished` promise unhandled
// (browsers mark it handled), and a pressed button's ripple is cancelled when
// its empty state gives way. Animations finish at once here.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fx = fixtureSample();
const rule = (id: string) =>
  strategyRules(fx.strategies[0]!).find((r) => r.id === id)!.text;
const r1 = rule('r-1');
const r2 = rule('r-2');
/** r-1 as it shows: "15-minute" can't break at its hyphen. */
const r1Shown = keepHyphens(r1);
/** The drill-down's title: the rule, then its strategy. */
const r1Dialog = keepHyphens(`${r1} (${fx.strategies[0]!.name})`);
const fomo = fx.tags.find((t) => t.id === 'tag-fomo')!.name;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Rule and mistake buttons' aria-labels start "{text}." */
const opener = (text: string) => new RegExp(`^${esc(text)}\\.`);

const graded = async () => dashboardFixture();

/** The graded fixture with `edit` applied. */
function sampleWith(edit: (s: SampleWorkspace) => void) {
  return async () => {
    const s = dashboardFixture();
    edit(s);
    return s;
  };
}

/** The sample's trades replaced by `kept` that kept r-1 and `broken` that broke it. */
function adherenceOf(kept: number, broken: number) {
  return sampleWith((s) => {
    const base = s.trades.find((t) => t.id === 'f-2')!;
    s.trades = Array.from({ length: kept + broken }, (_, i) => {
      const closedAt = Date.UTC(2026, 10, 2, 15) + i * 60_000;
      return {
        ...base,
        id: `g-${i}`,
        serial: i + 1,
        openedAt: new Date(closedAt - 30_000).toISOString(),
        closedAt: new Date(closedAt).toISOString(),
        ruleChecks: [{ ruleId: 'r-1', followed: i < kept }],
        tagIds: [],
      };
    });
  });
}

/** What a screen reader gets: aria-hidden parts (the ticker's count) dropped. */
function spoken(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return copy.textContent ?? '';
}

/** A fresh local repository over `sample`, with some methods replaced. */
function repositoryWith(
  patch: (repo: Repository) => Partial<Repository>,
  sample = graded,
): Repository {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  return { ...repo, ...patch(repo) };
}

test('loading first', () => {
  renderApp(<DashboardView />, { sample: graded });
  expect(
    screen.getByRole('status', { name: 'Loading your dashboard' }),
  ).toBeTruthy();
});

test('your plan: adherence, cost once per trade, rules by cost with the costliest flagged', async () => {
  renderApp(<DashboardView />, { sample: graded });
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  expect(plan.textContent).toContain('75%'); // the ticker renders its final string more than once (sr-only and final copy)
  expect(plan.textContent).toContain('−$400.00');
  const rows = within(within(plan).getByRole('table', { name: 'Rules' }))
    .getAllByRole('row')
    .slice(1);
  // On screen the rule can't break at its hyphen; its label keeps the plain text.
  expect(r1Shown).not.toBe(r1);
  expect(rows[0]!.textContent).toContain(r1Shown);
  expect(rows[0]!.textContent).toContain('Costliest');
  // Each row names its strategy on the line under the rule.
  expect(rows[0]!.textContent).toContain(fx.strategies[0]!.name);
  expect(rows[1]!.textContent).toContain(fx.strategies[0]!.name);
  expect(rows[1]!.textContent).toContain(r2);
  expect(rows[1]!.textContent).toContain('none');
  // A never-broken rule is not a drill-down.
  expect(
    within(rows[1]!).queryByRole('button', { name: opener(r2) }),
  ).toBeNull();
  expect(
    within(rows[0]!)
      .getByRole('button', { name: opener(r1) })
      .getAttribute('aria-label'),
  ).toBe(
    `${r1}. Kept 1 of 2, 50%. Cost when broken −$400.00. Show the trades.`,
  );
  expect(
    document.querySelector('[data-testid="dashboard-ready"]'),
  ).toBeTruthy();
});

test('a losers-only rule is never flagged Costliest, though its broken trades lost the most', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      strategyRules(s.strategies[0]!).find((r) => r.id === 'r-1')!.showWhen =
        'loser';
    }),
  });
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  const rows = within(within(plan).getByRole('table', { name: 'Rules' }))
    .getAllByRole('row')
    .slice(1);
  expect(rows[0]!.textContent).toContain(r1Shown);
  expect(plan.textContent).not.toContain('Costliest');
});

test.each([
  [199, 1, '99.5%', /(?<![\d.])100%/],
  [1, 299, '0.3%', /(?<![\d.])0%/],
])(
  'adherence of %i kept and %i broken reads %s in the headline and the row, never an edge it has not reached',
  async (kept, broken, shown, edge) => {
    renderApp(<DashboardView />, { sample: adherenceOf(kept, broken) });
    const plan = await screen.findByRole('region', {
      name: 'Your plan, all time',
    });
    const table = within(plan).getByRole('table', { name: 'Rules' });
    const row = within(table).getAllByRole('row')[1]!;
    expect(row.textContent).toContain(shown);
    expect(row.textContent).not.toMatch(edge);
    expect(
      within(row)
        .getByRole('button', { name: opener(r1) })
        .getAttribute('aria-label'),
    ).toContain(`Kept ${kept} of ${kept + broken}, ${shown}.`);
    const headline = spoken(plan).replace(spoken(table), '');
    expect(headline).toContain(shown);
    expect(headline).not.toMatch(edge);
  },
);

test('a trade that broke two rules counts once in the headline, in both rows, and the definitions say so (Review Focus 4)', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      s.trades.find((t) => t.id === 'f-1')!.ruleChecks = [
        { ruleId: 'r-1', followed: false },
        { ruleId: 'r-2', followed: false },
      ];
    }),
  });
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  const rows = within(within(plan).getByRole('table', { name: 'Rules' }))
    .getAllByRole('row')
    .slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.textContent).toContain('−$400.00');
  expect(plan.textContent).not.toContain('−$800.00');

  fireEvent.focus(
    within(plan).getByRole('button', { name: 'Broken rules cost' }),
  );
  expect((await screen.findByRole('tooltip')).textContent).toContain(
    'A trade that broke several rules counts once.',
  );
  fireEvent.focus(
    within(plan).getByRole('button', { name: 'Cost when broken' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('tooltip').textContent).toContain(
      'rows can add up to more than the total',
    ),
  );
});

test('a rule opens its trades; Escape closes; focus returns (signature move)', async () => {
  renderApp(<DashboardView />, { sample: graded });
  const open = await screen.findByRole('button', { name: opener(r1) });
  open.focus();
  fireEvent.click(open);
  const dialog = await screen.findByRole('dialog', { name: r1Dialog });
  expect(within(dialog).getAllByRole('row')).toHaveLength(2);
  expect(dialog.textContent).toContain(
    'Broken on 1 trade, all time. Cost when broken −$400.00. Trades that kept it: +$600.00.',
  );
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(open);
});

test('clicking anywhere on a rule row opens it', async () => {
  renderApp(<DashboardView />, { sample: graded });
  const open = await screen.findByRole('button', { name: opener(r1) });
  fireEvent.click(open.closest('tr')!.lastElementChild!);
  expect(await screen.findByRole('dialog', { name: r1Dialog })).toBeTruthy();
});

test('regrading in the drill-down saves the check, keeps the row, and updates the plan', async () => {
  const { repo } = renderApp(<DashboardView />, { sample: graded });
  fireEvent.click(await screen.findByRole('button', { name: opener(r1) }));
  const dialog = await screen.findByRole('dialog', { name: r1Dialog });
  const kept = within(dialog).getByRole('checkbox', {
    name: new RegExp(`^Kept ${esc(r1)} on ESZ5 `),
  }) as HTMLInputElement;
  expect(kept.checked).toBe(false);
  // Drawn as a broken mark, not an empty box, and said as much.
  const mark = kept.closest('label')!;
  expect(mark.textContent).toBe('Broken');
  expect(mark.querySelector('.text-loss:not(.opacity-0)')).toBeTruthy();
  fireEvent.click(kept);
  expect(kept.checked).toBe(true); // at once, before the save lands
  expect(mark.textContent).toBe('Kept');
  expect(mark.querySelector('.text-gain:not(.opacity-0)')).toBeTruthy();
  await waitFor(async () =>
    expect(
      (await repo.trades.get('sample', 'f-1'))!.ruleChecks.find(
        (c) => c.ruleId === 'r-1',
      )!.followed,
    ).toBe(true),
  );
  // the plan behind the dialog (aria-hidden while it is open) updates; the dialog keeps its row
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Your plan, all time', hidden: true })
        .textContent,
    ).toContain('100%'),
  );
  expect(within(dialog).getAllByRole('row')).toHaveLength(2);
  expect(kept.checked).toBe(true);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole('table', { name: 'Rules' }),
  ); // the opener is gone (r-1 is never broken now)
});

test('a regrade that fails to save reverts with an inline error', async () => {
  const repository = repositoryWith((repo) => ({
    trades: {
      ...repo.trades,
      update: () => Promise.reject(new Error('disk full')),
    },
  }));
  renderApp(<DashboardView />, { repository });
  fireEvent.click(await screen.findByRole('button', { name: opener(r1) }));
  const dialog = await screen.findByRole('dialog', { name: r1Dialog });
  const kept = within(dialog).getByRole('checkbox', {
    name: new RegExp(`^Kept ${esc(r1)}`),
  }) as HTMLInputElement;
  fireEvent.click(kept);
  expect(kept.checked).toBe(true);
  expect(
    await within(dialog).findByText("Couldn't save. Try again."),
  ).toBeTruthy();
  expect(kept.checked).toBe(false);
});

test('a mistake opens its trades', async () => {
  renderApp(<DashboardView />, { sample: graded });
  const mistakes = await screen.findByRole('region', {
    name: 'Mistakes by cost',
  });
  const open = within(mistakes).getByRole('button', { name: opener(fomo) });
  expect(open.getAttribute('aria-label')).toBe(
    `${fomo}. 1 trade, −$400.00. Show the trades.`,
  );
  open.focus();
  fireEvent.click(open);
  const dialog = await screen.findByRole('dialog', { name: fomo });
  const rows = within(dialog).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  // The future reads as root and contract month; the title keeps the symbol.
  expect(rows[0]!.textContent).toContain('ES Dec 25');
  expect(within(rows[0]!).getByTitle('ESZ5')).toBeTruthy();
  expect(rows[0]!.textContent).toContain('−$400.00');
  // Every row carries the opened mistake and none has another: no Mistakes column.
  const headers = within(dialog)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual(['Time', 'Symbol', 'Side', 'Strategy', 'Net P&L']);
  expect(rows[0]!.textContent).not.toContain(fomo);
  expect(rows[0]!.textContent).not.toContain('None');
  expect(dialog.textContent).toContain('1 trade, all time, −$400.00 net.');
  // A mistake's trades are not regraded here.
  expect(within(dialog).queryByRole('checkbox')).toBeNull();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(open);
});

test("a mistake's rows list only the trade's other mistakes", async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      s.tags.push({
        id: 'tag-size',
        workspaceId: 'sample',
        name: 'oversized',
        categoryId: 'mistakes',
      });
      s.trades.find((t) => t.id === 'f-1')!.tagIds = ['tag-fomo', 'tag-size'];
      const f2 = s.trades.find((t) => t.id === 'f-2')!;
      f2.tagIds = ['tag-fomo'];
      f2.strategyIds = [];
    }),
  });
  const mistakes = await screen.findByRole('region', {
    name: 'Mistakes by cost',
  });
  fireEvent.click(within(mistakes).getByRole('button', { name: opener(fomo) }));
  const dialog = await screen.findByRole('dialog', { name: fomo });
  expect(
    within(dialog)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toContain('Other mistakes');
  const [f1, f2] = within(dialog).getAllByRole('row').slice(1);
  expect(f1!.textContent).toContain('oversized');
  expect(f1!.textContent).not.toContain(fomo);
  expect(f2!.textContent).not.toContain(fomo);
  expect(f2!.textContent).toContain('None');
  // A trade with no strategy reads as Recent trades does.
  for (const none of within(f2!).getAllByText('None'))
    expect(none.className).toContain('text-faint');
});

test('a filter that matches nothing offers Clear filters (Review Focus 2)', async () => {
  renderApp(<DashboardView />, {
    sample: graded,
    url: '/app/dashboard?symbol=ZZZ',
  });
  expect(
    await screen.findByText('No trades match these filters.'),
  ).toBeTruthy();
  expect(screen.queryByRole('figure')).toBeNull(); // the preview is for an empty workspace
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  // The button is gone: focus lands on the plan that replaced it.
  await waitFor(() => expect(document.activeElement).toBe(plan));
});

test('an empty workspace offers Import and the sample (Review Focus 2)', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: graded,
  });
  await repository.workspaces.setActive('mine');
  renderApp(<DashboardView />, { repository });
  expect(
    await screen.findByText('No trades in My workspace yet.'),
  ).toBeTruthy();
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
  // A ghosted, labelled "Your plan": rule rows, no numbers.
  const preview = screen.getByRole('figure', {
    name: 'Your rules and what breaking them costs will show here.',
  });
  expect(preview.textContent).not.toMatch(/\d/);
  expect(
    screen.getByRole('link', { name: 'Import' }).getAttribute('href'),
  ).toBe('/app/import');
  fireEvent.click(
    screen.getByRole('button', { name: 'Open the sample workspace' }),
  );
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  await waitFor(() => expect(document.activeElement).toBe(plan));
});

test('open trades only, with no filters, wait for a close', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      for (const t of s.trades) {
        t.status = 'open';
        delete t.closedAt;
        delete t.avgExit;
      }
    }),
  });
  expect(await screen.findByText('No closed trades yet.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

test('filters that match only open trades say so, and offer Clear filters', async () => {
  renderApp(<DashboardView />, {
    // f-2 is the only short trade: still open, the Short filter holds no closed one.
    sample: sampleWith((s) => {
      const short = s.trades.find((t) => t.id === 'f-2')!;
      short.status = 'open';
      delete short.closedAt;
      delete short.avgExit;
    }),
    url: '/app/dashboard?side=short',
  });
  expect(
    await screen.findByText('No closed trades in these filters yet.'),
  ).toBeTruthy();
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
  expect(
    screen.getByText('Open positions count here once they close.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  await waitFor(() => expect(document.activeElement).toBe(plan));
});

test("ungraded trades show the plan's empty state, not 0% (Review Focus 1)", async () => {
  renderApp(<DashboardView />, {
    sample: async () => dashboardFixture({ graded: false }),
  });
  expect(
    await screen.findByText('No graded trades in this range.'),
  ).toBeTruthy();
  expect(screen.queryByText('0%')).toBeNull();
  // A bare 0%, not one inside a larger figure such as Performance's 50.0% win rate.
  expect(document.body.textContent).not.toMatch(/NaN|(?<![\d.])0%/);
  expect(screen.queryByRole('table', { name: 'Rules' })).toBeNull();
  // Mistakes still read real numbers.
  expect(screen.getByRole('button', { name: opener(fomo) })).toBeTruthy();
});

test('storage failure is an alert with a retry that reloads the page', async () => {
  const repository = repositoryWith((repo) => ({
    trades: {
      ...repo.trades,
      list: () => Promise.reject(new StorageUnavailableError()),
    },
  }));
  renderApp(<DashboardView />, { repository });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("can't open storage");
  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();
});

test('any other failure retries in place', async () => {
  let fail = true;
  const repository = repositoryWith((repo) => ({
    trades: {
      ...repo.trades,
      list: (ws: string) =>
        fail ? Promise.reject(new Error('boom')) : repo.trades.list(ws),
    },
  }));
  renderApp(<DashboardView />, { repository });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Your dashboard couldn't load.");
  expect(alert.textContent).not.toContain('boom');
  fail = false;
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(
    await screen.findByRole('region', { name: 'Your plan, all time' }),
  ).toBeTruthy();
});

test('the five costliest rules show, then all of them on request', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      const extra = [3, 4, 5, 6].map((n) => ({
        id: `r-${n}`,
        text: `Extra rule ${n}`,
        showWhen: 'always' as const,
      }));
      s.strategies[0]!.groups[1]!.rules.push(...extra);
      s.trades
        .find((t) => t.id === 'f-2')!
        .ruleChecks.push(
          ...extra.map((r) => ({ ruleId: r.id, followed: true })),
        );
    }),
  });
  const table = await screen.findByRole('table', { name: 'Rules' });
  expect(within(table).getAllByRole('row').slice(1)).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Show all 6 rules' }));
  expect(within(table).getAllByRole('row').slice(1)).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
  expect(within(table).getAllByRole('row').slice(1)).toHaveLength(5);
});

test('two currencies: one at a time, with a switch and a plain note', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      s.trades.find((t) => t.id === 'f-2')!.pnlCurrency = 'EUR';
    }),
  });
  const plan = await screen.findByRole('region', {
    name: 'Your plan, all time',
  });
  expect(
    screen.getByText(
      "Each currency is shown on its own. Converting between them isn't built yet.",
    ),
  ).toBeTruthy();
  const currency = screen.getByRole('radiogroup', { name: 'Currency' });
  expect(
    (within(currency).getByRole('radio', { name: 'USD' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(plan.textContent).toContain('50%');
  fireEvent.click(within(currency).getByRole('radio', { name: 'EUR' }));
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Your plan, all time' }).textContent,
    ).toContain('100%'),
  );
});

/** Every text node and every attribute value under `root`, which is what any reader (a screen, a tooltip, a screen reader) can get. */
function everyString(root: Element): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) out.push(n.textContent ?? '');
    else
      for (const a of Array.from((n as Element).attributes)) out.push(a.value);
  }
  return out;
}

async function inUnit(
  displayUnit: 'privacy' | 'percent' | 'r' | 'ticks',
  sample = graded,
) {
  const repository = repositoryWith(() => ({}), sample);
  await repository.prefs.update({ displayUnit });
  return renderApp(<DashboardView />, { repository });
}

test('under Privacy no amount survives anywhere in the dashboard, not a label, a title or a ticker', async () => {
  await inUnit('privacy');
  await screen.findByTestId('dashboard-ready');
  const root = document.body;
  expect(everyString(root).filter((s) => /\$\d/.test(s))).toEqual([]);
  const plan = screen.getByRole('region', { name: 'Your plan, all time' });
  expect(plan.textContent).toContain('−$•••');
  expect(plan.textContent).not.toContain('−$400.00');
  // The drill-down's own amounts are hidden too.
  fireEvent.click(within(plan).getByRole('button', { name: opener(r1) }));
  const dialog = await screen.findByRole('dialog');
  expect(everyString(dialog).filter((s) => /\$\d/.test(s))).toEqual([]);
  expect(dialog.textContent).toContain('$•••');
});

test('in Percentage the amounts read over the accounts, signed to two decimals', async () => {
  await inUnit('percent');
  await screen.findByTestId('dashboard-ready');
  const plan = screen.getByRole('region', { name: 'Your plan, all time' });
  expect(plan.textContent).toMatch(/−\d+\.\d{2}%/);
  expect(plan.textContent).not.toContain('−$400.00');
  expect(
    within(screen.getByTestId('kpi-pnl')).getAllByText(/%/).length,
  ).toBeGreaterThan(0);
});

test('in R with no trade that has a stop, the Dashboard says R reads none of them', async () => {
  await inUnit('r');
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  expect(
    screen.getByText('R-multiple counts trades with a stop only.'),
  ).toBeTruthy();
  expect(screen.queryByTestId('dashboard-ready')).toBeNull();
  expect(document.body.textContent).not.toMatch(/NaN|undefined|null/);
});

test('under Privacy the screen-reader text of every amount reads "hidden amount", never the bullets', async () => {
  await inUnit('privacy');
  await screen.findByTestId('dashboard-ready');
  const pnl = screen.getByTestId('kpi-pnl');
  expect(
    Array.from(pnl.querySelectorAll('.sr-only')).map((e) => e.textContent),
  ).toContain('hidden amount');
  const plan = screen.getByRole('region', { name: 'Your plan, all time' });
  expect(
    Array.from(plan.querySelectorAll('.sr-only')).map((e) => e.textContent),
  ).toContain('hidden amount');
  // Nothing a screen reader can get is bullets: every sr-only string and every label.
  const heard = [
    ...Array.from(document.body.querySelectorAll('.sr-only')).map(
      (e) => e.textContent ?? '',
    ),
    ...Array.from(document.body.querySelectorAll('[aria-label]')).map(
      (e) => e.getAttribute('aria-label') ?? '',
    ),
  ];
  expect(heard.filter((s) => s.includes('•'))).toEqual([]);
  const mistake = screen.getByRole('region', { name: /mistakes/i });
  expect(
    within(mistake)
      .getAllByRole('button')
      .some((b) => /hidden amount/.test(b.getAttribute('aria-label') ?? '')),
  ).toBe(true);
});

test('the unit empty state keeps Clear filters while a filter is set', async () => {
  const repository = repositoryWith(() => ({}));
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<DashboardView />, {
    repository,
    url: '/app/dashboard?symbol=ES',
  });
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

test('under R the Dashboard reads only the trades with a stop, so no figure leaves one out', async () => {
  // Only the first trade has a risk: the set is that trade alone.
  await inUnit(
    'r',
    sampleWith((s) => {
      s.trades[0]!.initialRisk = 10000;
    }),
  );
  await screen.findByTestId('dashboard-ready');
  const text = (e: Element) => e.textContent ?? '';
  const pnl = screen.getByTestId('kpi-pnl');
  // f-1 lost $400 on a $100 risk.
  expect(pnl.textContent).toContain('−4.00R');
  const heard = [
    document.body.textContent ?? '',
    ...Array.from(pnl.querySelectorAll('.sr-only')).map(text),
    ...Array.from(document.body.querySelectorAll('[aria-label]')).map(
      (e) => e.getAttribute('aria-label') ?? '',
    ),
  ];
  expect(heard.some((s) => /left out/.test(s))).toBe(false);
  const recent = screen.getByRole('table', { name: 'Recent trades' });
  expect(within(recent).getAllByRole('row').slice(1)).toHaveLength(1);
});

test('under Ticks the balance has no value: the equity reads None', async () => {
  await inUnit('ticks');
  await screen.findByTestId('dashboard-ready');
  const perf = screen.getByRole('region', { name: 'Performance' });
  expect(perf.textContent).not.toMatch(/\$\d/);
  expect(
    within(perf).getByRole('img', {
      name: 'Equity line, the balance has no value in Ticks',
    }),
  ).toBeTruthy();
  const equity = within(perf).getByRole('button', { name: 'Equity' });
  expect(equity.parentElement!.textContent).toBe('Equity None');
});

test("a trade with no mistake in a rule's drill-down can be tagged on the spot (E46)", async () => {
  const { repo } = renderApp(<DashboardView />, {
    // The broken trade carries no mistake yet.
    sample: sampleWith((s) => s.trades.forEach((t) => (t.tagIds = []))),
  });
  const count = async () =>
    (await repo.trades.list('sample')).filter((t) =>
      t.tagIds.includes('tag-fomo'),
    ).length;
  const before = await count();
  fireEvent.click(await screen.findByRole('button', { name: opener(r1) }));
  const dialog = await screen.findByRole('dialog', { name: r1Dialog });
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: /^Tag a mistake on / })[0]!,
  );
  const picker = await screen.findByRole('combobox', { name: 'Mistakes' });
  // Only the mistake categories are listed.
  await screen.findByRole('option', { name: fomo });
  expect(screen.queryByRole('option', { name: 'breakout' })).toBeNull();
  fireEvent.change(picker, { target: { value: 'fom' } });
  fireEvent.keyDown(picker, { key: 'Enter' });
  await waitFor(async () => expect(await count()).toBe(before + 1));
});

test('a workspace whose accounts are all archived says where the trades are, with a link to Accounts', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      for (const a of s.accounts) a.status = 'archived';
    }),
  });
  expect(
    await screen.findByText('Your trades are in archived accounts.'),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Open Accounts' }).getAttribute('href'),
  ).toBe('/app/settings/accounts');
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
});
