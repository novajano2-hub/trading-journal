import { expect, test } from 'vitest';
import {
  atFromInput,
  costInput,
  parseCost,
  parsePrice,
  priceInput,
  priceText,
  wallInput,
} from './missed-trade-fields';

const NY = 'America/New_York';

test('a typed price is a number above zero, blank, or not a price', () => {
  expect(parsePrice('6618.5')).toBe(6618.5);
  expect(parsePrice('6,618.50')).toBe(6618.5);
  expect(parsePrice(' 1.1584 ')).toBe(1.1584);
  expect(parsePrice('.5')).toBe(0.5);
  expect(parsePrice('')).toBeUndefined();
  expect(parsePrice('   ')).toBeUndefined();
  // Zero, a minus, letters, a decimal comma, a second point and a sign are not prices.
  for (const bad of ['0', '-5', 'abc', '1,5', '1.2.3', '$5', '1e3', '.'])
    expect(parsePrice(bad), bad).toBeNull();
});

test('a price reads with at least two decimals and the ones that were typed', () => {
  expect(priceText(6618.5)).toBe('6,618.50');
  expect(priceText(22512.25)).toBe('22,512.25');
  expect(priceText(1.1584)).toBe('1.1584');
  expect(priceText(0.00001234)).toBe('0.00001234');
  expect(priceText(100)).toBe('100.00');
  // And as the field shows it: plain, nothing to strip.
  expect(priceInput(6618.5)).toBe('6618.5');
  expect(priceInput(1.1584)).toBe('1.1584');
});

test('a typed cost is cents, blank, or not an amount; a minus is a credit', () => {
  expect(parseCost('2.58')).toBe(258);
  expect(parseCost('1,234.50')).toBe(123450);
  expect(parseCost('')).toBeUndefined();
  expect(parseCost('0')).toBe(0);
  expect(parseCost('-0.35')).toBe(-35);
  expect(parseCost('2,5')).toBeNull();
  expect(parseCost('abc')).toBeNull();
  expect(costInput(258)).toBe('2.58');
  expect(costInput(0)).toBe('0.00');
  expect(costInput(-35)).toBe('-0.35');
});

test('the date and time box is read in the profile zone', () => {
  // 10:42 in New York on 24 Nov is 15:42 UTC; 9 Jul is daylight time.
  expect(atFromInput('2026-11-24T10:42', NY)).toBe('2026-11-24T15:42:00.000Z');
  expect(atFromInput('2026-07-09T10:42', NY)).toBe('2026-07-09T14:42:00.000Z');
  expect(atFromInput('2026-11-24T10:42', 'UTC')).toBe(
    '2026-11-24T10:42:00.000Z',
  );
  expect(wallInput('2026-11-24T15:42:00.000Z', NY)).toBe('2026-11-24T10:42');
  expect(wallInput('2026-07-09T14:42:00.000Z', NY)).toBe('2026-07-09T10:42');
  // Blank or half-typed is not a time.
  expect(atFromInput('', NY)).toBeNull();
  expect(atFromInput('2026-11-24', NY)).toBeNull();
});
