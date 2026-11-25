// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Execution, LevelSide, Trade } from '@/domain/types';
import type { Display } from '@/lib/display';
import { FillsTimeline } from './fills-timeline';

afterEach(cleanup);

const fill = (
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
): Execution => ({
  id,
  accountId: 'a1',
  symbol: 'ESZ5',
  side,
  qty,
  price,
  time,
  fees: 0,
  commission: 0,
});

/** A long ES trade of two contracts at 4500, out at 4504. */
const trade = (p: Partial<Trade> = {}): Trade =>
  makeTrade({
    net: 40000,
    avgEntry: 4500,
    avgExit: 4504,
    maxPosition: 2,
    executions: [
      fill('b', 'buy', 2, 4500, '2026-03-02T15:00:00Z'),
      fill('s', 'sell', 2, 4504, '2026-03-02T15:05:00Z'),
    ],
    ...p,
  });

const side = (
  unit: LevelSide['unit'],
  ...levels: [number, number][]
): LevelSide => ({
  unit,
  levels: levels.map(([value, qty]) => ({ value, qty })),
});

function draw(t: Trade) {
  const { container } = render(
    // The readout is the only place that reads the display, and no marker is hovered.
    <FillsTimeline
      trade={t}
      timeZone="America/New_York"
      display={{} as Display}
    />,
  );
  const all = (plan: string) => [
    ...container.querySelectorAll(`[data-plan="${plan}"]`),
  ];
  const num = (el: Element, attr: string) => Number(el.getAttribute(attr));
  return { container, all, num };
}

describe('the fills chart draws the plan', () => {
  test('one line per level, and each zone reaches the farthest level on its side', () => {
    const { container, all, num } = draw(
      trade({
        targets: side('points', [4, 1], [10, 1]),
        stops: side('price', [4495, 1], [4490, 1]),
      }),
    );
    const targets = all('target-line');
    const stops = all('stop-line');
    expect(targets).toHaveLength(2);
    expect(stops).toHaveLength(2);
    // Prices read out beside their lines: 4500 + 4 and 4500 + 10 points.
    for (const text of ['4,504.00', '4,510.00', '4,495.00', '4,490.00'])
      expect(container.textContent).toContain(text);

    // Up the chart is a smaller y. The target zone's top is the farthest target.
    const targetYs = targets.map((l) => num(l, 'y1'));
    const stopYs = stops.map((l) => num(l, 'y1'));
    const [targetZone] = all('target-zone');
    const [riskZone] = all('risk-zone');
    expect(all('target-zone')).toHaveLength(1);
    expect(all('risk-zone')).toHaveLength(1);
    expect(num(targetZone!, 'y')).toBeCloseTo(Math.min(...targetYs), 6);
    expect(num(riskZone!, 'y') + num(riskZone!, 'height')).toBeCloseTo(
      Math.max(...stopYs),
      6,
    );
    // Both zones start at the average entry, which is where they meet.
    expect(num(targetZone!, 'y') + num(targetZone!, 'height')).toBeCloseTo(
      num(riskZone!, 'y'),
      6,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('one level keeps the plain labels; several are numbered', () => {
    const one = draw(
      trade({
        targets: side('price', [4510, 2]),
        stops: side('price', [4495, 2]),
      }),
    );
    const text = one.container.textContent!;
    expect(text).toContain('Target');
    expect(text).toContain('Stop');
    expect(text).not.toMatch(/Target 1|Stop 1/);
    cleanup();
    const many = draw(
      trade({
        targets: side('price', [4505, 1], [4510, 1]),
        stops: side('price', [4495, 2]),
      }),
    );
    expect(many.container.textContent).toContain('Target 1');
    expect(many.container.textContent).toContain('Target 2');
    expect(many.container.textContent).not.toMatch(/Stop 1/);
  });

  test('a trade saved before levels draws its one stop and one target as it did', () => {
    const { all, container } = draw(
      trade({ plannedStop: 4495, plannedTarget: 4510 }),
    );
    expect(all('target-line')).toHaveLength(1);
    expect(all('stop-line')).toHaveLength(1);
    expect(all('target-zone')).toHaveLength(1);
    expect(all('risk-zone')).toHaveLength(1);
    expect(container.textContent).toContain('4,510.00');
    expect(container.textContent).toContain('4,495.00');
  });

  test('a trade with no plan draws no plan', () => {
    const { container } = draw(trade());
    expect(container.querySelector('[data-plan]')).toBeNull();
  });

  test('a level in ticks is drawn where its price is', () => {
    const { container, all } = draw(
      trade({ stops: { unit: 'ticks', levels: [{ value: 8, qty: 2 }] } }),
    );
    // 8 ticks of 0.25 below 4500.
    expect(all('stop-line')).toHaveLength(1);
    expect(container.textContent).toContain('4,498.00');
  });
});
