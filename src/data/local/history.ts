import { localDate } from '@/domain/time';
import type { HistoryRow, Trade } from '@/domain/types';
import type { HistoryRepo } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

/** B28: rows older than this are removed. */
export const HISTORY_DAYS = 30;
const DAY_MS = 86_400_000;

/** What a history row's `oldValue` and `newValue` hold. */
type Value = HistoryRow['oldValue'];

export interface FieldChange {
  field: string;
  oldValue: Value;
  newValue: Value;
}

/**
 * A stored value as a primitive: a missing value is null, a list of ids one
 * comma-joined string, anything else structured (a levels side) its JSON.
 */
function plain(v: unknown): Value {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string'))
    return v.join(',');
  return JSON.stringify(v);
}

/** One row per changed field; created and deleted rows carry no field. */
export function fieldChanges<T extends object>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  return fields.flatMap((field) => {
    const oldValue = plain(before[field]);
    const newValue = plain(after[field]);
    return oldValue === newValue ? [] : [{ field, oldValue, newValue }];
  });
}

/** A row as the caller gives it: `logHistory` adds the id, the workspace and the time. */
export type NewHistoryRow = Omit<HistoryRow, 'id' | 'workspaceId' | 'at'>;

/** One row for a record that came, went or was undone, with no field. */
export function lifecycleRow(
  type: HistoryRow['type'],
  action: 'created' | 'deleted' | 'undone',
  entityId: string,
  label: string,
  source: HistoryRow['source'] = 'you',
): NewHistoryRow {
  return { type, action, source, entityId, label };
}

/** One edited row per change; none for a write that changed nothing logged. */
export function changeRows(
  type: HistoryRow['type'],
  entityId: string,
  label: string,
  changes: readonly FieldChange[],
  source: HistoryRow['source'] = 'you',
): NewHistoryRow[] {
  return changes.map((change) => ({
    type,
    action: 'edited',
    source,
    entityId,
    label,
    ...change,
  }));
}

/**
 * Writes one history row per entry, stamped with the clock. Call inside the
 * transaction that makes the change, with `db.history` in its table list: the
 * rows and the change stand or fall together (B26). The rows take ids of their
 * own, not `ctx.newId()`: a fixed id generator (a test's) must neither make two
 * rows collide nor shift the ids it hands to the records themselves.
 */
export async function logHistory(
  db: KeelDb,
  ws: string,
  rows: readonly NewHistoryRow[],
  ctx: LocalContext,
): Promise<void> {
  if (rows.length === 0) return;
  const at = ctx.now().toISOString();
  await db.history.bulkAdd(
    rows.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      workspaceId: ws,
      at,
    })),
  );
}

// ---- Trades -----------------------------------------------------------------

/** The trade fields history keeps (B26); `executions` is kept as `fills`, its count. */
const TRADE_FIELDS = [
  'strategyIds',
  'tagIds',
  'rating',
  'reviewed',
  'targets',
  'stops',
  'noteId',
  'accountId',
  'swap',
  'fills',
] as const;

function tradeView(t: Trade) {
  return {
    strategyIds: t.strategyIds,
    tagIds: t.tagIds,
    rating: t.rating,
    reviewed: t.reviewed,
    targets: t.targets,
    stops: t.stops,
    noteId: t.noteId,
    accountId: t.accountId,
    swap: t.swap,
    fills: t.executions.length,
  };
}

/** The fills without the account they sit in: a move of account is logged as `accountId`. */
function fillsOf(t: Trade): string {
  // `undefined` is left out of the JSON.
  return JSON.stringify(
    t.executions.map((e) => ({ ...e, accountId: undefined })),
  );
}

/**
 * The logged fields that differ between two versions of a trade. The fills
 * read as their count; fills rebuilt to the same count still show, as the same
 * number on both sides, so an edit of a price or a time is not lost.
 */
export function tradeChanges(before: Trade, after: Trade): FieldChange[] {
  const changes = fieldChanges(tradeView(before), tradeView(after), [
    ...TRADE_FIELDS,
  ]);
  const edited =
    before.executions !== after.executions &&
    fillsOf(before) !== fillsOf(after);
  if (edited && !changes.some((c) => c.field === 'fills'))
    changes.push({
      field: 'fills',
      oldValue: before.executions.length,
      newValue: after.executions.length,
    });
  return changes;
}

/** How history names a trade: its symbol and open date, in the profile's time zone. */
export function tradeLabel(t: Trade, timeZone: string): string {
  return `${t.instrument.symbol} ${localDate(t.openedAt, timeZone)}`;
}

// ---- The read side ----------------------------------------------------------

/** `at` is an ISO string, so these bound every row of a workspace. */
const FIRST = '';
const LAST = '￿';

export function localHistory(ctx: LocalContext): HistoryRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const cutoff = new Date(
        ctx.now().getTime() - HISTORY_DAYS * DAY_MS,
      ).toISOString();
      return rwTx(db, [db.history], async () => {
        await db.history
          .where('[workspaceId+at]')
          .between([ws, FIRST], [ws, cutoff], true, false)
          .delete();
        return db.history
          .where('[workspaceId+at]')
          .between([ws, FIRST], [ws, LAST])
          .reverse()
          .toArray();
      });
    },
  };
}
