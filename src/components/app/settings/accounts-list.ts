import type { Account, AccountType } from '@/domain/types';

export type AccountStatus = Account['status'];

export const TYPE_PARAM = 'type';
export const STATUS_PARAM = 'status';
export const CCY_PARAM = 'ccy';
export const SEARCH_PARAM = 'q';

/** The search and filters of the accounts list, as the address holds them. */
export interface AccountsView {
  q: string;
  types: AccountType[];
  statuses: AccountStatus[];
  currencies: string[];
}

const TYPES: readonly AccountType[] = [
  'live',
  'demo',
  'prop-evaluation',
  'prop-funded',
];
const STATUSES: readonly AccountStatus[] = ['active', 'archived'];

/** The comma list of one parameter: unknown entries are dropped, repeats too. */
function list<T extends string>(
  raw: string | null,
  allowed?: readonly T[],
): T[] {
  const out: T[] = [];
  for (const part of (raw ?? '').split(',')) {
    const v = part.trim() as T;
    if (v === '' || out.includes(v)) continue;
    if (allowed && !allowed.includes(v)) continue;
    out.push(v);
  }
  return out;
}

export function parseView(params: URLSearchParams): AccountsView {
  return {
    q: params.get(SEARCH_PARAM) ?? '',
    types: list(params.get(TYPE_PARAM), TYPES),
    statuses: list(params.get(STATUS_PARAM), STATUSES),
    currencies: list(params.get(CCY_PARAM)).map((c) => c.toUpperCase()),
  };
}

/** The text a parameter holds for these values, or null when none is set. */
export const formatList = (values: readonly string[]): string | null =>
  values.length === 0 ? null : values.join(',');

/** True when the view narrows the list at all. */
export const isNarrowed = (v: AccountsView): boolean =>
  v.q.trim() !== '' ||
  v.types.length > 0 ||
  v.statuses.length > 0 ||
  v.currencies.length > 0;

/** The accounts the search and the filters let through; each filter takes any of its choices. */
export function matches(a: Account, v: AccountsView): boolean {
  const q = v.q.trim().toLowerCase();
  if (
    q !== '' &&
    !a.name.toLowerCase().includes(q) &&
    !a.broker.toLowerCase().includes(q)
  )
    return false;
  if (v.types.length > 0 && !v.types.includes(a.type)) return false;
  if (v.statuses.length > 0 && !v.statuses.includes(a.status)) return false;
  if (v.currencies.length > 0 && !v.currencies.includes(a.currency))
    return false;
  return true;
}
