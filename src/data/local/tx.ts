import type { Table } from 'dexie';
import { NotFoundError } from '../repository';
import type { KeelDb } from './db';

/**
 * One rw transaction over `tables`. Dexie wraps errors named like its own
 * (NotFoundError) and keeps the original in `inner`; hand that original back.
 */
export async function rwTx<R>(
  db: KeelDb,
  tables: Table[],
  scope: () => Promise<R>,
): Promise<R> {
  try {
    return await db.transaction('rw', tables, scope);
  } catch (error) {
    const inner = (error as { inner?: unknown } | null)?.inner;
    throw inner instanceof NotFoundError ? inner : error;
  }
}
