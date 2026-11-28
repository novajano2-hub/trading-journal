import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { computePatterns } from '@/domain/patterns';
import { breakdown } from '@/domain/metrics/breakdowns';
import { defaultMetricContext } from '@/domain/metrics/context';
import { dailyPnl } from '@/domain/metrics/days';
import { summarize } from '@/domain/metrics/summary';
import { EMPTY_FILTERS, applyFilters } from '../filters';
import { fixtureSample } from '../__fixtures__/sample';
import { NotFoundError } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

const ids = (list: string[]) => {
  let i = 0;
  return () => list[i++] ?? `id-${i}`;
};

function setup(opts: { newId?: () => string } = {}) {
  const indexedDB = new IDBFactory();
  const make = (o = opts) =>
    createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
      ...o,
    });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return { repo: make(), make, db };
}

const input = {
  strategyId: 'str-1',
  symbol: 'ES',
  at: '2026-11-24T15:42:00.000Z',
  price: 6618.5,
  commission: 258,
  fees: 276,
};

test('a missed trade saves exactly its fields', async () => {
  const { repo, db } = setup({ newId: ids(['m-1']) });
  // A side and a quantity are not part of a missed trade: they are never kept.
  const created = await repo.missedTrades.create(S, {
    ...input,
    side: 'buy',
    quantity: 2,
  } as typeof input);
  expect(created).toEqual({ id: 'm-1', workspaceId: S, ...input });
  expect(Object.keys((await db.missedTrades.get([S, 'm-1']))!).sort()).toEqual([
    'at',
    'commission',
    'fees',
    'id',
    'price',
    'strategyId',
    'symbol',
    'workspaceId',
  ]);
  expect(await repo.missedTrades.list(S, 'str-1')).toEqual([created]);
});

test('a missed trade needs only a symbol and a time; the symbol is trimmed', async () => {
  const { repo, db } = setup({ newId: ids(['m-1']) });
  const made = await repo.missedTrades.create(S, {
    strategyId: 'str-1',
    symbol: '  EURUSD ',
    at: '2026-11-18T19:20:00.000Z',
  });
  expect(made).toEqual({
    id: 'm-1',
    workspaceId: S,
    strategyId: 'str-1',
    symbol: 'EURUSD',
    at: '2026-11-18T19:20:00.000Z',
  });
  // An absent price, commission or fee is not stored at all.
  expect(Object.keys((await db.missedTrades.get([S, 'm-1']))!)).not.toContain(
    'price',
  );
});

