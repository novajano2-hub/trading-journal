import { toCents } from '../money';
import type {
  Cents,
  Challenge,
  PropTxn,
  PropTxnCategory,
  PropTxnStatus,
} from '../types';

/**
 * What the Transactions tab reads of the prop money ledger: the words, the
 * filter and a typed amount. Pure; the sums live in `finance.ts`.
 */

/** The categories in TradeZella's order (C27), and the words the table shows. */
export const TXN_CATEGORY_LABELS: Record<PropTxnCategory, string> = {
  payout: 'Payout',
  'evaluation-fee': 'Evaluation fee',
  'activation-fee': 'Activation fee',
  'reset-fee': 'Reset fee',
  'affiliate-income': 'Affiliate income',
  uncategorized: 'Uncategorized',
};
export const TXN_CATEGORIES = Object.keys(
  TXN_CATEGORY_LABELS,
) as PropTxnCategory[];

export const TXN_STATUS_LABELS: Record<PropTxnStatus, string> = {
  'not-reviewed': 'Not reviewed',
  reviewed: 'Reviewed',
  ignored: 'Ignored',
};
export const TXN_STATUSES = Object.keys(TXN_STATUS_LABELS) as PropTxnStatus[];

/** The tab's filter (C68). It carries no counts (C73). */
export type TxnView = 'all' | 'income' | 'costs' | 'review';
export const TXN_VIEWS: readonly { value: TxnView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'costs', label: 'Costs' },
  { value: 'review', label: 'To review' },
];

/**
 * The rows a filter keeps, newest first (a tie by id, as the repository
 * lists). Income and Costs go by the sign whatever the category or the status
 * (C60); To review is the rows still not reviewed. An ignored row keeps its
 * place in the list: it is only left out of the sums.
 */
export function txnsInView(txns: readonly PropTxn[], view: TxnView): PropTxn[] {
  const keep = (t: PropTxn): boolean =>
    view === 'all' ||
    (view === 'income' && t.amount > 0) ||
    (view === 'costs' && t.amount < 0) ||
    (view === 'review' && t.status === 'not-reviewed');
  return txns
    .filter(keep)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/**
 * A typed signed amount in whole currency, as cents: "-300", "−300" (the
 * minus sign), "3000", "+3000", "1,500.00", "$29". Null for text that is no
 * amount, and for zero (a row that moves no money). More than two decimals
 * round to the cent.
 */
export function parseAmount(text: string): Cents | null {
  const clean = text
    .replace(/[\s,]/g, '')
    .replace(/−/g, '-')
    .replace(/^([+-]?)\p{Sc}/u, '$1');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const cents = toCents(Number(clean));
  return cents === 0 ? null : cents;
}

/**
 * Whether a payout can be logged on the challenge: it is in its funded phase
 * and has not breached. The repository's rule (C29), so the dialog lists only
 * the challenges that will take one.
 */
export function canLogPayout(c: Challenge): boolean {
  return c.phase === 'funded' && c.status !== 'breached';
}
