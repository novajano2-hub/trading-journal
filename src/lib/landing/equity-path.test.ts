import { describe, expect, test } from 'vitest';
import { equityPath } from './equity-path';

describe('equityPath', () => {
  test('maps a series to line and area paths inside the viewBox', () => {
    const { line, area, first, last } = equityPath([100, 200, 150], {
      xMax: 680,
      top: 15,
      bottom: 145,
      floor: 160,
    });
    expect(line).toBe('M0 145 L340 15 L680 80');
    expect(area).toBe('M0 145 L340 15 L680 80 L680 160 L0 160Z');
    expect(first).toEqual({ x: 0, y: 145 });
    expect(last).toEqual({ x: 680, y: 80 });
  });

  test('a flat series sits mid-height rather than dividing by zero', () => {
    const { line } = equityPath([5, 5], {
      xMax: 680,
      top: 15,
      bottom: 145,
      floor: 160,
    });
    expect(line).toBe('M0 80 L680 80');
  });

  test('a shared range keeps a small series small beside a big one', () => {
    const box = { xMax: 680, top: 15, bottom: 145, floor: 160 };
    // Alone, 0 to 100 fills the box; against a 0 to 1000 range it uses a tenth of it.
    expect(equityPath([0, 100], box).line).toBe('M0 145 L680 15');
    expect(
      equityPath([0, 100], { ...box, range: { min: 0, max: 1000 } }).line,
    ).toBe('M0 145 L680 132');
  });

  test('an empty series yields empty paths', () => {
    const box = { xMax: 680, top: 15, bottom: 145, floor: 160 };
    expect(equityPath([], box)).toEqual({
      line: '',
      area: '',
      first: null,
      last: null,
    });
  });
});
