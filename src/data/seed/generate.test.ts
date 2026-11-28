import { createHash } from 'node:crypto';
import { differenceInCalendarDays, format, parse, parseISO } from 'date-fns';
import { beforeAll, describe, expect, test } from 'vitest';
import { defaultMetricContext } from '@/domain/metrics/context';
import { dailyPnl } from '@/domain/metrics/days';
import { summarize } from '@/domain/metrics/summary';
import { evaluateProp } from '@/domain/prop/evaluate';
import { spendItems, totals } from '@/domain/prop/finance';
import { closedInOrder } from '@/domain/trade-status';
import { toCents } from '@/domain/money';
import { localDate, localParts } from '@/domain/time';
import { mistakeTags } from '@/domain/metrics/mistakes';
import { strategyRules, type Trade } from '@/domain/types';
import { gridStep, streaks } from '@/domain/tracker/summary';
import { buildGroupedTrade } from '@/domain/grouping';
import {
  levelPrice,
  levelProblems,
  levelValueAt,
  plannedRMultiple,
  sidesOf,
  tradeRisk,
} from '@/domain/risk';
import { feeRuleError } from '@/domain/rules/fee-rules';
import { pickRule } from '@/domain/rules/match';
import { targetRuleError } from '@/domain/rules/target-rules';
import { defaultSample } from '../local/context';
import { scoreHistory } from '../routine';
import { DAY_MS, nyMs, parseYmd, ymd } from './calendar';
import {
  generateSampleBase,
  generateSampleWorkspace,
  SAMPLE_SEED,
  sampleEndDate,
  type SampleWorkspace,
} from './generate';

const NY = 'America/New_York';

/**
 * The v7 trades (seed SAMPLE_SEED, end 2026-11-19) that v8's grouping took:
 * two pairs merged, the first of each keeping its record, and one split.
 */
const MERGED = [
  [
    'sample-futures:ESZ6:sample-fill-02138',
    'sample-futures:ESZ6:sample-fill-02140',
  ],
  [
    'sample-futures:ESZ6:sample-fill-02209',
    'sample-futures:ESZ6:sample-fill-02212',
  ],
] as const;
const SPLIT = 'sample-futures:MESZ6:sample-fill-01564';
/** Their v7 figures and fills, pinned before v8. */
const V7_FIGURES: Record<
  string,
  { gross: number; fees: number; net: number; fills: string[] }
> = {
  'sample-futures:ESZ6:sample-fill-02138': {
    gross: 22500,
    fees: 520,
    net: 21980,
    fills: ['sample-fill-02138', 'sample-fill-02139'],
  },
  'sample-futures:ESZ6:sample-fill-02140': {
    gross: -25000,
    fees: 520,
    net: -25520,
    fills: ['sample-fill-02140', 'sample-fill-02142'],
  },
  'sample-futures:ESZ6:sample-fill-02209': {
    gross: 26250,
    fees: 520,
    net: 25730,
    fills: ['sample-fill-02209', 'sample-fill-02211'],
  },
  'sample-futures:ESZ6:sample-fill-02212': {
    gross: 12500,
    fees: 520,
    net: 11980,
    fills: ['sample-fill-02212', 'sample-fill-02215'],
  },
  'sample-futures:MESZ6:sample-fill-01564': {
    gross: 14000,
    fees: 2080,
    net: 11920,
    fills: [
      'sample-fill-01564',
      'sample-fill-01565',
      'sample-fill-01566',
      'sample-fill-01567',
    ],
  },
};

