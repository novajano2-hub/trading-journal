import { expect, test } from 'vitest';
import { WIDGETS } from '@/domain/dashboard/widgets';
import type { WidgetKey } from '@/domain/types';
import { WIDGET_BLURBS, WIDGET_TITLES } from './dashboard-widgets';

const keys = Object.keys(WIDGETS) as WidgetKey[];

test('every widget of the catalogue has a name and a one-line blurb, and nothing else does', () => {
  expect(Object.keys(WIDGET_TITLES).sort()).toEqual([...keys].sort());
  expect(Object.keys(WIDGET_BLURBS).sort()).toEqual([...keys].sort());
});

test.each(keys)(
  'the blurb of %s is one short sentence in Keel plain words',
  (key) => {
    const blurb = WIDGET_BLURBS[key];
    expect(blurb.length).toBeGreaterThan(15);
    expect(blurb.length).toBeLessThanOrEqual(90);
    expect(blurb.endsWith('.')).toBe(true);
    expect(blurb).not.toMatch(/[–—]/);
    expect(blurb).not.toMatch(/tradezella/i);
  },
);

test('the blurbs of the picker comp read as it writes them', () => {
  expect(WIDGET_BLURBS['win-avg']).toBe(
    'The three, running through the day, by the time each trade closed.',
  );
  expect(WIDGET_BLURBS['calendar-mini']).toBe(
    'A small month; a day opens its Day view.',
  );
  expect(WIDGET_BLURBS.year).toBe(
    'The year, month by month; a month opens Calendar.',
  );
});
