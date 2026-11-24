import { describe, expect, test } from 'vitest';
import { resolveInstrument } from '@/domain/instruments';
import { defaultMetricContext } from '@/domain/metrics/context';
import type { Account, CashFlow, Trade } from '@/domain/types';
import {
  expectancyFigure,
  formatFigure,
  meanFigure,
  pctBaseOf,
  sumFigures,
  formatRatioFigure,
  tradeFigure,
  type Figure,
} from './display';

const ctx = defaultMetricContext('UTC');
const o = (
  unit: Parameters<typeof formatFigure>[1]['unit'],
  signed = true,
) => ({
  unit,
  currency: 'USD',
  signed,
});

function trade(
  symbol: string,
  direction: 'long' | 'short',
  avgEntry: number,
  avgExit: number | undefined,
  extra: Partial<Trade> = {},
): Trade {
  const instrument = resolveInstrument(symbol)!;
  return {
    id: 't',
    serial: 1,
    workspaceId: 'w',
    accountId: 'a',
    instrument,
    direction,
    status: avgExit === undefined ? 'open' : 'closed',
    openedAt: '2026-11-02T15:00:00Z',
    closedAt: '2026-11-02T16:00:00Z',
    executions: [],
    avgEntry,
    avgExit,
    maxPosition: 1,
    pnlCurrency: instrument.quoteCurrency,
    gross: 12345,
    fees: 0,
    net: 12345,
    strategyIds: [],
    tagIds: [],
    ruleChecks: [],
    ...extra,
  };
}

describe('formatFigure compact', () => {
  const c = (money: number, unit: Parameters<typeof o>[0] = 'dollar') =>
    formatFigure(
      { money, pct: money / 1_000_000, r: money / 10000 },
      { ...o(unit), compact: true },
    );
  test('dollars shorten to a signed figure with no symbol', () => {
    expect(c(110_000).text).toBe('+1.1k');
    expect(c(-38_800).text).toBe('−388');
    expect(c(4_405).text).toBe('+44');
    expect(c(1_240_000).text).toBe('+12k');
    expect(c(250_000_000).text).toBe('+2.5M');
    expect(c(0).text).toBe('0');
  });
  test('the label stays the full figure', () => {
    expect(c(110_000).label).toBe('+$1,100.00');
  });
  test('Privacy still hides it as +$•••', () => {
    expect(c(110_000, 'privacy')).toEqual({
      text: '+$•••',
      label: 'hidden amount',
    });
    expect(c(-38_800, 'privacy').text).toBe('−$•••');
  });
});

describe('formatFigure', () => {
  test('dollar reads as signed P&L', () => {
    expect(formatFigure({ money: 12345 }, o('dollar')).text).toBe('+$123.45');
    expect(formatFigure({ money: -500 }, o('dollar')).text).toBe('−$5.00');
    expect(formatFigure({ money: 500 }, o('dollar', false)).text).toBe('$5.00');
  });
  test('percentage, R, ticks, pips and points', () => {
    expect(formatFigure({ money: 1, pct: 0.0125 }, o('percent')).text).toBe(
      '+1.25%',
    );
    expect(formatFigure({ money: 1, pct: -0.0125 }, o('percent')).text).toBe(
      '−1.25%',
    );
    expect(formatFigure({ money: 1, r: 3.4 }, o('r')).text).toBe('+3.40R');
    expect(formatFigure({ money: 1, ticks: 12 }, o('ticks')).text).toBe(
      '+12.0 ticks',
    );
    expect(formatFigure({ money: 1, pips: 8.5 }, o('pips')).text).toBe(
      '+8.5 pips',
    );
    expect(formatFigure({ money: 1, points: 3 }, o('points')).text).toBe(
      '+3.0 pts',
    );
  });
  test('thousands group as money does: +8,495.0 ticks, −1,204.5 pips', () => {
    expect(formatFigure({ money: 1, ticks: 8495 }, o('ticks')).text).toBe(
      '+8,495.0 ticks',
    );
    expect(formatFigure({ money: -1, pips: -1204.5 }, o('pips')).text).toBe(
      '−1,204.5 pips',
    );
    expect(formatFigure({ money: 0, ticks: 0.04 }, o('ticks')).text).toBe(
      '0.0 ticks',
    );
  });
  test('a figure with no value in the unit shows its dollars', () => {
    expect(formatFigure({ money: 12345, r: null }, o('r')).text).toBe(
      '+$123.45',
    );
    expect(formatFigure({ money: 12345 }, o('ticks')).text).toBe('+$123.45');
  });
  test('privacy hides the amount and keeps the sign', () => {
    expect(formatFigure({ money: 12345 }, o('privacy'))).toEqual({
      text: '+$•••',
      label: 'hidden amount',
    });
    expect(formatFigure({ money: -1 }, o('privacy')).text).toBe('−$•••');
    expect(formatFigure({ money: 0 }, o('privacy')).text).toBe('$•••');
    expect(formatFigure({ money: 5 }, o('privacy', false)).text).toBe('$•••');
  });
  test('the label is the text, plus the trades left out', () => {
    const f: Figure = { money: 100, r: 1, leftOut: 2 };
    expect(formatFigure(f, o('r'))).toEqual({
      text: '+1.00R',
      label: '+1.00R, 2 trades left out',
    });
    expect(formatFigure({ ...f, leftOut: 1 }, o('r')).label).toBe(
      '+1.00R, 1 trade left out',
    );
    expect(formatFigure(f, o('dollar')).label).toBe('+$1.00');
  });
});

