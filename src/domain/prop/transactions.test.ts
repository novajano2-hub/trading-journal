import { describe, expect, test } from 'vitest';
import type {
  Cents,
  Challenge,
  PropTxn,
  PropTxnCategory,
  PropTxnStatus,
} from '../types';
import {
  canLogPayout,
  parseAmount,
  TXN_CATEGORIES,
  TXN_CATEGORY_LABELS,
  TXN_STATUS_LABELS,
  TXN_STATUSES,
  txnsInView,
  TXN_VIEWS,
} from './transactions';

const txn = (
  id: string,
  date: string,
  amount: Cents,
  status: PropTxnStatus = 'reviewed',
  category: PropTxnCategory = 'uncategorized',
): PropTxn => ({
  id,
  workspaceId: 'w',
  date,
  firm: 'Sample firm A',
  category,
  amount,
  status,
});

/**
 * Thirteen rows: three of income (one of them ignored), ten of costs, three
 * waiting for review (one of income, two of costs).
 */
const THIRTEEN: PropTxn[] = [
  txn('t01', '2026-11-18', 16_500, 'ignored'),
  txn('t02', '2026-11-16', 270_000, 'not-reviewed', 'payout'),
  txn('t03', '2026-11-10', -2_900, 'not-reviewed'),
  txn('t04', '2026-11-03', -54_000, 'reviewed', 'evaluation-fee'),
  txn('t05', '2026-11-02', 180_000, 'reviewed', 'payout'),
  txn('t06', '2026-10-28', -9_900, 'reviewed', 'reset-fee'),
  txn('t07', '2026-10-07', -9_900, 'not-reviewed', 'reset-fee'),
  txn('t08', '2026-10-05', -34_500, 'reviewed', 'evaluation-fee'),
  txn('t09', '2026-10-01', -32_500, 'reviewed', 'evaluation-fee'),
  txn('t10', '2026-09-30', -8_500, 'reviewed', 'activation-fee'),
  txn('t11', '2026-09-14', -16_500, 'reviewed', 'evaluation-fee'),
  txn('t12', '2026-09-02', -16_500, 'reviewed', 'evaluation-fee'),
  txn('t13', '2026-08-20', -1_500, 'ignored'),
];

const ids = (rows: readonly PropTxn[]): string[] => rows.map((r) => r.id);

describe('the filter (C68, C73)', () => {
  test('All, Income, Costs and To review, in the comp’s order and words', () => {
    expect(TXN_VIEWS).toEqual([
      { value: 'all', label: 'All' },
      { value: 'income', label: 'Income' },
      { value: 'costs', label: 'Costs' },
      { value: 'review', label: 'To review' },
    ]);
  });

  test('on thirteen rows it keeps 13, 3, 10 and 3', () => {
    expect(THIRTEEN).toHaveLength(13);
    expect(txnsInView(THIRTEEN, 'all')).toHaveLength(13);
    expect(txnsInView(THIRTEEN, 'income')).toHaveLength(3);
    expect(txnsInView(THIRTEEN, 'costs')).toHaveLength(10);
    expect(txnsInView(THIRTEEN, 'review')).toHaveLength(3);
  });

  test('income and costs go by the sign, whatever the category or the status', () => {
    expect(ids(txnsInView(THIRTEEN, 'income'))).toEqual(['t01', 't02', 't05']);
    // A positive amount on an uncategorized row is income; a negative one is a cost.
    expect(txnsInView(THIRTEEN, 'costs').every((t) => t.amount < 0)).toBe(true);
    // An ignored row keeps its place in the list by its sign.
    expect(ids(txnsInView(THIRTEEN, 'costs'))).toContain('t13');
  });

  test('to review is the rows not yet reviewed', () => {
    expect(ids(txnsInView(THIRTEEN, 'review'))).toEqual(['t02', 't03', 't07']);
  });

  test('newest first, a tie by id, whatever order the rows come in', () => {
    const shuffled = [
      txn('b', '2026-11-02', -100),
      txn('c', '2026-11-18', -100),
      txn('a', '2026-11-02', -100),
    ];
    expect(ids(txnsInView(shuffled, 'all'))).toEqual(['c', 'a', 'b']);
    // The rows given are left as they were.
    expect(ids(shuffled)).toEqual(['b', 'c', 'a']);
  });
});

describe('categories and statuses (C27)', () => {
  test('the six categories in TradeZella’s order, worded as the table shows them', () => {
    expect(TXN_CATEGORIES).toEqual([
      'payout',
      'evaluation-fee',
      'activation-fee',
      'reset-fee',
      'affiliate-income',
      'uncategorized',
    ]);
    expect(TXN_CATEGORY_LABELS).toEqual({
      payout: 'Payout',
      'evaluation-fee': 'Evaluation fee',
      'activation-fee': 'Activation fee',
      'reset-fee': 'Reset fee',
      'affiliate-income': 'Affiliate income',
      uncategorized: 'Uncategorized',
    });
  });

  test('the three statuses', () => {
    expect(TXN_STATUSES).toEqual(['not-reviewed', 'reviewed', 'ignored']);
    expect(TXN_STATUS_LABELS).toEqual({
      'not-reviewed': 'Not reviewed',
      reviewed: 'Reviewed',
      ignored: 'Ignored',
    });
  });
});

describe('parseAmount: a signed amount in whole dollars and cents', () => {
  test.each([
    ['3000', 300_000],
    ['+3000', 300_000],
    ['-300', -30_000],
    ['−300', -30_000],
    ['1,500.00', 150_000],
    ['-1,234.56', -123_456],
    ['  -29  ', -2_900],
    ['.5', 50],
    ['$29', 2_900],
    ['-$29', -2_900],
    ['−$29', -2_900],
    ['0.10', 10],
  ])('%s reads %i cents', (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  test.each([
    [''],
    ['  '],
    ['abc'],
    ['12a'],
    ['1e3'],
    ['0'],
    ['-0'],
    ['0.00'],
    ['0.004'],
    ['--5'],
    ['1.2.3'],
    ['−'],
  ])('%j is not an amount', (text) => {
    expect(parseAmount(text)).toBeNull();
  });

  test('a figure with more than two decimals rounds to the cent', () => {
    expect(parseAmount('12.346')).toBe(1_235);
    expect(parseAmount('-12.344')).toBe(-1_234);
  });
});

describe('canLogPayout: only a funded challenge that has not breached', () => {
  const c = (over: Partial<Challenge>): Challenge => ({
    id: 'c',
    workspaceId: 'w',
    name: 'Futures 50K',
    firm: 'Sample firm A',
    steps: 1,
    phases: [],
    phase: 'funded',
    status: 'active',
    ...over,
  });

  test('funded and active can; an evaluation cannot', () => {
    expect(canLogPayout(c({}))).toBe(true);
    expect(canLogPayout(c({ phase: 'evaluation' }))).toBe(false);
  });

  test('a breached challenge cannot, in any phase', () => {
    expect(canLogPayout(c({ status: 'breached' }))).toBe(false);
    expect(canLogPayout(c({ status: 'breached', phase: 'evaluation' }))).toBe(
      false,
    );
  });

  test('a passed challenge waiting for its funded account is not in its funded phase', () => {
    expect(canLogPayout(c({ status: 'passed', phase: 'evaluation' }))).toBe(
      false,
    );
    expect(canLogPayout(c({ status: 'passed', phase: 'funded' }))).toBe(true);
  });
});
