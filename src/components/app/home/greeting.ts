/** The hour (0 to 23) of `now` in the zone. */
function hourIn(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour);
}

/**
 * "Good morning, Sam": the word by the hour in the profile zone, then the first
 * name when there is one. Keel's call (TradeZella unknown): the record shows a
 * time-of-day word, not where it changes, so morning is before 12:00, afternoon
 * 12:00 to 17:59, and evening from 18:00.
 */
export function greeting(
  now: Date,
  timeZone: string,
  firstName: string | undefined,
): string {
  const hour = hourIn(now, timeZone);
  const word =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = firstName?.trim();
  return name ? `${word}, ${name}` : word;
}

/** "Wednesday 25 November", in the profile zone. */
export function dateLine(now: Date, timeZone: string): string {
  const part = (
    type: Intl.DateTimeFormatPartTypes,
    parts: Intl.DateTimeFormatPart[],
  ) => parts.find((p) => p.type === type)?.value ?? '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).formatToParts(now);
  return `${part('weekday', parts)} ${part('day', parts)} ${part('month', parts)}`;
}
