const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const CLOCK = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*([AaPp])\.?[Mm]\.?)?`;
/** YYYY-MM-DD HH:MM[:SS], with a space or a T between date and time. */
const ISO = new RegExp(
  String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s+)${CLOCK}$`,
);
/** MM/DD/YYYY HH:MM[:SS], month first as US brokers write it. */
const US = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})\s+${CLOCK}$`);

const two = (n: number) => String(n).padStart(2, '0');

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A fill time from the visitor's file, printed in the ticket clock format
 * 'DD MMM HH:MM:SS'. The wall clock is kept exactly as written, since the
 * file's timezone is unknown. Anything not recognised is shown as it came.
 */
export function formatFillTime(raw: string): string {
  const s = raw.trim();
  const iso = ISO.exec(s);
  const us = iso ? null : US.exec(s);
  const m = iso ?? us;
  if (!m) return raw;

  const [year, month, day] = iso
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : [Number(m[3]), Number(m[1]), Number(m[2])];
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const meridiem = m[7]?.toLowerCase();

  if (month < 1 || month > 12) return raw;
  if (day < 1 || day > daysIn(year, month)) return raw;
  if (minute > 59 || second > 59) return raw;
  if (meridiem) {
    if (hour < 1 || hour > 12) return raw;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) return raw;

  return `${two(day)} ${MONTHS[month - 1]} ${two(hour)}:${two(minute)}:${two(second)}`;
}