describe('tradeFigure', () => {
  test('ticks and points count every contract the trade closed (Q3)', () => {
    const two = trade('ESZ6', 'long', 5000, 5003.25, { maxPosition: 2 });
    expect(tradeFigure(two, ctx).ticks).toBe(26);
    expect(tradeFigure(two, ctx).points).toBe(6.5);
  });
  test('an ES long 5000 to 5003.25 is 13 ticks and 3.25 points, with no pips', () => {
    const f = tradeFigure(trade('ESZ6', 'long', 5000, 5003.25), ctx);
    expect(f.ticks).toBe(13);
    expect(f.points).toBe(3.25);
    expect(f.pips).toBeNull();
  });
  test('a short counts the other way', () => {
    expect(tradeFigure(trade('ESZ6', 'short', 5003.25, 5000), ctx).points).toBe(
      3.25,
    );
  });
  test('forex reads in pips: EURUSD to the fifth place, USDJPY to the second', () => {
    const eur = tradeFigure(trade('EURUSD', 'long', 1.07483, 1.07688), ctx);
    expect(eur.pips).toBe(20.5);
    expect(eur.ticks).toBeNull();
    expect(eur.points).toBeNull();
    expect(tradeFigure(trade('USDJPY', 'long', 150, 150.25), ctx).pips).toBe(
      25,
    );
  });
  test('a stock has neither, and an open trade has none', () => {
    const s = tradeFigure(trade('AAPL', 'long', 100, 101), ctx);
    expect([s.ticks, s.pips, s.points]).toEqual([null, null, null]);
    expect(
      tradeFigure(trade('ESZ6', 'long', 5000, undefined), ctx).ticks,
    ).toBeNull();
  });
  test('R needs an initial risk; percent is net over capital committed', () => {
    const t = trade('ESZ6', 'long', 5000, 5003.25, { initialRisk: 6000 });
    const f = tradeFigure(t, ctx);
    expect(f.r).toBeCloseTo(12345 / 6000);
    expect(f.pct).toBeCloseTo(12345 / (5000 * 50 * 100));
    expect(tradeFigure(trade('ESZ6', 'long', 5000, 5003.25), ctx).r).toBeNull();
  });
  test('money follows the basis', () => {
    const t = trade('ESZ6', 'long', 5000, 5001, {
      gross: 500,
      fees: 100,
      net: 400,
    });
    expect(tradeFigure(t, { ...ctx, pnlBasis: 'gross' }).money).toBe(500);
    expect(tradeFigure(t, ctx).money).toBe(400);
  });
});

describe('sumFigures', () => {
  test('adds money; a unit sums over the trades that have it and counts the rest as left out', () => {
    const s = sumFigures([{ money: 100, r: 2 }, { money: 50 }], 10000);
    expect(s.money).toBe(150);
    expect(s.r).toBe(2);
    expect(s.leftOut).toBe(1);
    expect(s.pct).toBeCloseTo(0.015);
  });
  test('with no base the percentage is missing; with no value in a unit it is null', () => {
    const s = sumFigures([{ money: 100 }], null);
    expect(s.pct).toBeNull();
    expect(s.r).toBeNull();
  });
  test('ticks sum across futures and leave stocks out', () => {
    const fut = tradeFigure(trade('ESZ6', 'long', 5000, 5003.25), ctx);
    const stock = tradeFigure(trade('AAPL', 'long', 100, 101), ctx);
    const s = sumFigures([fut, fut, stock], null);
    expect(s.ticks).toBe(26);
    expect(s.leftOutBy?.ticks).toBe(1);
  });
});

test('meanFigure averages each unit over the trades that have it', () => {
  const m = meanFigure(
    [
      { money: 100, r: 2 },
      { money: 300, r: 4 },
    ],
    20000,
  );
  expect(m.money).toBe(200);
  expect(m.r).toBe(3);
  expect(m.pct).toBeCloseTo(0.01);
});

