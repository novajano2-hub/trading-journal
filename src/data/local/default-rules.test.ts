import { describe, expect, test, vi } from 'vitest';
import { tradeRisk } from '@/domain/risk';
import { feeInput, H, M, rulesSetup, targetInput } from '../__fixtures__/rules';

const costs = (t: { executions: { commission: number; fees: number }[] }) =>
  t.executions.map((e) => [e.commission, e.fees]);

/** An ES round trip, a costed NQ round trip (commission 2.50 on the entry) and an AAPL round trip. */
const FILE =
  H +
  [
    '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,',
    '2026-11-16 09:40:00,ESZ5,Sell,2,6004,,',
    '2026-11-16 10:30:00,NQZ5,Buy,1,21000,2.50,',
    '2026-11-16 10:40:00,NQZ5,Sell,1,21010,,',
    '2026-11-16 11:30:00,AAPL,Buy,10,190,,',
    '2026-11-16 11:40:00,AAPL,Sell,10,191,,',
  ].join('\n') +
  '\n';

/** Ten points to the target and five to the stop, so the same rule fits ES and NQ. */
const MOVE = {
  target: { unit: 'movement' as const, levels: [{ value: 10, pct: 100 }] },
  stop: { unit: 'movement' as const, levels: [{ value: 5, pct: 100 }] },
};

const bySymbol = async (repo: Awaited<ReturnType<typeof rulesSetup>>['repo']) =>
  Object.fromEntries(
    (await repo.trades.list(M)).map((t) => [t.instrument.symbol, t]),
  );

