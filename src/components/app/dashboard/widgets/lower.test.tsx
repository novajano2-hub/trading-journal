// @vitest-environment happy-dom
// The lower widgets (#46, Task 9): the Edge score and the charts, over the
// sample's closed trades on 20 Nov 2026 and over small trade sets whose
// answers are worked out by hand.
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RADAR } from '@/components/charts/radar-chart';
import { scoreOf } from '@/domain/metrics/score';
import {
  byDay,
  esTrade,
  renderWidgets,
  said,
  saveTemplateElsewhere,
  theSample,
  tradesSample,
  widget,
} from '../../__fixtures__/dashboard-widgets';
import { bandOf, scoreText } from './score';

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

const NY = {
  timeZone: 'America/New_York',
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
};

/** The parts table of the score's radar: each part's row, as the words a screen reader gets. */
function parts(): Record<string, string> {
  const table = within(widget('score')).getByRole('table', {
    name: 'Edge score parts, each out of 100',
  });
  return Object.fromEntries(
    within(table)
      .getAllByRole('row')
      .map((row) => [
        within(row).getByRole('rowheader').textContent!,
        within(row).getByRole('cell').textContent!,
      ]),
  );
}

describe('the Edge score', () => {
  test('its total and band follow the score of the closed trades, with decimals as the score has them', async () => {
    await renderWidgets(['score']);
    const usd = theSample().trades.filter((t) => t.pnlCurrency === 'USD');
    const score = scoreOf(usd, NY)!;
    const total = scoreText(score.total);
    expect(said('score')).toContain('Edge score');
    expect(said('score')).toContain(total);
    expect(said('score')).toContain(bandOf(score.total).word);
    // Never TradeZella's own name.
    expect(said('score')).not.toMatch(/zella|zella score/i);
    expect(widget('score').getAttribute('data-widget')).toBe('score');
    // Up to two decimals: the figure is the total as the score rounds it.
    expect(total).toMatch(/^\d{1,3}(\.\d{1,2})?$/);
  });

  test('the total drops its trailing zeros and the band words cut at 40 and 70', () => {
    expect(scoreText(63.73)).toBe('63.73');
    expect(scoreText(63.7)).toBe('63.7');
    expect(scoreText(64)).toBe('64');
    expect(scoreText(90)).toBe('90');
    expect(scoreText(0)).toBe('0');
    expect(scoreText(100)).toBe('100');
    expect(scoreText(76.304)).toBe('76.3');
    const word = (n: number) => bandOf(n).word;
    expect([0, 39.99, 40, 69.99, 70, 100].map(word)).toEqual([
      'Weak',
      'Weak',
      'Building',
      'Building',
      'Strong',
      'Strong',
    ]);
  });

  test('the radar draws six parts, five rings and no value; the parts are in a table a screen reader reads', async () => {
    await renderWidgets(['score']);
    const card = widget('score');
    const svg = card.querySelector('svg[data-chart="radar"]')!;
    expect(svg.querySelectorAll('[data-ring]')).toHaveLength(5);
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual(
      [
        'Win rate',
        'Profit factor',
        'Win to loss',
        'Recovery',
        'Drawdown',
        'Consistency',
      ],
    );
    // No axis value anywhere in the drawing.
    expect(svg.textContent).not.toMatch(/\d/);
    expect(Object.keys(parts())).toEqual([
      'Win rate',
      'Profit factor',
      'Win to loss',
      'Recovery',
      'Drawdown',
      'Consistency',
    ]);
    const usd = theSample().trades.filter((t) => t.pnlCurrency === 'USD');
    const score = scoreOf(usd, NY)!;
    expect(parts()['Win rate']).toContain(
      `${scoreText(score.parts.winRate.score)} of 100`,
    );
    // The image and its label.
    expect(
      within(card).getByRole('img', { name: /Edge score .* of 100, .*\./ }),
    ).toBeTruthy();
  });

  test('the track is a neutral 0 to 100 scale with a marker at the total, named in words', async () => {
    await renderWidgets(['score']);
    const usd = theSample().trades.filter((t) => t.pnlCurrency === 'USD');
    const { total } = scoreOf(usd, NY)!;
    const word = bandOf(total);
    const track = within(widget('score')).getByRole('img', {
      name: `${scoreText(total)} of 100, in the ${word.word.toLowerCase()} band (${word.from} to ${word.to})`,
    });
    const marker = track.querySelector<HTMLElement>('[data-marker]')!;
    expect(marker.style.left).toBe(`${total}%`);
    // The scale names the bands.
    const scale = widget('score').querySelector('[data-scale]')!.textContent;
    expect(scale).toBe('0Weak40Building70Strong100');
    // Neutral: no money hue on a figure that is not money.
    expect(track.innerHTML).not.toMatch(/gain|loss/);
  });

  test('focus reads each part: its score, and what it is made of', async () => {
    await renderWidgets(['score']);
    const chart = within(widget('score')).getByRole('img', {
      name: /Edge score .* of 100, .*\./,
    });
    fireEvent.focus(chart);
    const status = within(widget('score')).getByRole('status');
    expect(status.textContent).toContain('Win rate');
    expect(status.textContent).toMatch(/\d+(\.\d+)? of 100/);
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(status.textContent).toContain('Profit factor');
  });

  describe('worked by hand', () => {
    // Three green days, each one winning trade: nothing lost, no fall from a high.
    const wins = byDay([
      ['2026-11-02', 10000],
      ['2026-11-03', 10000],
      ['2026-11-04', 10000],
    ]);

    test('with no drawdown recovery is drawn full while the total counts it 0', async () => {
      await renderWidgets(['score'], { sample: wins });
      // 25 + 20 + 20 + 15 + 0 + 10: the part of recovery adds nothing.
      expect(said('score')).toContain('90');
      expect(said('score')).toContain('Strong');
      const dot = (key: string) =>
        widget('score').querySelector<SVGCircleElement>(
          `[data-axis="${key}"]`,
        )!;
      // The outer ring is one radius from the centre: recovery, straight down, is drawn there.
      expect(Number(dot('recovery').getAttribute('cy'))).toBeCloseTo(
        RADAR.cy + RADAR.radius,
        5,
      );
      expect(parts().Recovery).toContain('0 of 100');
      expect(parts().Recovery).toMatch(/no drawdown/i);
      expect(parts().Recovery).toMatch(/adds nothing to the score/i);
      // A part that is full is drawn full and scores so.
      expect(Number(dot('winRate').getAttribute('cy'))).toBeCloseTo(
        RADAR.cy - RADAR.radius,
        5,
      );
      expect(parts()['Win rate']).toContain('100 of 100');
    });

    test('no loss scores a ratio full and says why', async () => {
      await renderWidgets(['score'], { sample: wins });
      expect(parts()['Profit factor']).toContain('100 of 100');
      expect(parts()['Profit factor']).toMatch(/nothing was lost/i);
      expect(parts()['Win to loss']).toMatch(/nothing was lost/i);
    });

    test('nothing won scores the ratios 0 and says no edge is shown, and a net loss scores consistency 0', async () => {
      await renderWidgets(['score'], {
        sample: byDay([
          ['2026-11-02', -10000],
          ['2026-11-03', -5000],
        ]),
      });
      expect(parts()['Profit factor']).toContain('0 of 100');
      expect(parts()['Profit factor']).toContain(
        'Nothing won in this range, so no edge is shown.',
      );
      expect(parts()['Win to loss']).toContain(
        'Nothing won in this range, so no edge is shown.',
      );
      expect(parts().Consistency).toContain('0 of 100');
      expect(parts().Consistency).toContain(
        'The range lost money, so consistency scores 0.',
      );
      expect(said('score')).toContain('Weak');
    });

    test('with no closed trade it says it needs one', async () => {
      await renderWidgets(['score'], { url: '/app/dashboard?symbol=ZZZ' });
      expect(said('score')).toContain('Edge score');
      expect(said('score')).toMatch(/needs at least one closed trade/i);
      expect(widget('score').querySelector('[data-chart]')).toBeNull();
    });
  });

  test('it reads money: the display unit does not change it', async () => {
    await renderWidgets(['score']);
    const dollars = said('score');
    cleanup();
    await renderWidgets(['score'], { prefs: { displayUnit: 'ticks' } });
    expect(said('score')).toBe(dollars);
  });

  test('Privacy hides the ratios in the readout and the table, and leaves the score', async () => {
    await renderWidgets(['score'], { prefs: { displayUnit: 'privacy' } });
    const usd = theSample().trades.filter((t) => t.pnlCurrency === 'USD');
    const score = scoreOf(usd, NY)!;
    expect(said('score')).toContain(scoreText(score.total));
    const pf = parts()['Profit factor'];
    expect(pf).toContain(`${scoreText(score.parts.profitFactor.score)} of 100`);
    expect(pf).toContain('•••');
    expect(pf).not.toContain(score.parts.profitFactor.raw!.toFixed(2));
    expect(parts()['Win to loss']).toContain('•••');
    expect(parts().Recovery).toContain('•••');
  });

  test("the caption says the range, and the info tip is the score's own", async () => {
    await renderWidgets(['score']);
    expect(said('score')).toContain('All time');
    expect(
      widget('score').querySelector('[data-metric-tip="edge-score"]'),
    ).not.toBeNull();
    // Nothing waits on a tip to be read: the info glyph has its name.
    expect(screen.getAllByText('About Edge score').length).toBeGreaterThan(0);
  });
});

