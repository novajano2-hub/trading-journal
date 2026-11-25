import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import type { FirstRunInput } from '../repository';
import { fixtureSample } from '../__fixtures__/sample';
import { isOnboarded } from '../onboarding';
import { createLocalRepository } from './local-repository';

const NOW = new Date('2026-11-25T10:30:00.000Z');
const open = () =>
  createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    now: () => NOW,
    sample: async () => fixtureSample(),
  });

const INPUT: FirstRunInput = {
  firstName: 'Sam',
  lastName: 'Doe',
  username: 'sam.doe',
  baseCurrency: 'EUR',
  timeZone: 'America/Chicago',
  survey: {
    experience: 'one-to-three',
    capital: ['personal'],
    broker: 'other',
    instruments: ['stocks', 'futures'],
    goals: ['journal'],
    heardFrom: 'friend',
  },
};

test('complete makes My account in the chosen currency, makes My workspace active and sets the flag', async () => {
  const repo = open();
  expect(isOnboarded(await repo.prefs.get())).toBe(false);
  await repo.onboarding.complete(INPUT);

  const prefs = await repo.prefs.get();
  expect(isOnboarded(prefs)).toBe(true);
  expect(prefs).toMatchObject({
    firstName: 'Sam',
    lastName: 'Doe',
    username: 'sam.doe',
    baseCurrency: 'EUR',
    timeZone: 'America/Chicago',
    onboarding: {
      status: 'done',
      at: NOW.toISOString(),
      survey: INPUT.survey,
    },
  });
  const accounts = await repo.accounts.list('mine');
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({
    name: 'My account',
    currency: 'EUR',
    type: 'live',
    status: 'active',
    startingBalance: 0,
  });
  expect((await repo.workspaces.getActive()).id).toBe('mine');
});

test('no second account when My workspace has one', async () => {
  const repo = open();
  await repo.accounts.create('mine', {
    name: 'Existing',
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  await repo.onboarding.complete(INPUT);
  await repo.onboarding.complete(INPUT);
  expect((await repo.accounts.list('mine')).map((a) => a.name)).toEqual([
    'Existing',
  ]);
});

test('a retry after a finished save makes no second My account', async () => {
  const repo = open();
  await repo.onboarding.complete(INPUT);
  await repo.onboarding.complete(INPUT);
  expect(await repo.accounts.list('mine')).toHaveLength(1);
});

test.each([
  ['username', { username: 'no' }],
  ['time zone', { timeZone: 'Mars/Base' }],
  ['currency', { baseCurrency: 'DOLLARS' }],
])('a bad %s writes nothing', async (_, bad) => {
  const repo = open();
  await expect(
    repo.onboarding.complete({ ...INPUT, ...bad }),
  ).rejects.toBeInstanceOf(RangeError);
  expect(isOnboarded(await repo.prefs.get())).toBe(false);
  expect(await repo.prefs.saved()).toEqual({});
  expect(await repo.accounts.list('mine')).toEqual([]);
  expect((await repo.workspaces.getActive()).id).toBe('sample');
});

test('the survey is optional', async () => {
  const repo = open();
  await repo.onboarding.complete({ ...INPUT, survey: undefined });
  expect((await repo.prefs.get()).onboarding?.survey).toBeUndefined();
});

test('complete is one transaction: a write that fails inside it leaves prefs, accounts and the active workspace as they were', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    now: () => NOW,
    // The account's id is made after the prefs are written, inside the transaction.
    newId: () => {
      throw new Error('no id');
    },
    sample: async () => fixtureSample(),
  });
  await expect(repo.onboarding.complete(INPUT)).rejects.toThrow('no id');
  expect(isOnboarded(await repo.prefs.get())).toBe(false);
  expect(await repo.prefs.saved()).toEqual({});
  expect(await repo.accounts.list('mine')).toEqual([]);
  expect((await repo.workspaces.getActive()).id).toBe('sample');
});
