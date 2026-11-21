import { expect, test } from 'vitest';
import {
  APP_NAV,
  activeItem,
  navHref,
  pageTitle,
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
