import type { Cents, Tag, Trade } from '../types';
import { closedInOrder } from '../trade-status';
import { pnlOf, type MetricContext } from './context';

export interface MistakeCost {
  tagId: string;
  name: string;
  tradeCount: number;
  pnl: Cents;
  /** Newest close first. */
  tradeIds: string[];
}

/** What each mistake tag cost, over closed trades. A trade with two mistake tags counts in both. Costliest first. */
export function mistakeCosts(
  trades: readonly Trade[],
  tags: readonly Tag[],
  ctx: MetricContext,
): MistakeCost[] {
  const rows = new Map<string, MistakeCost>();
  for (const tag of tags)
    if (tag.category === 'mistake')
      rows.set(tag.id, {
        tagId: tag.id,
        name: tag.name,
        tradeCount: 0,
        pnl: 0,
        tradeIds: [],
      });
  for (const t of closedInOrder(trades).reverse()) {
    const pnl = pnlOf(t, ctx.pnlBasis);
    for (const id of new Set(t.tagIds)) {
      const row = rows.get(id);
      if (!row) continue;
      row.tradeCount += 1;
      row.pnl += pnl;
      row.tradeIds.push(t.id);
    }
  }
  return [...rows.values()]
    .filter((r) => r.tradeCount > 0)
    .sort((a, b) => a.pnl - b.pnl || a.name.localeCompare(b.name));
}
