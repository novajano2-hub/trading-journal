import { strategyRules, type RuleGroup, type Strategy } from '@/domain/types';
import {
  NotFoundError,
  type RuleGroupDraft,
  type StrategiesRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { deleteOwnerFiles } from './files';
import {
  changeRows,
  fieldChanges,
  lifecycleRow,
  logHistory,
  type FieldChange,
} from './history';
import { deleteStrategyMissedTrades } from './missed-trades';
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

/** The strategy fields history keeps (B26); the groups read as `rules`, their count. */
const LOGGED_FIELDS = [
  'name',
  'description',
  'status',
  'icon',
  'photoId',
  'rules',
] as const;

function loggedView(s: Strategy) {
  return {
    name: s.name,
    description: s.description,
    status: s.status,
    icon: s.icon,
    photoId: s.photoId,
    rules: strategyRules(s).length,
  };
}

/** The groups and rules as the trader reads them: titles, texts and when each is graded, without ids. */
function rulesOf(s: Strategy): string {
  return JSON.stringify(
    s.groups.map((g) => [g.title, g.rules.map((r) => [r.text, r.showWhen])]),
  );
}

/**
 * The logged fields that differ between two versions of a strategy. Rules
 * reworded, regrouped or reordered to the same count still show, as the same
 * number on both sides, so the edit is not lost.
 */
function strategyChanges(before: Strategy, after: Strategy): FieldChange[] {
  const changes = fieldChanges(loggedView(before), loggedView(after), [
    ...LOGGED_FIELDS,
  ]);
  if (
    !changes.some((c) => c.field === 'rules') &&
    rulesOf(before) !== rulesOf(after)
  ) {
    const count = strategyRules(after).length;
    changes.push({ field: 'rules', oldValue: count, newValue: count });
  }
  return changes;
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
      return rwTx(db, [db.strategies, db.history], async () => {
        await db.strategies.put(strategy);
        await logHistory(
          db,
          ws,
          [lifecycleRow('strategy', 'created', strategy.id, strategy.name)],
          ctx,
        );
        return strategy;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      const tables = [db.strategies, db.trades, db.files, db.history];
      return rwTx(db, tables, async () => {
        const strategy = await db.strategies.get([ws, id]);
        if (!strategy) throw new NotFoundError('strategy', id);
        const { groups, ...rest } = patch;
        const next: Strategy = {
          // `photoId` sent as undefined clears the photo.
          ...mergePatch(strategy, rest, ['icon', 'tone', 'photoId']),
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
        // A photo that is cleared or replaced is deleted with the write (B56).
        if (
          strategy.photoId !== undefined &&
          next.photoId !== strategy.photoId
        ) {
          const old = await db.files.get([ws, strategy.photoId]);
          if (old?.owner === `strategy:${id}`)
            await db.files.delete([ws, old.id]);
        }
        await logHistory(
          db,
          ws,
          changeRows(
            'strategy',
            id,
            next.name,
            strategyChanges(strategy, next),
          ),
          ctx,
        );
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(
        db,
        [
          db.strategies,
          db.trades,
          db.files,
          db.history,
          db.challenges,
          db.missedTrades,
        ],
        async () => {
          const strategy = await db.strategies.get([ws, id]);
          if (!strategy) throw new NotFoundError('strategy', id);
          await onItsTrades(db, ws, id, ruleIdsOf(strategy), true);
          // A challenge traded with it no longer lists it.
          const using = await db.challenges
            .where('workspaceId')
            .equals(ws)
            .filter((c) => c.strategyIds?.includes(id) ?? false)
            .toArray();
          await db.challenges.bulkPut(
            using.map((c) => ({
              ...c,
              strategyIds: c.strategyIds!.filter((s) => s !== id),
            })),
          );
          await db.strategies.delete([ws, id]);
          await deleteOwnerFiles(db, ws, `strategy:${id}`);
          await deleteStrategyMissedTrades(db, ws, id);
          // One row for the strategy, not one per trade it leaves.
          await logHistory(
            db,
            ws,
            [lifecycleRow('strategy', 'deleted', id, strategy.name)],
            ctx,
          );
        },
      );
    },
  };
}
