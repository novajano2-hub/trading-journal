import type { MetricContext } from '@/domain/metrics/context';
import { checkChallenge } from '@/domain/prop/challenge';
import {
  breachInsights,
  breakdown,
  filterChallenges,
  filterItems,
  passRates,
  roiSeries,
  spendItems,
  totals,
  type BreachInsights,
  type BreakdownRow,
  type PassRateRow,
  type PropFilters,
  type RoiPoint,
} from '@/domain/prop/finance';
import type {
  Account,
  CashFlow,
  Cents,
  Challenge,
  PropTxn,
  Trade,
} from '@/domain/types';

/**
 * The prop dashboard's figures (#45): `domain/prop/finance.ts` over the
 * workspace's rows, with the filters applied and the balances of the active
 * accounts added. Money is in the base currency (C58): an account in another
 * currency is left out of the balances and of every figure that reads an
 * account, and counted in `leftOut`.
 */

/** The dashboard's own switches: the ROI window, and the grouping of each card. */
export interface PropFinanceView {
  roi: '1w' | '1m' | '1y';
  breakdown: 'firm' | 'type' | 'size' | 'fee';
  passRate: 'firm' | 'type' | 'size' | 'strategy';
  /** The breaches shown: those of an evaluation or of a funded account. */
  breaches: 'evaluation' | 'funded';
}

export const DEFAULT_PROP_VIEW: PropFinanceView = {
  roi: '1y',
  breakdown: 'firm',
  passRate: 'firm',
  breaches: 'evaluation',
};

export interface PropFinanceInput {
  challenges: readonly Challenge[];
  /** Every account of the workspace, whatever its currency. */
  accounts: readonly Account[];
  trades: readonly Trade[];
  flows: readonly CashFlow[];
  txns: readonly PropTxn[];
  /** Names the strategy rows of the pass rate; an id with no strategy reads as itself. */
  strategies?: readonly { id: string; name: string }[];
  filters: PropFilters;
  view: PropFinanceView;
  baseCurrency: string;
  ctx: MetricContext;
  /** The local date today, in the profile zone. */
  today: string;
}

/** The balance of the active accounts of one kind, and how many are in it. */
export interface BalanceCard {
  balance: Cents;
  count: number;
}

export interface PropFinance {
  /** The challenges that pass the filters. */
  challenges: Challenge[];
  /** Active funded accounts: a challenge in its funded phase, not breached. */
  funded: BalanceCard;
  /** Active evaluation accounts: a challenge still in its evaluation, active. */
  evaluation: BalanceCard;
  /** The accounts of the challenges in view that are not in the base currency, left out of the balances and the figures that read an account (C58). */
  leftOut: number;
  totals: ReturnType<typeof totals>;
  roi: RoiPoint[];
  breakdown: BreakdownRow[];
  passRate: {
    overall: { passed: number; attempted: number };
    rows: PassRateRow[];
  };
  breaches: BreachInsights;
  /** What the workspace holds before the filters: the states (first run, transactions only) read them. */
  counts: { challenges: number; txns: number };
}

const NONE_CARD: BalanceCard = { balance: 0, count: 0 };

/** The figures of the prop dashboard for the filters and the view. */
export function propFinance(input: PropFinanceInput): PropFinance {
  const { filters, view, baseCurrency, ctx, today } = input;
  const accounts = input.accounts.filter((a) => a.currency === baseCurrency);
  const challenges = filterChallenges(input.challenges, accounts, filters);
  // Fee fields count for the challenges in view; every row is then filtered on its own.
  const items = filterItems(
    spendItems(challenges, input.txns),
    input.challenges,
    accounts,
    filters,
  );

  let funded = NONE_CARD;
  let evaluation = NONE_CARD;
  for (const c of challenges) {
    if (c.status === 'breached') continue;
    const isFunded = c.phase === 'funded';
    if (!isFunded && c.status !== 'active') continue;
    const check = checkChallenge(
      c,
      input.accounts,
      input.trades,
      ctx,
      today,
      input.flows,
    );
    const current = check.phases.find((p) => p.step === check.currentStep);
    if (
      current?.account?.currency !== baseCurrency ||
      current.balance === undefined
    )
      continue;
    const card = isFunded ? funded : evaluation;
    const next = {
      balance: card.balance + current.balance,
      count: card.count + 1,
    };
    if (isFunded) funded = next;
    else evaluation = next;
  }

  const other = new Set<string>();
  const currencyOf = new Map(input.accounts.map((a) => [a.id, a.currency]));
  for (const c of challenges)
    for (const p of c.phases) {
      const currency =
        p.accountId === undefined ? undefined : currencyOf.get(p.accountId);
      if (currency !== undefined && currency !== baseCurrency)
        other.add(p.accountId!);
    }

  const names = new Map((input.strategies ?? []).map((s) => [s.id, s.name]));
  const rates = passRates(challenges, accounts, view.passRate);
  return {
    challenges,
    funded,
    evaluation,
    leftOut: other.size,
    totals: totals(items),
    roi: roiSeries(items, view.roi, filters.range?.to ?? today),
    // Every challenge groups the rows; the ones in view are counted.
    breakdown: breakdown(
      items,
      input.challenges,
      accounts,
      view.breakdown,
      challenges,
    ),
    passRate:
      view.passRate === 'strategy'
        ? {
            ...rates,
            rows: rates.rows.map((r) => ({
              ...r,
              label: names.get(r.key) ?? r.label,
            })),
          }
        : rates,
    breaches: breachInsights(
      challenges,
      accounts,
      input.trades,
      ctx,
      view.breaches,
    ),
    counts: { challenges: input.challenges.length, txns: input.txns.length },
  };
}
