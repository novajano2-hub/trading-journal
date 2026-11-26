import { localParts } from '@/domain/time';
import { csvField, decimalOf } from '@/lib/csv';
import type { Trade } from '@/domain/types';
import { dayOfTrade } from './day-log';
import { COLUMN_LABELS, type ColumnId } from './trade-columns';
import {
  heldMs,
  netRoiOf,
  plannedR,
  rOf,
  rowFacts,
  statusOf,
  type RowEnv,
} from './trade-rows';

/** What the export needs to name things; its time zone is the trader's. */
export type CsvEnv = RowEnv;

const two = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm' in the zone. */
function clock(iso: string, timeZone: string): string {
  const p = localParts(iso, timeZone);
  return `${p.date} ${two(p.hour)}:${two(p.minute)}`;
}

const fixed = (n: number | undefined, digits: number) =>
  n === undefined ? '' : n.toFixed(digits);

/**
 * The trades as CSV, one column per id, in that order. The values are the real
 * ones (a file is the trader's own data, so Privacy never touches it): money as
 * plain decimals in the trade's own currency, times as `YYYY-MM-DD HH:mm` in
 * the trader's time zone, lists joined with "; ". Lines end in CRLF.
 */
export function tradesCsv(
  trades: readonly Trade[],
  columns: readonly ColumnId[],
  env: CsvEnv,
): string {
  const facts = rowFacts(env);
  const value = (t: Trade, id: ColumnId): string => {
    switch (id) {
      case 'open':
        return clock(t.openedAt, env.timeZone);
      case 'close':
        return t.closedAt === undefined ? '' : clock(t.closedAt, env.timeZone);
      case 'instrument':
        return t.instrument.symbol;
      case 'account':
        return facts.accountName(t);
      case 'side':
        return t.direction === 'long' ? 'Long' : 'Short';
      case 'qty':
        return String(t.maxPosition);
      case 'entry':
        return String(t.avgEntry);
      case 'exit':
        return t.avgExit === undefined ? '' : String(t.avgExit);
      case 'gross':
        return decimalOf(t.gross);
      case 'fees':
        return decimalOf(t.fees);
      case 'net':
        return decimalOf(t.net);
      case 'roi': {
        const roi = netRoiOf(t);
        return fixed(roi === undefined ? undefined : roi * 100, 2);
      }
      case 'realizedR':
        return fixed(rOf(t, 'net'), 2);
      case 'plannedR':
        return fixed(plannedR(t), 2);
      case 'duration': {
        const ms = heldMs(t);
        return ms === undefined ? '' : String(Math.round(ms / 1000));
      }
      case 'strategies':
        return facts.strategyNames(t).join('; ');
      case 'tags':
        return facts
          .tagsOf(t)
          .map((x) => x.name)
          .join('; ');
      case 'mistakes':
        return facts.mistakesOf(t).join('; ');
      case 'rules': {
        const r = facts.rules(t);
        return r.checked === 0 ? '' : `${r.kept} of ${r.checked}`;
      }
      case 'rating':
        return t.rating === undefined ? '' : String(t.rating);
      case 'reviewed':
        return t.reviewed === true ? 'Yes' : 'No';
      case 'status':
        return statusOf(t, env.ctx);
      case 'ticker':
        return t.instrument.root;
      case 'day':
        return dayOfTrade(t, env.timeZone);
    }
  };
  const header = columns.map((id) => {
    const l = COLUMN_LABELS[id];
    return csvField(l.csv ?? l.label);
  });
  const rows = trades.map((t) =>
    columns.map((id) => csvField(value(t, id))).join(','),
  );
  return [header.join(','), ...rows].join('\r\n');
}
