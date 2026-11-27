import type { ParsedCsv } from '@/domain/import/csv';
import type { ImportMapping } from '@/domain/import/mapping';
import {
  planImport,
  type ImportContext,
  type ImportPlan,
} from '@/domain/import/plan';

/**
 * What a plan is made from. Every part clones (plain objects, arrays, strings
 * and numbers; no functions), so it can be sent to a worker as it is.
 */
export interface PlanInput {
  parsed: ParsedCsv;
  mapping: ImportMapping;
  ctx: ImportContext;
  meta: { importId: string; fileName: string; now: string };
}

/** What the page posts to the worker. */
export interface PlanRequest extends PlanInput {
  id: number;
}

/** The plan's lists that grow with the file, and so travel in slices. */
export type SlicedList =
  | 'trades'
  | 'replacedTrades'
  | 'issues'
  | 'duplicateRows'
  | 'fingerprints'
  | 'flags'
  | 'filePnl';

const SLICED: readonly SlicedList[] = [
  'trades',
  'replacedTrades',
  'issues',
  'duplicateRows',
  'fingerprints',
  'flags',
  'filePnl',
];

/**
 * What the worker posts back, for the request with this `id`: any slices of the
 * plan's long lists, then the plan itself (those lists empty), or the reason
 * it could not be made. `filePnl` goes as its `[trade id, cents]` entries.
 */
export type PlanReply =
  | { id: number; list: SlicedList; items: unknown[] }
  | { id: number; plan: ImportPlan }
  | { id: number; error: string };

/**
 * Items to a slice. A message is unpacked on the page's own thread in one
 * task, and unpacking a whole plan for a large file (tens of thousands of
 * trades) takes longer than the 50 ms a task may. A slice takes a few.
 */
export const SLICE = 2_000;

/** The reply for one request: the plan, cut into slices where a list is long. */
export function answer(request: PlanRequest): PlanReply[] {
  const { id, parsed, mapping, ctx, meta } = request;
  try {
    return slice(id, planImport(parsed, mapping, ctx, meta));
  } catch (e) {
    return [{ id, error: e instanceof Error ? e.message : String(e) }];
  }
}

function slice(id: number, plan: ImportPlan): PlanReply[] {
  const replies: PlanReply[] = [];
  const rest: Record<string, unknown> = { ...plan };
  for (const list of SLICED) {
    const items =
      list === 'filePnl'
        ? Object.entries(plan.filePnl)
        : (plan[list] as unknown[]);
    if (items.length <= SLICE) continue;
    for (let at = 0; at < items.length; at += SLICE)
      replies.push({ id, list, items: items.slice(at, at + SLICE) });
    rest[list] = list === 'filePnl' ? {} : [];
  }
  replies.push({ id, plan: rest as unknown as ImportPlan });
  return replies;
}

/** Collects the slices of one request's reply, and puts the plan back together. */
export class PlanAssembler {
  private readonly lists = new Map<SlicedList, unknown[]>();

  add(list: SlicedList, items: unknown[]): void {
    const soFar = this.lists.get(list);
    if (soFar) for (const item of items) soFar.push(item);
    else this.lists.set(list, [...items]);
  }

  finish(plan: ImportPlan): ImportPlan {
    const whole: Record<string, unknown> = { ...plan };
    for (const [list, items] of this.lists)
      whole[list] =
        list === 'filePnl'
          ? Object.fromEntries(items as [string, number][])
          : items;
    return whole as unknown as ImportPlan;
  }
}
