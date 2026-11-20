import { createStore, del, get, set, type UseStore } from 'idb-keyval';

/** What /app/import will read. Bump `v` when the shape changes. */
interface PendingImport {
  v: 1;
  file: File;
  /** ISO 8601 */
  savedAt: string;
}

const KEY = 'current';
const TIMEOUT_MS = 5000;

let store: UseStore | undefined;
// Created on first use: opening IndexedDB must never happen during server rendering.
const db = () => (store ??= createStore('keel', 'pending-import'));

/** IndexedDB can stall (private modes, blocked upgrades): fail loudly rather than hang the UI. */
function withTimeout<T>(op: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('IndexedDB did not respond in time')),
      TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

export async function savePendingImport(file: File): Promise<void> {
  const record: PendingImport = {
    v: 1,
    file,
    savedAt: new Date().toISOString(),
  };
  await withTimeout(set(KEY, record, db()));
}

export async function loadPendingImport(): Promise<File | undefined> {
  const record = await withTimeout(get<unknown>(KEY, db()));
  if (typeof record !== 'object' || record === null) return undefined;
  const { v, file } = record as Partial<PendingImport>;
  return v === 1 && file instanceof File ? file : undefined;
}

export async function clearPendingImport(): Promise<void> {
  await withTimeout(del(KEY, db()));
}
