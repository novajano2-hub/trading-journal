import { expect, test } from 'vitest';
import {
  APP_NAV,
  activeItem,
  navHref,
  pageTitle,
  tradePageId,
  filtersApply,
  type AppModuleId,
} from './nav';

test('order and groups', () => {
  expect(APP_NAV.map((i) => i.id)).toEqual([
    'dashboard',
    'trades',
    'calendar',
    'reports',
    'strategies',
    'notebook',
    'import',
    'prop-firms',
    'backtesting',
    'replay',
    'mentors',
    'assistant',
    'settings',
  ]);
  expect(
    APP_NAV.filter((i) => i.group === 'not-live').map((i) => i.id),
  ).toEqual(['backtesting', 'replay', 'mentors', 'assistant']);
});

test('filter-scoped links carry the canonical filters, others none', () => {
  const p = new URLSearchParams('by=hour&side=long&range=this-week');
  const item = (id: AppModuleId) => APP_NAV.find((i) => i.id === id)!;
  expect(navHref(item('dashboard'), p)).toBe(
    '/app/dashboard?range=this-week&side=long',
  );
  expect(navHref(item('strategies'), p)).toBe('/app/strategies');
  expect(navHref(item('trades'), new URLSearchParams())).toBe('/app/trades');
});

test('active item and title', () => {
  expect(activeItem('/app/trades/abc')?.id).toBe('trades');
  expect(pageTitle('/app/prop-firms')).toBe('Prop firms');
  expect(activeItem('/app/nope')).toBeUndefined();
});

test('tradePageId reads the id of a trade page, decoded, and nothing else', () => {
  expect(tradePageId('/app/trades/t-c')).toBe('t-c');
  expect(tradePageId('/app/trades/acc%3AEUR%2FUSD%3Ac')).toBe('acc:EUR/USD:c');
  expect(tradePageId('/app/trades')).toBeUndefined();
  expect(tradePageId('/app/trades/new')).toBeUndefined();
  expect(tradePageId('/app/trades/t-c/edit')).toBeUndefined();
  expect(tradePageId('/app/notes/t-c')).toBeUndefined();
});

test('filtersApply is true only on the routes the global filters drive', () => {
  for (const p of [
    '/app/dashboard',
    '/app/trades',
    '/app/calendar',
    '/app/reports',
    '/app/reports/time',
  ])
    expect(filtersApply(p), p).toBe(true);
  for (const p of [
    // Compare's groups own their filters.
    '/app/reports/compare',
    '/app/import',
    '/app/settings/import-history',
    '/app/trades/t-c',
    '/app/trades/new',
    '/app/trades/t-c/edit',
    '/app/strategies',
    '/app/settings',
  ])
    expect(filtersApply(p), p).toBe(false);
});
