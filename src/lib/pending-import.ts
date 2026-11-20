import { del, get, set } from 'idb-keyval';

const KEY = 'keel:pending-import';

export async function savePendingImport(file: File): Promise<void> {
  await set(KEY, file);
}

export async function loadPendingImport(): Promise<File | undefined> {
  return get<File>(KEY);
}

export async function clearPendingImport(): Promise<void> {
  await del(KEY);
}
