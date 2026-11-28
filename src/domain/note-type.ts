// The note editor's type settings (B41): four sizes and whether a ticked
// checklist item is crossed out. Pure: no storage, no React.
import type { NoteType } from './types';

/** The sizes a heading or the body can take, in px (Keel's call, B41). */
export const NOTE_SIZE_MIN = 10;
export const NOTE_SIZE_MAX = 40;

/** What a note reads like when nothing is saved: 28, 24, 20 and 14 px, ticked items crossed out. */
export const DEFAULT_NOTE_TYPE: Readonly<NoteType> = {
  h1: 28,
  h2: 24,
  h3: 20,
  body: 14,
  strikeChecked: true,
};

export const NOTE_SIZE_KEYS = ['h1', 'h2', 'h3', 'body'] as const;

const isSize = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isInteger(n) &&
  n >= NOTE_SIZE_MIN &&
  n <= NOTE_SIZE_MAX;

/**
 * The setting a note is drawn with: what is saved, with the default standing
 * in for anything missing or out of range (a stored value is trusted, but a
 * wrong one must not make a note unreadable).
 */
export function noteTypeOf(saved: Partial<NoteType> | undefined): NoteType {
  const pick = (key: (typeof NOTE_SIZE_KEYS)[number]): number => {
    const n = saved?.[key];
    return isSize(n) ? n : DEFAULT_NOTE_TYPE[key];
  };
  return {
    h1: pick('h1'),
    h2: pick('h2'),
    h3: pick('h3'),
    body: pick('body'),
    strikeChecked:
      typeof saved?.strikeChecked === 'boolean'
        ? saved.strikeChecked
        : DEFAULT_NOTE_TYPE.strikeChecked,
  };
}

export function sameNoteType(a: NoteType, b: NoteType): boolean {
  return (
    a.h1 === b.h1 &&
    a.h2 === b.h2 &&
    a.h3 === b.h3 &&
    a.body === b.body &&
    a.strikeChecked === b.strikeChecked
  );
}
