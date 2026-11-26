import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { guessMapping } from '@/domain/import/mapping';
import { planImport } from '@/domain/import/plan';
import { defaultMetricContext } from '@/domain/metrics/context';
import { readImportFile } from '@/lib/decode';
import { createLocalRepository } from './local/local-repository';
import { metricsByCurrency } from './metrics';

test(
  'the fixture CSV imports into My workspace with correct totals, dedupes, and undoes',
  { timeout: 30_000 },
  async () => {
    const repo = createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      now: () => new Date('2026-11-20T15:00:00Z'),
    });
    const { parsed } = await readImportFile(
      new File(
        [readFileSync('e2e/fixtures/sample-fills.csv')],
        'sample-fills.csv',
      ),
    );
    const mapping = guessMapping(parsed, {
      sourceTimeZone: 'America/New_York',
    });
    const acc = await repo.accounts.create('mine', {
      name: 'Imported',
      broker: '',
      type: 'live',
      currency: 'USD',
      startingBalance: 5_000_000,
      status: 'active',
    });
    const meta = (id: string) => ({
      importId: id,
      fileName: 'sample-fills.csv',
      now: '2026-11-20T15:00:00.000Z',
    });
    const job = await repo.imports.commit(
      'mine',
      planImport(
        parsed,
        mapping,
        await repo.imports.context('mine', acc.id),
        meta('i1'),
      ),
    );
    const trades = await repo.trades.list('mine');
    expect(trades[0]!.openedAt).toBe('2026-11-16T14:41:00.000Z');
    const [usd] = metricsByCurrency(trades, {
      accounts: [acc],
      ctx: defaultMetricContext('America/New_York'),
      baseCurrency: 'USD',
    });
    expect(usd!.summary).toMatchObject({
      closedCount: 8,
      netPnl: 127250,
      wins: 4,
      losses: 3,
      breakevens: 1,
    });
    expect(usd!.days.map((d) => [d.date, d.net])).toEqual([
      ['2026-11-16', 20500],
      ['2026-11-17', 28750],
      ['2026-11-18', 67500],
      ['2026-11-19', -27000],
      ['2026-11-20', 37500],
    ]);
    expect(usd!.drawdown.amount).toBe(27000);
    expect((await repo.trades.list('sample')).length).toBeGreaterThan(1000);
    const again = planImport(
      parsed,
      mapping,
      await repo.imports.context('mine', acc.id),
      meta('i2'),
    );
    expect(again.blocked).toBe('nothing-new');
    expect(await repo.imports.undo('mine', job.id)).toEqual({ ok: true });
    expect(await repo.trades.list('mine')).toEqual([]);
    expect((await repo.imports.list('mine'))[0]!.status).toBe('undone');
  },
);
