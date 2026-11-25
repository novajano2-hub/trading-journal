import { realizations } from '../metrics/realized';
import { localDate, localParts } from '../time';
import type { AccountDayInputs, Cents, Trade, TrackerVersion } from '../types';

export interface InputsEnv {
  timeZone: string;
  baseCurrency: string;
  version: TrackerVersion;
  /** The account's balance at the start of `date` (`balanceAt` of the day before). */
  balanceAtDayStart(accountId: string): Cents;
}

const empty = (): AccountDayInputs => ({
  opened: 0,
  withStrategy: 0,
  withStop: 0,
  inHours: 0,
  moneyOpened: 0,
  withinTradeLoss: 0,
  largestLoss: 0,
  dayNet: 0,
  booked: false,
  otherCurrency: 0,
});

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

function minuteOf(iso: string, timeZone: string): number {
  const p = localParts(iso, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * Each account's inputs to the day's rules. Trade rules read trades opened on
 * `date` in the profile zone (K4); the daily cap reads each exit booked on it (K8).
 * Accounts with neither are absent.
 */
export function dayInputs(
  trades: readonly Trade[],
  date: string,
  env: InputsEnv,
): Record<string, AccountDayInputs> {
  const out: Record<string, AccountDayInputs> = {};
  const { timeZone, baseCurrency, version } = env;
  const { hours, lossPerTrade } = version.builtIn;
  const from = minutes(hours.from);
  const to = minutes(hours.to);
  const get = (id: string) => (out[id] ??= empty());

  for (const t of trades) {
    const base = t.pnlCurrency === baseCurrency;
    const openedHere = localDate(t.openedAt, timeZone) === date;
    let booked = openedHere && base;
    let net = 0;
    if (base) {
      for (const r of realizations(t)) {
        if (localDate(r.time, timeZone) !== date) continue;
        net += r.net;
        booked = true;
      }
    }
    if (!openedHere && !booked) continue;
    const i = get(t.accountId);
    if (booked) i.booked = true;
    i.dayNet += net;
    if (!openedHere) continue;

    i.opened += 1;
    if (t.strategyIds.length > 0) i.withStrategy += 1;
    if (t.plannedStop !== undefined) i.withStop += 1;
    const entry = minuteOf(t.openedAt, timeZone);
    let inside = entry >= from && entry <= to;
    if (
      inside &&
      t.closedAt !== undefined &&
      localDate(t.closedAt, timeZone) === date
    ) {
      const exit = minuteOf(t.closedAt, timeZone);
      inside = exit >= from && exit <= to;
    }
    if (inside) i.inHours += 1;

    if (!base) {
      i.otherCurrency += 1;
      continue;
    }
    i.moneyOpened += 1;
    const loss = Math.max(0, -t.net);
    const limit =
      lossPerTrade.unit === 'amount'
        ? lossPerTrade.value
        : Math.round(lossPerTrade.value * env.balanceAtDayStart(t.accountId));
    if (loss <= limit) i.withinTradeLoss += 1;
    if (loss > i.largestLoss) i.largestLoss = loss;
  }
  return out;
}

/** Counts add, largestLoss takes the max, booked ORs. undefined ids: every account. */
export function sumInputs(
  inputs: Readonly<Record<string, AccountDayInputs>>,
  accountIds?: readonly string[],
): AccountDayInputs {
  const sum = empty();
  for (const id of accountIds ?? Object.keys(inputs)) {
    const i = inputs[id];
    if (!i) continue;
    sum.opened += i.opened;
    sum.withStrategy += i.withStrategy;
    sum.withStop += i.withStop;
    sum.inHours += i.inHours;
    sum.moneyOpened += i.moneyOpened;
    sum.withinTradeLoss += i.withinTradeLoss;
    sum.largestLoss = Math.max(sum.largestLoss, i.largestLoss);
    sum.dayNet += i.dayNet;
    sum.booked ||= i.booked;
    sum.otherCurrency += i.otherCurrency;
  }
  return sum;
}

/** HH:mm of the stamp when its local date is `date`, else undefined (K9). */
export function stampTime(
  iso: string | undefined,
  date: string,
  timeZone: string,
): string | undefined {
  if (!iso) return undefined;
  const p = localParts(iso, timeZone);
  if (p.date !== date) return undefined;
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
