// @vitest-environment happy-dom
// One fixture read by every page that shows the same figure, under Ticks and
// R: a figure must read the same wherever it is shown (final review,
// Recommendation 1). Each page's own tests pin its layout; this pins the
// agreement between them.
import { cleanup, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { DisplayUnit, Execution, Trade } from '@/domain/types';
import { renderApp } from './__fixtures__/render-app';
import { DashboardView } from './dashboard/dashboard-view';
import { CompareView } from './reports/compare';
import { OverviewView } from './reports/overview';
import { PerformanceView } from './reports/performance';
import { StrategyView } from './strategies/strategy-view';
import { TradesView } from './trades/trades-view';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);
beforeEach(() => {
  window.innerWidth = 1440;
});

const fill = (
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
): Execution => ({
  id,
  accountId: 'acc-a',
  symbol: 'ESZ5',
  side,
  qty,
  price,
  time,
  fees: 0,
  commission: 0,
});

/**
 * New York days, every trade in str-1, each risking $100:
 *   x-1 ES   Mon 2 Nov  +8 ticks   +$100  +1R
 *   x-2 ES   Mon 2 Nov  -4 ticks    -$50  -0.5R
 *   x-3 ES   Tue 3 Nov  +1 tick       $0  breakeven
 *   x-4 EUR  Tue 3 Nov  no ticks    +$30  +0.3R
 *   x-5 ES   two contracts, one out Wed 4 Nov at +24 ticks (+$300, +3R),
 *            the other Thu 5 Nov at -8 ticks (-$100, -1R): +16 ticks, +$200, +2R
 */
async function crossSample(): Promise<SampleWorkspace> {
  const s = fixtureSample();
  const t = (p: Partial<Trade> & { id: string; net: number }): Trade =>
    makeTrade({
      serial: Number(p.id.slice(2)),
      workspaceId: SAMPLE_WORKSPACE.id,
      accountId: 'acc-a',
      gross: p.net,
      fees: 0,
      instrument: resolveInstrument('ESZ5')!,
      avgEntry: 4500,
      initialRisk: 10000,
      strategyIds: ['str-1'],
      tagIds: [],
      ruleChecks: [],
      ...p,
    });
  const at = (day: string, from: string, to: string) => ({
    openedAt: `${day}T${from}:00Z`,
    closedAt: `${day}T${to}:00Z`,
  });
  s.trades = [
    t({
      id: 'x-1',
      net: 10000,
      avgExit: 4502,
      ...at('2026-11-02', '15:00', '15:30'),
    }),
    t({
      id: 'x-2',
      net: -5000,
      avgExit: 4499,
      ...at('2026-11-02', '16:00', '16:30'),
    }),
    t({
      id: 'x-3',
      net: 0,
      avgExit: 4500.25,
      ...at('2026-11-03', '15:00', '15:30'),
    }),
    t({
      id: 'x-4',
      net: 3000,
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.07,
      avgExit: 1.0703,
      maxPosition: 1,
      ...at('2026-11-03', '16:00', '16:30'),
    }),
    t({
      id: 'x-5',
      net: 20000,
      avgExit: 4502,
      maxPosition: 2,
      openedAt: '2026-11-04T15:00:00Z',
      closedAt: '2026-11-05T15:30:00Z',
      executions: [
        fill('x-5a', 'buy', 2, 4500, '2026-11-04T15:00:00Z'),
        fill('x-5b', 'sell', 1, 4506, '2026-11-04T16:00:00Z'),
        fill('x-5c', 'sell', 1, 4498, '2026-11-05T15:30:00Z'),
      ],
    }),
  ];
  s.journal = [];
  return s;
}

async function inUnit(unit: DisplayUnit) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: crossSample,
  });
  await repository.prefs.update({
    displayUnit: unit,
    timeZone: 'America/New_York',
  });
  return repository;
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ');

/** The rows of a Performance summary table by day, in date order: [period, value]. */
async function performanceRows(
  unit: DisplayUnit,
  metric: string,
  mode: 'period' | 'running' = 'period',
) {
  renderApp(<PerformanceView />, {
    repository: await inUnit(unit),
    url: `/app/reports/performance?m=${metric}:bar${mode === 'running' ? ':running' : ''}&bucket=day`,
  });
  const table = await screen.findByRole('table', { name: 'Summary by day' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) =>
      within(r)
        .getAllByRole('cell')
        .map((c) => text(c)),
    );
}

async function overviewKpi(unit: DisplayUnit, id: string) {
  renderApp(<OverviewView />, {
    repository: await inUnit(unit),
    url: '/app/reports',
  });
  const page = await screen.findByTestId('reports-overview');
  return text(page.querySelector(`[data-kpi="${id}"]`));
}

async function stripKpi(unit: DisplayUnit, id: string) {
  renderApp(<TradesView />, {
    repository: await inUnit(unit),
    url: '/app/trades',
  });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  return text(strip.querySelector(`[data-kpi="${id}"]`));
}

async function dashboardKpi(unit: DisplayUnit, id: string) {
  renderApp(<DashboardView />, {
    repository: await inUnit(unit),
    url: '/app/dashboard',
  });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  return text(perf.querySelector(`[data-kpi="${id}"]`));
}

async function compareRow(unit: DisplayUnit, name: RegExp) {
  renderApp(<CompareView />, {
    repository: await inUnit(unit),
    url: '/app/reports/compare',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  return within(within(table).getByRole('row', { name }))
    .getAllByRole('cell')
    .map((c) => text(c));
}

async function strategyStat(unit: DisplayUnit, id: string) {
  renderApp(<StrategyView id="str-1" />, {
    repository: await inUnit(unit),
    url: '/app/strategies/str-1',
  });
  const stats = await screen.findByRole('region', { name: 'Stats' });
  return text(stats.querySelector(`[data-metric-tip="${id}"]`)?.closest('div'));
}

describe('expectancy reads the decided trades on every page (I1)', () => {
  // Ticks: x-1, x-2, x-3 and x-5. Decided: +8, -4 and +16, so (8 - 4 + 16) / 3.
  // The average trade, breakeven in, would be 21 / 4 = +5.3 ticks.
  // R: every trade. Decided: +1, -0.5, +0.3 and +2, so 2.8 / 4 = +0.70R.
  // The average trade would be 2.8 / 5 = +0.56R.
  const cases = [
    ['ticks', '+6.7 ticks'],
    ['r', '+0.70R'],
  ] as const;

  test.each(cases)('in %s, the Overview KPI', async (unit, want) => {
    expect(await overviewKpi(unit, 'expectancy')).toContain(want);
  });

  test.each(cases)(
    'in %s, the end of the Performance running expectancy',
    async (unit, want) => {
      const rows = await performanceRows(unit, 'expectancy', 'running');
      expect(rows.at(-1)![0]).toBe('Thu 5 Nov');
      expect(rows.at(-1)![1]).toBe(want);
    },
  );

  test.each(cases)('in %s, the Trades strip', async (unit, want) => {
    expect(await stripKpi(unit, 'expectancy')).toContain(want);
  });

  test.each(cases)('in %s, the Dashboard KPI', async (unit, want) => {
    expect(await dashboardKpi(unit, 'expectancy')).toContain(want);
  });

  test.each(cases)('in %s, Compare', async (unit, want) => {
    const cells = await compareRow(unit, /^Expectancy/);
    expect(cells[0]).toBe(want);
    expect(cells[1]).toBe(want);
  });

  test.each(cases)('in %s, the Strategy page', async (unit, want) => {
    expect(await strategyStat(unit, 'expectancy')).toContain(want);
  });
});
