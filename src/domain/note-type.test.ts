import { expect, test } from 'vitest';
import {
  DEFAULT_NOTE_TYPE,
  NOTE_SIZE_MAX,
  NOTE_SIZE_MIN,
  noteTypeOf,
  sameNoteType,
} from './note-type';

test('the defaults are 28, 24, 20 and 14 px, with ticked items crossed out', () => {
  expect(DEFAULT_NOTE_TYPE).toEqual({
    h1: 28,
    h2: 24,
    h3: 20,
    body: 14,
    strikeChecked: true,
  });
});

test('a size runs from 10 to 40 px', () => {
  expect([NOTE_SIZE_MIN, NOTE_SIZE_MAX]).toEqual([10, 40]);
});

test('nothing saved reads as the defaults, and a saved setting as itself', () => {
  expect(noteTypeOf(undefined)).toEqual(DEFAULT_NOTE_TYPE);
  const saved = { h1: 32, h2: 26, h3: 22, body: 16, strikeChecked: false };
  expect(noteTypeOf(saved)).toEqual(saved);
});

test('a field that is not a size in range reads as its default, the rest are kept', () => {
  const odd = {
    h1: 99,
    h2: 'big',
    h3: 21.5,
    body: 18,
    strikeChecked: 'yes',
  } as unknown as Parameters<typeof noteTypeOf>[0];
  expect(noteTypeOf(odd)).toEqual({ ...DEFAULT_NOTE_TYPE, body: 18 });
});

test('two settings are the same when every field is', () => {
  expect(sameNoteType(DEFAULT_NOTE_TYPE, { ...DEFAULT_NOTE_TYPE })).toBe(true);
  expect(
    sameNoteType(DEFAULT_NOTE_TYPE, { ...DEFAULT_NOTE_TYPE, h2: 25 }),
  ).toBe(false);
  expect(
    sameNoteType(DEFAULT_NOTE_TYPE, {
      ...DEFAULT_NOTE_TYPE,
      strikeChecked: false,
    }),
  ).toBe(false);
});
