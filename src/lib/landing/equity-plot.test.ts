import { describe, expect, test } from 'vitest';
import { plotEquity } from './equity-plot';
import { getSampleView, SAMPLE_START } from './sample-view';

describe('plotEquity', () => {
  const { equity, days } = getSampleView();
  const { points, col, baseline } = plotEquity(equity, days, SAMPLE_START);

  test('starts at the opening balance and plots every closed trade', () => {
    expect(points).toHaveLength(equity.length + 1);
    expect(points[0]).toEqual({ x: 0, y: baseline, day: 0 });
    expect(points.slice(1).map((p) => p.point)).toEqual(equity);
  });

  test("spaces each day's closes inside that day's column", () => {
    expect(col).toBe(1000 / days.length);
    for (const p of points.slice(1)) {
      expect(p.x).toBeGreaterThan(col * p.day);
      expect(p.x).toBeLessThan(col * (p.day + 1));
    }
  });

  test('keeps the highest and lowest balances inside the frame, top down', () => {
    const ys = points.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(1000);
    const top = points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(top.point?.equity).toBe(Math.max(...equity.map((e) => e.equity)));
  });
});
