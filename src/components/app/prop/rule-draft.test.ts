import { expect, test } from 'vitest';
import { emptyRules, rulesFromDraft } from './rule-draft';

const draft = (over: Partial<ReturnType<typeof emptyRules>> = {}) => ({
  ...emptyRules(),
  target: '3000',
  dailyLoss: '1000',
  maxDrawdown: '2000',
  drawdownType: 'trailing' as const,
  ...over,
});
const o = { phase: 'evaluation' as const, firm: 'Firm', start: 10_000_000 };

test('a floor above the starting balance is accepted (firms lock at start + $100)', () => {
  const r = rulesFromDraft(draft({ floorMode: 'fixed', floor: '100100' }), o);
  expect(r).toMatchObject({ rules: { drawdownFloor: 10_010_000 } });
});

test('a floor still needs a positive number', () => {
  expect(
    rulesFromDraft(draft({ floorMode: 'fixed', floor: '' }), o),
  ).toMatchObject({ errors: { floor: 'Enter the floor balance.' } });
});

test('a static drawdown ignores a fixed floor, even an empty one', () => {
  const r = rulesFromDraft(
    draft({ drawdownType: 'static', floorMode: 'fixed', floor: '' }),
    o,
  );
  expect(r).toMatchObject({ rules: { drawdownType: 'static' } });
  expect('rules' in r && 'drawdownFloor' in r.rules).toBe(false);
});