describe('sample workspace generator', () => {
  let s: SampleWorkspace;
  beforeAll(() => {
    s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  });

  test('the sample tracker shows every state', () => {
    const h = scoreHistory(s.tracker, s.days, s.trades, s.accounts, [], {
      timeZone: NY,
      baseCurrency: 'USD',
      now: new Date(nyMs(s.endDate, 20, 0)).toISOString(),
      today: s.endDate,
    });
    // With the trades pinned and the default rules, no two perfect days touch: best is 1 (R7).
    expect(streaks(h.days, h.today).best).toBeGreaterThanOrEqual(1);
    const steps = h.days.map((d) => gridStep(d));
    expect(steps).toContain(4);
    expect(steps.some((x) => x === 2 || x === 3)).toBe(true);
    expect(steps.some((x) => x === 0 || x === 1)).toBe(true);
    expect(h.days.some((d) => d.finished)).toBe(true);
    expect(h.scoreOn(s.endDate).finished).toBe(false);
  });

  test("the sample's today is live and has no session, so the Trade stage can start one", () => {
    const today = s.days.find((d) => d.id === s.endDate);
    expect(today).toBeDefined();
    expect(today!.session).toBeUndefined();
    expect(today!.finishedAt).toBeUndefined();
    expect(today!.locked).toBeUndefined();
    expect(today!.noteStartedAt).toBeDefined();
    expect(today!.ticks).toBeDefined();
  });

  test('every day record with a start stamp has a daily note on its date', () => {
    const stamped = s.days.filter((d) => d.noteStartedAt !== undefined);
    expect(stamped.length).toBeGreaterThan(0);
    for (const d of stamped)
      expect(
        s.journal.some(
          (j) =>
            j.kind === 'daily-review' &&
            j.date === d.id &&
            j.deletedAt === undefined,
        ),
      ).toBe(true);
  });

  test('every seeded daily-review entry records the daily review template', () => {
    const daily = s.journal.filter((j) => j.kind === 'daily-review');
    expect(daily.length).toBeGreaterThan(0);
    for (const j of daily) expect(j.templateId).toBe('template-daily-review');
  });

  test('every existing sample value is unchanged', () => {
    // The base is v7 whole (v7's own hash, every trade in it, below), and the
    // depth changes nothing of it but the trades, each checked against its v7
    // self here.
    const base = generateSampleBase({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    // v8 gives trades levels, a swap and a hand grouping. Strip them, and the
    // swap from the net, and every trade a merge or the split left alone is
    // its v7 self, by id. A trade saved in levels has left its single stop
    // and target (v9, as `applyTradePatch` drops them): its levels sit at
    // exactly those prices, its stop on the whole position, its first target
    // at the target.
    const touched = new Set<string>([...MERGED.flat(), SPLIT]);
    const v7ById = new Map(base.trades.map((t) => [t.id, t]));
    const kept = s.trades.filter(
      (t) => !touched.has(t.id) && !t.id.startsWith('split:'),
    );
    expect(kept).toHaveLength(base.trades.length - touched.size);
    let moved = 0;
    for (const t of kept) {
      const v7 = v7ById.get(t.id)!;
      const { targets, stops, swap, grouping, ...rest } = t;
      void grouping;
      const legacy: Pick<Trade, 'plannedStop' | 'plannedTarget'> = {};
      if (targets || stops) {
        expect(t.plannedStop, t.id).toBeUndefined();
        expect(t.plannedTarget, t.id).toBeUndefined();
        const stop = stops!.levels[0]!;
        expect(stops!.levels, t.id).toHaveLength(1);
        expect(stop.qty, t.id).toBe(t.maxPosition);
        expect(
          levelPrice(t, 'stop', stops!.unit, stop) - v7.plannedStop!,
        ).toBeCloseTo(0, 9);
        // An Amount is the money at the target, to the cent, so its price
        // follows the cents.
        const first = targets?.levels[0];
        if (targets?.unit === 'amount')
          expect(first!.value).toBe(
            levelValueAt(v7, 'target', 'amount', v7.plannedTarget!, first!.qty),
          );
        else if (targets)
          expect(
            levelPrice(t, 'target', targets.unit, first!) - v7.plannedTarget!,
          ).toBeCloseTo(0, 9);
        else expect(v7.plannedTarget, t.id).toBeUndefined();
        legacy.plannedStop = v7.plannedStop;
        if (v7.plannedTarget !== undefined)
          legacy.plannedTarget = v7.plannedTarget;
        moved++;
      }
      expect({ ...rest, ...legacy, net: t.net - (swap ?? 0) }, t.id).toEqual(
        v7,
      );
    }
    expect(moved).toBeGreaterThan(400);
    const baseHash = createHash('sha256')
      .update(
        JSON.stringify({
          accounts: base.accounts,
          strategies: base.strategies,
          tagCategories: base.tagCategories,
          tags: base.tags,
          trades: base.trades,
          journal: base.journal
            .filter((j) => !j.id.startsWith('routine-note-'))
            .map((j) => ({ ...j, templateId: undefined })),
          challenges: base.challenges.map(
            ({ strategyIds, breachReason, breachedOn, ...kept }) => {
              void [strategyIds, breachReason, breachedOn];
              return kept;
            },
          ),
        }),
      )
      .digest('hex');
    expect(baseHash).toBe(
      '08613e3b01d577685a0bf14a5686ffef7a84c944e8b31208864afdde8a67fbdd',
    );
    const { trades: baseTrades, ...baseRest } = base;
    const { trades: v8Trades, ...v8Rest } = s;
    void [baseTrades, v8Trades];
    expect({
      ...v8Rest,
      history: undefined,
      targetRules: undefined,
      feeRules: undefined,
      missedTrades: undefined,
    }).toEqual(baseRest);

    // The trades the grouping took carry v7's fills, costs and P&L between them.
    const byId = new Map(s.trades.map((t) => [t.id, t]));
    for (const [kept, gone] of MERGED) {
      expect(byId.has(gone)).toBe(false);
      const t = byId.get(kept)!;
      expect(t.grouping).toBe('manual');
      expect(t.executions.map((e) => e.id).sort()).toEqual(
        [...V7_FIGURES[kept]!.fills, ...V7_FIGURES[gone]!.fills].sort(),
      );
      for (const k of ['gross', 'fees', 'net'] as const)
        expect(t[k]).toBe(V7_FIGURES[kept]![k] + V7_FIGURES[gone]![k]);
    }
    const parts = s.trades.filter(
      (t) => t.id === SPLIT || t.id.startsWith('split:'),
    );
    expect(parts.map((t) => t.grouping)).toEqual(['manual', 'manual']);
    expect(parts.flatMap((t) => t.executions.map((e) => e.id)).sort()).toEqual(
      V7_FIGURES[SPLIT]!.fills,
    );
    for (const k of ['gross', 'fees', 'net'] as const)
      expect(parts.reduce((n, t) => n + t[k], 0)).toBe(V7_FIGURES[SPLIT]![k]);
  });

  test('the sample shows every new state', () => {
    const NOW = '2026-11-20T15:00:00.000Z';
    const w = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
      now: NOW,
    });
    const byId = new Map(w.trades.map((t) => [t.id, t]));

    // Levels on about a third of the trades: both sides on about half of
    // those, stops alone on the rest; each is valid, its stop side's loss is
    // the stored risk, and Planned R reads only with both sides.
    const levelled = w.trades.filter((t) => t.targets || t.stops);
    expect(levelled.length / w.trades.length).toBeGreaterThan(0.28);
    expect(levelled.length / w.trades.length).toBeLessThan(0.38);
    const both = levelled.filter((t) => t.targets && t.stops);
    const stopsOnly = levelled.filter((t) => !t.targets && t.stops);
    expect(both.length + stopsOnly.length).toBe(levelled.length);
    expect(both.length / levelled.length).toBeGreaterThan(0.4);
    expect(both.length / levelled.length).toBeLessThan(0.6);
    for (const t of levelled) {
      expect(levelProblems(t, sidesOf(t)), t.id).toEqual([]);
      expect(tradeRisk(t), t.id).toBe(t.initialRisk);
    }
    for (const t of stopsOnly) {
      expect(sidesOf(t).targets).toBeUndefined();
      expect(plannedRMultiple(t)).toBeUndefined();
    }
    for (const t of both) {
      expect(plannedRMultiple(t)!, t.id).toBeGreaterThanOrEqual(1);
      expect(plannedRMultiple(t)!, t.id).toBeLessThanOrEqual(6);
    }
    expect(both.some((t) => t.targets!.levels.length >= 2)).toBe(true);
    const units = new Set(
      levelled.flatMap((t) => [t.stops!.unit, t.targets?.unit]),
    );
    for (const unit of ['price', 'ticks', 'pips', 'amount'] as const)
      expect(units.has(unit), unit).toBe(true);

    // Two merged trades and one split, as the app's grouping builds them.
    const manual = w.trades.filter((t) => t.grouping === 'manual');
    expect(manual).toHaveLength(4);
    const opts = {
      workspaceId: 'sample',
      startSerial: 0,
      resolve: () => null,
      accountCurrency: () => 'USD',
      costMethodOf: () => 'fifo' as const,
    };
    for (const t of manual) {
      expect(buildGroupedTrade(t.executions, t, opts)).toEqual(t);
      expect(t.fees).toBe(
        t.executions.reduce((n, e) => n + e.commission + e.fees, 0),
      );
    }
    const part = manual.find((t) => t.id.startsWith('split:'))!;
    expect(part.serial).toBe(
      Math.max(...w.trades.filter((t) => t !== part).map((t) => t.serial)) + 1,
    );
    expect(new Set(w.trades.map((t) => t.serial)).size).toBe(w.trades.length);

    // Two rules of each kind (B53), as the Settings cards save them: one
    // naming symbols and a newer one for all symbols, so a symbol rule rules
    // its symbols over the newer all-symbols rule, which rules the rest (B15).
    expect(w.targetRules).toHaveLength(2);
    expect(w.feeRules).toHaveLength(2);
    const accounts = new Set(w.accounts.map((a) => a.id));
    for (const rule of [...w.targetRules, ...w.feeRules]) {
      expect(rule.workspaceId).toBe('sample');
      expect(accounts.has(rule.accountId)).toBe(true);
      expect(rule.symbols.every((x) => x === x.toUpperCase())).toBe(true);
    }
    for (const rule of w.targetRules) {
      expect(targetRuleError(rule)).toBeNull();
      expect(rule.target && rule.stop).toBeDefined();
    }
    for (const rule of w.feeRules) expect(feeRuleError(rule)).toBeNull();
    for (const rules of [w.targetRules, w.feeRules]) {
      const named = rules.filter((r) => r.symbols.length > 0);
      const all = rules.filter((r) => r.symbols.length === 0);
      expect([named.length, all.length]).toEqual([1, 1]);
      expect(all[0]!.accountId).toBe(named[0]!.accountId);
      expect(all[0]!.assetClass).toBe(named[0]!.assetClass);
      expect(all[0]!.createdAt > named[0]!.createdAt).toBe(true);
    }
    const futureOf = (root: string) =>
      w.trades.find(
        (t) => t.accountId === 'sample-futures' && t.instrument.root === root,
      )!;
    const [es, mes, nq] = [futureOf('ES'), futureOf('MES'), futureOf('NQ')];
    expect(pickRule(w.targetRules, es)!.symbols).toEqual(['ES']);
    expect(pickRule(w.targetRules, mes)!.symbols).toEqual([]);
    expect(pickRule(w.feeRules, mes)!.symbols).toEqual(['MES', 'MNQ']);
    expect(pickRule(w.feeRules, nq)!.symbols).toEqual([]);

    // Swap on the closed forex trades no note reads (a note of their own or
    // linking them, or a daily note on their day) and on nothing else: small,
    // charges and the same credits in pairs; the net carries it and the gross
    // does not.
    const linked = new Set(w.journal.flatMap((j) => j.linkedTradeIds));
    const daily = new Set(
      w.journal.flatMap((j) =>
        j.kind === 'daily-review' && j.date ? [j.date] : [],
      ),
    );
    const noted = (t: Trade) =>
      t.noteId !== undefined ||
      linked.has(t.id) ||
      daily.has(localDate(t.openedAt, NY));
    for (const t of w.trades) {
      expect(t.net, t.id).toBe(t.gross - t.fees + (t.swap ?? 0));
      const fx = t.instrument.assetClass === 'forex' && t.status === 'closed';
      expect(t.swap !== undefined, t.id).toBe(fx && !noted(t));
    }
    const swaps = w.trades.flatMap((t) =>
      t.swap === undefined ? [] : [t.swap],
    );
    expect(swaps.length).toBeGreaterThan(60);
    const charges = swaps.filter((x) => x < 0);
    expect(charges.length).toBeGreaterThan(20);
    expect(swaps.filter((x) => x > 0).length).toBe(charges.length);
    expect(swaps.some((x) => x === 0)).toBe(true);
    expect(swaps.reduce((n, x) => n + x, 0)).toBe(0);
    for (const x of swaps) expect(Math.abs(x)).toBeLessThanOrEqual(3_000);

    // One missed trade per strategy, with exactly the fields the form has.
    expect(w.missedTrades.map((m) => m.strategyId).sort()).toEqual(
      w.strategies.map((x) => x.id).sort(),
    );
    for (const m of w.missedTrades) {
      expect(Object.keys(m).sort()).toEqual([
        'at',
        'commission',
        'fees',
        'id',
        'price',
        'strategyId',
        'symbol',
        'workspaceId',
      ]);
      expect(m.workspaceId).toBe('sample');
      expect(m.symbol).not.toBe('');
      expect(m.price!).toBeGreaterThan(0);
      expect(Number.isSafeInteger(m.commission)).toBe(true);
      expect(Number.isSafeInteger(m.fees)).toBe(true);
      expect(new Date(m.at).toISOString()).toBe(m.at);
      expect(localDate(m.at, NY) <= w.endDate).toBe(true);
    }

    // History for those edits, stamped in the hours before the seed time
    // and after the last fill, so the 30-day purge keeps them for a month.
    const lastFill = Math.max(
      ...w.trades.flatMap((t) => t.executions.map((e) => Date.parse(e.time))),
    );
    expect(new Set(w.history.map((r) => r.id)).size).toBe(w.history.length);
    for (const r of w.history) {
      expect(r.workspaceId).toBe('sample');
      expect(r.source).toBe('you');
      expect(Date.parse(r.at)).toBeLessThan(Date.parse(NOW));
      expect(Date.parse(r.at)).toBeGreaterThan(lastFill);
      expect(Date.parse(NOW) - Date.parse(r.at)).toBeLessThan(6 * 3_600_000);
    }
    const rows = (action: string, field?: string) =>
      w.history.filter(
        (r) =>
          r.action === action && (field === undefined || r.field === field),
      );
    const created = rows('created');
    // Made in turn: the symbol rules, then the all-symbols rules.
    const ruleOrder = [
      ['target-rule', w.targetRules[0]!],
      ['fee-rule', w.feeRules[0]!],
      ['target-rule', w.targetRules[1]!],
      ['fee-rule', w.feeRules[1]!],
    ] as const;
    expect(created.map((r) => [r.type, r.entityId])).toEqual(
      ruleOrder.map(([type, rule]) => [type, rule.id]),
    );
    ruleOrder.forEach(([, rule], i) =>
      expect(rule.createdAt).toBe(created[i]!.at),
    );
    const merged = rows('merged', 'fills');
    expect(merged).toHaveLength(4);
    for (const [kept, gone] of MERGED) {
      const k = byId.get(kept)!;
      expect(merged.filter((r) => r.entityId === kept)).toEqual([
        expect.objectContaining({ oldValue: 2, newValue: k.executions.length }),
      ]);
      expect(merged.filter((r) => r.entityId === gone)).toEqual([
        expect.objectContaining({ oldValue: 2, newValue: 0 }),
      ]);
    }
    const split = rows('split', 'fills');
    expect(split.map((r) => [r.entityId, r.oldValue, r.newValue])).toEqual([
      [SPLIT, 4, 2],
      [part.id, 0, 2],
    ]);
    // Each level edit of the last 30 days is logged as the trade page logs it.
    const since = ymd(parseYmd(w.endDate) - 30 * DAY_MS);
    const recent = levelled.filter((t) => localDate(t.openedAt, NY) >= since);
    expect(recent.length).toBeGreaterThan(20);
    // The row's old value is the side as the trade read before (its single
    // stop or target, as one Price level), so no row reads "None to 37
    // ticks" for a trade that had a stop; a side that reads as it did logs
    // nothing.
    const v7ById = new Map(
      generateSampleBase({
        seed: SAMPLE_SEED,
        endDate: '2026-11-19',
      }).trades.map((t) => [t.id, t]),
    );
    const levelRows = w.history.filter(
      (r) => r.field === 'targets' || r.field === 'stops',
    );
    const json = (side: unknown) =>
      side === undefined ? null : JSON.stringify(side);
    expect(
      levelRows.map((r) => [r.entityId, r.field, r.oldValue, r.newValue]),
    ).toEqual(
      recent.flatMap((t) =>
        (['targets', 'stops'] as const).flatMap((field) => {
          const before = json(sidesOf(v7ById.get(t.id)!)[field]);
          const after = json(t[field]);
          return before === after ? [] : [[t.id, field, before, after]];
        }),
      ),
    );
    expect(levelRows.length).toBeGreaterThan(20);
    for (const r of levelRows) {
      const t = byId.get(r.entityId)!;
      expect(r).toMatchObject({ type: 'trade', action: 'edited' });
      expect(localDate(t.openedAt, NY) >= since).toBe(true);
      // Every side saved in levels was the trade's own stop or target.
      expect(r.oldValue, t.id).not.toBeNull();
    }
    // The rows run oldest first: the rules, the levels, the merges, the split.
    expect(w.history.map((r) => r.at)).toEqual(
      [...w.history.map((r) => r.at)].sort(),
    );

    // No files: no photos, attachments or note images.
    expect('files' in w).toBe(false);
  });

  test.each(['2026-11-19', '2026-11-20', '2026-11-27'])(
    "the swap leaves every note's figures as they read: weekly recaps, daily notes and trade notes (end %s)",
    (endDate) => {
      const s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate });
      // As the journal writes its figures (seed/journal.ts).
      const money = (cents: number) => {
        const abs = String(Math.abs(Math.round(cents / 100)));
        return `${cents < 0 ? '-' : '+'}$${abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
      };
      type Node = { text?: string; content?: Node[] };
      const textOf = (n: Node): string =>
        (n.text ?? '') + (n.content ?? []).map(textOf).join(' ');
      const day = (t: Trade) => localDate(t.openedAt, NY);
      const closed = (ts: readonly Trade[]) =>
        ts.filter((t) => t.status === 'closed');
      const sum = (ts: readonly Trade[]) => ts.reduce((n, t) => n + t.net, 0);

      // The notes were written before the merges and the split, which the
      // history stamps after them: read the grouped trades as they were then.
      const base = generateSampleBase({ seed: SAMPLE_SEED, endDate });
      const grouped = s.trades.filter((t) => t.grouping === 'manual');
      expect(grouped).toHaveLength(4);
      const now = new Set(s.trades.map((t) => t.id));
      const then = new Set(grouped.map((t) => t.id));
      const all = [
        ...s.trades.filter((t) => t.grouping !== 'manual'),
        ...base.trades.filter((t) => then.has(t.id) || !now.has(t.id)),
      ];
      const first = new Set(s.accounts.slice(0, 3).map((a) => a.id));
      const journalled = all.filter((t) => first.has(t.accountId));
      expect(all.some((t) => t.swap !== undefined && t.swap !== 0)).toBe(true);

      const recaps = s.journal.filter((j) => j.kind === 'weekly-recap');
      expect(recaps.length).toBeGreaterThan(20);
      for (const r of recaps) {
        const monday = ymd(parseYmd(r.date!) - 4 * DAY_MS);
        const week = closed(
          journalled.filter((t) => day(t) >= monday && day(t) <= r.date!),
        );
        const wins = week.filter((t) => t.net > 0).length;
        const best = week.reduce((a, b) => (b.net > a.net ? b : a));
        const worst = week.reduce((a, b) => (b.net < a.net ? b : a));
        const text = textOf(r.body as Node);
        expect(text, r.date).toContain(
          `${week.length} closed trades, ${Math.round((wins / week.length) * 100)}% winners, net ${money(sum(week))}.`,
        );
        expect(text, r.date).toContain(
          `Best trade: ${best.instrument.symbol} ${best.direction}, ${money(best.net)}.`,
        );
        expect(text, r.date).toContain(
          `Worst trade: ${worst.instrument.symbol} ${worst.direction}, ${money(worst.net)}.`,
        );
      }

      const daily = s.journal.filter((j) => j.kind === 'daily-review');
      expect(daily.length).toBeGreaterThan(20);
      for (const n of daily) {
        // The routine's notes read every account; the daily notes the journal's.
        const own = (
          n.id.startsWith('routine-note-') ? all : journalled
        ).filter((t) => day(t) === n.date);
        const done = closed(own);
        const won = done.filter((t) => t.net > 0).length;
        expect(textOf(n.body as Node), n.date).toContain(
          `${own.length} trades, ${won} won and ${done.length - won} did not. Net ${money(sum(done))} after costs.`,
        );
      }

      const byId = new Map(all.map((t) => [t.id, t]));
      const notes = s.journal.filter((j) => j.kind === 'trade-note');
      expect(notes.length).toBeGreaterThan(30);
      for (const n of notes) {
        const t = byId.get(n.linkedTradeIds[0]!)!;
        expect(textOf(n.body as Node), t.id).toContain(
          `Result: ${money(t.net)} net.`,
        );
      }
    },
  );

  test('the history is stamped from the time the sample is written', async () => {
    const at = new Date('2026-11-23T15:00:00.000Z');
    const w = await defaultSample(at);
    expect(w.endDate).toBe('2026-11-20');
    expect(w.history.length).toBeGreaterThan(0);
    for (const r of w.history) {
      expect(Date.parse(r.at)).toBeLessThan(at.getTime());
      expect(at.getTime() - Date.parse(r.at)).toBeLessThan(6 * 3_600_000);
    }
  });

  test("the first three accounts' trades and their totals are as Plan 4 pinned them", () => {
    const first = new Set(s.accounts.slice(0, 3).map((a) => a.id));
    const own = s.trades.filter((t) => first.has(t.accountId));
    const total = (f: (t: Trade) => number) =>
      own.reduce((sum, t) => sum + f(t), 0);
    // v8: the two merges each take a trade and the split adds one (1,233 in
    // v7), the swap is in the net, and the grouped trades' risks follow their
    // new positions; v7's five carried 69,250 of the 14,369,935.
    expect(own).toHaveLength(1232);
    expect(own.filter((t) => t.status === 'closed')).toHaveLength(1228);
    expect(total((t) => t.net - (t.swap ?? 0))).toBe(1_646_295);
    expect(total((t) => t.gross)).toBe(2_577_713);
    expect(total((t) => t.fees)).toBe(931_418);
    expect(
      own
        .filter((t) => t.grouping !== 'manual')
        .reduce((sum, t) => sum + (t.initialRisk ?? 0), 0),
    ).toBe(14_369_935 - 69_250);
    expect(own.filter((t) => t.noteId !== undefined)).toHaveLength(40);
  });

  test('the net rounds once per trade (E71): the pinned USDJPY trade, the ETHUSD trade and the USDJPY total', () => {
    const live = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-20',
    });
    const jpy = live.trades.filter((t) => t.instrument.symbol === 'USDJPY');
    const pinned = jpy.find((t) => t.avgEntry === 153.757)!;
    // v8 adds swap to the net of a closed forex trade: what rounds is the net before it.
    const beforeSwap = (t: Trade) => t.net - (t.swap ?? 0);
    expect([pinned.gross, pinned.fees, beforeSwap(pinned)]).toEqual([
      -39593, 1400, -40993,
    ]);
    expect(jpy).toHaveLength(45);
    expect(jpy.reduce((n, t) => n + beforeSwap(t), 0)).toBe(-128_916);
    const eth = live.trades.find(
      (t) =>
        t.instrument.symbol === 'ETHUSD' &&
        t.avgEntry === 3380.13 &&
        t.fees === 467,
    )!;
    expect(eth.net).toBe(5704);
    for (const t of live.trades)
      expect(t.net).toBe(t.gross - t.fees + (t.swap ?? 0));
    const other = (sym: string) =>
      live.trades
        .filter((t) => t.instrument.symbol === sym)
        .reduce((n, t) => n + beforeSwap(t), 0);
    expect([other('EURUSD'), other('GBPUSD'), other('AUDUSD')]).toEqual([
      20900, 287710, 165560,
    ]);
  });

  test('about 70% of trades closed a week or more before the end are reviewed', () => {
    const daysBefore = (t: Trade) =>
      differenceInCalendarDays(
        parseISO('2026-11-19'),
        parseISO(localDate(t.closedAt!, NY)),
      );
    const closed = s.trades.filter((t) => t.status === 'closed');
    const old = closed.filter((t) => daysBefore(t) >= 7);
    const share = old.filter((t) => t.reviewed === true).length / old.length;
    expect(share).toBeGreaterThanOrEqual(0.6);
    expect(share).toBeLessThanOrEqual(0.8);
    expect(
      s.trades.filter(
        (t) => t.reviewed && (t.status === 'open' || daysBefore(t) < 7),
      ),
    ).toEqual([]);
  });

  test('some trades follow two strategies, graded on both', () => {
    const withStrategy = s.trades.filter((t) => t.strategyIds.length > 0);
    const two = withStrategy.filter((t) => t.strategyIds.length === 2);
    expect(two.length / withStrategy.length).toBeGreaterThanOrEqual(0.1);
    expect(two.length / withStrategy.length).toBeLessThanOrEqual(0.2);
    expect(withStrategy.every((t) => t.strategyIds.length <= 2)).toBe(true);
    const byId = new Map(s.strategies.map((x) => [x.id, x]));
    for (const t of two) {
      expect(new Set(t.strategyIds).size).toBe(2);
      const checked = new Set(t.ruleChecks.map((c) => c.ruleId));
      for (const id of t.strategyIds) {
        const st = byId.get(id)!;
        expect(st.assetClasses).toContain(t.instrument.assetClass);
        for (const r of strategyRules(st))
          if (r.showWhen === 'always') expect(checked.has(r.id)).toBe(true);
      }
    }
  });

  test('daily notes for the last 20 trading days, from the daily template', () => {
    const daily = s.journal.filter(
      (j) => j.kind === 'daily-review' && !j.id.startsWith('routine-note-'),
    );
    expect(daily).toHaveLength(20);
    const dates = daily.map((j) => j.date!);
    expect(new Set(dates).size).toBe(20);
    expect(dates.sort().at(-1)).toBe('2026-11-19');
    const tradingDays = [
      ...new Set(s.trades.map((t) => localDate(t.openedAt, NY))),
    ].sort();
    expect(dates).toEqual(tradingDays.slice(-20));
    for (const j of daily) {
      const text = JSON.stringify(j.body);
      for (const section of ['Preparation', 'Session log', 'End of day'])
        expect(text).toContain(section);
      expect(j.linkedTradeIds.length).toBeGreaterThan(0);
    }
  });

  test('strategies have titled groups, a loser rule, an icon and a tone', () => {
    for (const st of s.strategies) {
      expect(st.groups.map((g) => g.title)).toEqual([
        'Entry',
        'Exit',
        'Risk',
        'Management',
      ]);
      expect(strategyRules(st).filter((r) => r.showWhen === 'loser')).toEqual([
        expect.objectContaining({
          text: expect.stringMatching(/^Took the loss /),
        }),
      ]);
      expect(st.icon).toBeDefined();
      expect(st.tone).toBeDefined();
    }
  });

  test('no two rules in the workspace share a wording', () => {
    const texts = s.strategies.flatMap((st) =>
      strategyRules(st).map((r) => r.text),
    );
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('tags sit in Setups, Mistakes, Emotions and Custom tags', () => {
    expect(s.tagCategories.map((c) => [c.name, c.builtIn, c.role])).toEqual([
      ['Setups', false, undefined],
      ['Mistakes', true, 'mistake'],
      ['Emotions', false, undefined],
      ['Custom tags', true, undefined],
    ]);
    const ids = new Set(s.tagCategories.map((c) => c.id));
    for (const t of s.tags) expect(ids.has(t.categoryId)).toBe(true);
    const mistakes = mistakeTags(s.tags, s.tagCategories);
    expect(mistakes.map((t) => t.name)).toEqual([
      'fomo entry',
      'moved stop',
      'oversized',
      'early exit',
      'revenge trade',
    ]);
    for (const t of mistakes) expect(t.description).toMatch(/\.$/);
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

  test('the first three accounts; the prop evaluation has rules and is not breached', () => {
    expect(s.accounts.slice(0, 3).map((a) => [a.id, a.type])).toEqual([
      ['sample-futures', 'live'],
      ['sample-forex-prop', 'prop-evaluation'],
      ['sample-multi', 'live'],
    ]);
    expect(s.accounts.slice(0, 3).map((a) => a.startingBalance)).toEqual([
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
      if (t.strategyIds.length === 0 || graded.length === 0) ungraded += 1;
      else if (graded.some((r) => r.followed === false)) {
        broken += 1;
        const mistakes = new Set(
          mistakeTags(s.tags, s.tagCategories).map((x) => x.id),
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

  test('about 1,500 trades over about six months, across five asset classes', () => {
    // 1,233 on the first three accounts, and the prop accounts' own on top.
    expect(s.trades.length).toBeGreaterThanOrEqual(1400);
    expect(s.trades.length).toBeLessThanOrEqual(1650);
    expect(
      differenceInCalendarDays(
        parseISO('2026-11-19'),
        parseISO(localDate(s.trades[0]!.openedAt, NY)),
      ),
    ).toBeGreaterThanOrEqual(170);
    expect(new Set(s.trades.map((t) => t.instrument.assetClass))).toEqual(
      new Set(['future', 'forex', 'stock', 'option', 'crypto']),
    );
    // Serials run from 1 in v7's order. v8's merges leave a gap where each
    // trade they took was (973 and 1005), and the split's new trade takes the
    // next serial after v7's last, as the app numbers it.
    const v7Count = s.trades.length + 1;
    expect(s.trades.map((t) => t.serial)).toEqual([
      ...Array.from({ length: v7Count }, (_, i) => i + 1).filter(
        (n) => n !== 973 && n !== 1005,
      ),
      v7Count + 1,
    ]);
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
      for (const g of st.groups) expect(g.rules.length).toBeGreaterThan(0);
      expect(st.checklist.length).toBeGreaterThanOrEqual(3);
      expect(st.checklist.length).toBeLessThanOrEqual(5);
      expect(st.workspaceId).toBe('sample');
    }
    expect(new Set(s.tags.map((x) => x.categoryId)).size).toBe(4);
    expect(new Set(s.journal.map((j) => j.kind))).toEqual(
      new Set(['daily-review', 'pre-market', 'weekly-recap', 'trade-note']),
    );
    expect(
      s.journal.filter((j) => j.kind === 'weekly-recap').length,
    ).toBeGreaterThanOrEqual(20);
    for (const j of s.journal) expect(j.tags).toEqual([]);

    // Trades: a check per rule of the first strategy that applies, and only
    // on rules of the trade's strategies.
    const withStrategy = s.trades.filter((t) => t.strategyIds.length > 0);
    expect(withStrategy.length / s.trades.length).toBeGreaterThan(0.78);
    expect(withStrategy.length / s.trades.length).toBeLessThan(0.92);
    for (const t of s.trades) {
      if (t.strategyIds.length === 0) {
        expect(t.ruleChecks).toEqual([]);
      } else {
        const own = t.strategyIds.map((id) => strategies.get(id)!);
        expect(own.every((st) => st !== undefined)).toBe(true);
        const ruleIds = own.flatMap((st) => strategyRules(st).map((r) => r.id));
        const checked = t.ruleChecks.map((c) => c.ruleId);
        expect(new Set(checked).size).toBe(checked.length);
        for (const id of checked) expect(ruleIds).toContain(id);
        for (const r of strategyRules(own[0]!))
          if (r.showWhen === 'always') expect(checked).toContain(r.id);
        // A loser rule is graded only on a loss.
        const loserIds = new Set(
          own.flatMap((st) =>
            strategyRules(st)
              .filter((r) => r.showWhen === 'loser')
              .map((r) => r.id),
          ),
        );
        if (t.status !== 'closed' || t.net >= 0)
          expect(checked.filter((id) => loserIds.has(id))).toEqual([]);
      }
      for (const id of t.tagIds) expect(tags.has(id)).toBe(true);
      if (t.noteId !== undefined) {
        const note = journal.get(t.noteId)!;
        expect(note.kind).toBe('trade-note');
        expect(note.linkedTradeIds).toEqual([t.id]);
      }
    }

    // Journal.
    for (const j of s.journal) {
      for (const id of j.linkedTradeIds) expect(tradeIds.has(id)).toBe(true);
      expect(j.workspaceId).toBe('sample');
      expect((j.body as { type: string }).type).toBe('doc');
    }
    const notes = s.journal.filter((j) => j.kind === 'trade-note');
    expect(s.journal.some((j) => j.kind === 'note')).toBe(false);
    expect(s.journal.some((j) => 'folder' in j || 'folderId' in j)).toBe(false);
    expect(notes.length).toBeGreaterThanOrEqual(35);
    expect(notes.length).toBeLessThanOrEqual(45);
    for (const n of notes) {
      expect(n.linkedTradeIds).toHaveLength(1);
      const t = s.trades.find((x) => x.id === n.linkedTradeIds[0])!;
      expect(t.noteId).toBe(n.id);
      // Titled as ensureTradeNote titles one: "{symbol} : {d MMM yyyy}", the day the trade opened.
      const opened = localDate(t.openedAt, NY);
      expect(n.title).toBe(
        `${t.instrument.symbol} : ${format(parse(opened, 'yyyy-MM-dd', new Date(0)), 'd MMM yyyy')}`,
      );
    }
    expect(s.trades.filter((t) => t.noteId !== undefined)).toHaveLength(
      notes.length,
    );
  });

  test('stops, targets and risk are set on most trades', () => {
    // Read as every reader reads them: levels first, else the single stop and target.
    const stop = s.trades.filter((t) => sidesOf(t).stops !== undefined);
    const target = s.trades.filter((t) => sidesOf(t).targets !== undefined);
    expect(stop.length / s.trades.length).toBeGreaterThan(0.78);
    expect(stop.length / s.trades.length).toBeLessThan(0.92);
    expect(target.length / s.trades.length).toBeGreaterThan(0.5);
    expect(target.length / s.trades.length).toBeLessThan(0.7);
    for (const t of stop) expect(t.initialRisk!).toBeGreaterThan(0);
    for (const t of s.trades)
      if (sidesOf(t).stops === undefined) expect(t.initialRisk).toBeUndefined();
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

  describe('prop challenges', () => {
    const NOW = '2026-11-19T22:00:00.000Z';
    const accountOf = (id: string) => s.accounts.find((a) => a.id === id)!;
    const stateOf = (id: string) => {
      const a = accountOf(id);
      return evaluateProp({
        startingBalance: a.startingBalance,
        rules: a.propRules!,
        timeZone: NY,
        now: NOW,
        trades: s.trades.filter((t) => t.accountId === id),
      });
    };

    test('three challenges: active, funded and active, and breached', () => {
      expect(
        s.challenges.map((c) => [c.name, c.steps, c.phase, c.status]),
      ).toEqual([
        ['Forex 100K', 2, 'evaluation', 'active'],
        ['Futures 50K', 1, 'funded', 'active'],
        ['Futures 100K', 1, 'evaluation', 'breached'],
      ]);
      const [forex, f50, f100] = s.challenges;
      expect(forex!.phases.map((p) => [p.step, p.accountId])).toEqual([
        ['step-1', 'sample-forex-prop'],
        ['step-2', undefined],
        ['funded', undefined],
      ]);
      expect(f50!.phases.map((p) => p.step)).toEqual(['step-1', 'funded']);
      expect(f50!.phases.every((p) => p.accountId !== undefined)).toBe(true);
      expect(
        f100!.phases.map((p) => [p.step, p.accountId !== undefined]),
      ).toEqual([
        ['step-1', true],
        ['funded', false],
      ]);
      for (const c of s.challenges)
        for (const p of c.phases)
          if (p.accountId) expect(accountOf(p.accountId)).toBeDefined();
      expect(s.challenges.every((c) => c.evaluationFee! > 0)).toBe(true);
    });

    test('each outcome holds on its own stream', () => {
      const [, f50, f100] = s.challenges;
      const evalId = (c: typeof f50) => c!.phases[0]!.accountId!;
      expect(stateOf(evalId(f50)).overall).toBe('target-reached');
      const funded = stateOf(f50!.phases[1]!.accountId!);
      expect(funded.overall).not.toBe('breached');
      expect(accountOf(f50!.phases[1]!.accountId!)).toMatchObject({
        type: 'prop-funded',
        status: 'active',
      });
      const broken = stateOf(evalId(f100));
      expect(broken.overall).toBe('breached');
      expect(f100!.failureReason).toMatch(/ broken on \d+ \w{3} \(/);
      expect(s.challenges.filter((c) => c.failureReason)).toHaveLength(1);
    });

    test('each new account trades 25 to 40 weekdays, from the futures specs', () => {
      const added = s.accounts.slice(3);
      expect(added.length).toBe(3);
      for (const a of added) {
        const own = s.trades.filter((t) => t.accountId === a.id);
        const days = new Set(own.map((t) => localDate(t.openedAt, NY)));
        expect(days.size).toBeGreaterThanOrEqual(25);
        expect(days.size).toBeLessThanOrEqual(40);
        expect(own.every((t) => t.instrument.assetClass === 'future')).toBe(
          true,
        );
      }
    });
  });

  describe('prop finances (C57)', () => {
    const ENDS = '2026-11-19';
    const firmOf = (id: string) => s.challenges.find((c) => c.id === id)!.firm;
    const [forex, f50, f100] = [
      'sample-challenge-forex-100k',
      'sample-challenge-futures-50k',
      'sample-challenge-futures-100k',
    ];

    test("nine transactions with the comps' shape", () => {
      expect(s.propTxns).toHaveLength(9);
      const by = (f: (t: (typeof s.propTxns)[number]) => boolean) =>
        s.propTxns.filter(f);
      expect(by((t) => t.status === 'ignored')).toHaveLength(1);
      expect(
        by((t) => t.category === 'uncategorized' && t.amount < 0),
      ).toHaveLength(1);
      expect(by((t) => t.category === 'reset-fee')).toHaveLength(2);
      expect(by((t) => t.category === 'evaluation-fee')).toHaveLength(2);
      expect(by((t) => t.category === 'activation-fee')).toHaveLength(1);
      const payouts = by((t) => t.category === 'payout');
      expect(payouts).toHaveLength(2);
      for (const p of payouts) {
        expect(p.amount).toBeGreaterThan(0);
        expect(p.challengeId).toBe(f50);
      }
      // Every status shows; costs are negative and income positive.
      expect(new Set(s.propTxns.map((t) => t.status))).toEqual(
        new Set(['reviewed', 'not-reviewed', 'ignored']),
      );
      for (const t of by((t) => t.category.endsWith('-fee')))
        expect(t.amount).toBeLessThan(0);
      expect(s.propTxns.every((t) => t.workspaceId === 'sample')).toBe(true);
      expect(new Set(s.propTxns.map((t) => t.id)).size).toBe(9);
    });

    test("each row is a real date up to the sample's end, and links a challenge of the sample", () => {
      const ids = new Set(s.challenges.map((c) => c.id));
      for (const t of s.propTxns) {
        expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(t.date <= ENDS, `${t.id} ${t.date}`).toBe(true);
        if (t.challengeId) {
          expect(ids.has(t.challengeId)).toBe(true);
          expect(t.firm).toBe(firmOf(t.challengeId));
        }
      }
      // The one cost no challenge owns is another payee's.
      const loose = s.propTxns.filter((t) => t.challengeId === undefined);
      expect(loose).toHaveLength(1);
      expect(loose[0]).toMatchObject({
        description: 'Market data fee',
        category: 'uncategorized',
        amount: -2_900,
        status: 'not-reviewed',
      });
    });

    test("the fee rows match the challenges' fee fields, which they replace (C28)", () => {
      const fee = (challenge: string, category: string) =>
        s.propTxns.find(
          (t) => t.challengeId === challenge && t.category === category,
        )!.amount;
      const field = (id: string) => s.challenges.find((c) => c.id === id)!;
      expect(-fee(forex, 'evaluation-fee')).toBe(field(forex).evaluationFee);
      expect(-fee(forex, 'activation-fee')).toBe(field(forex).activationFee);
      expect(-fee(f100, 'evaluation-fee')).toBe(field(f100).evaluationFee);
      // The funded challenge's fees stay fields: no row of a fee category.
      expect(
        s.propTxns.filter(
          (t) => t.challengeId === f50 && t.category.endsWith('-fee'),
        ),
      ).toEqual([]);
    });

    test("the resets fall inside the breached challenge's life, and the refund after it", () => {
      const broken = s.challenges.find((c) => c.id === f100)!;
      const start = broken.phases[0]!.startDate!;
      const resets = s.propTxns.filter((t) => t.category === 'reset-fee');
      for (const r of resets) {
        expect(r.challengeId).toBe(f100);
        expect(r.date > start).toBe(true);
        expect(r.date <= broken.breachedOn!).toBe(true);
      }
      expect(resets[0]!.date).not.toBe(resets[1]!.date);
      const refund = s.propTxns.find((t) => t.status === 'ignored')!;
      expect(refund).toMatchObject({
        challengeId: f100,
        category: 'uncategorized',
        amount: 16_500,
      });
      expect(refund.date >= broken.breachedOn!).toBe(true);
    });

    test('the payouts come after the funded phase starts', () => {
      const funded = s.challenges.find((c) => c.id === f50)!;
      const from = funded.phases.find((p) => p.step === 'funded')!.startDate!;
      for (const t of s.propTxns.filter((t) => t.category === 'payout'))
        expect(t.date > from).toBe(true);
    });

    test('one breached challenge carries a reason and the day its own check found', () => {
      const broken = s.challenges.find((c) => c.id === f100)!;
      expect(broken).toMatchObject({
        status: 'breached',
        breachReason: 'max-drawdown',
      });
      // "Max drawdown limit broken on 27 Oct": the text and the date agree.
      const day = Number(/ on (\d+) /.exec(broken.failureReason!)![1]);
      expect(Number(broken.breachedOn!.slice(8))).toBe(day);
      expect(broken.breachedOn! <= ENDS).toBe(true);
      expect(
        s.challenges.filter((c) => c.breachReason !== undefined),
      ).toHaveLength(1);
      expect(
        s.challenges.filter((c) => c.breachedOn !== undefined),
      ).toHaveLength(1);
    });

    test("every challenge is traded with one or two of the sample's strategies, most used first", () => {
      const known = new Set(s.strategies.map((x) => x.id));
      for (const c of s.challenges) {
        expect(c.strategyIds!.length).toBeGreaterThanOrEqual(1);
        expect(c.strategyIds!.length).toBeLessThanOrEqual(2);
        for (const id of c.strategyIds!) expect(known.has(id)).toBe(true);
        expect(new Set(c.strategyIds).size).toBe(c.strategyIds!.length);
      }
    });

    test('the totals the prop dashboard reads', () => {
      const items = spendItems(s.challenges, s.propTxns);
      expect(totals(items)).toMatchObject({
        spent: 151_900,
        earned: 450_000,
        net: 298_100,
        payouts: 2,
      });
      // The fee fields no row holds still count: the funded challenge's two.
      expect(
        items.filter((i) => i.id.startsWith('fee-')).map((i) => i.challengeId),
      ).toEqual([f50, f50]);
    });

    test('the same seed and end give the same rows, and a later end shifts them with the days', () => {
      const again = generateSampleWorkspace({
        seed: SAMPLE_SEED,
        endDate: ENDS,
      });
      expect(again.propTxns).toEqual(s.propTxns);
      const later = generateSampleWorkspace({
        seed: SAMPLE_SEED,
        endDate: '2026-11-20',
      });
      expect(later.propTxns).toHaveLength(9);
      for (const t of later.propTxns) expect(t.date <= '2026-11-20').toBe(true);
    });
  });
});
