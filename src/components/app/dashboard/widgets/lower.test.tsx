// @vitest-environment happy-dom
// The lower widgets (#46, Task 9): the Edge score and the charts, over the
// sample's closed trades on 20 Nov 2026 and over small trade sets whose
// answers are worked out by hand.
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { scoreOf } from '@/domain/metrics/score';
import {
  byDay,
  renderWidgets,
  said,
  theSample,
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
      // The outer ring is 80 units from the centre (125): recovery, straight down, is drawn there.
      expect(Number(dot('recovery').getAttribute('cy'))).toBeCloseTo(205, 5);
      expect(parts().Recovery).toContain('0 of 100');
      expect(parts().Recovery).toMatch(/no drawdown/i);
      expect(parts().Recovery).toMatch(/adds nothing to the score/i);
      // A part that is full is drawn full and scores so.
      expect(Number(dot('winRate').getAttribute('cy'))).toBeCloseTo(45, 5);
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
