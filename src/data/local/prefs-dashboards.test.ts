import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import type { DashTemplate } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from './local-repository';

const open = () =>
  createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });

const tpl = (over: Partial<DashTemplate> = {}): DashTemplate => ({
  id: 'x',
  name: 'Mine',
  upper: [{ key: 'net-pnl' }],
  lower: [],
  ...over,
});
const widgets = (n: number) =>
  Array.from({ length: n }, () => ({ key: 'net-pnl' }));

test('a valid dashboards value is kept', async () => {
  const dashboards = { inUse: 'x', templates: [tpl()] };
  expect((await open().prefs.update({ dashboards })).dashboards).toEqual(
    dashboards,
  );
});

test.each([
  ['no templates', { inUse: 'x', templates: [] }],
  [
    'six upper widgets',
    { inUse: 'x', templates: [tpl({ upper: widgets(6) })] },
  ],
  [
    'a 41-character name',
    { inUse: 'x', templates: [tpl({ name: 'n'.repeat(41) })] },
  ],
  ['an empty name', { inUse: 'x', templates: [tpl({ name: '' })] }],
  ['an inUse that names none', { inUse: 'nope', templates: [tpl()] }],
])('dashboards with %s is refused with RangeError', async (_n, dashboards) => {
  await expect(open().prefs.update({ dashboards })).rejects.toBeInstanceOf(
    RangeError,
  );
});

test('five upper widgets and a 40-character name pass', async () => {
  const dashboards = {
    inUse: 'x',
    templates: [tpl({ upper: widgets(5), name: 'n'.repeat(40) })],
  };
  expect((await open().prefs.update({ dashboards })).dashboards).toEqual(
    dashboards,
  );
});

test.each([
  ['sidebar', 'wide'],
  ['propLayout', 'table'],
])('%s %j is refused with RangeError', async (key, value) => {
  await expect(
    open().prefs.update({ [key]: value as never }),
  ).rejects.toBeInstanceOf(RangeError);
});

test('sidebar and propLayout accept their values', async () => {
  const prefs = await open().prefs.update({
    sidebar: 'collapsed',
    propLayout: 'list',
  });
  expect(prefs.sidebar).toBe('collapsed');
  expect(prefs.propLayout).toBe('list');
});

test.each([
  { a: { answer: 'maybe', done: true } },
  { a: { done: false } },
  { a: {} },
  'x',
])('propStart %j is refused with RangeError', async (propStart) => {
  await expect(
    open().prefs.update({ propStart: propStart as never }),
  ).rejects.toBeInstanceOf(RangeError);
});

test('propStart with and without an answer passes', async () => {
  const propStart = {
    a: { answer: 'both' as const, done: true as const },
    b: { done: true as const },
  };
  expect((await open().prefs.update({ propStart })).propStart).toEqual(
    propStart,
  );
});
