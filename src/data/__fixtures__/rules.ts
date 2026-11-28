import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { planImport } from '@/domain/import/plan';
import { resolveInstrument } from '@/domain/instruments';
import type { HistoryRow, Side } from '@/domain/types';
import { KeelDb } from '../local/db';
import { createLocalRepository } from '../local/local-repository';
import type { NewAccount, NewFeeRule, NewTargetRule } from '../repository';
import { fixtureSample } from './sample';

/** Test kit for the default rules: a repository on a fresh database with a clock that moves a second per reading. */
export const M = 'mine';
export const NOW = '2026-11-19T21:00:00.000Z';
export const DAY = '2026-11-19';
export const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price,Commission,Fees\n';

const ES = resolveInstrument('ESZ5')!;

export async function rulesSetup() {
  const indexedDB = new IDBFactory();
  let clock = Date.parse(NOW);
  let n = 0;
  let planned = 0;
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    // Every reading is a second later: rules and rows made in turn order by their time.
    now: () => new Date((clock += 1000)),
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const account = (name: string, over: Partial<NewAccount> = {}) =>
    repo.accounts.create(M, {
      name,
      broker: 'b',
      type: 'live',
      currency: 'USD',
      startingBalance: 0,
      status: 'active',
      ...over,
    });
  const acc = await account('Futures');

  /** A manual trade in `symbol`; each fill is `[side, qty, price, minute, costs?]`. */
  const manual = (
    accountId: string,
    fills: [
      Side,
      number,
      number,
      string,
      { commission?: number; fees?: number }?,
    ][],
    symbol = 'ESZ5',
  ) =>
    repo.trades.createManual(M, {
      accountId,
      instrument: symbol === 'ESZ5' ? ES : resolveInstrument(symbol)!,
      fills: fills.map(([side, qty, price, hhmm, c]) => ({
        time: `${DAY}T${hhmm}:00.000Z`,
        side,
        qty,
        price,
        commission: c?.commission ?? 0,
        fees: c?.fees ?? 0,
      })),
    });
  /** A closed long: in at `entry`, out at `exit`. */
  const trip = (
    accountId: string,
    qty: number,
    entry: number,
    exit: number,
    symbol = 'ESZ5',
    hhmm: [string, string] = ['14:30', '14:40'],
  ) =>
    manual(
      accountId,
      [
        ['buy', qty, entry, hhmm[0]],
        ['sell', qty, exit, hhmm[1]],
      ],
      symbol,
    );

  /** Plans the file as of `now`: by default 2026-11-21, a minute later for each plan. */
  const plan = async (
    text: string,
    importId: string,
    accountId = acc.id,
    now = new Date(Date.UTC(2026, 10, 21, 0, planned++)).toISOString(),
  ) => {
    const parsed = parseCsv(text);
    return planImport(
      parsed,
      guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
      await repo.imports.context(M, accountId),
      { importId, fileName: `${importId}.csv`, now },
    );
  };
  const commit = async (
    text: string,
    importId: string,
    accountId = acc.id,
    now?: string,
  ) => repo.imports.commit(M, await plan(text, importId, accountId, now));

  /** History rows without their ids and times, filtered by type. */
  const rows = async (...types: HistoryRow['type'][]) =>
    (await db.history.where('workspaceId').equals(M).toArray())
      .filter((r) => types.includes(r.type))
      .map((r) => ({
        type: r.type,
        action: r.action,
        source: r.source,
        entityId: r.entityId,
        label: r.label,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
      }))
      .sort(
        (a, b) =>
          a.entityId.localeCompare(b.entityId) ||
          (a.field ?? '').localeCompare(b.field ?? '') ||
          a.action.localeCompare(b.action),
      );
  const rowCount = async () =>
    db.history.where('workspaceId').equals(M).count();

  return {
    repo,
    db,
    acc,
    account,
    manual,
    trip,
    plan,
    commit,
    rows,
    rowCount,
  };
}

export const targetInput = (
  accountId: string,
  over: Partial<NewTargetRule> = {},
): NewTargetRule => ({
  accountId,
  assetClass: 'future',
  symbols: [],
  target: { unit: 'price', levels: [{ value: 6010, pct: 100 }] },
  stop: { unit: 'price', levels: [{ value: 5995, pct: 100 }] },
  ...over,
});

export const feeInput = (
  accountId: string,
  over: Partial<NewFeeRule> = {},
): NewFeeRule => ({
  accountId,
  assetClass: 'future',
  symbols: [],
  mode: 'per-execution',
  applyOn: 'all',
  commission: 150,
  fee: 20,
  ...over,
});
