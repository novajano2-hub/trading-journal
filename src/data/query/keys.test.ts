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
    // An update can make the account of a phase (C-02).
    ['challenges.update', k('challenges', 'accounts')],
    // Its transactions are unlinked.
    ['challenges.remove', k('challenges', 'propTxns')],
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
    // A kept version changes the versions list; a restore also writes the
    // note, which the journal and the day cards read.
    ['noteVersions.keep', k('noteVersionsAll')],
    ['noteVersions.restore', k('journal', 'days', 'noteVersionsAll')],
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
    // A cleared or replaced photo goes with the write.
    'strategies.update',
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
    'accounts.setCostMethod',
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
    'noteVersions.keep',
    'noteVersions.restore',
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

test('the versions of one note sit under all versions, and workspaces never overlap', () => {
  expect(keys.noteVersions('mine', 'n-1').slice(0, 4)).toEqual(
    keys.noteVersionsAll('mine'),
  );
  expect(keys.noteVersions('mine', 'n-1')).not.toEqual(
    keys.noteVersions('sample', 'n-1'),
  );
  expect(keys.noteVersions('mine', 'n-1')).not.toEqual(
    keys.noteVersions('mine', 'n-2'),
  );
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
    // ...and logs the change of method (6B).
    ['accounts.setCostMethod', k('accounts', 'trades', 'imports', 'history')],
    // A strategy leaves the challenges that list it, and takes its photo and its missed trades and leaves a history row (6B).
    [
      'strategies.remove',
      k(
        'strategies',
        'trades',
        'imports',
        'history',
        'filesAll',
        'challenges',
        'missedTradesAll',
      ),
    ],
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

test('missed trades are their own lists, per workspace and per strategy', () => {
  const ws = 'mine';
  const k = (...names: (keyof typeof keys)[]) =>
    names.map((n) => (keys[n] as (w: string) => readonly unknown[])(ws));
  // A save or a delete refreshes every strategy's list, and nothing a figure reads.
  expect(invalidationsFor('missedTrades.save', ws)).toEqual(
    k('missedTradesAll'),
  );
  expect(invalidationsFor('missedTrades.remove', ws)).toEqual(
    k('missedTradesAll'),
  );
  // One strategy's list sits under all of them.
  expect(keys.missedTrades(ws, 's-1').slice(0, 4)).toEqual(
    keys.missedTradesAll(ws),
  );
  expect(keys.missedTrades(ws, 's-1')).not.toEqual(
    keys.missedTrades(ws, 's-2'),
  );
  expect(keys.missedTradesAll('mine')).not.toEqual(
    keys.missedTradesAll('sample'),
  );
  // They log no history and touch no trade, file or strategy list.
  for (const write of ['missedTrades.save', 'missedTrades.remove'] as const)
    for (const stale of [
      keys.trades(ws),
      keys.history(ws),
      keys.strategies(ws),
      keys.filesAll(ws),
      keys.days(ws),
      keys.journal(ws),
    ])
      expect(invalidationsFor(write, ws), write).not.toContainEqual(stale);
});
