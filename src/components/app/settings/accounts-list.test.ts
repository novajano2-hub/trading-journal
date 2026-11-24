import { expect, test } from 'vitest';
import type { Account } from '@/domain/types';
import { isNarrowed, matches, parseView } from './accounts-list';

const acct = (over: Partial<Account>): Account =>
  ({
    id: 'a',
    workspaceId: 'w',
    name: 'Futures main',
    broker: 'Tradovate',
    type: 'live',
    status: 'active',
    currency: 'USD',
    startingBalance: 0,
    ...over,
  }) as Account;

const view = (qs: string) => parseView(new URLSearchParams(qs));

test('search matches the name or the broker, in any case, as a part', () => {
  const a = acct({});
  expect(matches(a, view('q=FUT'))).toBe(true);
  expect(matches(a, view('q=trado'))).toBe(true);
  expect(matches(a, view('q=%20%20'))).toBe(true);
  expect(matches(a, view('q=ninja'))).toBe(false);
});

test('each filter takes any of its choices and all of them must hold together', () => {
  const a = acct({ type: 'prop-funded', currency: 'EUR' });
  expect(matches(a, view('type=live,prop-funded'))).toBe(true);
  expect(matches(a, view('type=live'))).toBe(false);
  expect(matches(a, view('status=archived'))).toBe(false);
  expect(matches(a, view('ccy=eur'))).toBe(true);
  expect(matches(a, view('type=prop-funded&ccy=USD'))).toBe(false);
});

test('unknown types and statuses in a link are dropped; an empty view is not narrowed', () => {
  expect(view('type=nope&status=gone')).toEqual({
    q: '',
    types: [],
    statuses: [],
    currencies: [],
  });
  expect(isNarrowed(view(''))).toBe(false);
  expect(isNarrowed(view('q=x'))).toBe(true);
});
