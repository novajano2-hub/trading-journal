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
