import { differenceInCalendarDays, parseISO } from 'date-fns';
import { beforeAll, describe, expect, test } from 'vitest';
import { defaultMetricContext } from '@/domain/metrics/context';
import { dailyPnl } from '@/domain/metrics/days';
import { summarize } from '@/domain/metrics/summary';
import { evaluateProp } from '@/domain/prop/evaluate';
import { closedInOrder } from '@/domain/trade-status';
import { toCents } from '@/domain/money';
import { localDate, localParts } from '@/domain/time';
import type { Trade } from '@/domain/types';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  sampleEndDate,
  type SampleWorkspace,
} from './generate';

const NY = 'America/New_York';

describe('sample workspace generator', () => {
  let s: SampleWorkspace;
  beforeAll(() => {
    s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  });

  test('deterministic in seed and end date', () => {
    expect(
      generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' }),
    ).toEqual(s);
    expect(
      generateSampleWorkspace({ seed: 7, endDate: '2026-11-19' }).trades,
    ).not.toEqual(s.trades);
  });

  test('sampleEndDate is the last weekday before today in New York', () => {
    expect(sampleEndDate('2026-11-20T15:00:00.000Z')).toBe('2026-11-19');
    expect(sampleEndDate('2026-11-23T15:00:00.000Z')).toBe('2026-11-20');
    expect(sampleEndDate('2026-11-22T03:00:00.000Z')).toBe('2026-11-20');
  });

  test('three accounts; the prop evaluation has rules and is not breached', () => {
    expect(s.accounts.map((a) => [a.id, a.type])).toEqual([
      ['sample-futures', 'live'],
      ['sample-forex-prop', 'prop-evaluation'],
      ['sample-multi', 'live'],
    ]);
    expect(s.accounts.map((a) => a.startingBalance)).toEqual([
      5_000_000, 10_000_000, 2_500_000,
    ]);
    const prop = s.accounts[1]!;
    expect(prop.propRules).toEqual({
      firm: 'Sample prop firm',
      phase: 'evaluation',
      profitTarget: 800_000,
      dailyLossLimit: 500_000,
      maxDrawdown: 1_000_000,
      drawdownType: 'trailing',
      minTradingDays: 5,
      consistencyPct: 0.4,
    });
    const propTrades = s.trades.filter((t) => t.accountId === prop.id);
    for (const seed of [5, 99, SAMPLE_SEED]) {
      const w = generateSampleWorkspace({ seed, endDate: '2026-11-19' });
      const p = w.accounts[1]!;
      expect(
        evaluateProp({
          startingBalance: p.startingBalance,
          rules: p.propRules!,
          timeZone: NY,
          now: '2026-11-19T22:00:00.000Z',
          trades: w.trades.filter((t) => t.accountId === p.id),
        }).overall,
      ).not.toBe('breached');
    }
    // The evaluation trades only in the last 12 weeks.
    expect(
      differenceInCalendarDays(
        parseISO('2026-11-19'),
        parseISO(localDate(propTrades[0]!.openedAt, NY)),
      ),
    ).toBeLessThanOrEqual(84);
    expect(propTrades.length).toBeGreaterThan(50);
  });

  test('the prop evaluation sits mid-way to its target with consistency met', () => {
    const prop = s.accounts[1]!;
    const status = evaluateProp({
      startingBalance: prop.startingBalance,
      rules: prop.propRules!,
      timeZone: NY,
      now: '2026-11-19T22:00:00.000Z',
      trades: s.trades.filter((t) => t.accountId === prop.id),
    });
    const target = prop.propRules!.profitTarget;
    expect(status.profit.current).toBeGreaterThanOrEqual(0.4 * target);
    expect(status.profit.current).toBeLessThanOrEqual(0.7 * target);
    expect(status.overall).toBe('in-progress');
    expect(status.consistency?.met).toBe(true);
  });

  test('live account returns are plausible and stock size fits the account', () => {
    for (const id of ['sample-futures', 'sample-multi']) {
      const acct = s.accounts.find((a) => a.id === id)!;
      const net = s.trades
        .filter((t) => t.accountId === id && t.status === 'closed')
        .reduce((sum, t) => sum + t.net, 0);
      expect(net).not.toBe(0);
      expect(net / acct.startingBalance).toBeGreaterThanOrEqual(-0.15);
      expect(net / acct.startingBalance).toBeLessThanOrEqual(0.25);
    }
    for (const t of s.trades.filter(
      (x) => x.instrument.assetClass === 'stock',
    )) {
      const acct = s.accounts.find((a) => a.id === t.accountId)!;
      expect(t.avgEntry * t.maxPosition).toBeLessThanOrEqual(
        (4 * acct.startingBalance) / 100,
      );
    }
  });

  test('the five latest closed trades carry a strategy, kept and broken rules', () => {
    const latest = closedInOrder(s.trades).slice(-5);
    expect(latest).toHaveLength(5);
    let kept = 0;
    let broken = 0;
    let ungraded = 0;
    for (const c of latest) {
      const t = s.trades.find((x) => x.id === c.id)!;
      const graded = t.ruleChecks.filter((r) => r.followed !== null);
      if (t.strategyId === undefined || graded.length === 0) ungraded += 1;
      else if (graded.some((r) => r.followed === false)) {
        broken += 1;
        const mistakes = new Set(
          s.tags.filter((x) => x.category === 'mistake').map((x) => x.id),
        );
        expect(t.tagIds.some((id) => mistakes.has(id))).toBe(true);
      } else kept += 1;
    }
    expect(broken).toBeGreaterThanOrEqual(1);
    expect(kept).toBeGreaterThanOrEqual(2);
    expect(ungraded).toBeLessThanOrEqual(1);
  });

  test('end date is validated; a weekend rolls back to Friday', () => {
    expect(() =>
      generateSampleWorkspace({ seed: 1, endDate: 'yesterday' }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      generateSampleWorkspace({ seed: 1, endDate: '2026-02-30' }),
    ).toThrow(/YYYY-MM-DD/);
    const sat = generateSampleWorkspace({ seed: 1, endDate: '2026-11-21' });
    expect(sat.endDate).toBe('2026-11-20');
    expect(sat).toEqual(
      generateSampleWorkspace({ seed: 1, endDate: '2026-11-20' }),
    );
  });

  test('about 1,200 trades over about six months, across five asset classes', () => {
    expect(s.trades.length).toBeGreaterThanOrEqual(1100);
    expect(s.trades.length).toBeLessThanOrEqual(1300);
    expect(
      differenceInCalendarDays(
        parseISO('2026-11-19'),
        parseISO(localDate(s.trades[0]!.openedAt, NY)),
      ),
    ).toBeGreaterThanOrEqual(170);
    expect(new Set(s.trades.map((t) => t.instrument.assetClass))).toEqual(
      new Set(['future', 'forex', 'stock', 'option', 'crypto']),
    );
    expect(s.trades.map((t) => t.serial)).toEqual(
      s.trades.map((_, i) => i + 1),
    );
    expect(
      s.trades.every(
        (t) =>
          t.pnlCurrency === 'USD' && t.fees > 0 && t.workspaceId === 'sample',
      ),
    ).toBe(true);
  });

  test('trades happen inside the New York session windows', () => {
    for (const t of s.trades) {
      expect(localParts(t.openedAt, NY).weekday).toBeGreaterThanOrEqual(1);
      expect(localParts(t.openedAt, NY).weekday).toBeLessThanOrEqual(5);
      expect(localDate(t.openedAt, NY) <= '2026-11-19').toBe(true);
      if (t.executions.some((e) => e.id.endsWith(':expiry'))) continue;
      const parts = [t.openedAt, t.closedAt ?? t.openedAt].map((iso) => {
        const w = new Date(iso).toLocaleString('en-GB', {
          timeZone: NY,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        });
        const [h = 0, m = 0] = w.split(':').map(Number);
        return h * 60 + m;
      });
      const [from, to] =
        t.instrument.assetClass === 'forex'
          ? [3 * 60, 11 * 60 + 30]
          : [9 * 60 + 30, 16 * 60];
      for (const p of parts) {
        expect(p).toBeGreaterThanOrEqual(from);
        expect(p).toBeLessThanOrEqual(to);
      }
    }
  });

  test('partial exits, scale-ins, open positions and an expired option', () => {
    const sides = (t: Trade) => t.executions.map((e) => e.side);
    expect(
      s.trades.filter((t) => t.executions.length > 2).length,
    ).toBeGreaterThanOrEqual(150);
    expect(s.trades.some((t) => sides(t)[0] === sides(t)[1])).toBe(true);
    const open = s.trades.filter((t) => t.status === 'open');
    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(open.length).toBeLessThanOrEqual(5);
    expect(
      s.trades.some(
        (t) =>
          t.executions.some((e) => e.id.endsWith(':expiry')) && t.avgExit === 0,
      ),
    ).toBe(true);
  });

  test('fees follow each asset class schedule', () => {
    const fills = s.trades.flatMap((t) =>
      t.executions.map((e) => ({ e, cls: t.instrument.assetClass })),
    );
    for (const { e, cls } of fills) {
      if (e.id.endsWith(':expiry')) continue;
      if (cls === 'future') {
        expect(e.commission).toBe(toCents(e.qty * 2.25));
        expect(e.fees).toBe(toCents(e.qty * 0.35));
      } else if (cls === 'forex') {
        expect(e.commission).toBe(toCents(e.qty * 3.5));
      } else if (cls === 'stock') {
        expect(e.commission).toBe(Math.max(100, toCents(e.qty * 0.005)));
      } else if (cls === 'option') {
        expect(e.commission).toBe(toCents(e.qty * 0.65));
      } else {
        expect(e.fees).toBe(toCents(e.qty * e.price * 0.001));
      }
    }
  });

  test('every reference resolves', () => {
    const strategies = new Map(s.strategies.map((x) => [x.id, x]));
    const tags = new Set(s.tags.map((x) => x.id));
    const tradeIds = new Set(s.trades.map((t) => t.id));
    const journal = new Map(s.journal.map((j) => [j.id, j]));
    expect(tradeIds.size).toBe(s.trades.length);
    expect(journal.size).toBe(s.journal.length);

    // Strategies, tags and journal kinds are complete.
    expect(s.strategies).toHaveLength(4);
    for (const st of s.strategies) {
      expect(new Set(st.rules.map((r) => r.group))).toEqual(
        new Set(['entry', 'exit', 'risk', 'management']),
      );
      expect(st.checklist.length).toBeGreaterThanOrEqual(3);
      expect(st.checklist.length).toBeLessThanOrEqual(5);
      expect(st.workspaceId).toBe('sample');
    }
    expect(new Set(s.tags.map((x) => x.category))).toEqual(
      new Set(['setup', 'mistake', 'emotion', 'custom']),
    );
    expect(new Set(s.journal.map((j) => j.kind))).toEqual(
      new Set(['daily-review', 'pre-market', 'weekly-recap', 'note']),
    );
    expect(
      s.journal.filter((j) => j.kind === 'weekly-recap').length,
    ).toBeGreaterThanOrEqual(20);
    expect(new Set(s.journal.map((j) => j.folder))).toEqual(
      new Set(['Daily reviews', 'Plans', 'Weekly recaps', 'Trade notes']),
    );

    // Trades.
    const withStrategy = s.trades.filter((t) => t.strategyId !== undefined);
    expect(withStrategy.length / s.trades.length).toBeGreaterThan(0.78);
    expect(withStrategy.length / s.trades.length).toBeLessThan(0.92);
    for (const t of s.trades) {
      if (t.strategyId === undefined) {
        expect(t.ruleChecks).toEqual([]);
      } else {
        const st = strategies.get(t.strategyId)!;
        expect(st).toBeDefined();
        expect(t.ruleChecks.map((c) => c.ruleId)).toEqual(
          st.rules.map((r) => r.id),
        );
      }
      for (const id of t.tagIds) expect(tags.has(id)).toBe(true);
      if (t.noteId !== undefined) {
        const note = journal.get(t.noteId)!;
        expect(note.kind).toBe('note');
        expect(note.linkedTradeIds).toEqual([t.id]);
      }
    }

    // Journal.
    for (const j of s.journal) {
      for (const id of j.linkedTradeIds) expect(tradeIds.has(id)).toBe(true);
      expect(j.workspaceId).toBe('sample');
      expect((j.body as { type: string }).type).toBe('doc');
    }
    const notes = s.journal.filter((j) => j.kind === 'note');
    expect(notes.length).toBeGreaterThanOrEqual(35);
    expect(notes.length).toBeLessThanOrEqual(45);
    for (const n of notes) {
      expect(n.linkedTradeIds).toHaveLength(1);
      const t = s.trades.find((x) => x.id === n.linkedTradeIds[0])!;
      expect(t.noteId).toBe(n.id);
    }
    expect(s.trades.filter((t) => t.noteId !== undefined)).toHaveLength(
      notes.length,
    );
  });

  test('stops, targets and risk are set on most trades', () => {
    const stop = s.trades.filter((t) => t.plannedStop !== undefined);
    const target = s.trades.filter((t) => t.plannedTarget !== undefined);
    expect(stop.length / s.trades.length).toBeGreaterThan(0.78);
    expect(stop.length / s.trades.length).toBeLessThan(0.92);
    expect(target.length / s.trades.length).toBeGreaterThan(0.5);
    expect(target.length / s.trades.length).toBeLessThan(0.7);
    for (const t of stop) expect(t.initialRisk!).toBeGreaterThan(0);
    for (const t of s.trades)
      if (t.plannedStop === undefined) expect(t.initialRisk).toBeUndefined();
  });

  test('MAE and MFE bracket the result', () => {
    const closed = s.trades.filter((t) => t.status === 'closed');
    expect(
      closed.filter((t) => t.mae !== undefined).length / closed.length,
    ).toBeGreaterThanOrEqual(0.9);
    for (const t of closed)
      if (t.mae !== undefined)
        expect(
          t.mae <= Math.min(0, t.gross) && t.mfe! >= Math.max(0, t.gross),
        ).toBe(true);
  });

  test('looks like a real trader: a modest edge and real losing days', () => {
    const ctx = defaultMetricContext(NY);
    const sum = summarize(s.trades, ctx);
    expect(sum.winRate!).toBeGreaterThan(0.42);
    expect(sum.winRate!).toBeLessThan(0.62);
    expect(sum.profitFactor!).toBeGreaterThan(1.05);
    expect(sum.profitFactor!).toBeLessThan(2.5);
    expect(sum.netPnl).toBeGreaterThan(0);
    expect(sum.ruleAdherence!).toBeGreaterThan(0.7);
    expect(sum.ruleAdherence!).toBeLessThan(0.9);
    const days = dailyPnl(s.trades, ctx);
    expect(
      days.filter((d) => d.net < 0).length / days.length,
    ).toBeGreaterThanOrEqual(0.25);
  });
});
