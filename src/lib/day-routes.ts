import { parseFilters, serializeFilters } from '@/data/filters';

export type DayMode = 'plan' | 'review';

/** K26: today and future dates open plan; past dates open review. */
export function dayModeOf(date: string, today: string): DayMode {
  return date < today ? 'review' : 'plan';
}

/** The day page for a date, in the mode K26 gives it. */
export function dayHref(date: string, today: string, query = ''): string {
  return dayModeOf(date, today) === 'review'
    ? dayReviewHref(date, query)
    : dayPlanHref(date, query);
}

/**
 * The global filters (account selection, range) as a `?query`, or '' when
 * none is set, for every link to and around the day page. `navHref` carries
 * them the same way, so the day page scores the accounts the page before it did.
 */
export function dayQuery(
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
): string {
  const query = serializeFilters(parseFilters(params)).toString();
  return query ? `?${query}` : '';
}

/** A date's plan page. */
export function dayPlanHref(date: string, query = ''): string {
  return `/app/day/${date}/plan${query}`;
}

/** A date's review page. */
export function dayReviewHref(date: string, query = ''): string {
  return `/app/day/${date}/review${query}`;
}
