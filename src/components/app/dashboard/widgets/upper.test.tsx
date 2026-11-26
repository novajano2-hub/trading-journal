// @vitest-environment happy-dom
// The twelve upper widgets (#46, Task 8), over the sample's closed trades on
// 20 Nov 2026, and over small trade sets whose answers are worked out by hand.
import { cleanup, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { NewCashFlow } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Trade, UserPrefs, WidgetKey } from '@/domain/types';
import { renderApp } from '../../__fixtures__/render-app';
import { DashboardView } from '../dashboard-view';
import { WIDGET_RENDER } from './registry';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));

// Animations finish at once here, as in dashboard-view.test.tsx.
MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z')); // Friday 20 Nov, 10:00 in New York
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const UPPER: WidgetKey[] = [
  'net-pnl',
  'balance-pnl',
  'trade-win',
  'profit-factor',
  'day-win',
  'win-loss-ratio',
  'expectancy',
  'day-streak',
  'trade-streak',
  'streaks',
  'max-drawdown',
  'avg-drawdown',
];

// The sample as the app seeds it on 20 Nov 2026: 1,518 closed trades over six accounts.
let seeded: SampleWorkspace | undefined;
const theSample = () =>
  (seeded ??= generateSampleWorkspace({
    seed: SAMPLE_SEED,
    endDate: '2026-11-19',
  }));

/**
 * The Dashboard over `sample`, in New York time, with `prefs` on top. Its
 * template holds `keys`: the first five in the upper strip (the most a template
 * saves) and the rest below it, which draws them the same, for a widget is
 * drawn by its key, wherever its template puts it.
 */
async function renderUpper(
  opts: {
    keys?: readonly WidgetKey[];
    sample?: () => SampleWorkspace;
    prefs?: Partial<UserPrefs>;
    url?: string;
    /** Deposits and withdrawals to book before the page opens. */
    flows?: NewCashFlow[];
  } = {},
) {
  const sample = opts.sample ?? theSample;
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
  });
  await repository.prefs.update({
    timeZone: 'America/New_York',
    dashboards: {
      inUse: 't',
      templates: [
        {
          id: 't',
          name: 'Upper',
          upper: (opts.keys ?? UPPER).slice(0, 5).map((key) => ({ key })),
          lower: (opts.keys ?? UPPER).slice(5).map((key) => ({ key })),
        },
      ],
    },
    ...opts.prefs,
  });
  for (const flow of opts.flows ?? [])
    await repository.cashFlows.create(SAMPLE_WORKSPACE.id, flow);
  renderApp(<DashboardView />, { repository, url: opts.url });
  await screen.findByTestId('dashboard-ready');
}

