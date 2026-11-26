import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { invalidationsFor, keys } from './keys';

test('the invalidation table', () => {
  expect(invalidationsFor('trades.update', 'sample')).toEqual([
    keys.trades('sample'),
    keys.imports('sample'),
  ]);
  expect(invalidationsFor('tags.remove', 'mine')).toEqual([
    keys.tags('mine'),
    keys.trades('mine'),
    keys.imports('mine'),
  ]);
  expect(invalidationsFor('tags.update', 'mine')).toEqual([keys.tags('mine')]);
  expect(invalidationsFor('accounts.create', 'mine')).toEqual([
    keys.accounts('mine'),
  ]);
  expect(invalidationsFor('imports.commit', 'mine')).toEqual([
    keys.imports('mine'),
    keys.trades('mine'),
  ]);
  expect(invalidationsFor('workspaces.resetSample', 'sample')).toEqual([
    keys.workspace('sample'),
  ]);
});

test('Plan 5 writes invalidate what they change', () => {
  const ws = 'mine';
  const k = (...names: (keyof typeof keys)[]) =>
    names.map((n) => (keys[n] as (w: string) => readonly unknown[])(ws));
  const table: [Parameters<typeof invalidationsFor>[0], unknown[]][] = [
    ['tagCategories.create', k('tagCategories')],
    // Tags sort by their category's name.
    ['tagCategories.update', k('tagCategories', 'tags')],
    ['tagCategories.remove', k('tagCategories', 'tags', 'trades', 'imports')],
    ['folders.create', k('folders')],
    ['folders.rename', k('folders')],
    ['folders.remove', k('folders', 'journal')],
    ['templates.save', k('templates')],
    ['templates.remove', k('templates')],
    ['templates.setDefault', k('templates')],
    ['trades.createManual', k('trades', 'imports')],
    ['trades.replaceManual', k('trades', 'imports')],
    ['trades.updateMany', k('trades', 'imports')],
    ['accounts.clearTrades', k('trades', 'journal', 'imports')],
    [
      'accounts.remove',
      k('accounts', 'trades', 'journal', 'imports', 'cashFlows', 'challenges'),
    ],
    ['cashFlows.create', k('cashFlows')],
    ['cashFlows.update', k('cashFlows')],
    ['cashFlows.remove', k('cashFlows')],
    ['challenges.create', k('challenges')],
    // An update can make the account of a phase (C-02).
    ['challenges.update', k('challenges', 'accounts')],
    // Its transactions are unlinked.
    ['challenges.remove', k('challenges', 'propTxns')],
    ['journal.save', k('journal', 'days')],
    ['journal.trash', k('journal', 'days')],
    ['journal.restore', k('journal', 'days')],
    ['journal.remove', k('trades', 'journal', 'imports', 'days')],
    ['journal.ensureTradeNote', k('journal', 'trades', 'imports', 'days')],
    ['journal.dailyNote', k('journal', 'days')],
    ['tracker.save', k('tracker', 'days')],
    ['tracker.reset', k('tracker', 'days')],
    ['days.write', k('days')],
    ['days.finish', k('days')],
    ['dayShots.add', k('dayShotsAll')],
    ['dayShots.remove', k('dayShotsAll')],
  ];
  for (const [write, expected] of table)
    expect(invalidationsFor(write, ws), write).toEqual(expected);
});

test('a day key covers a date, and the shots of one date sit under all shots', () => {
  expect(keys.dayShots('mine', '2026-11-19').slice(0, 4)).toEqual(
    keys.dayShotsAll('mine'),
  );
});

test('every write that changes what an import context holds makes it stale', () => {
  // The context holds the account's currency and open trades with their journaling.
  for (const write of [
    'trades.update',
    'trades.remove',
    'tags.remove',
    'strategies.update',
    'strategies.remove',
    'journal.remove',
    'accounts.update',
    'accounts.clearTrades',
    'tagCategories.remove',
    'trades.updateMany',
    'trades.createManual',
    'trades.replaceManual',
    'journal.ensureTradeNote',
  ] as const)
    expect(invalidationsFor(write, 'mine'), write).toContainEqual(
      keys.imports('mine'),
    );
});

