// What a trade log row says about a trade, shared by the table and the CSV.
import { rOf, plannedR } from '@/domain/metrics/summary';
import {
  classify,
  costBasis,
  type MetricContext,
} from '@/domain/metrics/context';
import { mistakeTags } from '@/domain/metrics/mistakes';
import {
  type Account,
  type Strategy,
  type Tag,
  type TagCategory,
  type Trade,
} from '@/domain/types';
import { tradeRulesSummary, type TradeRulesSummary } from './dashboard';

export interface RowEnv {
  timeZone: string;
  accounts: readonly Account[];
  strategies: readonly Strategy[];
  tags: readonly Tag[];
  categories: readonly TagCategory[];
  /** Which rules apply to a trade follows its outcome, read through this. */
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>;
}

/** A tag with its category's colour (`#RRGGBB`), which always travels with the name. */
export interface TagInfo {
  id: string;
  name: string;
  color: string;
}

export interface RowFacts {
  accountName(t: Trade): string;
  strategyNames(t: Trade): string[];
  /** Non-mistake tags. */
  tagsOf(t: Trade): TagInfo[];
  mistakesOf(t: Trade): string[];
  rules(t: Trade): TradeRulesSummary;
}

/** Name lookups for a workspace, built once per render of the log. */
export function rowFacts(env: RowEnv): RowFacts {
  const accountName = new Map(env.accounts.map((a) => [a.id, a.name]));
  const strategyName = new Map(env.strategies.map((s) => [s.id, s.name]));
  const mistakes = new Map(
    mistakeTags(env.tags, env.categories).map((t) => [t.id, t.name]),
  );
  const color = new Map(env.categories.map((c) => [c.id, c.color]));
  const tags = new Map<string, TagInfo>();
  for (const tag of env.tags)
    if (!mistakes.has(tag.id))
      tags.set(tag.id, {
        id: tag.id,
        name: tag.name,
        color: color.get(tag.categoryId) ?? '#6B7280',
      });
  return {
    accountName: (t) => accountName.get(t.accountId) ?? '',
    strategyNames: (t) =>
      t.strategyIds.flatMap((id) => strategyName.get(id) ?? []),
    tagsOf: (t) => t.tagIds.flatMap((id) => tags.get(id) ?? []),
    mistakesOf: (t) => t.tagIds.flatMap((id) => mistakes.get(id) ?? []),
    rules: (t) => tradeRulesSummary(t, env.strategies, env.ctx),
  };
}

/** How long a closed trade was held, in milliseconds; undefined while it is open. */
export function heldMs(t: Trade): number | undefined {
  return t.closedAt === undefined
    ? undefined
    : Date.parse(t.closedAt) - Date.parse(t.openedAt);
}

/** Net P&L over the capital committed, a 0..1 ratio; undefined with no cost basis. */
export function netRoiOf(t: Trade): number | undefined {
  const base = costBasis(t);
  return base > 0 ? t.net / base : undefined;
}

/** What a trade log's Status says: the outcome of a closed trade by the breakeven range, or Open. */
export type TradeStatus = 'Win' | 'Loss' | 'Breakeven' | 'Open';

/** Sort order of the Status column: wins first, open trades last. */
export const STATUS_RANK: Record<TradeStatus, number> = {
  Win: 0,
  Breakeven: 1,
  Loss: 2,
  Open: 3,
};

export function statusOf(
  t: Trade,
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>,
): TradeStatus {
  if (t.status !== 'closed') return 'Open';
  const { outcome } = classify(t, ctx);
  return outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Breakeven';
}

export { rOf, plannedR };
