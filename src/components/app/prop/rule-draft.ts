import { toCents } from '@/domain/money';
import type { Cents, DrawdownType, PropRuleSet } from '@/domain/types';

export type Unit = 'amount' | 'percent';

/** One phase's rules as the form holds them: text, with a unit for each limit. */
export interface RuleDraft {
  target: string;
  targetUnit: Unit;
  dailyLoss: string;
  dailyLossUnit: Unit;
  maxDrawdown: string;
  maxDrawdownUnit: Unit;
  drawdownType: DrawdownType;
  floorMode: 'start' | 'fixed';
  floor: string;
  minDays: string;
  period: 'none' | 'days';
  periodDays: string;
  /** The best day's share of the profit, in percent. */
  consistency: string;
}

export const emptyRules = (): RuleDraft => ({
  target: '',
  targetUnit: 'amount',
  dailyLoss: '',
  dailyLossUnit: 'amount',
  maxDrawdown: '',
  maxDrawdownUnit: 'amount',
  drawdownType: 'static',
  floorMode: 'start',
  floor: '',
  minDays: '0',
  period: 'none',
  periodDays: '',
  consistency: '',
});

/** "8000" or "8000.5": whole dollars without decimals. */
const dollars = (cents: Cents): string =>
  String(Math.round(cents) / 100).replace(/\.0+$/, '');

/** A phase's stored rules as a draft, every limit in dollars. */
export function draftFromRules(r: PropRuleSet): RuleDraft {
  return {
    ...emptyRules(),
    target: r.profitTarget > 0 ? dollars(r.profitTarget) : '',
    dailyLoss: dollars(r.dailyLossLimit),
    maxDrawdown: dollars(r.maxDrawdown),
    drawdownType: r.drawdownType,
    floorMode: r.drawdownFloor === undefined ? 'start' : 'fixed',
    floor: r.drawdownFloor === undefined ? '' : dollars(r.drawdownFloor),
    minDays: String(r.minTradingDays),
    period: r.periodDays === undefined ? 'none' : 'days',
    periodDays: r.periodDays === undefined ? '' : String(r.periodDays),
    consistency:
      r.consistencyPct === undefined
        ? ''
        : String(Math.round(r.consistencyPct * 1000) / 10),
  };
}

export type RuleErrors = Partial<
  Record<
    | 'target'
    | 'dailyLoss'
    | 'maxDrawdown'
    | 'floor'
    | 'minDays'
    | 'periodDays'
    | 'consistency',
    string
  >
>;

const number = (text: string): number =>
  text.trim() === '' ? NaN : Number(text.replace(/,/g, ''));

/** A limit as cents: dollars as typed, or a percentage of the starting balance (E12). */
function limit(text: string, unit: Unit, start: Cents): Cents | null {
  const n = number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'percent' ? Math.round((start * n) / 100) : toCents(n);
}

/**
 * The rules to store, or what is wrong with each field. `start` is the
 * account's starting balance, which a percentage is read against. The funded
 * phase has no target and no period.
 */
export function rulesFromDraft(
  d: RuleDraft,
  o: { phase: PropRuleSet['phase']; firm: string; start: Cents },
): { rules: PropRuleSet } | { errors: RuleErrors } {
  const errors: RuleErrors = {};
  const evaluation = o.phase === 'evaluation';
  const target = evaluation ? limit(d.target, d.targetUnit, o.start) : 0;
  if (target === null) errors.target = 'Enter a target above zero.';
  const dailyLossLimit = limit(d.dailyLoss, d.dailyLossUnit, o.start);
  if (dailyLossLimit === null)
    errors.dailyLoss = 'Enter a daily loss limit above zero.';
  const maxDrawdown = limit(d.maxDrawdown, d.maxDrawdownUnit, o.start);
  if (maxDrawdown === null)
    errors.maxDrawdown = 'Enter a max drawdown above zero.';
  let drawdownFloor: Cents | undefined;
  // A static drawdown has no floor: the field is hidden, and a stale one is dropped.
  if (d.floorMode === 'fixed' && d.drawdownType !== 'static') {
    const n = number(d.floor);
    if (!Number.isFinite(n) || n <= 0)
      errors.floor = 'Enter the floor balance.';
    else drawdownFloor = toCents(n);
  }
  const minTradingDays = number(d.minDays);
  if (!Number.isInteger(minTradingDays) || minTradingDays < 0)
    errors.minDays = 'Enter whole days, 0 or more.';
  let periodDays: number | undefined;
  if (evaluation && d.period === 'days') {
    const n = number(d.periodDays);
    if (!Number.isInteger(n) || n <= 0)
      errors.periodDays = 'Enter whole days above zero.';
    else periodDays = n;
  }
  let consistencyPct: number | undefined;
  if (d.consistency.trim() !== '') {
    const n = number(d.consistency);
    if (!Number.isFinite(n) || n <= 0 || n > 100)
      errors.consistency = 'Enter a percentage from 1 to 100.';
    else consistencyPct = n / 100;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    rules: {
      firm: o.firm,
      phase: o.phase,
      profitTarget: target!,
      dailyLossLimit: dailyLossLimit!,
      maxDrawdown: maxDrawdown!,
      drawdownType: d.drawdownType,
      minTradingDays,
      ...(consistencyPct !== undefined && { consistencyPct }),
      ...(periodDays !== undefined && { periodDays }),
      ...(drawdownFloor !== undefined && { drawdownFloor }),
    },
  };
}
