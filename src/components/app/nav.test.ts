import { expect, test } from 'vitest';
import {
  APP_NAV,
  activeItem,
  dayPageDate,
  navHref,
  pageTitle,
  strategyEditId,
  strategyPageId,
  tradePageId,
  filtersApply,
  datesOnly,
  hidesDisplayMenu,
  type AppModuleId,
} from './nav';

test('order and groups', () => {
  expect(APP_NAV.map((i) => i.id)).toEqual([
    'dashboard',
    'trades',
    'calendar',
    'reports',
    'progress',
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
  expect(navHref(item('strategies'), p)).toBe(
    '/app/strategies?range=this-week&side=long',
  );
  expect(navHref(item('prop-firms'), p)).toBe('/app/prop-firms');
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

test('strategyPageId reads the id of a strategy page, decoded, and not new or edit', () => {
  expect(strategyPageId('/app/strategies/str-1')).toBe('str-1');
  expect(strategyPageId('/app/strategies/a%2Fb')).toBe('a/b');
  expect(strategyPageId('/app/strategies')).toBeUndefined();
  expect(strategyPageId('/app/strategies/new')).toBeUndefined();
  expect(strategyPageId('/app/strategies/str-1/edit')).toBeUndefined();
  expect(strategyPageId('/app/trades/str-1')).toBeUndefined();
});

test('strategyEditId reads the id of a strategy editor, and nothing else', () => {
  expect(strategyEditId('/app/strategies/str-1/edit')).toBe('str-1');
  expect(strategyEditId('/app/strategies/str-1')).toBeUndefined();
  expect(strategyEditId('/app/strategies/new')).toBeUndefined();
});

test('filtersApply is true only on the routes the global filters drive', () => {
  for (const p of [
    '/app/dashboard',
    '/app/trades',
    '/app/calendar',
    '/app/reports',
    '/app/reports/time',
    '/app/strategies',
    '/app/strategies/str-1',
    '/app/progress',
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
    '/app/strategies/new',
    '/app/strategies/str-1/edit',
    '/app/settings',
  ])
    expect(filtersApply(p), p).toBe(false);
});

test('Progress tracker sits after Reports, with the Gauge glyph', () => {
  const ids = APP_NAV.map((i) => i.id);
  expect(ids.indexOf('progress')).toBe(ids.indexOf('reports') + 1);
  const progress = APP_NAV.find((i) => i.id === 'progress')!;
  expect(progress.label).toBe('Progress tracker');
  expect(progress.href).toBe('/app/progress');
  expect(pageTitle('/app/progress')).toBe('Progress tracker');
});

test('the tracker shows the date range alone and no Display menu', () => {
  expect(datesOnly('/app/progress')).toBe(true);
  expect(hidesDisplayMenu('/app/progress')).toBe(true);
  for (const p of ['/app/dashboard', '/app/trades', '/app/reports']) {
    expect(datesOnly(p), p).toBe(false);
    expect(hidesDisplayMenu(p), p).toBe(false);
  }
});

test('a day page sits under Trades, with no Display menu and no filters', () => {
  for (const path of [
    '/app/day/2026-11-24',
    '/app/day/2026-11-24/plan',
    '/app/day/2026-11-24/review',
  ]) {
    expect(activeItem(path)?.id, path).toBe('trades');
    expect(pageTitle(path), path).toBe('Trades');
    expect(dayPageDate(path), path).toBe('2026-11-24');
    expect(hidesDisplayMenu(path), path).toBe(true);
    expect(filtersApply(path), path).toBe(false);
  }
  expect(dayPageDate('/app/day')).toBeUndefined();
  expect(dayPageDate('/app/trades')).toBeUndefined();
  expect(hidesDisplayMenu('/app/trades')).toBe(false);
});
