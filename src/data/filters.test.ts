import { describe, expect, test } from 'vitest';
import { makeTrade } from '../domain/__fixtures__/trades';
import { resolveInstrument } from '../domain/instruments';
import { summarize } from '../domain/metrics/summary';
import type { Account, Trade } from '../domain/types';
import { applyTradePatch } from './trade-patch';
import {
  applyFilters,
  EMPTY_FILTERS,
  mergeFilterParams,
  narrowToUnit,
  parseFilters,
  previousRange,
  queryString,
  resolveRange,
  sanitizeFilters,
  selectedAccounts,
  serializeFilters,
  type DatePreset,
  type GlobalFilters,
  advancedFilterCount,
  type FilterEnv,
  DATE_PRESETS,
  FILTER_PARAMS,
} from './filters';

const acct = (id: string, status: Account['status'] = 'active') =>
  ({ id, status }) as Account;
const env: FilterEnv = {
  timeZone: 'America/New_York',
  today: '2026-11-20',
  accounts: [acct('a'), acct('b', 'archived')],
};

describe('global filters', () => {
  test('presets resolve against today', () => {
    const r = (preset: DatePreset) => resolveRange({ preset }, '2026-11-20');
    expect(r('today')).toEqual({ from: '2026-11-20', to: '2026-11-20' });
    expect(r('this-month')).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(r('last-month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(r('last-30-days')).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(r('this-quarter')).toEqual({ from: '2026-10-01', to: '2026-11-20' });
    expect(r('ytd')).toEqual({ from: '2026-01-01', to: '2026-11-20' });
    expect(resolveRange({}, '2026-11-20')).toEqual({});
    expect(resolveRange({ from: '2026-01-01' }, '2026-11-20')).toEqual({
      from: '2026-01-01',
    });
  });

  test('weeks start Sunday by default, Monday when the preference says so', () => {
    const r = (preset: DatePreset, w?: 'sunday' | 'monday') =>
      resolveRange({ preset }, '2026-11-20', w);
    expect(r('this-week')).toEqual({ from: '2026-11-15', to: '2026-11-20' });
    expect(r('last-week')).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(r('this-week', 'monday')).toEqual({
      from: '2026-11-16',
      to: '2026-11-20',
    });
    expect(r('last-week', 'monday')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    // On a Sunday, Sunday-first weeks begin that very day.
    expect(resolveRange({ preset: 'this-week' }, '2026-11-22')).toEqual({
      from: '2026-11-22',
      to: '2026-11-22',
    });
  });

  test('a trade belongs to its local close day', () => {
    const t = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-03-03T02:00:00Z',
    }); // 21:00 on 2 Mar in New York
    const day = (d: string) =>
      applyFilters([t], { ...EMPTY_FILTERS, range: { from: d, to: d } }, env);
    expect(day('2026-03-02')).toHaveLength(1);
    expect(day('2026-03-03')).toHaveLength(0);
  });

  test('an open trade belongs to its local open day', () => {
    const t = makeTrade({
      net: 0,
      accountId: 'a',
      status: 'open',
      openedAt: '2026-03-03T02:00:00Z',
    });
    const day = (d: string) =>
      applyFilters([t], { ...EMPTY_FILTERS, range: { from: d, to: d } }, env);
    expect(day('2026-03-02')).toHaveLength(1);
    expect(day('2026-03-03')).toHaveLength(0);
  });

  test('a preset range filters trades against env.today', () => {
    const inRange = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-11-18T15:00:00Z',
    });
    const before = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-11-10T15:00:00Z',
    });
    const out = applyFilters(
      [inRange, before],
      { ...EMPTY_FILTERS, range: { preset: 'this-week' } },
      env,
    );
    expect(out).toEqual([inRange]);
  });

  test('no account filter means active accounts; an archived one counts when selected', () => {
    const ts = [
      makeTrade({ net: 1, accountId: 'a' }),
      makeTrade({ net: 1, accountId: 'b' }),
    ];
    expect(
      applyFilters(ts, EMPTY_FILTERS, env).map((t) => t.accountId),
    ).toEqual(['a']);
    expect(
      applyFilters(ts, { ...EMPTY_FILTERS, accountIds: ['b'] }, env).map(
        (t) => t.accountId,
      ),
    ).toEqual(['b']);
    expect(
      selectedAccounts(env.accounts, EMPTY_FILTERS).map((a) => a.id),
    ).toEqual(['a']);
    expect(
      selectedAccounts(env.accounts, {
        ...EMPTY_FILTERS,
        accountIds: ['b'],
      }).map((a) => a.id),
    ).toEqual(['b']);
  });

  test('symbol by root, side, strategy and any-of tags combine with AND', () => {
    const base = { net: 1, accountId: 'a' };
    const esz = makeTrade({
      ...base,
      instrument: resolveInstrument('ESZ5')!,
      strategyIds: ['s1'],
      tagIds: ['t1', 't2'],
    });
    const esh = makeTrade({
      ...base,
      instrument: resolveInstrument('ESH6')!,
      direction: 'short',
      strategyIds: ['s1'],
      tagIds: ['t3'],
    });
    const nq = makeTrade({
      ...base,
      instrument: resolveInstrument('NQZ5')!,
      strategyIds: ['s2', 's3'],
    });
    const ts = [esz, esh, nq];
    const run = (f: Partial<GlobalFilters>) =>
      applyFilters(ts, { ...EMPTY_FILTERS, ...f }, env);
    expect(run({ symbols: ['ES'] })).toEqual([esz, esh]);
    expect(run({ symbols: ['ES'], side: 'short' })).toEqual([esh]);
    expect(run({ strategyIds: ['s1'] })).toEqual([esz, esh]);
    // A trade in several strategies matches any of them.
    expect(run({ strategyIds: ['s3'] })).toEqual([nq]);
    expect(run({ strategyIds: ['s1', 's2'] })).toEqual(ts);
    expect(run({ tagIds: ['t2'] })).toEqual([esz]);
    expect(run({ tagIds: ['t2', 't3'] })).toEqual([esz, esh]);
    expect(
      run({ symbols: ['ES', 'NQ'], strategyIds: ['s1'], tagIds: ['t3'] }),
    ).toEqual([esh]);
    expect(run({ symbols: ['NQ'], side: 'short' })).toEqual([]);
  });

  test('URL round trip is canonical', () => {
    const f: GlobalFilters = {
      ...EMPTY_FILTERS,
      range: { from: '2026-01-01', to: '2026-03-31' },
      accountIds: ['b', 'a'],
      symbols: ['ES'],
      side: 'long',
      strategyIds: ['s1'],
      tagIds: ['t2', 't1'],
    };
    const qs =
      'from=2026-01-01&to=2026-03-31&account=a,b&symbol=ES&side=long&strategy=s1&tag=t1,t2';
    expect(queryString(serializeFilters(f))).toBe(qs);
    expect(
      queryString(serializeFilters(parseFilters(new URLSearchParams(qs)))),
    ).toBe(qs);
    // Repeated keys from older links still read.
    expect(
      parseFilters(new URLSearchParams('account=a&account=b&tag=t1&tag=t2')),
    ).toMatchObject({ accountIds: ['a', 'b'], tagIds: ['t1', 't2'] });
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('');
    expect(
      serializeFilters({
        ...EMPTY_FILTERS,
        range: { preset: 'ytd' },
      }).toString(),
    ).toBe('range=ytd');
  });

  test('garbage is dropped; reversed dates swap; presets win', () => {
    expect(
      parseFilters(
        new URLSearchParams(
          'side=up&from=2026-02-30&range=bogus&account=&tag=t1&tag=t1&symbol=es',
        ),
      ),
    ).toEqual({ ...EMPTY_FILTERS, tagIds: ['t1'], symbols: ['ES'] });
    expect(
      parseFilters(new URLSearchParams('from=2026-03-31&to=2026-01-01')).range,
    ).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(
      parseFilters(new URLSearchParams('range=ytd&from=2026-01-05')).range,
    ).toEqual({ preset: 'ytd' });
  });

  test('merging keeps other params', () => {
    const merged = mergeFilterParams(
      new URLSearchParams('by=hour&side=short&tag=x'),
      {
        ...EMPTY_FILTERS,
        side: 'long',
      },
    );
    expect(merged.toString()).toBe('by=hour&side=long');
  });

  test('ids unknown to the workspace are dropped (Review Focus 5)', () => {
    const f = {
      ...EMPTY_FILTERS,
      accountIds: ['a', 'ghost'],
      strategyIds: ['old'],
      tagIds: ['t1'],
      symbols: ['ES'],
    };
    expect(
      sanitizeFilters(f, {
        accountIds: new Set(['a']),
        strategyIds: new Set(),
        tagIds: new Set(['t1']),
      }),
    ).toEqual({ ...f, accountIds: ['a'], strategyIds: [] });
  });

  test('a link with only ghost ids shows data once sanitized', () => {
    const t = makeTrade({
      net: 1,
      accountId: 'a',
      strategyIds: ['s1'],
      tagIds: ['t1'],
    });
    const link = parseFilters(
      new URLSearchParams('account=ghost&strategy=old&tag=gone'),
    );
    expect(applyFilters([t], link, env)).toEqual([]);
    const clean = sanitizeFilters(link, {
      accountIds: new Set(['a']),
      strategyIds: new Set(['s1']),
      tagIds: new Set(['t1']),
    });
    expect(clean).toEqual(EMPTY_FILTERS);
    expect(applyFilters([t], clean, env)).toEqual([t]);
  });

  test('the date presets include the quarter, and old keys keep their values', () => {
    expect([...DATE_PRESETS]).toEqual(
      expect.arrayContaining([
        'today',
        'this-week',
        'this-month',
        'last-30-days',
        'last-month',
        'this-quarter',
        'ytd',
      ]),
    );
  });
});