describe('the rules on import', () => {
  test('import applies both kinds to new trades only', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.targetRules.create(M, targetInput(acc.id, MOVE));
    await repo.feeRules.create(M, feeInput(acc.id));
    await commit(FILE, 'imp-1');
    const t = await bySymbol(repo);

    // The ES trade: levels from the rule, risk from its stop, a cost on each fill.
    const es = t['ESZ5']!;
    expect(es.targets).toEqual({
      unit: 'movement',
      levels: [{ value: 10, qty: 2 }],
    });
    expect(es.stops!.levels).toEqual([{ value: 5, qty: 2 }]);
    expect(es.initialRisk).toBe(50000);
    expect(es.initialRisk).toBe(tradeRisk(es));
    expect(costs(es)).toEqual([
      [150, 20],
      [150, 20],
    ]);
    expect(es.fees).toBe(340);
    // Net and gross are rebuilt from the fills: +$400 gross, less the costs.
    expect(es.gross).toBe(40000);
    expect(es.net).toBe(40000 - 340);
    expect(es.status).toBe('closed');

    // The NQ trade carries a commission from its file, so the fee rule leaves it; levels still apply.
    const nqTrade = t['NQZ5']!;
    expect(costs(nqTrade)).toEqual([
      [250, 0],
      [0, 0],
    ]);
    expect(nqTrade.fees).toBe(250);
    expect(nqTrade.targets).toBeDefined();

    // AAPL is not a future: neither rule covers it.
    const aapl = t['AAPL']!;
    expect(aapl.targets).toBeUndefined();
    expect(aapl.stops).toBeUndefined();
    expect(aapl.fees).toBe(0);
  });

  test('a trade a later import closes keeps its levels, and the fill the import adds is costed', async () => {
    const { repo, acc, commit } = await rulesSetup();
    const target = await repo.targetRules.create(M, targetInput(acc.id));
    await repo.feeRules.create(M, feeInput(acc.id));
    await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
    const [open] = await repo.trades.list(M);
    expect(open!.status).toBe('open');
    expect(costs(open!)).toEqual([[150, 20]]);
    expect(open!.stops!.levels).toEqual([{ value: 5995, qty: 2 }]);

    // The levels rule changes; the next file closes the same trade.
    await repo.targetRules.update(M, target.id, {
      stop: { unit: 'price', levels: [{ value: 5900, pct: 100 }] },
    });
    await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,2,6004,,\n', 'imp-2');
    const [closed] = await repo.trades.list(M);
    expect(closed!.id).toBe(open!.id);
    expect(closed!.status).toBe('closed');
    // Its levels are as the first import left them (B17), and the full charge is on it.
    expect(closed!.stops!.levels).toEqual([{ value: 5995, qty: 2 }]);
    expect(costs(closed!)).toEqual([
      [150, 20],
      [150, 20],
    ]);
    expect(closed!.fees).toBe(340);
    expect(closed!.gross).toBe(40000);
    expect(closed!.net).toBe(40000 - 340);
  });

  test('the new fill of a carried-on trade is costed by the rule as it is then, once', async () => {
    const { repo, acc, commit } = await rulesSetup();
    const fee = await repo.feeRules.create(M, feeInput(acc.id));
    await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
    await repo.feeRules.update(M, fee.id, { commission: 999 });
    await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,1,6004,,\n', 'imp-2');
    await commit(H + '2026-11-16 09:50:00,ESZ5,Sell,1,6006,,\n', 'imp-3');
    const [t] = await repo.trades.list(M);
    // Each import costs the fills it brought and leaves the earlier ones as they were.
    expect(costs(t!)).toEqual([
      [150, 20],
      [999, 20],
      [999, 20],
    ]);
    expect(t!.fees).toBe(170 + 1019 * 2);
  });

  test('Apply on reads the whole position: an exit rule costs the closing fill, an entry rule leaves it', async () => {
    for (const [applyOn, expected] of [
      [
        'exit',
        [
          [0, 0],
          [150, 20],
        ],
      ],
      [
        'entry',
        [
          [150, 20],
          [0, 0],
        ],
      ],
    ] as const) {
      const { repo, acc, commit } = await rulesSetup();
      await repo.feeRules.create(M, feeInput(acc.id, { applyOn }));
      await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
      await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,2,6004,,\n', 'imp-2');
      const [t] = await repo.trades.list(M);
      expect(costs(t!), applyOn).toEqual(expected);
      expect(t!.fees, applyOn).toBe(170);
    }
  });

  test('a new fill that carries costs from the file is left as it is', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.feeRules.create(M, feeInput(acc.id));
    await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
    await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,2,6004,2.50,\n', 'imp-2');
    const [t] = await repo.trades.list(M);
    expect(costs(t!)).toEqual([
      [150, 20],
      [250, 0],
    ]);
    expect(t!.fees).toBe(420);
  });

  test('a rule that does not match leaves the new fill of a carried-on trade alone', async () => {
    const { repo, acc, commit } = await rulesSetup();
    // A stock rule does not cover an ES trade; neither does a rule of another account.
    await repo.feeRules.create(M, feeInput(acc.id, { assetClass: 'stock' }));
    await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
    await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,2,6004,,\n', 'imp-2');
    const [t] = await repo.trades.list(M);
    expect(costs(t!)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(t!.fees).toBe(0);
  });

  test('the settlement of an expired option is not a fill that costs', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.feeRules.create(M, feeInput(acc.id, { assetClass: 'option' }));
    // Planned after the expiry, so the import closes the option at 0 with a fill of its own.
    await commit(
      H + '2026-11-18 10:00:00,AAPL  261120C00150000,Buy,1,1.50,,\n',
      'imp-1',
    );
    const [t] = await repo.trades.list(M);
    expect(t!.status).toBe('closed');
    expect(costs(t!)).toEqual([
      [150, 20],
      [0, 0],
    ]);
    expect(t!.fees).toBe(170);
  });

  test('a carried-on option the next import settles at its expiry costs its new broker fill only', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.feeRules.create(
      M,
      feeInput(acc.id, { assetClass: 'option', mode: 'per-contract' }),
    );
    // Expires 2026-11-27: still open when the first import is planned on the 21st.
    const CALL = 'AAPL  261127C00150000';
    await commit(H + `2026-11-18 10:00:00,${CALL},Buy,2,1.50,,\n`, 'imp-1');
    const [open] = await repo.trades.list(M);
    expect(open!.status).toBe('open');
    expect(costs(open!)).toEqual([[300, 40]]);
    // Planned after the expiry close: one contract is sold, the other settles at 0.
    await commit(
      H + `2026-11-24 10:00:00,${CALL},Sell,1,2.00,,\n`,
      'imp-2',
      acc.id,
      '2026-11-28T00:00:00.000Z',
    );
    const [t] = await repo.trades.list(M);
    expect(t!.id).toBe(open!.id);
    expect(t!.status).toBe('closed');
    expect(t!.executions.map((e) => e.id.endsWith(':expiry'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(costs(t!)).toEqual([
      [300, 40],
      [150, 20],
      [0, 0],
    ]);
    expect(t!.fees).toBe(510);
  });

  test('a carried-on option whose only new fill is its expiry settlement is not costed', async () => {
    const { repo, acc, commit } = await rulesSetup();
    const CALL = 'AAPL  261127C00150000';
    await commit(H + `2026-11-18 10:00:00,${CALL},Buy,1,1.50,,\n`, 'imp-1');
    await repo.feeRules.create(M, feeInput(acc.id, { assetClass: 'option' }));
    // A file of another symbol, planned after the expiry: the option settles on its own.
    await commit(
      H + '2026-11-24 09:30:00,ESZ5,Buy,1,6000,,\n',
      'imp-2',
      acc.id,
      '2026-11-28T00:00:00.000Z',
    );
    const option = (await repo.trades.list(M)).find(
      (t) => t.instrument.assetClass === 'option',
    )!;
    expect(option.status).toBe('closed');
    expect(costs(option)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(option.fees).toBe(0);
  });

  test('a trade left open before the rules existed is given no levels by the next import, and costs only on its new fill', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await commit(H + '2026-11-16 09:30:00,ESZ5,Buy,2,6000,,\n', 'imp-1');
    await repo.targetRules.create(M, targetInput(acc.id));
    await repo.feeRules.create(M, feeInput(acc.id));
    await commit(H + '2026-11-16 09:40:00,ESZ5,Sell,2,6004,,\n', 'imp-2');
    const [t] = await repo.trades.list(M);
    expect(t!.status).toBe('closed');
    // Levels are not given to a trade that already exists (B17); the fill the import added is costed.
    expect(t!.targets).toBeUndefined();
    expect(t!.stops).toBeUndefined();
    expect(costs(t!)).toEqual([
      [0, 0],
      [150, 20],
    ]);
    expect(t!.fees).toBe(170);
    // A new trade in the same file would have had them: the later import brings one.
    await commit(
      H +
        '2026-11-16 11:00:00,ESZ5,Buy,1,6000,,\n2026-11-16 11:10:00,ESZ5,Sell,1,6004,,\n',
      'imp-3',
    );
    const trades = await repo.trades.list(M);
    expect(trades).toHaveLength(2);
    expect(trades[1]!.stops).toBeDefined();
    expect(trades[1]!.fees).toBe(340);
  });

  test('the picked rule is the symbol rule over the all-symbols rules, then the newest', async () => {
    const { repo, acc, commit } = await rulesSetup();
    const move = (value: number) => ({
      unit: 'movement' as const,
      levels: [{ value, pct: 100 }],
    });
    const only = (rule: Parameters<typeof targetInput>[1]) =>
      targetInput(acc.id, { stop: undefined, ...rule });
    // The oldest names ES; two newer ones name no symbol.
    await repo.targetRules.create(
      M,
      only({ symbols: ['ES'], target: move(10) }),
    );
    await repo.targetRules.create(M, only({ target: move(30) }));
    await repo.targetRules.create(M, only({ target: move(50) }));
    await repo.feeRules.create(M, feeInput(acc.id, { commission: 100 }));
    await repo.feeRules.create(M, feeInput(acc.id, { commission: 300 }));
    await commit(FILE, 'imp-1');
    const t = await bySymbol(repo);
    expect(t['ESZ5']!.targets!.levels[0]!.value).toBe(10);
    // NQ is named by no rule: the newest all-symbols rule.
    expect(t['NQZ5']!.targets!.levels[0]!.value).toBe(50);
    expect(costs(t['ESZ5']!)[0]).toEqual([300, 20]);
  });

  test('a closed-trades file keeps the P&L it gave when a fee rule costs the trade', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.feeRules.create(M, feeInput(acc.id, { assetClass: 'forex' }));
    // EURGBP on a dollar account: the file's $125.00 is the figure, in the account currency.
    await commit(
      'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L\n' +
        '2026-11-16 09:30:00,2026-11-16 09:45:00,EURGBP,Long,1,0.8700,0.8710,0,125.00\n',
      'imp-1',
    );
    const [t] = await repo.trades.list(M);
    expect(t).toMatchObject({
      pnlCurrency: 'USD',
      gross: 12500,
      fees: 340,
      net: 12500 - 340,
    });
    expect(costs(t!)).toEqual([
      [150, 20],
      [150, 20],
    ]);
  });

  test('a rule of another account does not apply', async () => {
    const { repo, acc, account, commit } = await rulesSetup();
    const other = await account('Other');
    await repo.targetRules.create(M, targetInput(other.id));
    await repo.feeRules.create(M, feeInput(other.id));
    await commit(FILE, 'imp-1', acc.id);
    for (const t of await repo.trades.list(M)) {
      expect(t.targets).toBeUndefined();
      expect(t.fees).toBe(t.instrument.symbol === 'NQZ5' ? 250 : 0);
    }
  });

  test('an import logs its one row and none for the rules', async () => {
    const { repo, acc, commit, rows } = await rulesSetup();
    await repo.targetRules.create(M, targetInput(acc.id));
    await repo.feeRules.create(M, feeInput(acc.id));
    await commit(FILE, 'imp-1');
    expect(await rows('trade')).toEqual([]);
    expect((await rows('import')).map((r) => [r.action, r.source])).toEqual([
      ['created', 'import'],
    ]);
  });

  test('a commit that fails takes nothing with it, rules included', async () => {
    const { repo, acc, plan } = await rulesSetup();
    await repo.targetRules.create(M, targetInput(acc.id));
    await repo.feeRules.create(M, feeInput(acc.id));
    const pending = await plan(FILE, 'imp-1');
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(repo.imports.commit(M, pending)).rejects.toThrow('no id');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.trades.list(M)).toEqual([]);
  });

  test('a stop the rule would put on the wrong side is skipped for that trade', async () => {
    const { repo, acc, commit } = await rulesSetup();
    await repo.targetRules.create(
      M,
      targetInput(acc.id, {
        // A long's stop above its entry: skipped; the target stands.
        stop: { unit: 'price', levels: [{ value: 6500, pct: 100 }] },
      }),
    );
    await commit(FILE, 'imp-1');
    const es = (await bySymbol(repo))['ESZ5']!;
    expect(es.targets).toBeDefined();
    expect(es.stops).toBeUndefined();
    expect(es.initialRisk).toBeUndefined();
  });
});

