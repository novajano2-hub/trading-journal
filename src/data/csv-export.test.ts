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
      'Futures main,Opening range breakout,Breakout,FOMO,1 of 2,Yes,4,300',
    );
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
});
