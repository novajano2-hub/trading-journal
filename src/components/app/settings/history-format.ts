import { gmtLabel } from '@/components/app/welcome/choices';
import { ASSET_TYPES } from '@/domain/manual-trade';
import { toCents } from '@/domain/money';
import type {
  Account,
  HistoryAction,
  HistoryRow,
  HistorySource,
  HistoryType,
  LevelUnit,
} from '@/domain/types';
import type { Display } from '@/lib/display';
import { plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import { ICON_LABEL } from '../strategies/strategy-style';
import { plain } from '../trades/levels-block';
import { ACCOUNT_TYPES } from './account-dialog';
import { swatchName } from './colour-picker';
import { COST_METHODS } from './cost-methods';

/**
 * How the edit history reads (Plan 6B spec §5.9, B26 to B29). History keeps
 * raw values with the field's id; these turn them into words at read time, so
 * the reader's Display and Privacy apply.
 */

export const TYPE_LABEL: Record<HistoryType, string> = {
  trade: 'Trade',
  account: 'Account',
  'cash-flow': 'Balance adjustment',
  strategy: 'Strategy',
  tag: 'Tag',
  'tag-category': 'Tag category',
  'target-rule': 'Target and stop rule',
  'fee-rule': 'Commission and fee rule',
  import: 'Import',
};

export const ACTION_LABEL: Record<HistoryAction, string> = {
  created: 'Created',
  edited: 'Edited',
  deleted: 'Deleted',
  merged: 'Merged',
  split: 'Split',
  moved: 'Moved',
  undone: 'Undone',
};

export const SOURCE_LABEL: Record<HistorySource, string> = {
  you: 'You',
  import: 'Import',
  rule: 'Rule',
  system: 'System',
};

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
export const TYPE_OPTIONS = options(TYPE_LABEL);
export const ACTION_OPTIONS = options(ACTION_LABEL);
export const SOURCE_OPTIONS = options(SOURCE_LABEL);

/** Each logged field's name, by the id the repositories log it under. */
const FIELD_LABEL: Record<string, string> = {
  // Trades.
  strategyIds: 'Strategies',
  tagIds: 'Tags',
  rating: 'Rating',
  reviewed: 'Reviewed',
  targets: 'Targets',
  stops: 'Stops',
  noteId: 'Note',
  accountId: 'Account',
  swap: 'Swap',
  fills: 'Fills',
  fees: 'Fees',
  // Accounts.
  name: 'Name',
  broker: 'Broker',
  type: 'Type',
  currency: 'Currency',
  startingBalance: 'Starting balance',
  status: 'Status',
  costMethod: 'Cost method',
  trades: 'Trades',
  // Balance adjustments.
  amount: 'Amount',
  kind: 'Type',
  at: 'Date',
  note: 'Note',
  // Strategies, tags and categories.
  description: 'Description',
  icon: 'Icon',
  photoId: 'Photo',
  rules: 'Rules',
  categoryId: 'Category',
  color: 'Colour',
  // Default rules.
  assetClass: 'Instrument',
  symbols: 'Symbols',
  target: 'Targets',
  stop: 'Stops',
  mode: 'Charge',
  applyOn: 'Charged on',
  commission: 'Commission',
  fee: 'Fee',
};

/** The field's name, or nothing for a row that changed no one field (created, deleted, undone). */
export function fieldLabel(row: HistoryRow): string | null {
  if (row.field === undefined) return null;
  return FIELD_LABEL[row.field] ?? row.field;
}

/** Text to show, and what a screen reader says for it (the two differ only for a hidden amount). */
export interface Shown {
  text: string;
  label: string;
}
const words = (text: string): Shown => ({ text, label: text });
export const NONE = words('None');

/** What the reader needs to put names and currencies to the ids history keeps. */
export interface HistoryLookups {
  display: Display;
  baseCurrency: string;
  accounts: ReadonlyMap<string, Account>;
  strategies: ReadonlyMap<string, string>;
  tags: ReadonlyMap<string, string>;
  categories: ReadonlyMap<string, string>;
  /**
   * The currency a record's money is in, by `type:id`: a trade's P&L
   * currency, an account's own, a rule's or an adjustment's account's. A
   * record that is gone reads in the base currency.
   */
  currencyOf: ReadonlyMap<string, string>;
}

const MONEY_FIELDS = new Set([
  'fees',
  'swap',
  'startingBalance',
  'amount',
  'commission',
  'fee',
]);
/** Money with a sign of its own: a credit or a debit. */
const SIGNED_FIELDS = new Set(['swap', 'amount']);
const COUNT_FIELDS = new Set(['fills', 'trades', 'rules']);
const LEVEL_FIELDS = new Set(['targets', 'stops', 'target', 'stop']);

const UNIT_WORD: Partial<Record<LevelUnit, readonly [string, string]>> = {
  ticks: ['tick', 'ticks'],
  points: ['point', 'points'],
  pips: ['pip', 'pips'],
};
/** "4 pip levels": a side too long to list. */
const UNIT_NOUN: Record<LevelUnit, string> = {
  price: 'price',
  movement: 'price movement',
  ticks: 'tick',
  points: 'point',
  pips: 'pip',
  amount: 'amount',
};

/** "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Joins shown parts, the text and the spoken words each. */
function joined(parts: readonly Shown[]): Shown {
  return {
    text: listed(parts.map((p) => p.text)),
    label: listed(parts.map((p) => p.label)),
  };
}

/**
 * A side of levels in a few words: "8 points", "30 and 25 pips", "$300.00",
 * "1.085 and 1.09", "5 from entry"; past three levels, "4 pip levels". An
 * amount goes through Display, so Privacy hides it.
 */
function levelsSummary(json: string, money: (cents: number) => Shown): Shown {
  let side: { unit: LevelUnit; levels: { value: number }[] };
  try {
    side = JSON.parse(json) as typeof side;
  } catch {
    return words(json);
  }
  const values = (side.levels ?? []).map((l) => l.value);
  if (values.length === 0) return NONE;
  if (values.length > 3)
    return words(
      `${values.length} ${UNIT_NOUN[side.unit] ?? side.unit} levels`,
    );
  if (side.unit === 'amount')
    return joined(values.map((v) => money(toCents(Math.abs(v)))));
  const list = listed(values.map(plain));
  if (side.unit === 'price') return words(list);
  if (side.unit === 'movement') return words(`${list} from entry`);
  const [one, many] = UNIT_WORD[side.unit] ?? [side.unit, side.unit];
  const last = values.at(-1)!;
  return words(`${list} ${values.length > 1 ? many : plural(last, one, many)}`);
}

const names = (
  ids: string,
  lookup: ReadonlyMap<string, string>,
  gone: string,
): Shown =>
  words(
    ids
      .split(',')
      .filter((id) => id !== '')
      .map((id) => lookup.get(id) ?? gone)
      .join(', '),
  );

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One side of a change (`oldValue` or `newValue`) as words. */
export function shownValue(
  row: HistoryRow,
  side: 'oldValue' | 'newValue',
  ctx: HistoryLookups,
): Shown {
  const v = row[side];
  const field = row.field ?? '';
  if (field === 'symbols' && (v === '' || v === null || v === undefined))
    return words('All symbols');
  if (v === null || v === undefined || v === '') return NONE;
  const currency =
    ctx.currencyOf.get(`${row.type}:${row.entityId}`) ?? ctx.baseCurrency;
  const money = (cents: number, signed = false): Shown =>
    ctx.display.cash(cents, signed, currency);

  if (typeof v === 'boolean') return words(v ? 'Yes' : 'No');
  if (MONEY_FIELDS.has(field) && typeof v === 'number')
    return money(v, SIGNED_FIELDS.has(field));
  if (COUNT_FIELDS.has(field) && typeof v === 'number')
    return words(v.toLocaleString('en-US'));
  if (LEVEL_FIELDS.has(field) && typeof v === 'string')
    return levelsSummary(v, (cents) => money(cents));
  const s = String(v);
  switch (field) {
    case 'rating':
      return words(`${s} of 5`);
    case 'accountId':
      return words(ctx.accounts.get(s)?.name ?? 'Removed account');
    case 'strategyIds':
      return names(s, ctx.strategies, 'Removed strategy');
    case 'tagIds':
      return names(s, ctx.tags, 'Removed tag');
    case 'categoryId':
      return names(s, ctx.categories, 'Removed category');
    case 'noteId':
    case 'photoId': {
      const thing = field === 'noteId' ? 'note' : 'photo';
      const other = row[side === 'oldValue' ? 'newValue' : 'oldValue'];
      const replaced =
        side === 'newValue' && other !== null && other !== undefined;
      return words(replaced ? `A new ${thing}` : `A ${thing}`);
    }
    case 'type':
      return words(ACCOUNT_TYPES.find((t) => t.value === s)?.label ?? s);
    case 'costMethod':
      return words(COST_METHODS.find((m) => m.value === s)?.short ?? s);
    case 'icon':
      return words(ICON_LABEL[s as keyof typeof ICON_LABEL] ?? s);
    case 'color': {
      const swatch = swatchName(s);
      return words(swatch === 'Custom colour' ? `Custom colour ${s}` : swatch);
    }
    case 'assetClass':
      return words(ASSET_TYPES.find((a) => a.id === s)?.label ?? s);
    case 'symbols':
      return words(s.split(',').join(', '));
    case 'mode':
      return words(s === 'per-contract' ? 'Per contract' : 'Per execution');
    case 'applyOn':
      return words(
        s === 'entry' ? 'Entries' : s === 'exit' ? 'Exits' : 'Every execution',
      );
    case 'at':
      return /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? words(
            onTradingDate(s, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
          )
        : words(s);
    case 'kind':
    case 'status':
      return words(capital(s));
    default:
      return words(s);
  }
}

/** "25 Nov, 16:42 GMT−5": the row's time in the profile zone, with that zone's offset at the time. */
export function historyTime(
  iso: string,
  timeZone: string,
): { when: string; offset: string } {
  const date = new Date(iso);
  let when: string;
  try {
    when = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    when = iso;
  }
  return { when, offset: gmtLabel(timeZone, date) };
}

/** "New York time" for America/New_York; a zone with no city reads as its offset. */
export function zoneWords(timeZone: string): string {
  const parts = timeZone.split('/');
  const city =
    parts.length > 1 && parts[0] !== 'Etc' ? parts.at(-1) : undefined;
  return city ? `${city.replaceAll('_', ' ')} time` : gmtLabel(timeZone);
}

/** A strategy's photo is stored a moment after the strategy is made: within this, it reads as part of the creation. */
const FOLD_MS = 10_000;

/**
 * Leaves out the photo row that only completes a creation: a strategy made
 * with a photo is written, then its photo is stored and linked, so history
 * holds a created row and, a moment later, a photo set from none. Read
 * together, they are one creation.
 */
export function foldCreations(rows: readonly HistoryRow[]): HistoryRow[] {
  const made = new Map<string, number>();
  for (const r of rows)
    if (r.type === 'strategy' && r.action === 'created')
      made.set(r.entityId, Date.parse(r.at));
  return rows.filter((r) => {
    if (
      r.type !== 'strategy' ||
      r.action !== 'edited' ||
      r.field !== 'photoId' ||
      (r.oldValue !== null && r.oldValue !== undefined)
    )
      return true;
    const created = made.get(r.entityId);
    if (created === undefined) return true;
    const after = Date.parse(r.at) - created;
    return !(after >= 0 && after <= FOLD_MS);
  });
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Newest first. Rows of one write share their time: they read record by
 * record, and a record's fields in the order of their names.
 */
export function orderRows(rows: readonly HistoryRow[]): HistoryRow[] {
  return [...rows].sort(
    (a, b) =>
      cmp(b.at, a.at) ||
      a.label.localeCompare(b.label) ||
      cmp(a.entityId, b.entityId) ||
      (fieldLabel(a) ?? '').localeCompare(fieldLabel(b) ?? '') ||
      cmp(a.id, b.id),
  );
}

export interface HistoryFilters {
  q: string;
  type?: HistoryType;
  action?: HistoryAction;
  source?: HistorySource;
}

/** Whether a row is in view: the search over its type, identifier and field (B29), and each filter. */
export function matches(row: HistoryRow, f: HistoryFilters): boolean {
  if (f.type && row.type !== f.type) return false;
  if (f.action && row.action !== f.action) return false;
  if (f.source && row.source !== f.source) return false;
  const q = f.q.trim().toLowerCase();
  if (q === '') return true;
  return [TYPE_LABEL[row.type], row.label, fieldLabel(row) ?? '']
    .join('\n')
    .toLowerCase()
    .includes(q);
}