/** The chart a widget draws: the image that is not the info glyph, by the start of its label. */
const chartOf = (key: Parameters<typeof widget>[0], name: RegExp) =>
  within(widget(key)).getByRole('img', { name });

describe('the line and bar charts', () => {
  test('cumulative net P&L: the running total by trading day, over the whole range', async () => {
    await renderWidgets(['cum-pnl']);
    expect(said('cum-pnl')).toContain('Cumulative net P&L');
    expect(said('cum-pnl')).toContain('By trading day');
    chartOf(
      'cum-pnl',
      /^Cumulative net P&L by day, all time\. Ends at \+\$17,486\.25\.$/,
    );
    // The line is the accent over a soft area, as the other pages draw it.
    expect(
      widget('cum-pnl').querySelectorAll('[data-mark="line"]'),
    ).toHaveLength(1);
    // A hidden table holds a row a trading day.
    const rows = within(widget('cum-pnl')).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(100);
    expect(
      widget('cum-pnl').querySelector('[data-metric-tip="cumulative-pnl"]'),
    ).not.toBeNull();
  });

  describe('one trading day (record 1.5)', () => {
    // Three days, one trade each: +$100.00, -$50.00, +$200.00.
    const three = byDay([
      ['2026-11-02', 10_000],
      ['2026-11-03', -5_000],
      ['2026-11-04', 20_000],
    ]);
    const one = '/app/dashboard?from=2026-11-03&to=2026-11-03';
    /** The chart's table, a row a point: the day and the figure. */
    const tableOf = (key: Parameters<typeof widget>[0]) =>
      within(within(widget(key)).getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent);

    test('the cumulative chart starts at zero the day before, so a single day draws two points', async () => {
      await renderWidgets(['cum-pnl'], { sample: three, url: one });
      chartOf('cum-pnl', /^Cumulative net P&L by day, .*Ends at −\$50\.00\.$/);
      const rows = tableOf('cum-pnl');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toContain('Mon 2 Nov');
      expect(rows[0]).toContain('$0.00');
      expect(rows[1]).toContain('Tue 3 Nov');
      expect(rows[1]).toContain('−$50.00');
    });

    test('a range with a start puts the zero on the day before that start, even when the first trade comes later', async () => {
      await renderWidgets(['cum-pnl'], {
        sample: three,
        url: '/app/dashboard?from=2026-11-01&to=2026-11-04',
      });
      const rows = tableOf('cum-pnl');
      expect(rows).toHaveLength(4);
      expect(rows[0]).toContain('Sat 31 Oct');
      expect(rows[0]).toContain('$0.00');
      expect(rows[1]).toContain('Mon 2 Nov');
      expect(rows[1]).toContain('+$100.00');
    });

    test('with no start (all time) the zero is the day before the first trading day', async () => {
      await renderWidgets(['cum-pnl'], { sample: three });
      const rows = tableOf('cum-pnl');
      expect(rows).toHaveLength(4);
      expect(rows[0]).toContain('Sun 1 Nov');
      expect(rows[0]).toContain('$0.00');
      expect(rows[3]).toContain('+$250.00');
    });

    test('the drawdown widget shows its empty state with fewer than two trading days', async () => {
      await renderWidgets(['drawdown'], { sample: three, url: one });
      expect(said('drawdown')).toContain('Not enough days to draw a drawdown');
      expect(within(widget('drawdown')).queryAllByRole('img')).toHaveLength(0);
    });

    test('the drawdown widget draws from two trading days', async () => {
      await renderWidgets(['drawdown'], {
        sample: three,
        url: '/app/dashboard?from=2026-11-02&to=2026-11-03',
      });
      expect(said('drawdown')).not.toContain('Not enough days');
      chartOf('drawdown', /^Drawdown from the daily P&L peak, /);
    });
  });

  test('net daily P&L: a bar a day, gain above the line and loss below, with the best and the worst day named', async () => {
    await renderWidgets(['daily-pnl']);
    expect(said('daily-pnl')).toContain('Net daily P&L');
    const img = chartOf(
      'daily-pnl',
      /^Daily net P&L bars, \d+ days, all time\. Best /,
    );
    expect(img.getAttribute('aria-label')).toMatch(/, worst .* −\$/);
    const bars = widget('daily-pnl').querySelectorAll('[data-mark="bar"]');
    expect(bars.length).toBeGreaterThan(100);
    const fills = new Set([...bars].map((b) => b.getAttribute('fill')));
    expect(fills).toEqual(new Set(['var(--gain-fill)', 'var(--loss-fill)']));
  });

  test('the names follow the gross or net basis', async () => {
    await renderWidgets(['cum-pnl', 'daily-pnl', 'daily-cum'], {
      prefs: { pnlBasis: 'gross' },
    });
    expect(said('cum-pnl')).toContain('Cumulative gross P&L');
    expect(said('daily-pnl')).toContain('Gross daily P&L');
    expect(said('daily-cum')).toContain('Daily and cumulative gross P&L');
  });

  test('daily and cumulative: day bars on the left scale, the running total on the right', async () => {
    await renderWidgets(['daily-cum']);
    const card = widget('daily-cum');
    expect(said('daily-cum')).toContain('Day net, left scale');
    expect(said('daily-cum')).toContain('Running total, right scale');
    chartOf(
      'daily-cum',
      /^Daily net P&L bars and the running total, \d+ days, all time\. Ends at \+\$17,486\.25\.$/,
    );
    expect(card.querySelectorAll('[data-mark="bar"]').length).toBeGreaterThan(
      100,
    );
    expect(card.querySelectorAll('[data-tick="left"]').length).toBeGreaterThan(
      1,
    );
    expect(card.querySelectorAll('[data-tick="right"]').length).toBeGreaterThan(
      1,
    );
    expect(card.querySelectorAll('[data-mark="line"]')).toHaveLength(1);
  });

  test('drawdown: the chart alone, in the loss colour, with the max drawdown in its label', async () => {
    await renderWidgets(['drawdown']);
    expect(said('drawdown')).toContain('Drawdown');
    expect(said('drawdown')).toContain('By trading day');
    chartOf(
      'drawdown',
      /^Drawdown from the daily P&L peak, all time\. Max drawdown −\$8,665\.36\.$/,
    );
    expect(
      widget('drawdown')
        .querySelector('[data-mark="line"] path:not([stroke="none"])')!
        .getAttribute('stroke'),
    ).toBe('var(--loss-fill)');
  });

  test('every chart is an image with a label, and says so when there is nothing to chart', async () => {
    await renderWidgets(
      ['cum-pnl', 'daily-pnl', 'daily-cum', 'drawdown', 'win-avg', 'balance'],
      {
        url: '/app/dashboard?symbol=ZZZ',
      },
    );
    for (const key of [
      'cum-pnl',
      'daily-pnl',
      'daily-cum',
      'drawdown',
      'win-avg',
    ] as const) {
      expect(said(key), key).toMatch(/No closed trades in this range\./);
      expect(within(widget(key)).queryAllByRole('img'), key).toHaveLength(0);
    }
  });

  test('every chart has role img and a label', async () => {
    await renderWidgets([
      'cum-pnl',
      'daily-pnl',
      'daily-cum',
      'drawdown',
      'win-avg',
      'balance',
    ]);
    for (const key of [
      'cum-pnl',
      'daily-pnl',
      'daily-cum',
      'drawdown',
      'win-avg',
      'balance',
    ] as const) {
      const imgs = within(widget(key)).getAllByRole('img');
      expect(imgs.length, key).toBe(1);
      expect(imgs[0]!.getAttribute('aria-label')!.length, key).toBeGreaterThan(
        20,
      );
      expect(imgs[0]!.getAttribute('tabindex'), key).toBe('0');
    }
  });

  describe('a narrowing unit and Privacy', () => {
    // ES +8 ticks (+$100) on one day and -4 ticks (-$50) on the next.
    const ticks = tradesSample(() => [
      esTrade(0, '2026-11-02', 10000, { avgExit: 4502 }),
      esTrade(1, '2026-11-03', -5000, { avgExit: 4499 }),
    ]);

    test('in ticks the cumulative chart plots ticks, and says so in its label', async () => {
      await renderWidgets(['cum-pnl'], {
        sample: ticks,
        prefs: { displayUnit: 'ticks' },
      });
      chartOf('cum-pnl', /Ends at \+4\.0 ticks\./);
    });

    test('Privacy hides every amount: the label, the axes and the table', async () => {
      await renderWidgets(['cum-pnl', 'daily-pnl', 'daily-cum', 'drawdown'], {
        sample: ticks,
        prefs: { displayUnit: 'privacy' },
      });
      for (const key of [
        'cum-pnl',
        'daily-pnl',
        'daily-cum',
        'drawdown',
      ] as const) {
        const card = widget(key);
        expect(card.textContent, key).not.toMatch(/\d,\d{3}|\$\d|\.\d\d/);
        for (const img of within(card).getAllByRole('img'))
          expect(img.getAttribute('aria-label'), key).not.toMatch(/\$\d/);
        expect(card.textContent, key).toContain('$•••');
      }
    });
  });
});

