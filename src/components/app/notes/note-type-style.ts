// The note settings (B41) as the custom properties `note-prose.css` reads. An
// editor or read view puts these on its own box, so what Settings > Notebook
// saves reaches every note at once: the Notebook, a trade's notes, the day
// page, the version preview and the print layout.
import type { CSSProperties } from 'react';
import type { NoteType } from '@/domain/types';

/** Two quiet sizes that follow H3 in proportion, never under 12px: 13.5 and 15px at the default 20. */
const FIELD_LABEL = 0.675;
const COLUMN_HEADING = 0.75;
const SMALLEST = 12;
const px = (n: number) => `${Math.round(n * 100) / 100}px`;

export function noteTypeStyle(type: NoteType): CSSProperties {
  return {
    '--note-h1': px(type.h1),
    '--note-h2': px(type.h2),
    '--note-h3': px(type.h3),
    '--note-body': px(type.body),
    '--note-checked-decoration': type.strikeChecked ? 'line-through' : 'none',
    // The day note's field label (a template's H3) and a column's heading.
    '--note-field-label': px(Math.max(SMALLEST, type.h3 * FIELD_LABEL)),
    '--note-column-heading': px(Math.max(SMALLEST, type.h3 * COLUMN_HEADING)),
  } as CSSProperties;
}
