import { centsFromText } from '@/domain/fill-costs';
import { fillTimeToUtc } from '@/domain/import/fill-time';
import { localDate } from '@/domain/time';
import type { Cents } from '@/domain/types';
import { clock } from '@/lib/time-format';

/** What the form's fields hold and show for a missed trade: text in, numbers out. */

/** Thousands grouped by commas or none at all, then an optional fraction. */
const PRICE = /^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;

/**
 * A typed price: a number above zero. `undefined` for a blank field (a price
 * is optional), `null` for anything that is not one: zero, a minus, letters,
 * a decimal comma, a second point.
 */
export function parsePrice(text: string): number | undefined | null {
  const raw = text.replace(/\s/g, '');
  if (raw === '') return undefined;
  if (!PRICE.test(raw) || !/\d/.test(raw)) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const decimalsOf = (n: number): number => {
  const text = String(Number(n.toFixed(8)));
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
};

/** A price as the list shows it: grouped, with at least two decimals and the ones it has. */
export function priceText(n: number): string {
  const digits = Math.max(2, decimalsOf(n));
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** A price as the field holds it: plain, so editing it needs nothing stripped. */
export function priceInput(n: number): string {
  return String(Number(n.toFixed(8)));
}

/**
 * A typed commission or fee in cents. `undefined` for a blank field (nothing
 * was entered), `null` for what is not an amount. The same parser as the fill
 * costs: a leading minus is a credit, a decimal comma is refused.
 */
export function parseCost(text: string): Cents | undefined | null {
  if (text.trim() === '') return undefined;
  return centsFromText(text);
}

/** Cents as the field holds them: "2.58". */
export const costInput = (cents: Cents): string => (cents / 100).toFixed(2);

/** A stored instant as the `datetime-local` box holds it, read in `zone`. */
export function wallInput(iso: string, zone: string): string {
  return `${localDate(iso, zone)}T${clock(iso, zone, false)}`;
}

/** The instant a `datetime-local` value is, read in `zone`; null when blank or half typed. */
export function atFromInput(value: string, zone: string): string | null {
  return fillTimeToUtc(value, { timeZone: zone, dateOrder: 'mdy' });
}
