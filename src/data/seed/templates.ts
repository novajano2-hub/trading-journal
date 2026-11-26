import {
  DAILY_CHECKIN_BODY,
  DAILY_FULL_BODY,
  DAILY_PLAN_BODY,
  DAILY_REVIEW_BODY,
  PRE_MARKET_BODY,
  WEEKLY_RECAP_BODY,
} from '@/content/note-templates';
import type { NoteTemplate, TagCategory } from '@/domain/types';

// What every workspace starts with: the built-in tag categories and note
// templates. Their ids are fixed, so seeding them again finds them.

type CategoryPreset = Omit<TagCategory, 'workspaceId'>;

/** The categories Keel names. Their colours come from the tag-category palette (colour-picker.tsx), which leaves out the hues that have jobs: gain, loss, accent and cyan.
 * Mistakes and Custom tags are built in; Setups and Emotions are the sample's (and version 1's) own. */
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
    color: '#636889',
    builtIn: true,
  },
  setups: { id: 'setups', name: 'Setups', color: '#7E3F9E', builtIn: false },
  emotions: {
    id: 'emotions',
    name: 'Emotions',
    color: '#CB4B8A',
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

/** The ids of Keel's three extra daily templates (K32), the "recommended" group. */
export const KEEL_DAILY_IDS = [
  'template-daily-plan',
  'template-daily-full',
  'template-daily-checkin',
] as const;

/** "Daily review", "Pre-market plan" and "Weekly recap", each the default for its kind, and Keel's three other daily templates (K32), which are not defaults. */
export function builtInTemplates(ws: string): NoteTemplate[] {
  const template = (
    id: string,
    name: string,
    kind: NoteTemplate['kind'],
    body: unknown,
    isDefault = true,
  ): NoteTemplate => ({
    id,
    workspaceId: ws,
    name,
    kind,
    body: structuredClone(body),
    isDefault,
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
    template(
      KEEL_DAILY_IDS[0],
      'Daily game plan',
      'daily-review',
      DAILY_PLAN_BODY,
      false,
    ),
    template(
      KEEL_DAILY_IDS[1],
      'All-in-one day',
      'daily-review',
      DAILY_FULL_BODY,
      false,
    ),
    template(
      KEEL_DAILY_IDS[2],
      'Intraday check-in',
      'daily-review',
      DAILY_CHECKIN_BODY,
      false,
    ),
  ];
}
