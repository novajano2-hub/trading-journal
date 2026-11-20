import { describe, expect, test } from 'vitest';
import { parseDecimal } from './numbers';

describe('parseDecimal', () => {
  test("'.' decimals with ',' thousands", () => {
    expect(parseDecimal('6010.25', '.')).toBe(6010.25);
    expect(parseDecimal(' $1,234.50 ', '.')).toBe(1234.5);
    expect(parseDecimal('(12.50)', '.')).toBe(-12.5);
    expect(parseDecimal('-12.5', '.')).toBe(-12.5);
    expect(parseDecimal('+3', '.')).toBe(3);
  });
  test("a decimal comma is never read as thousands in '.' mode", () => {
    for (const raw of ['6010,25', '1,23', '12,3456', '', 'abc', '1.2.3', '--1'])
      expect(parseDecimal(raw, '.')).toBeNull();
  });
  test("',' decimals with '.' or space thousands", () => {
    expect(parseDecimal('6010,25', ',')).toBe(6010.25);
    expect(parseDecimal('6.010,25', ',')).toBe(6010.25);
    expect(parseDecimal('6 010,25', ',')).toBe(6010.25);
    expect(parseDecimal('€ -1,5', ',')).toBe(-1.5);
    expect(parseDecimal('6010.25', ',')).toBeNull();
  });
});
