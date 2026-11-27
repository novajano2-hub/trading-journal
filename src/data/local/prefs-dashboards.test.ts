import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import type { DashTemplate } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { KeelDb } from './db';
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
  [
    'two templates with one id',
    { inUse: 'x', templates: [tpl(), tpl({ name: 'Another' })] },
  ],
])('dashboards with %s is refused with RangeError', async (_n, dashboards) => {
  await expect(open().prefs.update({ dashboards })).rejects.toBeInstanceOf(
    RangeError,
  );
});

test.each([
  ['a null upper entry', tpl({ upper: [null as never] })],
  ['a number in the lower widgets', tpl({ lower: [5 as never] })],
  ['an entry without a key', tpl({ upper: [{} as never] })],
  ['an entry whose key is not a string', tpl({ lower: [{ key: 7 } as never] })],
  [
    'settings that are a number',
    tpl({ upper: [{ key: 'net-pnl', settings: 5 as never }] }),
  ],
  [
    'settings that are null',
    tpl({ upper: [{ key: 'net-pnl', settings: null as never }] }),
  ],
  [
    'settings that are a list',
    tpl({ lower: [{ key: 'net-pnl', settings: [] as never }] }),
  ],
])('a template with %s is refused with RangeError', async (_n, template) => {
  const dashboards = { inUse: 'x', templates: [template] };
  await expect(open().prefs.update({ dashboards })).rejects.toBeInstanceOf(
    RangeError,
  );
});

test('widget entries keep an unknown key, and settings when they are an object', async () => {
  const dashboards = {
    inUse: 'x',
    templates: [
      tpl({
        upper: [{ key: 'from-a-newer-build' }],
        lower: [{ key: 'balance', settings: { time: 'exit' } }],
      }),
    ],
  };
  expect((await open().prefs.update({ dashboards })).dashboards).toEqual(
    dashboards,
  );
});

test('templates with different ids and the same name pass', async () => {
  const dashboards = {
    inUse: 'y',
    templates: [tpl(), tpl({ id: 'y' })],
  };
  expect((await open().prefs.update({ dashboards })).dashboards).toEqual(
    dashboards,
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

test('stored dashboards that cannot be read are ignored, the other prefs and the next write are not affected', async () => {
  const indexedDB = new IDBFactory();
  const seed = new KeelDb({ indexedDB, IDBKeyRange });
  await seed.open();
  await seed.meta.put({
    key: 'prefs',
    value: {
      displayName: 'Sam',
      sidebar: 'collapsed',
      dashboards: {
        inUse: 'x',
        templates: [tpl({ upper: [null as never] })],
      },
    },
  });
  seed.close();

  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const read = await repo.prefs.get();
  expect(read.dashboards).toBeUndefined();
  expect(read.displayName).toBe('Sam');
  expect(read.sidebar).toBe('collapsed');

  // A write that starts from what was read goes through, as the Dashboard's own writes do.
  const dashboards = { inUse: 'x', templates: [tpl()] };
  expect((await repo.prefs.update({ dashboards })).dashboards).toEqual(
    dashboards,
  );
});
