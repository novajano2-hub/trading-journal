import type { Cents, Instrument } from '@/domain/types';

function currencyString(cents: Cents, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Math.abs(cents) / 100,
  );
}

/** Unsigned money, e.g. balances. */
export function formatMoney(cents: Cents, currency = 'USD'): string {
  return currencyString(cents, currency);
}

/** Signed P&L: `+` for gains, U+2212 minus for losses, none for zero. */
export function formatPnl(cents: Cents, currency = 'USD'): string {
  const body = currencyString(cents, currency);
  if (cents > 0) return `+${body}`;
  if (cents < 0) return `−${body}`;
  return body;
}

/** A 0..1 ratio as a percentage with a fixed number of decimals, e.g. 0.5 → "50.0%" at 1. */
export function formatPct(ratio: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/**
 * Rule adherence, a 0..1 ratio, as a whole percentage that never claims an
 * edge it hasn't reached: 199 of 200 reads 99.5%, not 100%, and 1 of 300
 * reads 0.3%, not 0%. Near either edge it shows one decimal, kept between
 * 0.1% and 99.9%.
 */
export function formatAdherence(ratio: number): string {
  if (adherenceDigits(ratio) === 0) return formatPct(ratio, 0);
  const tenths = Math.min(999, Math.max(1, Math.round(ratio * 1000)));
  return formatPct(tenths / 1000, 1);
}

/** The decimals `formatAdherence` shows: 1 where a whole percentage would read 0% or 100% short of it, else 0. */
export function adherenceDigits(ratio: number): 0 | 1 {
  if (ratio <= 0 || ratio >= 1) return 0;
  const whole = formatPct(ratio, 0);
  return whole === formatPct(0, 0) || whole === formatPct(1, 0) ? 1 : 0;
}

/** A plain ratio such as profit factor, to two decimals. */
export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

/** Signed whole dollars for chart labels, e.g. +1,160 or −39. Zero is bare. */
export function formatPnlWhole(cents: Cents): string {
  const body = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(cents) / 100));
  if (cents > 0) return `+${body}`;
  if (cents < 0) return `−${body}`;
  return body;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
/** Futures month codes, January to December. */
const MONTH_CODES = 'FGHJKMNQUVXZ';

/** How a trade's instrument reads in a row. */
export interface InstrumentLabel {
  /** "TSLA 370 Put", "ES Dec 26", or the symbol as traded. */
  name: string;
  /** An option's expiry, "20 Nov", with the year ("15 Jan 27") when it isn't the trade's. */
  detail?: string;
}

/**
 * The instrument in words: an option as underlying, strike and right with its
 * expiry beside it, a future as its root and contract month (the root is what
 * the Symbol filter matches). Stocks, forex and crypto read as traded, and so
 * does anything without the fields to decode. `tradedAt` (an ISO time) places
 * a one-digit contract year in its decade; it defaults to now.
 */
export function formatInstrument(
  instrument: Instrument,
  tradedAt: string = new Date().toISOString(),
): InstrumentLabel {
  const tradeYear = Number(tradedAt.slice(0, 4));
  const { symbol, underlying, strike, right, expiry } = instrument;

  if (
    instrument.assetClass === 'option' &&
    underlying &&
    strike !== undefined &&
    right &&
    expiry
  ) {
    const [year = 0, month = 0, day = 0] = expiry.split('-').map(Number);
    const strikeText = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 3,
      useGrouping: false,
    }).format(strike);
    const yearText =
      year === tradeYear ? '' : ` ${String(year % 100).padStart(2, '0')}`;
    return {
      name: `${underlying} ${strikeText} ${right === 'put' ? 'Put' : 'Call'}`,
      detail: `${day} ${MONTHS[month - 1] ?? ''}${yearText}`,
    };
  }

  if (instrument.assetClass === 'future') {
    const body = symbol.trim().toUpperCase().replace(/^\//, '');
    const contract = body.startsWith(instrument.root)
      ? /^([FGHJKMNQUVXZ])(\d{1,2})$/.exec(body.slice(instrument.root.length))
      : null;
    if (contract) {
      const [, code = '', digits = ''] = contract;
      const month = MONTHS[MONTH_CODES.indexOf(code)];
      return {
        name: `${instrument.root} ${month} ${twoDigitYear(digits, tradeYear)}`,
      };
    }
  }

  return { name: symbol };
}

/**
 * A contract year as two digits. One digit is the year ending in it nearest
 * the trade's, later on a tie: Z5 traded in 2026 is 2025, H0 is 2030.
 */
function twoDigitYear(digits: string, tradeYear: number): string {
  if (digits.length === 2) return digits;
  const back = (((tradeYear - Number(digits)) % 10) + 10) % 10;
  const year = back >= 5 ? tradeYear - back + 10 : tradeYear - back;
  return String(year % 100).padStart(2, '0');
}

/**
 * Rule text with each hyphen inside a word made non-breaking (U+2011), so a
 * narrow column never splits "1-hour" into "1-" and "hour".
 */
export function keepHyphens(text: string): string {
  return text.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, '\u2011');
}
