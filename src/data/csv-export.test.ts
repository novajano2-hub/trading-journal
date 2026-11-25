import { describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import { fixtureSample } from './__fixtures__/sample';
import { tradesCsv, type CsvEnv } from './csv-export';

const fx = fixtureSample();
const env: CsvEnv = {
  timeZone: 'America/New_York',
  accounts: fx.accounts,
  strategies: fx.strategies,
  tags: fx.tags,
  categories: fx.tagCategories,
  ctx: defaultMetricContext('America/New_York'),
};

const loss = makeTrade({
  id: 'a',
  net: -12_345,
  fees: 100,
  openedAt: '2026-03-02T15:00:00Z',
  closedAt: '2026-03-02T15:05:30Z',
});
const win = makeTrade({
  id: 'b',
  net: 250_000,
  openedAt: '2026-03-03T15:00:00Z',
  closedAt: '2026-03-03T16:00:00Z',
});

describe('tradesCsv', () => {
  test('a header and one row per trade, with plain decimals and no currency sign', () => {
    const csv = tradesCsv([loss, win], ['open', 'instrument', 'net'], env);
    expect(csv.split('\r\n')).toEqual([
      'Open,Instrument,Net',
      '2026-03-02 10:00,ESZ5,-123.45',
      '2026-03-03 10:00,ESZ5,2500.00',
    ]);
  });

  test('times are in the trader time zone', () => {
    const utc = tradesCsv([loss], ['open', 'close'], {
      ...env,
      timeZone: 'UTC',
    });
    expect(utc.split('\r\n')[1]).toBe('2026-03-02 15:00,2026-03-02 15:05');
  });

  test('names, lists and ratios read as values', () => {
    const t = makeTrade({
      net: 60_000,
      accountId: 'acc-a',
      strategyIds: ['str-1'],
      tagIds: ['tag-setup', 'tag-fomo'],
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'r-2', followed: false },
      ],
      reviewed: true,
      rating: 4,
    });
    const csv = tradesCsv(
      [t],
      [
        'account',
        'strategies',
        'tags',
        'mistakes',
        'rules',
        'reviewed',
        'rating',
        'duration',
      ],
      env,
    );
    const [head, row] = csv.split('\r\n');
    expect(head).toBe(
      'Account,Strategies,Tags,Mistakes,Rules,Reviewed,Rating,Duration (seconds)',
    );
    expect(row).toBe(
      'Futures main,Opening range breakout,breakout,fomo,1 of 2,Yes,4,300',
    );
  });

  test('the R columns read the one risk model: a legacy trade as it was, a level trade by its levels', () => {
    // Saved before levels: a 5 point stop and a 10 point target.
    const old = makeTrade({
      net: 22_500,
      avgEntry: 4500,
      plannedStop: 4495,
      plannedTarget: 4510,
      initialRisk: 25_000,
    });
    // Saved in levels: a 5 point stop and a 15 point target, one contract each.
    const levels = makeTrade({
      net: 22_500,
      avgEntry: 4500,
      maxPosition: 1,
      stops: { unit: 'price', levels: [{ value: 4495, qty: 1 }] },
      targets: { unit: 'price', levels: [{ value: 4515, qty: 1 }] },
      initialRisk: 25_000,
    });
    const csv = tradesCsv([old, levels], ['realizedR', 'plannedR'], env);
    expect(csv.split('\r\n')).toEqual([
      'Realized R,Planned R',
      '0.90,2.00',
      '0.90,3.00',
    ]);
  });

  test('a field with a comma, quote or line break is quoted', () => {
    const t = makeTrade({ net: 0, strategyIds: ['s'] });
    const csv = tradesCsv([t], ['strategies'], {
      ...env,
      strategies: [{ ...fx.strategies[0]!, id: 's', name: 'Fade, "late"' }],
    });
    expect(csv.split('\r\n')[1]).toBe('"Fade, ""late"""');
  });

  test('no trades is the header alone', () => {
    expect(tradesCsv([], ['open', 'net'], env)).toBe('Open,Net');
  });

  test('Status is a plain outcome: Win, Loss, Breakeven or Open', () => {
    const flat = makeTrade({ id: 'c', net: 0, gross: 0 });
    const open = makeTrade({ id: 'd', status: 'open', net: 0 });
    const csv = tradesCsv([win, loss, flat, open], ['status'], env);
    expect(csv.split('\r\n')).toEqual([
      'Status',
      'Win',
      'Loss',
      'Breakeven',
      'Open',
    ]);
  });
});

test('a name a spreadsheet would run as a formula exports as text; negative money stays a number (E83)', () => {
  const evil = {
    ...env,
    strategies: [{ ...fx.strategies[0]!, name: '=HYPERLINK("http://x")' }],
  };
  const t = makeTrade({
    id: 'e',
    net: -12_345,
    strategyIds: [fx.strategies[0]!.id],
    openedAt: '2026-03-02T15:00:00Z',
    closedAt: '2026-03-02T15:05:30Z',
  });
  const [, row] = tradesCsv([t], ['strategies', 'net'], evil).split('\r\n');
  expect(row).toBe(`"'=HYPERLINK(""http://x"")",-123.45`);
});