describe('win rate, average win and average loss through the day (C14)', () => {
  // New York closes at 10:10, 10:11 and 10:12: a win, a loss and a win, on three days.
  const three = tradesSample(() => [
    esTrade(0, '2026-11-02', 10000),
    esTrade(1, '2026-11-03', -5000),
    esTrade(2, '2026-11-04', 8000),
  ]);

  test('x is the time of day; each trade adds a point, the win rate on the left and the averages on the right', async () => {
    await renderWidgets(['win-avg'], { sample: three });
    const card = widget('win-avg');
    expect(said('win-avg')).toContain('Win rate, average win and average loss');
    expect(said('win-avg')).toContain('Through the day');
    expect(said('win-avg')).toContain('Win rate, left scale');
    expect(said('win-avg')).toContain('Average win, right scale');
    expect(said('win-avg')).toContain('Average loss, right scale');
    expect(said('win-avg')).toContain('Time of day in New York');
    // The x axis reads clock times, not dates.
    const clock = [...card.querySelectorAll('[data-axis-label]')].map(
      (t) => t.textContent,
    );
    expect(clock.length).toBeGreaterThan(0);
    for (const t of clock) expect(t).toMatch(/^\d\d:\d\d$/);
    // A rate on the left, money on the right.
    for (const t of card.querySelectorAll('[data-tick="left"]'))
      expect(t.textContent).toMatch(/%$/);
    for (const t of card.querySelectorAll('[data-tick="right"]'))
      expect(t.textContent).toMatch(/^[+−]?\$/);
    // Three lines: the rate and the two averages.
    expect(card.querySelectorAll('[data-mark="line"]')).toHaveLength(3);
  });

  test('the readout after the last trade: two of three won, +$90.00 a win and −$50.00 a loss', async () => {
    await renderWidgets(['win-avg'], { sample: three });
    const img = chartOf(
      'win-avg',
      /^Win rate, average win and average loss through the day, all time\./,
    );
    expect(img.getAttribute('aria-label')).toContain('After 3 trades');
    expect(img.getAttribute('aria-label')).toContain('win rate 66.7%');
    fireEvent.focus(img);
    fireEvent.keyDown(img, { key: 'End' });
    const status = within(widget('win-avg')).getByRole('status');
    expect(status.textContent).toContain('10:12, after 3 trades');
    expect(status.textContent).toContain('66.7%');
    expect(status.textContent).toContain('+$90.00');
    expect(status.textContent).toContain('−$50.00');
    // Before a loss there is no average loss.
    fireEvent.keyDown(img, { key: 'Home' });
    expect(status.textContent).toContain('10:10, after 1 trade');
    expect(status.textContent).toContain('100.0%');
    expect(status.textContent).toContain('None');
  });

  test('a table holds a row a closed trade', async () => {
    await renderWidgets(['win-avg'], { sample: three });
    const rows = within(widget('win-avg')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[3]!).getByRole('rowheader').textContent).toBe(
      '10:12, after 3 trades',
    );
  });

  test('over the sample it draws every closed trade of the range', async () => {
    await renderWidgets(['win-avg']);
    const rows = within(widget('win-avg')).getAllByRole('row');
    // The table is a sample of at most 120 rows, with the header, and ends at the last trade.
    expect(rows.length).toBeLessThanOrEqual(122);
    expect(
      within(rows[rows.length - 1]!).getByRole('rowheader').textContent,
    ).toMatch(/, after 1,?517 trades$/);
  });

  test('in ticks the averages read in ticks', async () => {
    await renderWidgets(['win-avg'], {
      prefs: { displayUnit: 'ticks' },
      sample: tradesSample(() => [
        esTrade(0, '2026-11-02', 10000, { avgExit: 4502 }),
        esTrade(1, '2026-11-03', -5000, { avgExit: 4499 }),
      ]),
    });
    const img = chartOf('win-avg', /^Win rate, average win/);
    fireEvent.focus(img);
    fireEvent.keyDown(img, { key: 'End' });
    const status = within(widget('win-avg')).getByRole('status');
    expect(status.textContent).toContain('+8.0 ticks');
    expect(status.textContent).toContain('−4.0 ticks');
    expect(status.textContent).toContain('50.0%');
  });

  test('Privacy hides the averages and their axis, and leaves the rate', async () => {
    await renderWidgets(['win-avg'], {
      sample: three,
      prefs: { displayUnit: 'privacy' },
    });
    const card = widget('win-avg');
    expect(card.textContent).not.toMatch(/\$\d/);
    expect(card.textContent).toContain('$•••');
    expect(
      chartOf('win-avg', /^Win rate/).getAttribute('aria-label'),
    ).toContain('win rate 66.7%');
  });
});

