import { strategyRules, type RuleGroup, type Strategy } from '@/domain/types';
import {
  NotFoundError,
  type RuleGroupDraft,
  type StrategiesRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';
import { mergePatch } from '../merge';

/**
 * Drops the checks of `ruleIds` on the workspace's trades in strategy `id`,
 * and with `leave` takes the strategy off them too. Call inside an rw
 * transaction that includes `db.trades`.
 */
async function onItsTrades(
  db: KeelDb,
  ws: string,
  id: string,
  ruleIds: ReadonlySet<string>,
  leave: boolean,
): Promise<void> {
  // The multiEntry index spans workspaces, so keep only this workspace's trades.
  await db.trades
    .where('strategyIds')
    .equals(id)
    .filter((t) => t.workspaceId === ws)
    .modify((t) => {
      if (leave) t.strategyIds = t.strategyIds.filter((s) => s !== id);
      t.ruleChecks = t.ruleChecks.filter((c) => !ruleIds.has(c.ruleId));
    });
}

export function localStrategies(ctx: LocalContext): StrategiesRepo {
  const withIds = (groups: readonly RuleGroupDraft[]): RuleGroup[] =>
    groups.map((g) => ({
      ...g,
      id: g.id ?? ctx.newId(),
      rules: g.rules.map((r) => ({ ...r, id: r.id ?? ctx.newId() })),
    }));
  const ruleIdsOf = (s: Strategy) => new Set(strategyRules(s).map((r) => r.id));

  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.strategies
        .where('workspaceId')
        .equals(ws)
        .toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },

    async get(ws, id) {
      return (await ctx.db()).strategies.get([ws, id]);
    },

    async create(ws, input) {
      const db = await ctx.db();
      const strategy: Strategy = {
        ...input,
        groups: withIds(input.groups),
        id: ctx.newId(),
        workspaceId: ws,
      };
      await db.strategies.put(strategy);
      return strategy;
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.strategies, db.trades], async () => {
        const strategy = await db.strategies.get([ws, id]);
        if (!strategy) throw new NotFoundError('strategy', id);
        const { groups, ...rest } = patch;
        const next: Strategy = {
          ...mergePatch(strategy, rest, ['icon', 'tone']),
          id,
          workspaceId: ws,
        };
        if (groups) {
          next.groups = withIds(groups);
          const kept = ruleIdsOf(next);
          const gone = new Set(
            [...ruleIdsOf(strategy)].filter((r) => !kept.has(r)),
          );
          if (gone.size > 0) await onItsTrades(db, ws, id, gone, false);
        }
        await db.strategies.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.strategies, db.trades], async () => {
        const strategy = await db.strategies.get([ws, id]);
        if (!strategy) throw new NotFoundError('strategy', id);
        await onItsTrades(db, ws, id, ruleIdsOf(strategy), true);
        await db.strategies.delete([ws, id]);
      });
    },
  };
}
