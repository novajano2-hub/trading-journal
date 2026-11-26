import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { invalidationsFor, keys } from './keys';

test('the invalidation table', () => {
  expect(invalidationsFor('trades.update', 'sample')).toEqual([
    keys.trades('sample'),
    keys.imports('sample'),
    keys.history('sample'),
  ]);
  expect(invalidationsFor('tags.remove', 'mine')).toEqual([
    keys.tags('mine'),
    keys.trades('mine'),
    keys.imports('mine'),
    keys.history('mine'),
  ]);
  expect(invalidationsFor('tags.update', 'mine')).toEqual([
    keys.tags('mine'),
    keys.history('mine'),
  ]);
  expect(invalidationsFor('accounts.create', 'mine')).toEqual([
    keys.accounts('mine'),
    keys.history('mine'),
  ]);
  expect(invalidationsFor('imports.commit', 'mine')).toEqual([
    keys.imports('mine'),
    keys.trades('mine'),
    keys.history('mine'),
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
    ['tagCategories.create', k('tagCategories', 'history')],
    // Tags sort by their category's name.
    ['tagCategories.update', k('tagCategories', 'tags', 'history')],
    [
      'tagCategories.remove',
      k('tagCategories', 'tags', 'trades', 'imports', 'history'),
    ],
    ['folders.create', k('folders')],
    ['folders.rename', k('folders')],
    ['folders.remove', k('folders', 'journal')],
    ['templates.save', k('templates')],
    ['templates.remove', k('templates')],
    ['templates.setDefault', k('templates')],
    ['trades.createManual', k('trades', 'imports', 'history')],
    ['trades.replaceManual', k('trades', 'imports', 'history')],
    ['trades.updateMany', k('trades', 'imports', 'history')],
    [
      'accounts.clearTrades',
      k('trades', 'journal', 'imports', 'history', 'filesAll'),
    ],
    [
      'accounts.remove',
      k(
        'accounts',
        'trades',
        'journal',
        'imports',
        'cashFlows',
        'challenges',
        'history',
        'filesAll',
        'targetRules',
        'feeRules',
      ),
    ],
    // Merging moves files and unlinks notes; a day's figures read the trades.
    [
      'trades.merge',
      k('trades', 'journal', 'imports', 'history', 'days', 'filesAll'),
    ],
    [
      'trades.split',
      k('trades', 'journal', 'imports', 'history', 'days', 'filesAll'),
    ],
    [
      'trades.move',
      k('trades', 'journal', 'imports', 'history', 'days', 'filesAll'),
    ],
    // A fill's costs: the trade, the import context (its revision moves), the
    // log, and the day figures, which read the trades.
    ['trades.setFillCosts', k('trades', 'imports', 'history', 'days')],
    ['cashFlows.create', k('cashFlows', 'history')],
    ['cashFlows.update', k('cashFlows', 'history')],
    ['cashFlows.remove', k('cashFlows', 'history')],
    ['challenges.create', k('challenges')],
    ['challenges.update', k('challenges')],
    ['challenges.remove', k('challenges')],
    ['journal.save', k('journal', 'days')],
    ['journal.trash', k('journal', 'days')],
    ['journal.restore', k('journal', 'days')],
    ['journal.remove', k('trades', 'journal', 'imports', 'days', 'filesAll')],
    ['journal.ensureTradeNote', k('journal', 'trades', 'imports', 'days')],
    ['journal.dailyNote', k('journal', 'days')],
    ['tracker.save', k('tracker', 'days')],
    ['tracker.reset', k('tracker', 'days')],
    ['days.write', k('days')],
    ['days.finish', k('days')],
    ['dayShots.add', k('dayShotsAll')],
    ['dayShots.remove', k('dayShotsAll')],
    ['files.add', k('filesAll')],
    ['files.remove', k('filesAll')],
    // The default rules: a rule's own write touches its list and the history;
    // applying one rewrites trades, so it also makes the import context stale.
    ['targetRules.save', k('targetRules', 'history')],
    ['targetRules.remove', k('targetRules', 'history')],
    ['feeRules.save', k('feeRules', 'history')],
    ['feeRules.remove', k('feeRules', 'history')],
    [
      'rules.apply',
      k('targetRules', 'feeRules', 'trades', 'imports', 'history'),
    ],
  ];
  for (const [write, expected] of table)
    expect(invalidationsFor(write, ws), write).toEqual(expected);
});

test('every trade write makes the edit history stale', () => {
  for (const write of [
    'trades.update',
    'trades.updateMany',
    'trades.createManual',
    'trades.replaceManual',
    'trades.remove',
    'trades.merge',
    'trades.split',
    'trades.move',
    'trades.setFillCosts',
  ] as const)
    expect(invalidationsFor(write, 'mine'), write).toContainEqual(
      keys.history('mine'),
    );
  expect(keys.history('mine')).not.toEqual(keys.history('sample'));
});

test('every write that deletes or moves files makes the file lists stale', () => {
  for (const write of [
    'files.add',
    'files.remove',
    'trades.remove',
    'trades.merge',
    'trades.split',
    'trades.move',
    'strategies.remove',
    'journal.remove',
    'imports.undo',
    'accounts.clearTrades',
    'accounts.remove',
  ] as const)
    expect(invalidationsFor(write, 'mine'), write).toContainEqual(
      keys.filesAll('mine'),
    );
});

test('every write of a logged record makes the edit history stale', () => {
  for (const write of [
    'accounts.create',
    'accounts.update',
    'accounts.remove',
    'accounts.clearTrades',
    'cashFlows.create',
    'cashFlows.update',
    'cashFlows.remove',
    'strategies.create',
    'strategies.update',
    'strategies.remove',
    'tags.create',
    'tags.update',
    'tags.remove',
    'tagCategories.create',
    'tagCategories.update',
    'tagCategories.remove',
    'imports.commit',
    'imports.undo',
    'targetRules.save',
    'targetRules.remove',
    'feeRules.save',
    'feeRules.remove',
    'rules.apply',
  ] as const)
    expect(invalidationsFor(write, 'mine'), write).toContainEqual(
      keys.history('mine'),
    );
  // What history does not log leaves it alone: notes, preferences, the tracker (B26).
  for (const write of [
    'prefs.update',
    'journal.save',
    'journal.ensureTradeNote',
    'tracker.save',
  ] as const)
    expect(invalidationsFor(write, 'mine'), write).not.toContainEqual(
      keys.history('mine'),
    );
});

test('the rule lists are per workspace and per kind', () => {
  expect(keys.targetRules('mine')).not.toEqual(keys.feeRules('mine'));
  expect(keys.targetRules('mine')).not.toEqual(keys.targetRules('sample'));
});

test('a day key covers a date, and the shots of one date sit under all shots', () => {
  expect(keys.dayShots('mine', '2026-11-19').slice(0, 4)).toEqual(
    keys.dayShotsAll('mine'),
  );
});

test('the files of one owner and one file sit under all files', () => {
  expect(keys.files('mine', 'trade:t-1').slice(0, 4)).toEqual(
    keys.filesAll('mine'),
  );
  expect(keys.file('mine', 'f-1').slice(0, 4)).toEqual(keys.filesAll('mine'));
  expect(keys.files('mine', 'trade:t-1')).not.toEqual(
    keys.files('mine', 'trade:t-2'),
  );
  expect(keys.file('mine', 'f-1')).not.toEqual(keys.file('sample', 'f-1'));
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
    'trades.merge',
    'trades.split',
    'trades.move',
    'trades.setFillCosts',
    'journal.ensureTradeNote',
    'rules.apply',
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
