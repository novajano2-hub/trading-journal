import type { Rule } from '@/domain/types';
import { NotFoundError, type StrategiesRepo } from '../repository';
import type { LocalContext } from './context';
import { rwTx } from './tx';
import { mergePatch } from '../merge';

export function localStrategies(ctx: LocalContext): StrategiesRepo {
  const withIds = (rules: readonly (Omit<Rule, 'id'> & { id?: string })[]) =>
    rules.map((r): Rule => ({ ...r, id: r.id ?? ctx.newId() }));

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
      const strategy = {
        ...input,
        rules: withIds(input.rules),
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
        const { rules, ...rest } = patch;
        const next = {
          ...mergePatch(strategy, rest),
          id,
          workspaceId: ws,
        };
        if (rules) {
          next.rules = withIds(rules);
          const kept = new Set(next.rules.map((r) => r.id));
          await db.trades
            .where('[workspaceId+strategyId]')
            .equals([ws, id])
            .modify((t) => {
              t.ruleChecks = t.ruleChecks.filter((c) => kept.has(c.ruleId));
            });
        }
        await db.strategies.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.strategies, db.trades], async () => {
        if (!(await db.strategies.get([ws, id])))
          throw new NotFoundError('strategy', id);
        await db.trades
          .where('[workspaceId+strategyId]')
          .equals([ws, id])
          .modify((t) => {
            delete t.strategyId;
            t.ruleChecks = [];
          });
        await db.strategies.delete([ws, id]);
      });
    },
  };
}