test('a list key covers its details and nothing in another workspace or entity', async () => {
  const qc = new QueryClient();
  for (const k of [
    keys.trade('sample', 't1'),
    keys.trades('mine'),
    keys.journal('sample'),
  ])
    qc.setQueryData(k, 1);
  await qc.invalidateQueries({ queryKey: keys.trades('sample') });
  expect(qc.getQueryState(keys.trade('sample', 't1'))!.isInvalidated).toBe(
    true,
  );
  expect(qc.getQueryState(keys.trades('mine'))!.isInvalidated).toBe(false);
  expect(qc.getQueryState(keys.journal('sample'))!.isInvalidated).toBe(false);
});

test('Plan 6C writes invalidate what they change', () => {
  const ws = 'mine';
  const k = (...names: (keyof typeof keys)[]) =>
    names.map((n) => (keys[n] as (w: string) => readonly unknown[])(ws));
  const table: [Parameters<typeof invalidationsFor>[0], unknown[]][] = [
    ['propTxns.add', k('propTxns')],
    ['propTxns.update', k('propTxns')],
    ['propTxns.remove', k('propTxns')],
    ['challenges.markBreached', k('challenges')],
    // A quantity and its new accounts are written together.
    ['challenges.createMany', k('challenges', 'accounts')],
    // The rebuild rewrites the account's trades, and the import context carries the method.
    ['accounts.setCostMethod', k('accounts', 'trades', 'imports')],
    // A strategy leaves the challenges that list it.
    ['strategies.remove', k('strategies', 'trades', 'imports', 'challenges')],
  ];
  for (const [write, expected] of table)
    expect(invalidationsFor(write, ws), write).toEqual(expected);
});

test('every write behind a figure of the widgets or the prop dashboard refreshes the query it reads', () => {
  // The derived figures are memos over these queries, so a stale query is a stale figure.
  const reads: [string, readonly unknown[]][] = [
    ['trades', keys.trades('mine')],
    ['accounts', keys.accounts('mine')],
    ['cash flows', keys.cashFlows('mine')],
    ['challenges', keys.challenges('mine')],
    ['prop transactions', keys.propTxns('mine')],
  ];
  const writes: [Parameters<typeof invalidationsFor>[0], string][] = [
    ['trades.update', 'trades'],
    ['trades.createManual', 'trades'],
    ['trades.remove', 'trades'],
    ['imports.commit', 'trades'],
    ['imports.undo', 'trades'],
    ['accounts.setCostMethod', 'trades'],
    // `update` with a new method does the same rebuild.
    ['accounts.update', 'trades'],
    ['accounts.create', 'accounts'],
    ['accounts.update', 'accounts'],
    ['accounts.setCostMethod', 'accounts'],
    ['cashFlows.create', 'cash flows'],
    ['cashFlows.update', 'cash flows'],
    ['cashFlows.remove', 'cash flows'],
    ['challenges.create', 'challenges'],
    ['challenges.createMany', 'challenges'],
    ['challenges.createMany', 'accounts'],
    ['challenges.update', 'challenges'],
    ['challenges.markBreached', 'challenges'],
    ['challenges.remove', 'challenges'],
    ['propTxns.add', 'prop transactions'],
    ['propTxns.update', 'prop transactions'],
    ['propTxns.remove', 'prop transactions'],
    ['challenges.remove', 'prop transactions'],
  ];
  for (const [write, read] of writes)
    expect(
      invalidationsFor(write, 'mine'),
      `${write} refreshes ${read}`,
    ).toContainEqual(reads.find(([name]) => name === read)![1]);
});
