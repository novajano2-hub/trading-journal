import { describe, expect, test } from 'vitest';
import { roundHalfEven, toCents } from './money';

describe('money', () => {
  test('toCents rounds half-even with float tolerance', () => {
    expect(toCents(175)).toBe(17500);
    expect(toCents(1.005)).toBe(100); // 100.4999… is a tie → even
    expect(toCents(2.675)).toBe(268); // 267.4999… is a tie → even
    expect(toCents(-0.125)).toBe(-12);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(129.99999999999545)).toBe(13000);
  });
  test('roundHalfEven', () => {
    expect(roundHalfEven(100.5)).toBe(100);
    expect(roundHalfEven(101.5)).toBe(102);
    expect(roundHalfEven(200.67)).toBe(201);
    expect(roundHalfEven(-2.5)).toBe(-2);
  });
});