describe('the full filter set', () => {
  // 09:30 New York is 14:30Z in November.
  const at = (hhmm: string, day = '2026-11-18') => `${day}T${hhmm}:00Z`;
  const trade = (p: Partial<Trade>) =>
    makeTrade({ net: 100, accountId: 'a', ...p });
  const run = (ts: Trade[], f: Partial<GlobalFilters>) =>
    applyFilters(ts, { ...EMPTY_FILTERS, ...f }, env);

  test('exclusions win over inclusions', () => {
    const es = trade({ instrument: resolveInstrument('ESZ5')! });
    const nq = trade({ instrument: resolveInstrument('NQZ5')! });
    expect(run([es, nq], { symbols: ['ES'], excludeSymbols: ['ES'] })).toEqual(
      [],
    );
    expect(run([es, nq], { excludeSymbols: ['ES'] })).toEqual([nq]);
    const s1 = trade({ strategyIds: ['s1'] });
    const s2 = trade({ strategyIds: ['s2'] });
    expect(
      run([s1, s2], { strategyIds: ['s1', 's2'], excludeStrategyIds: ['s1'] }),
    ).toEqual([s2]);
    const t1 = trade({ tagIds: ['t1', 't2'] });
    expect(run([t1], { tagIds: ['t1'], excludeTagIds: ['t2'] })).toEqual([]);
  });

  test('strategy: no strategy ORs with the selection, and all needs every one', () => {
    const none = trade({ strategyIds: [] });
    const a = trade({ strategyIds: ['a'] });
    const ab = trade({ strategyIds: ['a', 'b'] });
    expect(run([none, a, ab], { noStrategy: true })).toEqual([none]);
    expect(
      run([none, a, ab], { noStrategy: true, strategyIds: ['b'] }),
    ).toEqual([none, ab]);
    expect(
      run([none, a, ab], { strategyIds: ['a', 'b'], strategyMatch: 'all' }),
    ).toEqual([ab]);
    expect(run([none, a, ab], { strategyIds: ['a', 'b'] })).toEqual([a, ab]);
  });

  test('tag: all needs every selected tag', () => {
    const one = trade({ tagIds: ['x'] });
    const two = trade({ tagIds: ['x', 'y'] });
    expect(run([one, two], { tagIds: ['x', 'y'], tagMatch: 'all' })).toEqual([
      two,
    ]);
    expect(run([one, two], { tagIds: ['x', 'y'] })).toEqual([one, two]);
  });

  test('outcome follows the breakeven range; only closed trades have one', () => {
    const win = trade({ net: 500 });
    const loss = trade({ net: -500 });
    const flat = trade({ net: 0 });
    const open = trade({ status: 'open', net: 0 });
    const ts = [win, loss, flat, open];
    expect(run(ts, { outcomes: ['win'] })).toEqual([win]);
    expect(run(ts, { outcomes: ['loss', 'breakeven'] })).toEqual([loss, flat]);
    const wide: FilterEnv = {
      ...env,
      breakevenRange: { unit: 'amount', from: -600, to: 600 },
    };
    expect(
      applyFilters(ts, { ...EMPTY_FILTERS, outcomes: ['breakeven'] }, wide),
    ).toEqual([win, loss, flat]);
  });

  test('outcome and summarize classify alike under a percent band and on either basis', () => {
    // ES, 1 lot at 5000: cost basis $250,000, so +$100 net is +0.04%.
    const es = trade({
      instrument: resolveInstrument('ESZ5')!,
      avgEntry: 5000,
      maxPosition: 1,
      net: 10000,
      gross: 10000,
    });
    // Gross is a win even though the net is not: +$100 net, +$300 gross.
    const costly = trade({
      instrument: resolveInstrument('ESZ5')!,
      avgEntry: 5000,
      maxPosition: 1,
      net: -100,
      gross: 30000,
      fees: 30100,
    });
    const band = { unit: 'percent', from: -0.001, to: 0.001 } as const;
    for (const pnlBasis of ['net', 'gross'] as const) {
      const e: FilterEnv = { ...env, breakevenRange: band, pnlBasis };
      const ctx = {
        timeZone: env.timeZone,
        breakevenRange: band,
        pnlBasis,
      };
      for (const t of [es, costly]) {
        const filtered = (o: 'win' | 'loss' | 'breakeven') =>
          applyFilters([t], { ...EMPTY_FILTERS, outcomes: [o] }, e).length;
        const s = summarize([t], ctx);
        expect(filtered('win')).toBe(s.wins);
        expect(filtered('loss')).toBe(s.losses);
        expect(filtered('breakeven')).toBe(s.breakevens);
      }
    }
    // The probe: +0.04% sits inside +-0.1%, so it is breakeven and not a win.
    const probe: FilterEnv = { ...env, breakevenRange: band };
    expect(
      applyFilters([es], { ...EMPTY_FILTERS, outcomes: ['breakeven'] }, probe),
    ).toEqual([es]);
    expect(
      applyFilters([es], { ...EMPTY_FILTERS, outcomes: ['win'] }, probe),
    ).toEqual([]);
  });

  test('status and holding: intraday is one local date, open trades fail holding', () => {
    const same = trade({ openedAt: at('14:30'), closedAt: at('15:30') });
    const overnight = trade({
      openedAt: at('14:30'),
      closedAt: at('14:30', '2026-11-19'),
    });
    // 23:30 New York on the 18th to 00:30 on the 19th is two local dates.
    const midnight = trade({
      openedAt: '2026-11-19T04:30:00Z',
      closedAt: '2026-11-19T05:30:00Z',
    });
    const open = trade({ status: 'open', openedAt: at('14:30') });
    const ts = [same, overnight, midnight, open];
    expect(run(ts, { holding: 'intraday' })).toEqual([same]);
    expect(run(ts, { holding: 'multiday' })).toEqual([overnight, midnight]);
    expect(run(ts, { status: 'open' })).toEqual([open]);
    expect(run(ts, { status: 'closed' })).toEqual([same, overnight, midnight]);
  });

  test('reviewed, rating, weekday and month', () => {
    // 18 Nov 2026 is a Wednesday.
    const r = trade({ reviewed: true, rating: 4, openedAt: at('14:30') });
    const u = trade({ openedAt: at('14:30', '2026-12-02') });
    const sunday = trade({ openedAt: at('14:30', '2026-11-22') });
    expect(run([r, u], { reviewed: true })).toEqual([r]);
    expect(run([r, u], { reviewed: false })).toEqual([u]);
    expect(run([r, u], { ratings: [4, 5] })).toEqual([r]);
    expect(run([r, u, sunday], { weekdays: [3] })).toEqual([r, u]);
    expect(run([r, u, sunday], { weekdays: [7] })).toEqual([sunday]);
    expect(run([r, u], { months: [12] })).toEqual([u]);
  });

  test('a window wraps past midnight and an open end is open', () => {
    // New York is UTC-5 in November: 23:30 local is 04:30Z next day.
    const late = trade({ openedAt: '2026-11-19T04:30:00Z' });
    const early = trade({ openedAt: '2026-11-19T06:15:00Z' }); // 01:15 local
    const three = trade({ openedAt: '2026-11-19T08:00:00Z' }); // 03:00 local
    const ts = [late, early, three];
    expect(run(ts, { entryWindows: [{ from: '22:00', to: '02:00' }] })).toEqual(
      [late, early],
    );
    expect(run(ts, { entryWindows: [{ from: '02:00' }] })).toEqual([
      late,
      three,
    ]);
    expect(run(ts, { entryWindows: [{ to: '02:00' }] })).toEqual([early]);
    expect(
      run(ts, {
        entryWindows: [
          { from: '23:00', to: '23:59' },
          { from: '03:00', to: '04:00' },
        ],
      }),
    ).toEqual([late, three]);
  });

  test('exit windows and duration fail open trades', () => {
    const closed = trade({
      openedAt: at('14:30'),
      closedAt: at('15:00'), // 10:00 local, 30 minutes
    });
    const open = trade({ status: 'open', openedAt: at('14:30') });
    expect(
      run([closed, open], { exitWindows: [{ from: '09:00', to: '11:00' }] }),
    ).toEqual([closed]);
    expect(run([closed, open], { duration: { min: 10, max: 60 } })).toEqual([
      closed,
    ]);
    expect(run([closed, open], { duration: { min: 31 } })).toEqual([]);
    expect(run([closed, open], { exitPrice: { min: 0 } })).toEqual([closed]);
  });

  test('price, size and R ranges; a trade without risk fails R', () => {
    const risked = trade({
      avgEntry: 150,
      avgExit: 160,
      maxPosition: 2,
      net: 200,
      initialRisk: 200,
    });
    const unrisked = trade({ avgEntry: 50, avgExit: 40, maxPosition: 5 });
    const ts = [risked, unrisked];
    expect(run(ts, { entryPrice: { min: 100, max: 200 } })).toEqual([risked]);
    expect(run(ts, { exitPrice: { max: 45 } })).toEqual([unrisked]);
    expect(run(ts, { size: { min: 1, max: 3 } })).toEqual([risked]);
    expect(run(ts, { r: { min: -1, max: 2 } })).toEqual([risked]);
    expect(run(ts, { r: { min: 2 } })).toEqual([]);
  });

  test('a bound in exponent notation round-trips: a micro price bucket is not dropped (M7)', () => {
    const f: GlobalFilters = {
      ...EMPTY_FILTERS,
      entryPrice: { min: 1e-7, max: 5e-7, maxExclusive: true },
      exitPrice: { min: -2.5e-8 },
      size: { max: 1e21 },
    };
    const back = parseFilters(serializeFilters(f));
    expect(back.entryPrice).toEqual(f.entryPrice);
    expect(back.exitPrice).toEqual(f.exitPrice);
    expect(back.size).toEqual(f.size);
  });

  test('every new param survives a round trip', () => {
    for (const qs of [
      'xsym=NQ,YM',
      'xstrat=s1,s2',
      'nostrat=1',
      'stratmatch=all',
      'xtag=t1',
      'tagmatch=all',
      'outcome=win,loss',
      'status=open',
      'hold=intraday',
      'reviewed=1',
      'reviewed=0',
      'rating=4,5',
      'wd=1,2',
      'mo=11',
      'ccy=EUR',
      'xwd=5',
      'xmo=1,12',
      'entry=09:30-11:00,13:00-',
      'exit=-10:00',
      'dur=5_60',
      'ep=100_200',
      'xp=_50',
      'size=1_3',
      'r=-1_2',
    ]) {
      const f = parseFilters(new URLSearchParams(qs));
      expect(f).not.toEqual(EMPTY_FILTERS);
      expect(queryString(serializeFilters(f))).toBe(qs);
    }
  });

  test('a bound that is out reads and writes with < and >', () => {
    const f = parseFilters(new URLSearchParams('dur=1_<5&size=>100_&r=>-1_<1'));
    expect(f.duration).toEqual({ min: 1, max: 5, maxExclusive: true });
    expect(f.size).toEqual({ min: 100, minExclusive: true });
    expect(f.r).toEqual({
      min: -1,
      max: 1,
      minExclusive: true,
      maxExclusive: true,
    });
    const back = serializeFilters(f);
    expect(back.get('dur')).toBe('1_<5');
    expect(back.get('size')).toBe('>100_');
    expect(back.get('r')).toBe('>-1_<1');
    expect(parseFilters(back)).toEqual(f);
    // A flag on a missing bound is nothing.
    expect(parseFilters(new URLSearchParams('dur=_<5')).duration).toEqual({
      max: 5,
      maxExclusive: true,
    });
    expect(
      parseFilters(new URLSearchParams('dur=<1_5')).duration,
    ).toBeUndefined();
  });

  test('an excluded bound leaves its own value out', () => {
    const at5 = trade({
      openedAt: '2026-11-18T15:00:00Z',
      closedAt: '2026-11-18T15:05:00Z',
      maxPosition: 100,
    });
    const at4 = trade({
      openedAt: '2026-11-18T15:00:00Z',
      closedAt: '2026-11-18T15:04:00Z',
      maxPosition: 101,
    });
    expect(
      run([at5, at4], { duration: { min: 1, max: 5, maxExclusive: true } }),
    ).toEqual([at4]);
    expect(run([at5, at4], { duration: { min: 1, max: 5 } })).toEqual([
      at5,
      at4,
    ]);
    expect(run([at5, at4], { size: { min: 100, minExclusive: true } })).toEqual(
      [at4],
    );
  });

  test('exit weekday and month read the day the trade closed', () => {
    // Opened Friday 20 Nov 23:30 in New York, closed Saturday 21 Nov 00:30 (UTC-5).
    const overnight = trade({
      openedAt: '2026-11-21T04:30:00Z',
      closedAt: '2026-11-21T05:30:00Z',
    });
    // Opened Sunday 30 Nov, closed Tuesday 1 Dec.
    const monthEnd = trade({
      openedAt: '2026-11-30T15:00:00Z',
      closedAt: '2026-12-01T15:00:00Z',
    });
    const open = trade({ status: 'open', openedAt: '2026-11-18T15:00:00Z' });
    const ts = [overnight, monthEnd, open];
    expect(run(ts, { weekdays: [5] })).toEqual([overnight]);
    expect(run(ts, { exitWeekdays: [6] })).toEqual([overnight]);
    expect(run(ts, { months: [11] })).toEqual([overnight, monthEnd, open]);
    expect(run(ts, { exitMonths: [12] })).toEqual([monthEnd]);
    expect(run(ts, { exitMonths: [11], exitWeekdays: [7] })).toEqual([]);
    expect(run(ts, { exitWeekdays: [2] })).toEqual([monthEnd]);
  });

  test('the R range reads the P&L basis the figures read', () => {
    const t = trade({ net: 90, gross: 100, fees: 10, initialRisk: 100 });
    const runOn = (pnlBasis: 'net' | 'gross', r: GlobalFilters['r']) =>
      applyFilters([t], { ...EMPTY_FILTERS, r }, { ...env, pnlBasis });
    expect(runOn('net', { min: 1 })).toEqual([]);
    expect(runOn('gross', { min: 1 })).toEqual([t]);
    expect(runOn('net', { max: 0.9 })).toEqual([t]);
  });

  test('the currency filter keeps one P&L currency', () => {
    const usd = trade({ pnlCurrency: 'USD' });
    const eur = trade({ pnlCurrency: 'EUR' });
    expect(run([usd, eur], { currency: 'EUR' })).toEqual([eur]);
    expect(run([usd, eur], {})).toEqual([usd, eur]);
    expect(advancedFilterCount({ ...EMPTY_FILTERS, currency: 'EUR' })).toBe(1);
  });

  test('the instrument filter keeps the asset classes, round-trips and counts', () => {
    const es = trade({ instrument: resolveInstrument('ESZ5')! });
    const fx = trade({ instrument: resolveInstrument('EURUSD')! });
    expect(run([es, fx], { assetClasses: ['forex'] })).toEqual([fx]);
    expect(run([es, fx], { assetClasses: ['forex', 'future'] })).toEqual([
      es,
      fx,
    ]);
    const f = parseFilters(new URLSearchParams('inst=forex,future,bogus'));
    expect(f.assetClasses).toEqual(['future', 'forex']);
    expect(
      serializeFilters({ ...EMPTY_FILTERS, assetClasses: ['forex'] }).get(
        'inst',
      ),
    ).toBe('forex');
    expect(
      queryString(
        serializeFilters(parseFilters(new URLSearchParams('inst=crypto'))),
      ),
    ).toBe('inst=crypto');
    expect(
      advancedFilterCount({ ...EMPTY_FILTERS, assetClasses: ['forex'] }),
    ).toBe(1);
  });

  test('the advanced count includes the exit day fields', () => {
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        exitWeekdays: [1],
        exitMonths: [2],
      }),
    ).toBe(2);
  });

  test('bad values for the new params are dropped', () => {
    expect(parseFilters(new URLSearchParams('dur=abc&wd=9&rating=7'))).toEqual(
      EMPTY_FILTERS,
    );
    expect(
      parseFilters(
        new URLSearchParams(
          'entry=25:00-26:00&outcome=huge&status=maybe&mo=13',
        ),
      ),
    ).toEqual(EMPTY_FILTERS);
  });

  test('tag: no tags ORs with the selection, as no strategy does', () => {
    const none = trade({ tagIds: [] });
    const x = trade({ tagIds: ['x'] });
    const xy = trade({ tagIds: ['x', 'y'] });
    expect(run([none, x, xy], { noTags: true })).toEqual([none]);
    expect(run([none, x, xy], { noTags: true, tagIds: ['y'] })).toEqual([
      none,
      xy,
    ]);
    expect(run([none, x, xy], { noTags: true, excludeTagIds: ['y'] })).toEqual([
      none,
    ]);
  });

  test('no initial risk keeps the trades with no R, on either basis', () => {
    const stop = trade({ initialRisk: 100 });
    const free = trade({});
    const zero = trade({ initialRisk: 0 });
    expect(run([stop, free, zero], { noInitialRisk: true })).toEqual([
      free,
      zero,
    ]);
    // With an R range asked too, nothing has both.
    expect(
      run([stop, free, zero], { noInitialRisk: true, r: { min: -9 } }),
    ).toEqual([]);
  });

  test('the R filter keeps a level trade by its stop side', () => {
    const levels = (unit: 'price', ...vs: number[]) => ({
      unit,
      levels: vs.map((value) => ({ value, qty: 1 })),
    });
    // One ES contract, $50 a point: a stop 10 points away risks $500.
    const stopped = applyTradePatch(trade({ net: 100000 }), {
      stops: levels('price', 4490),
    });
    // A target alone has no stop side, so no risk and no R.
    const targeted = applyTradePatch(trade({ net: 100000 }), {
      targets: levels('price', 4530),
    });
    // Both sides: the stop side alone is the risk.
    const both = applyTradePatch(trade({ net: 100000 }), {
      stops: levels('price', 4490),
      targets: levels('price', 4530),
    });
    const old = trade({ net: 100000, plannedStop: 4490, initialRisk: 50000 });
    const ts = [stopped, targeted, both, old];
    expect(run(ts, { r: { min: 2, max: 2 } })).toEqual([stopped, both, old]);
    expect(run(ts, { noInitialRisk: true })).toEqual([targeted]);
    expect(narrowToUnit(ts, 'r')).toEqual([stopped, both, old]);
  });

  test('sessions are cut in New York time, from the entry or the exit', () => {
    // November, so New York is UTC-5: 08:00 NY (london), 11:00 (new-york),
    // 17:00 (after hours), 20:00 (asia).
    const london = trade({
      openedAt: at('13:00'),
      closedAt: at('13:30'),
    });
    const ny = trade({ openedAt: at('16:00'), closedAt: at('16:30') });
    const after = trade({ openedAt: at('22:00'), closedAt: at('22:30') });
    const asia = trade({
      openedAt: '2026-11-19T01:00:00Z',
      closedAt: '2026-11-19T01:30:00Z',
    });
    const all = [london, ny, after, asia];
    expect(run(all, { sessions: ['london'] })).toEqual([london]);
    expect(run(all, { sessions: ['new-york', 'asia'] })).toEqual([ny, asia]);
    // Opened in the New York session, closed after hours.
    const long = trade({ openedAt: at('20:30'), closedAt: at('22:30') });
    expect(run([long], { sessions: ['new-york'] })).toEqual([long]);
    expect(run([long], { exitSessions: ['new-york'] })).toEqual([]);
    expect(run([long], { exitSessions: ['after-hours'] })).toEqual([long]);
    // An open trade has no exit.
    const open = trade({ status: 'open', openedAt: at('16:00') });
    expect(run([open], { exitSessions: ['new-york'] })).toEqual([]);
    expect(run([open], { sessions: ['new-york'] })).toEqual([open]);
  });

  test('days to expiry counts whole days from the day the trade opened, and only options have it', () => {
    const option = (day: string, expiry: string) =>
      trade({
        openedAt: `${day}T15:00:00Z`,
        closedAt: `${day}T16:00:00Z`,
        instrument: {
          ...resolveInstrument('ESZ5')!,
          assetClass: 'option',
          expiry,
        },
      });
    const zero = option('2026-11-18', '2026-11-18');
    const week = option('2026-11-18', '2026-11-25');
    const far = option('2026-11-18', '2027-01-15');
    const future = trade({});
    const all = [zero, week, far, future];
    expect(run(all, { daysToExpiry: { max: 0 } })).toEqual([zero]);
    expect(run(all, { daysToExpiry: { min: 2, max: 7 } })).toEqual([week]);
    expect(run(all, { daysToExpiry: { min: 31 } })).toEqual([far]);
  });

  test('every new param survives a round trip, and the advanced count includes them', () => {
    const f: GlobalFilters = {
      ...EMPTY_FILTERS,
      noTags: true,
      noInitialRisk: true,
      sessions: ['new-york', 'asia'],
      exitSessions: ['london'],
      daysToExpiry: { min: 2, max: 7 },
    };
    const qs = queryString(serializeFilters(f));
    expect(qs).toBe('notag=1&norisk=1&dte=2_7&sess=asia,new-york&xsess=london');
    expect(parseFilters(new URLSearchParams(qs))).toEqual({
      ...f,
      sessions: ['asia', 'new-york'],
    });
    expect(advancedFilterCount(f)).toBe(5);
    // Nothing but the right value is read.
    expect(
      parseFilters(
        new URLSearchParams('notag=0&norisk=yes&sess=mars,asia&dte=x'),
      ),
    ).toEqual({ ...EMPTY_FILTERS, sessions: ['asia'] });
  });

  test('the advanced count is one per group in use', () => {
    expect(advancedFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        outcomes: ['loss'],
        weekdays: [3],
      }),
    ).toBe(2);
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        noStrategy: true,
        excludeSymbols: ['ES'],
        r: { min: 1 },
        entryWindows: [{ from: '09:00' }],
      }),
    ).toBe(4);
    // Symbol, side, strategy, tags and the date have chips of their own.
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        symbols: ['ES'],
        side: 'long',
        strategyIds: ['s'],
        tagIds: ['t'],
      }),
    ).toBe(0);
  });
});

