import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mem = new Map<unknown, unknown>();
const store = { tag: 'store' };
const hang = { on: false };

vi.mock('idb-keyval', () => {
  const never = () => new Promise<never>(() => {});
  return {
    createStore: vi.fn(() => store),
    set: vi.fn(async (k: unknown, v: unknown) => {
      if (hang.on) return never();
      mem.set(k, v);
    }),
    get: vi.fn(async (k: unknown) => {
      if (hang.on) return never();
      return mem.get(k);
    }),
    del: vi.fn(async (k: unknown) => {
      if (hang.on) return never();
      mem.delete(k);
    }),
  };
});

import { createStore, set } from 'idb-keyval';
import {
  clearPendingImport,
  loadPendingImport,
  savePendingImport,
} from './pending-import';

const csv = () => new File(['a,b\n1,2\n'], 'fills.csv', { type: 'text/csv' });

beforeEach(() => {
  mem.clear();
  hang.on = false;
});
afterEach(() => vi.useRealTimers());

describe('pending import store', () => {
  test('keeps the file in the keel / pending-import store as a versioned record', async () => {
    const file = csv();
    await savePendingImport(file);
    expect(createStore).toHaveBeenCalledWith('keel', 'pending-import');
    const [, value, used] = vi.mocked(set).mock.calls[0]!;
    expect(used).toBe(store);
    expect(value).toMatchObject({ v: 1, file });
    expect(new Date((value as { savedAt: string }).savedAt).toISOString()).toBe(
      (value as { savedAt: string }).savedAt,
    );
    expect(await loadPendingImport()).toBe(file);
  });

  test('returns undefined for a missing, unversioned or malformed record', async () => {
    expect(await loadPendingImport()).toBeUndefined();
    for (const bad of [
      csv(), // the old shape: a bare File
      { v: 2, file: csv(), savedAt: 'x' },
      { v: 1, file: 'not a file', savedAt: 'x' },
      { v: 1, savedAt: 'x' },
      null,
    ]) {
      mem.set('current', bad);
      expect(await loadPendingImport()).toBeUndefined();
    }
  });

  test('clear removes the record', async () => {
    await savePendingImport(csv());
    await clearPendingImport();
    expect(await loadPendingImport()).toBeUndefined();
  });

  test('every IndexedDB call gives up after 5 seconds, naming IndexedDB', async () => {
    vi.useFakeTimers();
    hang.on = true;
    for (const call of [
      () => savePendingImport(csv()),
      () => loadPendingImport(),
      () => clearPendingImport(),
    ]) {
      const settled = expect(call()).rejects.toThrow(/IndexedDB/);
      await vi.advanceTimersByTimeAsync(5000);
      await settled;
    }
  });
});
