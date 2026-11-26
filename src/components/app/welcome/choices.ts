import { offsetLabel } from '@/lib/time-zone-label';

/** The currency and time-zone lists of the preferences dialog (R12, R13). */

/**
 * TradeZella's order for the top of the list [inv-1 014].
 * INFERRED from [inv-1 013-014]: the record shows the lists as selects but not the
 * tail's order, so the rest follow A to Z by code.
 */
const CURRENCIES_FIRST = [
  'USD',
  'EUR',
  'AUD',
  'GBP',
  'CAD',
  'INR',
  'JPY',
  'CHF',
  'CNY',
  'HKD',
  'CZK',
];

function currencyCodes(): string[] {
  let all: string[];
  try {
    all = Intl.supportedValuesOf('currency');
  } catch {
    all = [];
  }
  const rest = all.filter((c) => !CURRENCIES_FIRST.includes(c)).sort();
  return [...CURRENCIES_FIRST, ...rest];
}

/** "US dollar": the browser's name with its unit in lower case ("Swiss Franc" reads "Swiss franc"). */
function currencyName(code: string): string {
  let name = code;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    // the code stands in for the name
  }
  const words = name.split(' ');
  const last = words.pop();
  return words.length === 0
    ? name
    : `${words.join(' ')} ${last!.toLowerCase()}`;
}

export interface Choice {
  value: string;
  label: string;
}

/** Every currency, each shown "USD (US dollar)". */
export function currencyChoices(): Choice[] {
  return currencyCodes().map((code) => ({
    value: code,
    label: `${code} (${currencyName(code)})`,
  }));
}

/** "US dollars", for a sentence ("in US dollars"). */
export function currencyPlural(code: string): string {
  try {
    const part = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'name',
    })
      .formatToParts(2)
      .find((p) => p.type === 'currency');
    if (part) return part.value;
  } catch {
    // fall through to the code
  }
  return code;
}

/** The zones people know by a US name; every other zone shows its IANA name. */
const US_NAMES: Record<string, string> = {
  'America/New_York': 'US/Eastern',
  'America/Chicago': 'US/Central',
  'America/Denver': 'US/Mountain',
  'America/Los_Angeles': 'US/Pacific',
  'America/Anchorage': 'US/Alaska',
  'Pacific/Honolulu': 'US/Hawaii',
};

/** The name a zone shows by: "US/Eastern" for America/New_York. */
export function zoneName(zone: string): string {
  return US_NAMES[zone] ?? zone;
}

/** Minutes east of UTC right now, from the shared offset label; 0 for a name the browser does not know. */
function offsetMinutes(zone: string, at: Date): number {
  const m = /^UTC([+-])(\d{2}):(\d{2})$/.exec(offsetLabel(zone, at));
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '+' ? minutes : -minutes;
}

/** "GMT−5", "GMT+5:30", "GMT" (a minus sign, not a dash). */
export function gmtLabel(zone: string, at: Date = new Date()): string {
  const minutes = offsetMinutes(zone, at);
  if (minutes === 0) return 'GMT';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${minutes < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/**
 * Every zone the browser knows, west to east, each "GMT−5 US/Eastern".
 * INFERRED from [inv-1 013-014]: the record shows a select of zones with an offset
 * and a name, not their order or naming, so Keel orders them west to east (then
 * by name) and shows the US names TradeZella uses for the six US zones.
 */
export function zoneChoices(at: Date = new Date()): Choice[] {
  let names: string[];
  try {
    names = Intl.supportedValuesOf('timeZone');
  } catch {
    names = [];
  }
  if (!names.includes('UTC')) names = [...names, 'UTC'];
  return names
    .map((zone) => ({ zone, minutes: offsetMinutes(zone, at) }))
    .sort((a, b) => a.minutes - b.minutes || a.zone.localeCompare(b.zone))
    .map(({ zone }) => ({
      value: zone,
      label: `${gmtLabel(zone, at)} ${zoneName(zone)}`,
    }));
}
