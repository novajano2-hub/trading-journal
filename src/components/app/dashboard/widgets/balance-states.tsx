import Link from 'next/link';
import { UNIT_SCOPE } from '@/content/display-units';
import type { TradeUnit } from '@/domain/metrics/units';

/** What a balance widget says in a narrowing unit: a balance is money, and has no value in R, ticks, pips or points. */
export const noBalanceIn = (unit: TradeUnit): string =>
  `A balance has no value in ${UNIT_SCOPE[unit].name}.`;

/** What a balance widget says with no starting balance: it asks for one and links to Settings > Accounts. */
export const STARTING_BALANCE_PROMPT = (
  <>
    Add a starting balance to see your balance.{' '}
    <Link
      href="/app/settings/accounts"
      className="rounded-chip font-semibold text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    >
      Open Accounts
    </Link>
  </>
);
