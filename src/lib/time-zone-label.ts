/** "UTC-06:00" for a zone right now; "UTC" for UTC itself; empty for a name the browser does not know. */
export function offsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    return part ? part.replace('GMT', 'UTC').replace('−', '-') || 'UTC' : '';
  } catch {
    return '';
  }
}

/**
 * A zone as a person says it, a city and its offset: "Addis Ababa, UTC+03:00"
 * for Africa/Addis_Ababa. A zone without a city (UTC, Etc/GMT+5) is its offset
 * alone, and a name the browser does not know comes back as typed.
 */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  const offset = offsetLabel(timeZone, at);
  if (offset === '') return timeZone;
  const parts = timeZone.split('/');
  const last = parts[parts.length - 1] ?? timeZone;
  if (parts.length < 2 || parts[0] === 'Etc')
    return offset === 'UTC+00:00' ? 'UTC' : offset;
  return `${last.replaceAll('_', ' ')}, ${offset}`;
}