describe('the account balance chart (C75)', () => {
  const three = tradesSample(() => [
    esTrade(0, '2026-11-02', 10000),
    esTrade(1, '2026-11-03', -5000),
    esTrade(2, '2026-11-04', 8000),
  ]);

  test('the balance on the left scale; with no deposit or withdrawal there is no second line', async () => {
    await renderWidgets(['balance'], { sample: three });
    const card = widget('balance');
    expect(said('balance')).toContain('Account balance');
    chartOf(
      'balance',
      /^Account balance by day, all time\. Ends at \$50,130\.00\.$/,
    );
    expect(said('balance')).toContain('Balance, left scale');
    expect(said('balance')).not.toContain('Deposits and withdrawals');
    expect(card.querySelectorAll('[data-mark="line"]')).toHaveLength(1);
    expect(card.querySelectorAll('[data-tick="right"]')).toHaveLength(0);
    // A balance is unsigned.
    for (const t of card.querySelectorAll('[data-tick="left"]'))
      expect(t.textContent).toMatch(/^\$/);
  });

  test('deposits and withdrawals, net, run on a scale of their own on the right', async () => {
    await renderWidgets(['balance'], {
      sample: three,
      flows: [
        { accountId: 'acc-a', date: '2026-11-02', amount: 100_000 },
        { accountId: 'acc-a', date: '2026-11-10', amount: -40_000 },
      ],
    });
    const card = widget('balance');
    expect(said('balance')).toContain('Balance, left scale');
    expect(said('balance')).toContain(
      'Deposits and withdrawals, net, right scale',
    );
    // 50,000.00 + 130.00 + 1,000.00 - 400.00, with the withdrawal on a day with no trade.
    chartOf(
      'balance',
      /^Account balance by day, all time\. Ends at \$50,730\.00\./,
    );
    expect(card.querySelectorAll('[data-mark="line"]')).toHaveLength(2);
    expect(card.querySelectorAll('[data-tick="right"]').length).toBeGreaterThan(
      1,
    );
    const img = chartOf('balance', /^Account balance by day/);
    fireEvent.focus(img);
    fireEvent.keyDown(img, { key: 'End' });
    const status = within(card).getByRole('status');
    expect(status.textContent).toContain('+$600.00');
  });

  test('with no starting balance it asks for one and links to Settings > Accounts', async () => {
    await renderWidgets(['balance'], {
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
    });
    expect(said('balance')).toContain(
      'Add a starting balance to see your balance.',
    );
    const link = within(widget('balance')).getByRole('link', {
      name: 'Open Accounts',
    });
    expect(link.getAttribute('href')).toBe('/app/settings/accounts');
    expect(within(widget('balance')).queryAllByRole('img')).toHaveLength(0);
  });

  test('a deposit funds the account: the chart draws from it, with no prompt', async () => {
    await renderWidgets(['balance'], {
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
      flows: [{ accountId: 'acc-a', date: '2026-11-01', amount: 100_000 }],
    });
    expect(said('balance')).not.toContain('Add a starting balance');
    // $1,000.00 deposited and $100.00 made.
    chartOf(
      'balance',
      /^Account balance by day, all time\. Ends at \$1,100\.00\./,
    );
  });

  test('a deposit dated after the range end does not: the prompt stays', async () => {
    await renderWidgets(['balance'], {
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10000)],
        (s) => {
          for (const a of s.accounts) a.startingBalance = 0;
        },
      ),
      flows: [{ accountId: 'acc-a', date: '2026-11-10', amount: 100_000 }],
      url: '/app/dashboard?from=2026-11-01&to=2026-11-05',
    });
    expect(said('balance')).toContain(
      'Add a starting balance to see your balance.',
    );
  });

  test.each(['ticks', 'r'] as const)(
    'under %s it says a balance has no value there',
    async (unit) => {
      await renderWidgets(['balance'], {
        sample: three,
        prefs: { displayUnit: unit },
      });
      expect(said('balance')).toMatch(/A balance has no value in /);
      expect(within(widget('balance')).queryAllByRole('img')).toHaveLength(0);
    },
  );

  test('Privacy hides the balance and the flows on the axes, the label and the table', async () => {
    await renderWidgets(['balance'], {
      sample: three,
      prefs: { displayUnit: 'privacy' },
      flows: [{ accountId: 'acc-a', date: '2026-11-02', amount: 100_000 }],
    });
    const card = widget('balance');
    expect(card.textContent).not.toMatch(/\$\d/);
    expect(card.textContent).toContain('$•••');
    expect(
      chartOf('balance', /^Account balance by day/).getAttribute('aria-label'),
    ).not.toMatch(/\$\d/);
  });
});

