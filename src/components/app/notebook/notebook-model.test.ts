import { expect, test } from 'vitest';
import type { JournalEntry } from '@/domain/types';
import { weeklyRecapFor } from './notebook-model';

const recap = (id: string, date: string, over: Partial<JournalEntry> = {}) =>
  ({
    id,
    workspaceId: 'w',
    kind: 'weekly-recap',
    date,
    title: id,
    body: {},
    linkedTradeIds: [],
    tags: [],
    updatedAt: '2026-11-20T00:00:00Z',
    ...over,
  }) as JournalEntry;

// 2026-11-15 is a Sunday; the week of Mon 16 Nov runs to Sun 22 Nov.
const legacy = recap('legacy', '2026-11-16'); // keyed on its Monday
const fresh = recap('fresh', '2026-11-15'); // keyed on a Sunday week start

test('a Monday-keyed note is found for a Sunday week that holds that Monday', () => {
  expect(weeklyRecapFor([legacy], '2026-11-20', 'sunday')?.id).toBe('legacy');
});

test('a note keyed on the Sunday week start is found under Sunday weeks, and not for the next week', () => {
  expect(weeklyRecapFor([fresh], '2026-11-20', 'sunday')?.id).toBe('fresh');
  expect(weeklyRecapFor([fresh], '2026-11-24', 'sunday')).toBeUndefined();
});

test('switching back to Monday still finds both', () => {
  const both = [legacy, fresh];
  // The Monday week of 16 to 22 Nov holds the Monday key.
  expect(weeklyRecapFor(both, '2026-11-20', 'monday')?.id).toBe('legacy');
  // The Monday week of 9 to 15 Nov ends on the Sunday key.
  expect(weeklyRecapFor(both, '2026-11-12', 'monday')?.id).toBe('fresh');
});

test('trashed notes and other kinds are not found', () => {
  expect(
    weeklyRecapFor(
      [recap('gone', '2026-11-16', { deletedAt: '2026-11-17T00:00:00Z' })],
      '2026-11-20',
      'sunday',
    ),
  ).toBeUndefined();
  expect(
    weeklyRecapFor(
      [recap('note', '2026-11-16', { kind: 'note' })],
      '2026-11-20',
      'sunday',
    ),
  ).toBeUndefined();
});