describe('manual trades', () => {
  test('a manual trade is untouched on entry, and Fill in logged trades covers it', async () => {
    const { repo, acc, trip } = await rulesSetup();
    const target = await repo.targetRules.create(M, targetInput(acc.id));
    const fee = await repo.feeRules.create(M, feeInput(acc.id));
    const t = await trip(acc.id, 2, 6000, 6004);
    // B16: nothing on entry.
    expect(t.targets).toBeUndefined();
    expect(t.stops).toBeUndefined();
    expect(t.fees).toBe(0);
    expect(costs(t)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await repo.trades.get(M, t.id)).toEqual(t);

    expect(await repo.targetRules.applyExisting(M, target.id, false)).toBe(1);
    expect(await repo.feeRules.applyExisting(M, fee.id, false)).toBe(1);
    const after = (await repo.trades.get(M, t.id))!;
    expect(after.stops!.levels).toEqual([{ value: 5995, qty: 2 }]);
    expect(costs(after)).toEqual([
      [150, 20],
      [150, 20],
    ]);
    expect(after.net).toBe(t.net - 340);
  });
});

describe('editing and deleting a rule', () => {
  test('deleting a rule leaves applied values', async () => {
    const { repo, acc, commit, trip } = await rulesSetup();
    const target = await repo.targetRules.create(M, targetInput(acc.id));
    const fee = await repo.feeRules.create(M, feeInput(acc.id));
    await commit(FILE, 'imp-1');
    const manual = await trip(acc.id, 1, 6000, 6004, 'ESZ5', [
      '15:00',
      '15:10',
    ]);
    await repo.targetRules.applyExisting(M, target.id, false);
    await repo.feeRules.applyExisting(M, fee.id, false);
    const before = await repo.trades.list(M);
    expect(before.some((t) => t.id === manual.id && t.fees === 340)).toBe(true);

    await repo.targetRules.remove(M, target.id);
    await repo.feeRules.remove(M, fee.id);
    expect(await repo.trades.list(M)).toEqual(before);
  });

  test('editing a rule leaves applied values; only Fill in logged trades rewrites them', async () => {
    const { repo, acc, commit } = await rulesSetup();
    const target = await repo.targetRules.create(M, targetInput(acc.id));
    const fee = await repo.feeRules.create(M, feeInput(acc.id));
    await commit(FILE, 'imp-1');
    const before = await repo.trades.list(M);

    await repo.targetRules.update(M, target.id, {
      target: { unit: 'price', levels: [{ value: 6100, pct: 100 }] },
    });
    await repo.feeRules.update(M, fee.id, { commission: 999 });
    expect(await repo.trades.list(M)).toEqual(before);

    // With override the new rule replaces what the old one wrote.
    expect(
      await repo.targetRules.applyExisting(M, target.id, true),
    ).toBeGreaterThan(0);
    expect(await repo.feeRules.applyExisting(M, fee.id, true)).toBeGreaterThan(
      0,
    );
    const es = (await bySymbol(repo))['ESZ5']!;
    expect(es.targets!.levels).toEqual([{ value: 6100, qty: 2 }]);
    expect(costs(es)).toEqual([
      [999, 20],
      [999, 20],
    ]);
  });

  test('rules are cleared with My workspace', async () => {
    const { repo, acc } = await rulesSetup();
    await repo.targetRules.create(M, targetInput(acc.id));
    await repo.feeRules.create(M, feeInput(acc.id));
    await repo.workspaces.clearUser();
    expect(await repo.targetRules.list(M)).toEqual([]);
    expect(await repo.feeRules.list(M)).toEqual([]);
  });
});
