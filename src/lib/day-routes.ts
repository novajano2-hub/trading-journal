export type DayMode = 'plan' | 'review';

/** K26: today and future dates open plan; past dates open review. */
export function dayModeOf(date: string, today: string): DayMode {
  return date < today ? 'review' : 'plan';
}

/** The day page for a date, in the mode K26 gives it. */
export function dayHref(date: string, today: string): string {
  return `/app/day/${date}/${dayModeOf(date, today)}`;
}
