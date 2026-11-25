import { expect, test } from 'vitest';
import { defaultVersion } from '@/domain/tracker/defaults';
import { formatMoney } from '@/lib/format';
import { ruleCondition, ruleName } from './rule-label';

const fmt = (c: number) => {
  const text = formatMoney(c, 'USD');
  return { text, label: text };
};
const v = {
  ...defaultVersion('2026-11-02'),
  custom: [
    {
      id: 'c1',
      name: 'Mark key levels before the open',
      stage: 'prepare' as const,
      days: [true, true, true, true, true, true, true] as [
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
      ],
    },
  ],
};

test("names and conditions are Keel's words, from the version in force", () => {
  expect(ruleName('startBy', v, fmt)).toBe('Start the day note by 09:30');
  expect(ruleName('strategy', v, fmt)).toBe('Every trade has a strategy');
  expect(ruleName('lossPerTrade', v, fmt)).toBe(
    'Keep every loss to $100 or less',
  );
  expect(ruleName('lossPerDay', v, fmt)).toBe(
    "Keep the day's loss to $100 or less",
  );
  expect(ruleName('custom:c1', v, fmt)).toBe('Mark key levels before the open');
  expect(ruleCondition('startBy', v, fmt)).toBe('By 09:30');
  expect(ruleCondition('stop', v, fmt)).toBe('All trades');
  expect(ruleCondition('lossPerTrade', v, fmt)).toBe('$100 a trade');
  expect(ruleCondition('lossPerDay', v, fmt)).toBe('$100 a day');
  expect(ruleCondition('custom:c1', v, fmt)).toBe('Ticked by hand');
});

test('hours and a percent cap read as the version sets them', () => {
  const w = {
    ...v,
    builtIn: {
      ...v.builtIn,
      lossPerTrade: { on: true, unit: 'percent' as const, value: 0.01 },
    },
  };
  expect(ruleName('hours', w, fmt)).toBe('Trade only between 09:00 and 12:00');
  expect(ruleCondition('hours', w, fmt)).toBe('09:00 to 12:00');
  expect(ruleName('lossPerTrade', w, fmt)).toBe(
    'Keep every loss to 1% or less',
  );
  expect(ruleCondition('lossPerTrade', w, fmt)).toBe('1% a trade');
});

test('under Privacy the amount is hidden in the name', () => {
  const hide = () => ({ text: '$•••', label: 'hidden amount' });
  expect(ruleName('lossPerDay', v, hide)).toBe(
    "Keep the day's loss to $••• or less",
  );
});