describe('expectancyFigure', () => {
  // ES: +8 ticks won, -4 lost, and a breakeven 1 tick up that netted nothing;
  // a stock win of $40 with no ticks. Each risked $100.
  const es = (id: string, net: number, avgExit: number) =>
    trade('ESZ6', 'long', 5000, avgExit, {
      id,
      net,
      gross: net,
      initialRisk: 10000,
    });
  const set = [
    es('w', 10000, 5002),
    es('l', -5000, 4999),
    es('b', 0, 5000.25),
    trade('AAPL', 'long', 100, 101, {
      id: 's',
      net: 4000,
      gross: 4000,
      initialRisk: 10000,
    }),
  ];

  test('every unit reads the decided trades only, as the money does: never the average trade', () => {
    const f = expectancyFigure(set, ctx, 1_000_000, 3000);
    expect(f.money).toBe(3000);
    expect(f.pct).toBeCloseTo(0.003);
    // (+8 - 4) / 2; the average trade would be (+8 - 4 + 1) / 3.
    expect(f.ticks).toBe(2);
    expect(f.points).toBe(0.5);
    // (+1 + 0.4 - 0.5) / 3 decided trades with a stop.
    expect(f.r).toBeCloseTo(0.3, 10);
    expect(f.pips).toBeNull();
    // The stock win has no ticks: one decided trade left out, the breakeven never counted.
    expect(f.leftOutBy?.ticks).toBe(1);
  });

  test('a unit no decided trade has is null; a breakeven alone has no expectancy', () => {
    const f = expectancyFigure([es('b', 0, 5000.25)], ctx, null, 0);
    expect(f.ticks).toBeNull();
    expect(f.r).toBeNull();
    expect(f.pct).toBeNull();
  });
});

describe('pctBaseOf', () => {
  const acct = (
    id: string,
    startingBalance: number,
    currency = 'USD',
    status: Account['status'] = 'active',
  ): Account => ({ id, startingBalance, currency, status }) as Account;
  const t = (accountId: string, closedAt: string, net: number) =>
    trade('ESZ6', 'long', 1, 2, { accountId, closedAt, net });
  const flow = (accountId: string, date: string, amount: number): CashFlow => ({
    id: `${accountId}-${date}`,
    workspaceId: 'w',
    accountId,
    date,
    amount,
  });
  const args = {
    accounts: [acct('a', 100000), acct('b', 50000), acct('c', 7, 'EUR')],
    flows: [] as CashFlow[],
    trades: [
      t('a', '2026-10-30T15:00:00Z', 2000),
      t('a', '2026-11-05T15:00:00Z', 9000),
      t('b', '2026-10-01T15:00:00Z', -500),
    ],
    currency: 'USD',
    timeZone: 'UTC',
  };
  test('starting balances plus net realized before the range start', () => {
    expect(pctBaseOf({ ...args, accountIds: [], from: '2026-11-01' })).toBe(
      100000 + 50000 + 2000 - 500,
    );
  });
  test('only the selected accounts, and the whole history when the range is open', () => {
    expect(pctBaseOf({ ...args, accountIds: ['a'], from: '2026-11-01' })).toBe(
      102000,
    );
    expect(pctBaseOf({ ...args, accountIds: ['a'] })).toBe(100000);
  });
  test('no accounts, or a base of zero or less, is null', () => {
    expect(pctBaseOf({ ...args, accounts: [], accountIds: [] })).toBeNull();
  });
  test('deposits and withdrawals dated before the range start move the base', () => {
    const flows = [
      flow('a', '2026-10-15', 10000),
      flow('a', '2026-10-31', -3000),
      // On the range's first day: inside the range, not before it.
      flow('a', '2026-11-01', 777777),
    ];
    expect(
      pctBaseOf({ ...args, flows, accountIds: ['a'], from: '2026-11-01' }),
    ).toBe(100000 + 2000 + 10000 - 3000);
  });
  test('an archived account counts only when it is selected', () => {
    const accounts = [acct('a', 100000), acct('z', 40000, 'USD', 'archived')];
    const trades = [t('z', '2026-10-02T15:00:00Z', 1000)];
    const all = { ...args, accounts, trades, from: '2026-11-01' };
    expect(pctBaseOf({ ...all, accountIds: [] })).toBe(100000);
    expect(pctBaseOf({ ...all, accountIds: ['z'] })).toBe(41000);
    expect(pctBaseOf({ ...all, accountIds: ['a', 'z'] })).toBe(141000);
  });
});

describe('compact unit figures', () => {
  const c = (unit: Parameters<typeof o>[0], value: number) =>
    formatFigure(
      { money: 1, ticks: value, pips: value, points: value },
      { ...o(unit), compact: true },
    ).text;
  test('ticks, pips and points shorten to a signed number and a suffix', () => {
    expect(c('ticks', 64)).toBe('+64t');
    expect(c('pips', 12.5)).toBe('+12.5p');
    expect(c('points', 3.5)).toBe('+3.5pt');
    expect(c('ticks', -8)).toBe('−8t');
    expect(c('ticks', 1234)).toBe('+1.2kt');
    expect(c('ticks', 0)).toBe('0t');
  });
  test('the label keeps the full figure', () => {
    expect(
      formatFigure({ money: 1, ticks: 64 }, { ...o('ticks'), compact: true })
        .label,
    ).toBe('+64.0 ticks');
  });
});

describe('ratios built from money', () => {
  test('read as the number, and as dots under Privacy, with words for a screen reader', () => {
    expect(formatRatioFigure('dollar', 1.5)).toEqual({
      text: '1.50',
      label: '1.50',
    });
    expect(formatRatioFigure('r', 1.5, 1)).toEqual({
      text: '1.5',
      label: '1.5',
    });
    expect(formatRatioFigure('privacy', 1.5)).toEqual({
      text: '•••',
      label: 'hidden ratio',
    });
  });
});
