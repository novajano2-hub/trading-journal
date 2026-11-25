// @vitest-environment happy-dom
import { beforeEach, expect, test, vi } from 'vitest';
import { BROKER_NAMES } from '@/content/onboarding';
import {
  allAnswered,
  clearFirstRun,
  firstUnanswered,
  isAnswered,
  readFirstRun,
  toAnswers,
  toggleCapital,
  writeFirstRun,
} from './survey-model';

beforeEach(clearFirstRun);

test('the broker list is A to Z', () => {
  expect([...BROKER_NAMES]).toEqual(
    [...BROKER_NAMES].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    ),
  );
});

test('capital: not yet clears the others, and either of them clears not yet', () => {
  expect(toggleCapital(['personal', 'prop'], 'not-yet')).toEqual(['not-yet']);
  expect(toggleCapital(['not-yet'], 'prop')).toEqual(['prop']);
  expect(toggleCapital(['prop'], 'personal')).toEqual(['prop', 'personal']);
  expect(toggleCapital(['prop'], 'prop')).toEqual([]);
});

test('step 6 Other needs its words', () => {
  expect(isAnswered(6, { heardFrom: 'friend' })).toBe(true);
  expect(isAnswered(6, { heardFrom: 'other' })).toBe(false);
  expect(isAnswered(6, { heardFrom: 'other', heardFromOther: '  ' })).toBe(
    false,
  );
  expect(
    isAnswered(6, { heardFrom: 'other', heardFromOther: 'a podcast' }),
  ).toBe(true);
});

test('the first unanswered step, and the stored answers', () => {
  expect(firstUnanswered({})).toBe(1);
  expect(firstUnanswered({ experience: '1-3', capital: ['prop'] })).toBe(3);
  const all = {
    experience: '1-3',
    capital: ['prop'],
    broker: 'IG',
    instruments: ['forex'],
    goals: ['journal'],
    heardFrom: 'friend',
    heardFromOther: 'left over',
  };
  expect(allAnswered(all)).toBe(true);
  // Words left from an earlier Other are not stored.
  expect(toAnswers(all)?.heardFromOther).toBeUndefined();
  expect(toAnswers({ experience: '1-3' })).toBeUndefined();
});

test('with storage that throws, the answers still hold for the tab', () => {
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('private window');
  });
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('private window');
  });
  try {
    writeFirstRun({ finished: false, draft: { experience: '3-5' } });
    expect(readFirstRun().draft.experience).toBe('3-5');
  } finally {
    set.mockRestore();
    get.mockRestore();
  }
});

test('a damaged stored value reads as no answers', () => {
  sessionStorage.setItem(
    'keel:first-run',
    '{"draft":{"capital":[1]},"finished":true}',
  );
  expect(readFirstRun()).toEqual({ draft: {}, finished: false });
  sessionStorage.setItem('keel:first-run', 'not json');
  expect(readFirstRun().finished).toBe(false);
});
