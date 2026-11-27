import type { MissedTrade } from '@/domain/types';
import {
  NotFoundError,
  type MissedTradesRepo,
  type NewMissedTrade,
} from '../repository';
import { mergePatch } from '../merge';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

/** The fields of a missed trade a caller can set: nothing else is ever kept. */
const FIELDS = ['symbol', 'at', 'price', 'commission', 'fees'] as const;
/** The optional ones: an edit that sends one as undefined clears it. */
const OPTIONAL = ['price', 'commission', 'fees'];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** The row that `fields` make, or a RangeError saying what is wrong with it. */
function checked(
  base: Pick<MissedTrade, 'id' | 'workspaceId' | 'strategyId'>,
  fields: Partial<NewMissedTrade>,
): MissedTrade {
  const symbol = typeof fields.symbol === 'string' ? fields.symbol.trim() : '';
  if (symbol === '') throw new RangeError('A missed trade needs a symbol');
  const at = fields.at;
  if (typeof at !== 'string' || !ISO.test(at) || Number.isNaN(Date.parse(at)))
    throw new RangeError('A missed trade needs a date and time');
  const { price, commission, fees } = fields;
  if (price !== undefined && !Number.isFinite(price))
    throw new RangeError('A missed trade price must be a number');
  for (const cost of [commission, fees])
    if (cost !== undefined && !Number.isSafeInteger(cost))
      throw new RangeError('A commission and a fee are whole cents');
  return {
    ...base,
    symbol,
    // One format, so the list sorts by the text.
    at: new Date(at).toISOString(),
    ...(price !== undefined && { price }),
    ...(commission !== undefined && { commission }),
    ...(fees !== undefined && { fees }),
  };
}

/** The named fields of `source`, a key sent as undefined included. */
function named(source: object): Partial<NewMissedTrade> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS)
    if (key in source) out[key] = (source as Record<string, unknown>)[key];
  return out as Partial<NewMissedTrade>;
}

/**
 * Deletes every missed trade of a strategy. Call inside an rw transaction that
 * includes `db.missedTrades` (removing a strategy takes them with it).
 */
export async function deleteStrategyMissedTrades(
  db: KeelDb,
  ws: string,
  strategyId: string,
): Promise<void> {
  await db.missedTrades
    .where('[workspaceId+strategyId]')
    .equals([ws, strategyId])
    .delete();
}

export function localMissedTrades(ctx: LocalContext): MissedTradesRepo {
  return {
    async list(ws, strategyId) {
      const db = await ctx.db();
      const rows = await db.missedTrades
        .where('[workspaceId+strategyId]')
        .equals([ws, strategyId])
        .toArray();
      return rows.sort(
        (a, b) =>
          (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    },

    async create(ws, input) {
      const db = await ctx.db();
      const row = checked(
        { id: ctx.newId(), workspaceId: ws, strategyId: input.strategyId },
        named(input),
      );
      return rwTx(db, [db.missedTrades, db.strategies], async () => {
        if (!(await db.strategies.get([ws, row.strategyId])))
          throw new NotFoundError('strategy', row.strategyId);
        await db.missedTrades.put(row);
        return row;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.missedTrades], async () => {
        const stored = await db.missedTrades.get([ws, id]);
        if (!stored) throw new NotFoundError('missed trade', id);
        const row = checked(
          { id, workspaceId: ws, strategyId: stored.strategyId },
          mergePatch(named(stored), named(patch), OPTIONAL),
        );
        await db.missedTrades.put(row);
        return row;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.missedTrades], async () => {
        if (!(await db.missedTrades.get([ws, id])))
          throw new NotFoundError('missed trade', id);
        await db.missedTrades.delete([ws, id]);
      });
    },
  };
}
