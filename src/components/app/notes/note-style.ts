// What the note toolbar offers to set on text: faces, sizes and two palettes.
// Colours are stored in a note as tokens (`var(--note-ink-rose)`), never as
// hex, so the same note reads in light and in graphite: note-prose.css gives
// each token its value per theme.

export interface NoteFont {
  id: 'sans' | 'serif' | 'mono';
  label: string;
  /** The `font-family` stored on the text; null is the editor's own face. */
  value: string | null;
}

export const FONT_FAMILIES: readonly NoteFont[] = [
  { id: 'sans', label: 'Sans', value: null },
  { id: 'serif', label: 'Serif', value: 'var(--note-serif)' },
  { id: 'mono', label: 'Mono', value: 'var(--note-mono)' },
];

/** Sizes in px, 8 to 72, one step apart. */
export const FONT_SIZES: readonly number[] = Array.from(
  { length: 65 },
  (_, i) => 8 + i,
);

export interface NoteSwatch {
  id: string;
  label: string;
  /** The CSS value stored on the text. */
  value: string;
  /** The hue at full strength, for a ring round a highlight's swatch. */
  ink: string;
}

/**
 * Each hue is one that has no job elsewhere in Keel: gain green, loss red,
 * and the cyan are left out as in the tag palette, so a coloured word never
 * reads as money kept or lost. Ultramarine is in because it is Keel's own ink
 * for what is chosen, and grey is the quiet one.
 */
const HUES = [
  ['marigold', 'Marigold'],
  ['clay', 'Clay'],
  ['rose', 'Rose'],
  ['orchid', 'Orchid'],
  ['plum', 'Plum'],
  ['olive', 'Olive'],
  ['ultramarine', 'Ultramarine'],
  ['grey', 'Grey'],
] as const;

export const TEXT_COLOURS: readonly NoteSwatch[] = HUES.map(([id, label]) => ({
  id,
  label,
  value: `var(--note-ink-${id})`,
  ink: `var(--note-ink-${id})`,
}));

export const HIGHLIGHTS: readonly NoteSwatch[] = HUES.map(([id, label]) => ({
  id,
  label,
  value: `var(--note-hl-${id})`,
  ink: `var(--note-ink-${id})`,
}));
