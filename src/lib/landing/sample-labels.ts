import type { Trade } from '@/domain/types';
import { weekdayOf } from '@/lib/time-format';
import type { SampleView } from './sample-view';

/** A trade's setup tag as the site displays it, straight from the engine's tags. */
export function setupName(view: SampleView, trade: Trade): string {
  const tag = trade.tagIds
    .map((id) => view.tags.find((t) => t.id === id))
    .find((t) => t?.category === 'setup');
  if (!tag) throw new Error(`Sample trade ${trade.serial} has no setup tag`);
  return tag.name;
}

/** The trade's day in New York, e.g. "Thu 19 Nov". */
export function dayLabel(trade: Trade): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date(trade.openedAt));
  return `${weekdayOf(day, 'short')} ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}
