import {
  DAILY_REVIEW_BODY,
  PRE_MARKET_BODY,
  WEEKLY_RECAP_BODY,
} from '@/content/note-templates';
import type { NoteTemplate, TagCategory } from '@/domain/types';

// What every workspace starts with: the built-in tag categories and note
// templates. Their ids are fixed, so seeding them again finds them.

type CategoryPreset = Omit<TagCategory, 'workspaceId'>;

/** The categories Keel names. Mistakes and Custom tags are built in; Setups and Emotions are the sample's (and version 1's) own. */
export const CATEGORIES = {
  mistakes: {
    id: 'mistakes',
    name: 'Mistakes',
    color: '#D97706',
    role: 'mistake',
    builtIn: true,
  },
  custom: {
    id: 'custom-tags',
    name: 'Custom tags',
    color: '#16A34A',
    builtIn: true,
  },
  setups: { id: 'setups', name: 'Setups', color: '#2B35AF', builtIn: false },
  emotions: {
    id: 'emotions',
    name: 'Emotions',
    color: '#0A6F94',
    builtIn: false,
  },
} as const satisfies Record<string, CategoryPreset>;

export function categoryIn(ws: string, preset: CategoryPreset): TagCategory {
  return { ...preset, workspaceId: ws };
}

export function builtInCategories(ws: string): TagCategory[] {
  return [
    categoryIn(ws, CATEGORIES.mistakes),
    categoryIn(ws, CATEGORIES.custom),
  ];
}

/** "Daily review", "Pre-market plan" and "Weekly recap", each the default for its kind. */
export function builtInTemplates(ws: string): NoteTemplate[] {
  const template = (
    id: string,
    name: string,
    kind: NoteTemplate['kind'],
    body: unknown,
  ): NoteTemplate => ({
    id,
    workspaceId: ws,
    name,
    kind,
    body: structuredClone(body),
    isDefault: true,
    builtIn: true,
  });
  return [
    template(
      'template-daily-review',
      'Daily review',
      'daily-review',
      DAILY_REVIEW_BODY,
    ),
    template(
      'template-pre-market',
      'Pre-market plan',
      'pre-market',
      PRE_MARKET_BODY,
    ),
    template(
      'template-weekly-recap',
      'Weekly recap',
      'weekly-recap',
      WEEKLY_RECAP_BODY,
    ),
  ];
}
