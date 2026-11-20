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
});
