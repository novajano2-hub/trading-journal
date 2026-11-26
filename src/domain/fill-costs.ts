import { toCents } from './money';
import type { Cents, Execution, Trade } from './types';

/**
 * Costs by hand (Plan 6B spec §5.4, B58): one execution's commission and fee
 * are replaced and the trade's fees and net follow. Pure: the data layer
 * decides whether the trade may be written and logs the change.
 */

/** What one fill cost: its commission and its exchange fee. */
const costOf = (e: Execution): Cents => e.commission + e.fees;

const total = (list: readonly Execution[]): Cents =>
  list.reduce((sum, e) => sum + costOf(e), 0);

/**
 * The trade with `executions` in place of its own, or nothing when no fill's
 * commission or fee differs. Fees and net move by the change in what the
 * fills cost, and everything else stays: the gross, the swap that sits inside
 * the net, a P&L a closed-trades file gave with its currency, and the
 * excursions. For a trade built from its fills this is exactly what
 * rebuilding it from them gives, since net is gross less fees plus swap; a
 * rebuild would also change such a file's currency and drop its MAE and MFE.
 * `executions` must be the trade's own, one for one and in order.
 */
export function withCosts(
  t: Trade,
  executions: readonly Execution[],
): Trade | undefined {
  const changed = executions.some(
    (e, i) =>
      e.commission !== t.executions[i]!.commission ||
      e.fees !== t.executions[i]!.fees,
  );
  if (!changed) return undefined;
  const delta = total(executions) - total(t.executions);
  return {
    ...t,
    executions: [...executions],
    fees: t.fees + delta,
    net: t.net - delta,
  };
}

/** The trade with the commission and fee of execution `executionId` replaced, or nothing when they are what it has or the trade has no such execution. */
export function withFillCosts(
  t: Trade,
  executionId: string,
  costs: { commission: Cents; fees: Cents },
): Trade | undefined {
  return withCosts(
    t,
    t.executions.map((e) =>
      e.id === executionId
        ? { ...e, commission: costs.commission, fees: costs.fees }
        : { ...e },
    ),
  );
}

/**
 * A message for costs that cannot be kept (not whole cents, or too large to
 * be), or null when they are fine. A negative cost is kept: it is a credit,
 * which is how TradeZella takes a swap credit, in the fees. Swap is a cost of
 * its own (B60), so a credit here lowers the trade's `fees`, and the net goes
 * up by the same.
 */
export function fillCostsError(costs: {
  commission: Cents;
  fees: Cents;
}): string | null {
  for (const cents of [costs.commission, costs.fees])
    if (!Number.isSafeInteger(cents))
      return 'A commission and a fee are whole cents';
  return null;
}

/** An optional minus, then thousands grouped by commas or no commas at all. */
const AMOUNT = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d*)?$/;

/**
 * The cents a typed amount comes to. An empty field is 0 (nothing was
 * charged). A leading minus is a credit: TradeZella takes a swap credit as a
 * negative amount in the fees. Null when it is not an amount: letters, a
 * second point, an exponent, a currency sign. A comma is a thousands mark
 * only, so a decimal comma is refused instead of read as dollars. A fraction
 * of a cent rounds.
 */
export function centsFromText(text: string): Cents | null {
  const raw = text.replace(/\s/g, '');
  if (raw === '') return 0;
  if (!AMOUNT.test(raw) || !/\d/.test(raw)) return null;
  const cents = toCents(Number(raw.replace(/,/g, '')));
  // Minus zero is zero.
  return Number.isSafeInteger(cents) ? cents + 0 : null;
}
