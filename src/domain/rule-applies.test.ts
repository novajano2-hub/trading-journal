import { expect, test } from 'vitest';
import { makeTrade } from './__fixtures__/trades';
import { defaultMetricContext, type MetricContext } from './metrics/context';
import { ruleApplies } from './rule-applies';
import type { Rule } from './types';

const ctx = defaultMetricContext('UTC');
const rule = (showWhen: Rule['showWhen']): Rule => ({
  id: 'r',
  text: 'A rule',
  showWhen,
});

test("'always' applies to every trade", () => {
  for (const net of [5000, -5000, 0])
    expect(ruleApplies(rule('always'), makeTrade({ net }), ctx)).toBe(true);
});

test("'loser' applies to a loss and not to a win", () => {
  expect(ruleApplies(rule('loser'), makeTrade({ net: -100 }), ctx)).toBe(true);
  expect(ruleApplies(rule('loser'), makeTrade({ net: 100 }), ctx)).toBe(false);
  expect(ruleApplies(rule('winner'), makeTrade({ net: 100 }), ctx)).toBe(true);
  expect(ruleApplies(rule('winner'), makeTrade({ net: -100 }), ctx)).toBe(
    false,
  );
});

test("'breakeven' applies inside the breakeven range, on the chosen basis", () => {
  const range: MetricContext = {
    ...ctx,
    breakevenRange: { unit: 'amount', from: -500, to: 500 },
  };
  expect(ruleApplies(rule('breakeven'), makeTrade({ net: 300 }), range)).toBe(
    true,
  );
  expect(ruleApplies(rule('breakeven'), makeTrade({ net: 900 }), range)).toBe(
    false,
  );
  // Gross basis: net 300 but fees of 800 make gross 1100, a win.
  const gross: MetricContext = { ...range, pnlBasis: 'gross' };
  const t = makeTrade({ net: 300, fees: 800 });
  expect(ruleApplies(rule('breakeven'), t, gross)).toBe(false);
  expect(ruleApplies(rule('winner'), t, gross)).toBe(true);
});

test('an open trade gets only the always rules', () => {
  const open = makeTrade({ net: 0, status: 'open' });
  expect(ruleApplies(rule('always'), open, ctx)).toBe(true);
  for (const when of ['winner', 'loser', 'breakeven'] as const)
    expect(ruleApplies(rule(when), open, ctx)).toBe(false);
});