describe('the trade scatters (C19)', () => {
  // Three trades, opened at 10:00 New York and closed at 10:10, 10:11 and 10:12; held 10, 11 and 12 minutes.
  const three = tradesSample(() => [
    esTrade(0, '2026-11-02', 10000),
    esTrade(1, '2026-11-03', -5000),
    esTrade(2, '2026-11-04', 0),
  ]);
  const dots = (key: Parameters<typeof widget>[0]) => [
    ...widget(key).querySelectorAll<SVGCircleElement>('[data-dot]'),
  ];

  test('trade time: a dot a closed trade, filled when it won, a ring when it lost, a quiet ring when it broke even', async () => {
    await renderWidgets(['trade-time'], { sample: three });
    expect(said('trade-time')).toContain('Trade time performance');
    expect(said('trade-time')).toContain('Win');
    expect(said('trade-time')).toContain('Loss');
    expect(said('trade-time')).toContain('Times in New York');
    expect(dots('trade-time').map((d) => d.getAttribute('data-tone'))).toEqual([
      'gain',
      'loss',
      'flat',
    ]);
    // Shape as well as colour.
    expect(dots('trade-time').map((d) => d.getAttribute('fill'))).toEqual([
      'var(--gain-fill)',
      'none',
      'none',
    ]);
    chartOf(
      'trade-time',
      /^Trade time performance by entry time, 3 closed trades, all time\. 1 won \(filled dots\), 1 lost \(hollow dots\), 1 breakeven\./,
    );
  });

  test('the Entry and Exit switch picks the time, and the choice is saved on the template in use', async () => {
    const { repo } = await renderWidgets(['trade-time'], { sample: three });
    const group = within(widget('trade-time')).getByRole('radiogroup', {
      name: 'Time of',
    });
    const entry = within(group).getByRole('radio', { name: 'Entry' });
    const exit = within(group).getByRole('radio', { name: 'Exit' });
    expect((entry as HTMLInputElement).checked).toBe(true);
    // Entry: all three opened at 10:00, the axis fits that hour.
    const xAt = () =>
      [...widget('trade-time').querySelectorAll('[data-axis-label="x"]')].map(
        (t) => t.textContent,
      );
    expect(xAt()[0]).toBe('10:00');
    fireEvent.click(exit);
    await waitFor(async () => {
      const prefs = await repo.prefs.get();
      expect(prefs.dashboards?.templates[0]?.lower[0]?.settings).toEqual({
        time: 'exit',
      });
    });
    // The page follows the template: Exit is chosen and the label says so.
    await waitFor(() =>
      expect(
        (
          within(widget('trade-time')).getByRole('radio', {
            name: 'Exit',
          }) as HTMLInputElement
        ).checked,
      ).toBe(true),
    );
    chartOf(
      'trade-time',
      /^Trade time performance by exit time, 3 closed trades/,
    );
    expect(within(widget('trade-time')).getByRole('status').textContent).toBe(
      '',
    );
  });

  test('the Entry and Exit switch writes on the template drawn and keeps what another tab saved since (C70)', async () => {
    const { repo } = await renderWidgets(['trade-time'], { sample: three });
    await saveTemplateElsewhere(repo);
    fireEvent.click(
      within(widget('trade-time')).getByRole('radio', { name: 'Exit' }),
    );
    await waitFor(async () => {
      const t = (await repo.prefs.get()).dashboards!.templates[0]!;
      expect(t.lower[0]?.settings).toEqual({ time: 'exit' });
    });
    const stored = (await repo.prefs.get()).dashboards!;
    expect(stored.templates.map((t) => t.id)).toEqual(['t', 'other']);
    expect(stored.inUse).toBe('other');
  });

  test('a template that asks for the exit time draws it from the start', async () => {
    await renderWidgets([{ key: 'trade-time', settings: { time: 'exit' } }], {
      sample: three,
    });
    chartOf('trade-time', /by exit time/);
    expect(
      (
        within(widget('trade-time')).getByRole('radio', {
          name: 'Exit',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  test('the readout names the trade and a click opens it', async () => {
    await renderWidgets(['trade-time'], { sample: three });
    const img = chartOf('trade-time', /^Trade time performance by entry time/);
    fireEvent.focus(img);
    const status = within(widget('trade-time')).getByRole('status');
    expect(status.textContent).toContain('ES Dec 25 long');
    expect(status.textContent).toContain('Entered');
    expect(status.textContent).toContain('02 Nov 10:00');
    expect(status.textContent).toContain('Held');
    expect(status.textContent).toContain('10m 00s');
    expect(status.textContent).toContain('+$100.00');
    fireEvent.keyDown(img, { key: 'Enter' });
    expect(window.location.pathname).toBe('/app/trades/u-1');
  });

  test('over the sample both axes fit the trades: hourly clock labels and money from the biggest loss to the biggest win', async () => {
    await renderWidgets(['trade-time']);
    const xs = [
      ...widget('trade-time').querySelectorAll('[data-axis-label="x"]'),
    ].map((t) => t.textContent!);
    expect(xs.length).toBeGreaterThan(3);
    for (const t of xs) expect(t).toMatch(/^\d\d:00$/);
    expect(dots('trade-time').length).toBe(1517);
    expect(
      [...widget('trade-time').querySelectorAll('[data-axis-label="y"]')].some(
        (t) => t.textContent === '$0',
      ),
    ).toBe(true);
  });

  test('on a one day range the clock reads finer than the hour', async () => {
    // A long range reads by the hour; one day, whose trades fall within minutes of each other, by five minutes.
    await renderWidgets(['trade-time'], {
      sample: three,
      url: '/app/dashboard?from=2026-11-02&to=2026-11-02',
    });
    const xs = [
      ...widget('trade-time').querySelectorAll('[data-axis-label="x"]'),
    ].map((t) => t.textContent!);
    expect(xs).toEqual(['10:00', '10:05']);
  });

  test('trade duration: hold time on a log scale, ticks from the ladder tightened to the range', async () => {
    await renderWidgets(['trade-duration'], { sample: three });
    expect(said('trade-duration')).toContain('Trade duration performance');
    expect(said('trade-duration')).toContain('Log scale');
    expect(dots('trade-duration')).toHaveLength(3);
    // Held 10 to 12 minutes: the rungs around them are 8m and 15m.
    const xs = [
      ...widget('trade-duration').querySelectorAll('[data-axis-label="x"]'),
    ].map((t) => t.textContent);
    expect(xs).toEqual(['8m', '15m']);
    chartOf(
      'trade-duration',
      /^Trade duration performance, 3 closed trades, all time\. /,
    );
    // Over the sample the ladder spreads wide, and only its own rungs appear.
  });

  test('trade duration over the sample uses only the ladder', async () => {
    await renderWidgets(['trade-duration']);
    const ladder = [
      '1m',
      '2m',
      '4m',
      '8m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '7h',
      '14h',
      '1d',
      '2d',
      '4d',
      '8d',
    ];
    const xs = [
      ...widget('trade-duration').querySelectorAll('[data-axis-label="x"]'),
    ].map((t) => t.textContent!);
    expect(xs.length).toBeGreaterThan(2);
    for (const t of xs) expect(ladder).toContain(t);
  });

  test('Privacy hides the money on the axis, in the label and in the readout', async () => {
    await renderWidgets(['trade-time', 'trade-duration'], {
      sample: three,
      prefs: { displayUnit: 'privacy' },
    });
    for (const key of ['trade-time', 'trade-duration'] as const) {
      const card = widget(key);
      const img = within(card).getByRole('img');
      expect(img.getAttribute('aria-label'), key).not.toMatch(/\$\d/);
      fireEvent.focus(img);
      expect(within(card).getByRole('status').textContent, key).toContain(
        '$•••',
      );
      expect(within(card).getByRole('status').textContent, key).not.toMatch(
        /\$\d/,
      );
      expect(card.textContent, key).toContain('$•••');
    }
  });

  test('a filter that matches nothing says so, in both', async () => {
    await renderWidgets(['trade-time', 'trade-duration'], {
      url: '/app/dashboard?symbol=ZZZ',
    });
    for (const key of ['trade-time', 'trade-duration'] as const) {
      expect(said(key)).toMatch(/No closed trades in this range\./);
      expect(within(widget(key)).queryAllByRole('img')).toHaveLength(0);
    }
  });

  test('every scatter is an image with a label', async () => {
    await renderWidgets(['trade-time', 'trade-duration'], { sample: three });
    for (const key of ['trade-time', 'trade-duration'] as const) {
      const img = within(widget(key)).getByRole('img');
      expect(img.getAttribute('aria-label')!.length).toBeGreaterThan(20);
      expect(img.getAttribute('tabindex')).toBe('0');
    }
  });
});