const widget = (key: WidgetKey): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-widget="${key}"]`)!;

/** What the widget shows, in one line: the words a screen reader alone gets are left out. */
function said(key: WidgetKey): string {
  const copy = widget(key).cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The split bar inside a widget: each segment's tone and its share, in order. */
function segments(key: WidgetKey): [string, number][] | null {
  const bar = widget(key).querySelector<HTMLElement>('[data-split-bar]');
  if (!bar) return null;
  expect(bar.getAttribute('aria-hidden')).toBe('true');
  return [...bar.querySelectorAll<HTMLElement>('[data-tone]')].map((s) => [
    s.dataset.tone!,
    Number(s.style.flexGrow),
  ]);
}

/** A closed ES trade on `day` (New York), closing `i` minutes into the session. */
function esTrade(
  i: number,
  day: string,
  net: number,
  over: Partial<Trade> = {},
): Trade {
  const minute = String(10 + i).padStart(2, '0');
  return makeTrade({
    id: `u-${i + 1}`,
    serial: i + 1,
    workspaceId: SAMPLE_WORKSPACE.id,
    accountId: 'acc-a',
    net,
    gross: net,
    fees: 0,
    instrument: resolveInstrument('ESZ5')!,
    avgEntry: 4500,
    avgExit: 4500,
    initialRisk: 10000,
    openedAt: `${day}T15:00:00Z`,
    closedAt: `${day}T15:${minute}:00Z`,
    ...over,
  });
}

/** The fixture workspace holding only the trades `make` gives, over acc-a ($50,000.00 to start). */
function tradesSample(
  make: () => Trade[],
  accountEdit?: (s: SampleWorkspace) => void,
) {
  return (): SampleWorkspace => {
    const s = fixtureSample();
    s.trades = make();
    s.journal = [];
    accountEdit?.(s);
    return s;
  };
}

/** Net results by day, one trade each, in the order given. */
const byDay = (rows: [day: string, net: number][]) =>
  tradesSample(() => rows.map(([day, net], i) => esTrade(i, day, net)));

describe('over the sample', () => {
  test('net P&L is the closed net with its trade count, and says nothing of fees', async () => {
    await renderUpper();
    const card = widget('net-pnl');
    expect(card.tagName).toBe('SECTION');
    expect(said('net-pnl')).toContain('Net P&L');
    expect(said('net-pnl')).toContain('+$17,486.25');
    expect(said('net-pnl')).toContain('1,518 trades');
    expect(said('net-pnl')).not.toMatch(/fee/i);
    // The figure is gain-toned.
    expect(card.querySelector('.text-gain')?.textContent).toBe('+$17,486.25');
  });

  test('balance and P&L: the balance at the range end, the closed net under it', async () => {
    await renderUpper();
    expect(said('balance-pnl')).toContain('Account balance and P&L');
    expect(said('balance-pnl')).toContain('$392,486.25');
    expect(said('balance-pnl')).toContain('+$17,486.25 net P&L, all time');
  });

  test('trade win rate: the rate, won, breakeven and lost, and a split bar of the three counts', async () => {
    await renderUpper();
    expect(said('trade-win')).toContain('Trade win rate');
    expect(said('trade-win')).toContain('48.8%');
    expect(said('trade-win')).toContain('741 won, 0 breakeven, 777 lost');
    expect(segments('trade-win')).toEqual([
      ['gain', 741],
      ['loss', 777],
    ]);
  });

  test('day win rate: green, flat and red days, with a split bar', async () => {
    await renderUpper();
    expect(said('day-win')).toContain('Day win rate');
    expect(said('day-win')).toContain('60.3%');
    expect(said('day-win')).toContain('76 green, 0 flat, 50 red');
    expect(segments('day-win')).toEqual([
      ['gain', 76],
      ['loss', 50],
    ]);
  });

  test('profit factor: the ratio over a split bar of gross profit against loss, and no amount anywhere', async () => {
    await renderUpper();
    expect(said('profit-factor')).toContain('Profit factor');
    expect(said('profit-factor')).toContain('1.13');
    expect(said('profit-factor')).not.toMatch(/[$€£]/);
    const bar = segments('profit-factor')!;
    expect(bar.map(([tone]) => tone)).toEqual(['gain', 'loss']);
    // Won over lost is the profit factor, so the bar's two shares are in that ratio.
    expect(bar[0]![1] / bar[1]![1]).toBeCloseTo(1.1327, 3);
  });

  test('average win to loss: the ratio, both amounts and a split bar', async () => {
    await renderUpper();
    expect(said('win-loss-ratio')).toContain('Average win to loss');
    expect(said('win-loss-ratio')).toContain('1.19');
    expect(said('win-loss-ratio')).toContain('+$201.44 / −$169.60');
    const bar = segments('win-loss-ratio')!;
    expect(bar.map(([tone]) => tone)).toEqual(['gain', 'loss']);
    expect(bar[0]![1] / bar[1]![1]).toBeCloseTo(1.1877, 3);
    // Each amount carries its own tone.
    const toned = [
      ...widget('win-loss-ratio').querySelectorAll('.text-gain, .text-loss'),
    ];
    expect(toned.map((e) => e.textContent)).toEqual(['+$201.44', '−$169.60']);
  });

  test('trade expectancy: the figure and nothing under it', async () => {
    await renderUpper();
    expect(said('expectancy')).toContain('Trade expectancy');
    expect(said('expectancy')).toContain('+$11.52');
    // TradeZella's card has no line of its own under the figure.
    expect(said('expectancy')).not.toMatch(/per closed trade|1,518/);
  });

  test('the streaks count winning runs ending at the last day and the last trade: 0 days after a losing day', async () => {
    await renderUpper();
    expect(said('day-streak')).toContain('Winning day streak');
    expect(said('day-streak')).toContain('0 days');
    expect(said('day-streak')).toContain('winning days in a row');
    expect(said('trade-streak')).toContain('Winning trade streak');
    expect(said('trade-streak')).toContain('1 trade');
    expect(said('trade-streak')).toContain('winning trades in a row');
    // Both, side by side.
    expect(said('streaks')).toContain('0 days');
    expect(said('streaks')).toContain('1 trade');
    expect(said('streaks')).toContain('winning days in a row');
    expect(said('streaks')).toContain('winning trades in a row');
  });

  test('max drawdown: the fall in dollars and as a share of the high, with the day it bottomed', async () => {
    await renderUpper();
    expect(said('max-drawdown')).toContain('Max drawdown');
    expect(said('max-drawdown')).toContain('−$8,665.36');
    expect(said('max-drawdown')).toContain('2.2% of the high, on 27 Oct');
    expect(
      widget('max-drawdown').querySelector('.text-loss')?.textContent,
    ).toBe('−$8,665.36');
  });

  test('average drawdown with no date range is the drawdown today, from the high', async () => {
    await renderUpper();
    expect(said('avg-drawdown')).toContain('Average drawdown');
    expect(said('avg-drawdown')).toContain('−$1,057.85');
    expect(said('avg-drawdown')).toContain(
      'today, from the high; no date range set',
    );
  });

  test('average drawdown with a date range is the mean of the days under a high, with no count under it', async () => {
    await renderUpper({
      keys: ['avg-drawdown'],
      url: '/app/dashboard?from=2026-01-01&to=2026-11-19',
    });
    expect(said('avg-drawdown')).toContain('−$1,944.46');
    // No line of its own under the figure (a day count is not on TradeZella's card).
    expect(said('avg-drawdown')).not.toMatch(/under a high|89/);
    expect(said('avg-drawdown')).not.toContain('no date range set');
  });
});

describe('streaks, worked out by hand', () => {
  // Mon 2, Tue 3 and Wed 4 Nov are green days; Wed's last trade lost.
  const sample = byDay([
    ['2026-11-02', 10000],
    ['2026-11-03', 5000],
    ['2026-11-04', 8000],
    ['2026-11-04', -2000],
  ]);

  test('three winning days in a row, and a last trade that lost: 3 days, 0 trades', async () => {
    await renderUpper({
      keys: ['day-streak', 'trade-streak', 'streaks'],
      sample,
    });
    expect(said('day-streak')).toContain('3 days');
    expect(said('trade-streak')).toContain('0 trades');
    expect(said('streaks')).toContain('3 days');
    expect(said('streaks')).toContain('0 trades');
  });

  test('a losing last day ends the run: 0 days and 0 trades', async () => {
    await renderUpper({
      keys: ['day-streak', 'trade-streak'],
      sample: byDay([
        ['2026-11-02', 10000],
        ['2026-11-03', 5000],
        ['2026-11-04', -3000],
      ]),
    });
    expect(said('day-streak')).toContain('0 days');
    expect(said('trade-streak')).toContain('0 trades');
  });

  test('a breakeven day ends a run, as a loss does', async () => {
    await renderUpper({
      keys: ['day-streak', 'trade-streak'],
      sample: byDay([
        ['2026-11-02', 10000],
        ['2026-11-03', 5000],
        ['2026-11-04', 0],
      ]),
    });
    expect(said('day-streak')).toContain('0 days');
    expect(said('trade-streak')).toContain('0 trades');
  });

  test('a breakeven range makes a small win a flat day and ends the run', async () => {
    await renderUpper({
      keys: ['day-streak', 'trade-streak'],
      prefs: { breakevenRange: { unit: 'amount', from: -500, to: 500 } },
      sample: byDay([
        ['2026-11-02', 10000],
        ['2026-11-03', 5000],
        ['2026-11-04', 300],
      ]),
    });
    expect(said('day-streak')).toContain('0 days');
    expect(said('trade-streak')).toContain('0 trades');
  });

  test('one day and one trade read in the singular', async () => {
    await renderUpper({
      keys: ['day-streak', 'trade-streak'],
      sample: byDay([
        ['2026-11-02', -1000],
        ['2026-11-03', 5000],
      ]),
    });
    expect(said('day-streak')).toContain('1 day');
    expect(said('day-streak')).not.toContain('1 days');
    expect(said('trade-streak')).toContain('1 trade');
    expect(said('trade-streak')).not.toContain('1 trades');
  });

  test('the day streak ends at the date range’s last trading day', async () => {
    // Wed 4 Nov lost, but the range stops on Tue 3 Nov: two winning days.
    await renderUpper({
      keys: ['day-streak'],
      url: '/app/dashboard?from=2026-11-02&to=2026-11-03',
      sample: byDay([
        ['2026-11-02', 10000],
        ['2026-11-03', 5000],
        ['2026-11-04', -3000],
      ]),
    });
    expect(said('day-streak')).toContain('2 days');
  });
});

describe('a narrowing unit', () => {
  // ES +8 ticks (+$100), ES -4 ticks (-$50) and a EURUSD trade with no ticks (+$30).
  const sample = tradesSample(() => [
    esTrade(0, '2026-11-02', 10000, { avgExit: 4502 }),
    esTrade(1, '2026-11-02', -5000, { avgExit: 4499 }),
    esTrade(2, '2026-11-03', 3000, {
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.07,
      avgExit: 1.0703,
    }),
  ]);

  test('Ticks narrows the figures to the futures trades', async () => {
    await renderUpper({
      keys: ['net-pnl', 'trade-win', 'expectancy'],
      sample,
      prefs: { displayUnit: 'ticks' },
    });
    // +8 and -4 ticks: +4.0 ticks over two trades; one win, one loss.
    expect(said('net-pnl')).toContain('+4.0 ticks');
    expect(said('net-pnl')).toContain('2 trades');
    expect(said('trade-win')).toContain('1 won, 0 breakeven, 1 lost');
    // (8 - 4) / 2 decided trades.
    expect(said('expectancy')).toContain('+2.0 ticks');
  });

  test.each(['ticks', 'r', 'pips', 'points'] as const)(
    'in %s the balance and P&L widget says a balance has no value there',
    async (unit) => {
      await renderUpper({
        keys: ['balance-pnl'],
        sample,
        prefs: { displayUnit: unit },
      });
      expect(said('balance-pnl')).toMatch(/no value in /i);
      expect(said('balance-pnl')).not.toMatch(/\$\d/);
    },
  );

  test('Dollar shows all three trades and the balance', async () => {
    await renderUpper({ keys: ['net-pnl', 'balance-pnl'], sample });
    expect(said('net-pnl')).toContain('3 trades');
    expect(said('net-pnl')).toContain('+$80.00');
    expect(said('balance-pnl')).toContain('$50,080.00');
  });

  test('the drawdowns stay in money, and the share of the high has no value', async () => {
    await renderUpper({
      keys: ['max-drawdown'],
      sample: byDay([
        ['2026-11-02', 10000],
        ['2026-11-03', -4000],
        ['2026-11-04', 2000],
      ]),
      prefs: { displayUnit: 'ticks' },
    });
    expect(said('max-drawdown')).toContain('−$40.00');
    expect(said('max-drawdown')).not.toContain('% of the high');
    expect(said('max-drawdown')).toContain('on 3 Nov');
  });
});

describe('Gross and Net', () => {
  test('Gross relabels the P&L widget and reads the figure before fees', async () => {
    const sample = tradesSample(() => [
      esTrade(0, '2026-11-02', 9000, { gross: 10000, fees: 1000 }),
    ]);
    await renderUpper({ keys: ['net-pnl'], sample });
    expect(said('net-pnl')).toContain('Net P&L');
    expect(said('net-pnl')).toContain('+$90.00');
    cleanup();
    await renderUpper({
      keys: ['net-pnl'],
      sample,
      prefs: { pnlBasis: 'gross' },
    });
    expect(said('net-pnl')).toContain('Gross P&L');
    expect(said('net-pnl')).toContain('+$100.00');
  });
});

describe('Privacy', () => {
  test('hides every amount, the profit factor and the ratio; counts and percentages stay', async () => {
    await renderUpper({ prefs: { displayUnit: 'privacy' } });
    expect(said('net-pnl')).toContain('+$•••');
    expect(said('net-pnl')).toContain('1,518 trades');
    expect(said('balance-pnl')).toContain('$•••');
    expect(said('balance-pnl')).toContain('+$••• net P&L');
    expect(said('profit-factor')).toContain('•••');
    expect(said('win-loss-ratio')).toContain('•••');
    expect(said('win-loss-ratio')).toContain('+$••• / −$•••');
    expect(said('expectancy')).toContain('+$•••');
    expect(said('max-drawdown')).toContain('−$•••');
    expect(said('avg-drawdown')).toContain('−$•••');
    // Percentages, counts and streaks are not amounts.
    expect(said('trade-win')).toContain('48.8%');
    expect(said('trade-win')).toContain('741 won, 0 breakeven, 777 lost');
    expect(said('day-win')).toContain('60.3%');
    expect(said('max-drawdown')).toContain('2.2% of the high');
    expect(said('trade-streak')).toContain('1 trade');
    // No digit of money or of a ratio is left anywhere on the strip.
    const all = UPPER.map(said).join(' | ');
    expect(all).not.toMatch(/\$\s?\d/);
    expect(all).not.toMatch(/\b1\.1[39]\b/);
    // A bar of a hidden ratio would draw it: those two bars show no split.
    expect(segments('profit-factor')).toEqual([]);
    expect(segments('win-loss-ratio')).toEqual([]);
    // The counts' bars stay.
    expect(segments('trade-win')).toEqual([
      ['gain', 741],
      ['loss', 777],
    ]);
  });

  test('a screen reader hears "hidden amount" and "hidden ratio", not the dots', async () => {
    await renderUpper({
      keys: ['net-pnl', 'profit-factor'],
      prefs: { displayUnit: 'privacy' },
    });
    expect(within(widget('net-pnl')).getByText('hidden amount')).toBeTruthy();
    expect(
      within(widget('profit-factor')).getByText('hidden ratio'),
    ).toBeTruthy();
  });
});

describe('no trades', () => {
  test('a filter that matches nothing leaves every widget saying None', async () => {
    await renderUpper({ url: '/app/dashboard?symbol=ZZZ' });
    for (const key of UPPER.filter((k) => k !== 'balance-pnl')) {
      expect(said(key), key).toContain('None');
      expect(said(key), key).not.toMatch(/\d/);
    }
  });

  test('the balance is still the accounts’ balance, with no P&L in the range', async () => {
    await renderUpper({
      keys: ['balance-pnl'],
      url: '/app/dashboard?symbol=ZZZ',
    });
    expect(said('balance-pnl')).toContain('$392,486.25');
    expect(said('balance-pnl')).toContain('$0.00 net P&L, all time');
  });

  test('only open trades leave the figures at None', async () => {
    await renderUpper({
      keys: ['net-pnl', 'trade-win'],
      sample: tradesSample(() => [
        esTrade(0, '2026-11-02', 0, { status: 'open' }),
      ]),
    });
    expect(said('net-pnl')).toContain('None');
    expect(said('trade-win')).toContain('None');
  });
});

describe('no starting balance', () => {
  test('the balance widget asks for one and links to Settings, Accounts', async () => {
    await renderUpper({
      keys: ['balance-pnl'],
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
    });
    const card = widget('balance-pnl');
    expect(card.textContent).toMatch(/starting balance/i);
    expect(within(card).getByRole('link').getAttribute('href')).toBe(
      '/app/settings/accounts',
    );
    expect(card.textContent).not.toMatch(/\$/);
  });

  test('a deposit funds the account: the balance shows, not the prompt', async () => {
    await renderUpper({
      keys: ['balance-pnl'],
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
      flows: [{ accountId: 'acc-a', date: '2026-11-01', amount: 100_000 }],
    });
    const card = widget('balance-pnl');
    expect(card.textContent).not.toMatch(/starting balance/i);
    // $1,000.00 deposited and $100.00 made.
    expect(said('balance-pnl')).toContain('$1,100.00');
    expect(said('balance-pnl')).toContain('+$100.00 net P&L');
  });

  test('a deposit dated after the range end does not: the prompt stays', async () => {
    await renderUpper({
      keys: ['balance-pnl'],
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
      flows: [{ accountId: 'acc-a', date: '2026-11-10', amount: 100_000 }],
      url: '/app/dashboard?from=2026-11-01&to=2026-11-05',
    });
    expect(widget('balance-pnl').textContent).toMatch(/starting balance/i);
  });
});

describe('the frame around each widget', () => {
  test('every widget is a labelled section with its own info tip', async () => {
    await renderUpper();
    for (const key of UPPER) {
      const card = widget(key);
      expect(card.tagName, key).toBe('SECTION');
      expect(card.getAttribute('aria-labelledby'), key).toBeTruthy();
      expect(card.querySelector('[data-metric-tip]'), key).toBeTruthy();
    }
  });

  test('before its series is in, each widget draws a skeleton and is busy', async () => {
    for (const key of UPPER) {
      const Render = WIDGET_RENDER[key];
      const { unmount } = renderApp(<Render />);
      const card = await screen.findByRole('region');
      expect(card.getAttribute('data-widget'), key).toBe(key);
      expect(card.getAttribute('aria-busy'), key).toBe('true');
      expect(card.querySelector('[data-skeleton]'), key).toBeTruthy();
      unmount();
    }
  });

  test('the page draws all twelve, in the order the template gives', async () => {
    await renderUpper();
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-widget]')].map(
        (el) => el.dataset.widget,
      ),
    ).toEqual(UPPER);
  });
});