describe('previousRange', () => {
  test('is the stretch of equal length that ends the day before', () => {
    expect(
      previousRange({ from: '2026-11-10', to: '2026-11-16' }, '2026-11-20'),
    ).toEqual({ from: '2026-11-03', to: '2026-11-09' });
    expect(previousRange({ preset: 'last-month' }, '2026-11-20')).toEqual({
      // October is 31 days: the 31 days before it.
      from: '2026-08-31',
      to: '2026-09-30',
    });
    // A preset that runs to today counts today in its length: Sun to Wed is four days.
    expect(previousRange({ preset: 'this-week' }, '2026-11-18')).toEqual({
      from: '2026-11-11',
      to: '2026-11-14',
    });
    // Monday weeks: Mon to Wed is three days.
    expect(
      previousRange({ preset: 'this-week' }, '2026-11-18', 'monday'),
    ).toEqual({ from: '2026-11-13', to: '2026-11-15' });
  });
  test('an open end runs to today, and no start has no previous period', () => {
    expect(previousRange({ from: '2026-11-19' }, '2026-11-20')).toEqual({
      from: '2026-11-17',
      to: '2026-11-18',
    });
    expect(previousRange({}, '2026-11-20')).toBeUndefined();
    expect(previousRange({ to: '2026-11-10' }, '2026-11-20')).toBeUndefined();
  });
});