test('a missed trade that is not valid is refused and writes nothing', async () => {
  const { repo, db } = setup();
  const bad: Partial<typeof input>[] = [
    { symbol: '   ' },
    { at: 'next tuesday' },
    { at: '' },
    { price: Number.NaN },
    { price: Number.POSITIVE_INFINITY },
    { commission: 2.5 },
    { fees: Number.NaN },
  ];
  for (const b of bad)
    await expect(
      repo.missedTrades.create(S, { ...input, ...b }),
      JSON.stringify(b),
    ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.missedTrades.create(S, { ...input, strategyId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(await db.missedTrades.count()).toBe(0);
});

test('a strategy lists its own missed trades, newest first, in its own workspace', async () => {
  const { repo } = setup({ newId: ids(['a', 'b', 'c', 'd', 'e']) });
  await repo.strategies.create(S, {
    name: 'Second',
    description: '',
    assetClasses: [],
    groups: [],
    checklist: [],
    status: 'active',
  });
  const [second] = (await repo.strategies.list(S)).filter(
    (s) => s.name === 'Second',
  );
  await repo.missedTrades.create(S, { ...input, at: '2026-11-18T19:20:00Z' });
  await repo.missedTrades.create(S, { ...input, at: '2026-11-24T15:42:00Z' });
  await repo.missedTrades.create(S, { ...input, at: '2026-11-20T14:58:00Z' });
  await repo.missedTrades.create(S, {
    ...input,
    strategyId: second!.id,
    symbol: 'NQ',
  });
  expect(
    (await repo.missedTrades.list(S, 'str-1')).map((m) => m.at.slice(0, 10)),
  ).toEqual(['2026-11-24', '2026-11-20', '2026-11-18']);
  expect(
    (await repo.missedTrades.list(S, second!.id)).map((m) => m.symbol),
  ).toEqual(['NQ']);
  // My workspace holds none of the sample's.
  expect(await repo.missedTrades.list(M, 'str-1')).toEqual([]);
});

test('an edit changes the fields it names, can clear an optional one, and never moves the strategy', async () => {
  const { repo } = setup({ newId: ids(['m-1']) });
  await repo.missedTrades.create(S, input);

  const moved = await repo.missedTrades.update(S, 'm-1', {
    symbol: 'NQ',
    price: 22512.25,
  });
  expect(moved).toEqual({
    id: 'm-1',
    workspaceId: S,
    ...input,
    symbol: 'NQ',
    price: 22512.25,
  });

  // A field sent as undefined is cleared; one left out stays.
  const cleared = await repo.missedTrades.update(S, 'm-1', {
    commission: undefined,
    fees: undefined,
    price: undefined,
  });
  expect(cleared).toEqual({
    id: 'm-1',
    workspaceId: S,
    strategyId: 'str-1',
    symbol: 'NQ',
    at: input.at,
  });

  // The strategy is not a field of an edit, whatever is sent.
  const stay = await repo.missedTrades.update(S, 'm-1', {
    strategyId: 'str-2',
  } as never);
  expect(stay.strategyId).toBe('str-1');

  await expect(
    repo.missedTrades.update(S, 'm-1', { symbol: '' }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.missedTrades.update(S, 'gone', { symbol: 'ES' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect((await repo.missedTrades.list(S, 'str-1'))[0]!.symbol).toBe('NQ');
});

test('removing a missed trade deletes just that one', async () => {
  const { repo } = setup({ newId: ids(['m-1', 'm-2']) });
  await repo.missedTrades.create(S, input);
  await repo.missedTrades.create(S, { ...input, symbol: 'NQ' });
  await repo.missedTrades.remove(S, 'm-1');
  expect((await repo.missedTrades.list(S, 'str-1')).map((m) => m.id)).toEqual([
    'm-2',
  ]);
  await expect(repo.missedTrades.remove(S, 'm-1')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('missed trades leave no edit history', async () => {
  const { repo } = setup({ newId: ids(['m-1']) });
  const before = await repo.history.list(S);
  await repo.missedTrades.create(S, input);
  await repo.missedTrades.update(S, 'm-1', { symbol: 'NQ' });
  await repo.missedTrades.remove(S, 'm-1');
  expect(await repo.history.list(S)).toEqual(before);
});

test('deleting a strategy deletes its missed trades and photo', async () => {
  const { repo, db } = setup();
  const keep = await repo.strategies.create(S, {
    name: 'Keep',
    description: '',
    assetClasses: [],
    groups: [],
    checklist: [],
    status: 'active',
  });
  const mine = await repo.missedTrades.create(S, input);
  const kept = await repo.missedTrades.create(S, {
    ...input,
    strategyId: keep.id,
  });
  const photo = await repo.files.add(
    S,
    'strategy:str-1',
    { bytes: new ArrayBuffer(4), type: 'image/png', name: 'p.png' },
    { images: true },
  );
  await repo.strategies.update(S, 'str-1', { photoId: photo.id });
  // The same ids in My workspace are another workspace's rows.
  await db.missedTrades.put({
    id: mine.id,
    workspaceId: M,
    strategyId: 'str-1',
    symbol: 'ES',
    at: input.at,
  });

  await repo.strategies.remove(S, 'str-1');

  expect(await repo.missedTrades.list(S, 'str-1')).toEqual([]);
  expect(await repo.files.get(S, photo.id)).toBeUndefined();
  expect((await repo.missedTrades.list(S, keep.id)).map((m) => m.id)).toEqual([
    kept.id,
  ]);
  expect(await db.missedTrades.get([M, mine.id])).toBeDefined();
});

test('a strategy that cannot be deleted keeps its missed trades and photo', async () => {
  const { repo } = setup({ newId: ids(['m-1', 'ph-1']) });
  await repo.missedTrades.create(S, input);
  await expect(repo.strategies.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await repo.missedTrades.list(S, 'str-1')).toHaveLength(1);
});

test('clearing a workspace clears its missed trades', async () => {
  const { repo, db } = setup({ newId: ids(['m-1', 'm-2']) });
  await repo.missedTrades.create(S, input);
  await db.missedTrades.put({
    id: 'm-9',
    workspaceId: M,
    strategyId: 'x',
    symbol: 'ES',
    at: input.at,
  });
  await repo.workspaces.resetSample();
  expect(await db.missedTrades.where('workspaceId').equals(S).count()).toBe(0);
  await repo.workspaces.clearUser();
  expect(await db.missedTrades.where('workspaceId').equals(M).count()).toBe(0);
});

test('clearing the photo deletes its file, and replacing it deletes the old one', async () => {
  const { repo } = setup({ newId: ids(['ph-1', 'ph-2']) });
  const png = (name: string) => ({
    bytes: new ArrayBuffer(4),
    type: 'image/png',
    name,
  });
  const first = await repo.files.add(S, 'strategy:str-1', png('a.png'), {
    images: true,
  });
  await repo.strategies.update(S, 'str-1', { photoId: first.id });
  const second = await repo.files.add(S, 'strategy:str-1', png('b.png'), {
    images: true,
  });

  // Replaced: the old file goes in the same write.
  const replaced = await repo.strategies.update(S, 'str-1', {
    photoId: second.id,
  });
  expect(replaced.photoId).toBe(second.id);
  expect(await repo.files.get(S, first.id)).toBeUndefined();
  expect(await repo.files.get(S, second.id)).toBeDefined();

  // An edit that leaves the photo alone leaves its file alone.
  await repo.strategies.update(S, 'str-1', { name: 'Renamed' });
  expect(await repo.files.get(S, second.id)).toBeDefined();

  // Cleared: undefined clears photoId, and the file goes.
  const cleared = await repo.strategies.update(S, 'str-1', {
    photoId: undefined,
  });
  expect('photoId' in cleared).toBe(false);
  expect(await repo.files.get(S, second.id)).toBeUndefined();
  expect(await repo.files.list(S, 'strategy:str-1')).toEqual([]);
});

test("a photo that is not the strategy's own is never deleted by clearing", async () => {
  const { repo } = setup({ newId: ids(['f-x']) });
  // A trade's attachment, wrongly named as a photo, stays when the photo is cleared.
  const other = await repo.files.add(
    S,
    'trade:f-1',
    { bytes: new ArrayBuffer(4), type: 'image/png', name: 'a.png' },
    { images: true },
  );
  await repo.strategies.update(S, 'str-1', { photoId: other.id });
  await repo.strategies.update(S, 'str-1', { photoId: undefined });
  expect(await repo.files.get(S, other.id)).toBeDefined();
});

test('missed trades never reach the summary, the log or patterns', async () => {
  const { repo } = setup({ newId: ids(['m-1', 'm-2', 'm-3', 'm-4']) });
  const ctx = {
    ...defaultMetricContext('UTC'),
    strategyNames: { 'str-1': 'Opening range breakout' },
  };
  const env = {
    timeZone: 'UTC',
    today: '2026-11-19',
    accounts: await repo.accounts.list(S),
  };
  // Everything a figure, a list, a filter or a pattern reads.
  const figures = async () => {
    const trades = await repo.trades.list(S);
    return {
      trades,
      strategies: await repo.strategies.list(S),
      summary: summarize(trades, ctx),
      byStrategy: breakdown(trades, 'strategy', ctx),
      bySymbol: breakdown(trades, 'symbol', ctx),
      perStrategy: (await repo.strategies.list(S)).map((s) => [
        s.id,
        summarize(
          trades.filter((t) => t.strategyIds.includes(s.id)),
          ctx,
        ),
      ]),
      calendar: dailyPnl(trades, ctx),
      filtered: applyFilters(
        trades,
        { ...EMPTY_FILTERS, strategyIds: ['str-1'] },
        env,
      ),
      patterns: computePatterns(trades, {
        timeZone: 'UTC',
        breakevenRange: ctx.breakevenRange,
        sessions: new Map(),
      }),
      history: await repo.history.list(S),
      days: await repo.days.list(S),
      tracker: await repo.tracker.get(S),
      journal: await repo.journal.list(S),
    };
  };
  const before = await figures();
  const symbolOfATrade = before.trades[0]!.instrument.symbol;
  const closedOn = before.trades[0]!.closedAt ?? before.trades[0]!.openedAt;

  // One on the symbol and the very day of a real trade, and two with costs.
  await repo.missedTrades.create(S, {
    ...input,
    symbol: symbolOfATrade,
    at: closedOn,
  });
  await repo.missedTrades.create(S, { ...input, price: 1, commission: 99_999 });
  await repo.missedTrades.create(S, { ...input, fees: 12_345 });
  await repo.missedTrades.update(S, 'm-3', { commission: 5 });

  const after = await figures();
  expect(after.trades).toEqual(before.trades);
  expect(after.summary).toEqual(before.summary);
  expect(after.byStrategy).toEqual(before.byStrategy);
  expect(after.bySymbol).toEqual(before.bySymbol);
  expect(after.perStrategy).toEqual(before.perStrategy);
  expect(after.calendar).toEqual(before.calendar);
  expect(after.filtered).toEqual(before.filtered);
  expect(after.patterns).toEqual(before.patterns);
  expect(after.strategies).toEqual(before.strategies);
  expect(after.history).toEqual(before.history);
  expect(after.days).toEqual(before.days);
  expect(after.tracker).toEqual(before.tracker);
  expect(after.journal).toEqual(before.journal);
  expect(await repo.missedTrades.list(S, 'str-1')).toHaveLength(3);
});

/** The app's source files (tests left out), as paths under `src/`. */
function sourceFiles(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}
const reading = (pattern: RegExp) =>
  sourceFiles().filter((f) => pattern.test(readFileSync(`src/${f}`, 'utf8')));

test('no trade list, filter, summary, report, calendar, tracker or pattern reads a missed trade', () => {
  const readers = reading(/missedTrades|MissedTrade/);
  // The strategy page and its form read them; the sanity check that the scan sees real files.
  expect(readers).toContain('components/app/strategies/missed-trades.tsx');
  expect(readers).toContain('data/local/missed-trades.ts');

  // Only these may name a missed trade: the store, the strategy pages that
  // show them, and the sample that seeds them. Anything else (a figure, a list,
  // a filter, a report, a day, a tracker, a pattern, a strategy's stats) is a
  // place a missed trade must never reach, so a new reader fails here.
  const allowed = new Set([
    'components/app/strategies/missed-trades.tsx',
    'components/app/strategies/strategies-view.tsx',
    'components/app/strategies/strategy-form.tsx',
    'components/app/strategies/strategy-view.tsx',
    'data/__fixtures__/sample.ts',
    'data/local/context.ts',
    'data/local/db.ts',
    'data/local/local-repository.ts',
    'data/local/missed-trades.ts',
    'data/local/schema.ts',
    'data/local/strategies.ts',
    'data/query/hooks.ts',
    'data/query/keys.ts',
    'data/repository.ts',
    'data/seed/depth.ts',
    'data/seed/generate.ts',
    'domain/types.ts',
  ]);
  expect(readers.filter((f) => !allowed.has(f))).toEqual([]);
});

test("a template's example figures reach only the template cards, never a real figure", () => {
  const readers = reading(/\b(STRATEGY_TEMPLATES|exampleStats)\b/);
  expect(readers).toContain('content/strategy-templates.ts');
  // The chooser and the Templates tab list them; a card draws a template's
  // examples, labelled as examples (B44). Nothing that builds a figure does.
  const allowed = new Set([
    'content/strategy-templates.ts',
    'components/app/strategies/template-card.tsx',
    'components/app/strategies/template-chooser.tsx',
    'components/app/strategies/templates-tab.tsx',
  ]);
  expect(readers.filter((f) => !allowed.has(f))).toEqual([]);
});