describe('the Patterns filter', () => {
  // 10:00 New York on 2026-11-18 is 15:00Z.
  const at = (hhmm: string, day = '2026-11-18') => `${day}T${hhmm}:00Z`;
  const trade = (id: string, openedAt: string, closedAt: string) =>
    makeTrade({ id, net: 100, accountId: 'a', openedAt, closedAt });
  const a = trade('a', at('15:00'), at('15:10'));
  const b = trade('b', at('16:00'), at('16:10'));
  const c = trade('c', at('17:00'), at('17:10'));
  const d = trade('d', at('15:00', '2026-11-19'), at('15:10', '2026-11-19'));
  const all = [a, b, c, d];
  // Trade `a` carries a trade pattern; the 18th carries a day pattern.
  const index = {
    byTrade: new Map([['a', [{ id: 'large-size' as const }]]]),
    byDay: new Map([['2026-11-18', [{ id: 'rushed-red-day' as const }]]]),
  };
  const run = (patterns: GlobalFilters['patterns'], patternIndex = index) =>
    applyFilters(
      all,
      { ...EMPTY_FILTERS, patterns },
      {
        ...env,
        patterns: patternIndex,
      },
    );

  test("the filter round-trips in the URL and keeps a day pattern's trades", () => {
    const f: GlobalFilters = {
      ...EMPTY_FILTERS,
      patterns: ['rushed-red-day', 'large-size'],
    };
    // Written once, in the order the patterns are listed in; read back the same.
    const qs = queryString(serializeFilters(f));
    expect(qs).toBe('pat=large-size,rushed-red-day');
    expect(parseFilters(new URLSearchParams(qs)).patterns).toEqual([
      'large-size',
      'rushed-red-day',
    ]);
    // Repeated keys read too; unknown ids and repeats are dropped.
    expect(
      parseFilters(
        new URLSearchParams(
          'pat=large-size&pat=nope&pat=large-size,held-longer',
        ),
      ).patterns,
    ).toEqual(['held-longer', 'large-size']);
    expect(FILTER_PARAMS).toContain('pat');
    expect(mergeFilterParams(new URLSearchParams('page=2'), f).toString()).toBe(
      'page=2&pat=large-size%2Crushed-red-day',
    );
    expect(serializeFilters(EMPTY_FILTERS).has('pat')).toBe(false);

    // A trade pattern keeps the trades it fired on.
    expect(run(['large-size']).map((t) => t.id)).toEqual(['a']);
    // A day pattern keeps every trade of that day, and no other day's.
    expect(run(['rushed-red-day']).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    // Any of the picks keeps a trade; none picked keeps all.
    expect(run(['large-size', 'rushed-red-day']).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(run([]).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    // A pattern that fired nowhere keeps nothing; so does a pick with no index.
    expect(run(['held-longer'])).toEqual([]);
    expect(
      applyFilters(all, { ...EMPTY_FILTERS, patterns: ['large-size'] }, env),
    ).toEqual([]);
  });

  test("a trade's day is the day it closed, an open trade's the day it opened (K37)", () => {
    const overnight = trade('n', at('23:00'), at('13:00', '2026-11-19'));
    const open = makeTrade({
      id: 'o',
      net: 0,
      accountId: 'a',
      status: 'open',
      openedAt: at('16:30'),
    });
    const kept = applyFilters(
      [overnight, open],
      { ...EMPTY_FILTERS, patterns: ['rushed-red-day'] },
      {
        ...env,
        patterns: {
          byTrade: new Map(),
          byDay: new Map([['2026-11-18', [{ id: 'rushed-red-day' as const }]]]),
        },
      },
    );
    // The overnight trade closed on the 19th (no pattern); the open one is the 18th's.
    expect(kept.map((t) => t.id)).toEqual(['o']);
  });

  test('the advanced count and the unshown list count a Patterns pick once', () => {
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        patterns: ['large-size', 'held-longer'],
      }),
    ).toBe(1);
  });
});
