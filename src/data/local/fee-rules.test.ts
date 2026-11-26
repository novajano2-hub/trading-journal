import { describe, expect, test, vi } from 'vitest';
import { feeInput, rulesSetup, M } from '../__fixtures__/rules';
import { ArchivedAccountError, NotFoundError } from '../repository';

const costs = (t: { executions: { commission: number; fees: number }[] }) =>
  t.executions.map((e) => [e.commission, e.fees]);

describe('fee rule storage', () => {
  test('create, edit and delete each log one row, with source you', async () => {
    const { repo, acc, rows } = await rulesSetup();
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    expect(rule).toMatchObject({
      workspaceId: M,
      accountId: acc.id,
      assetClass: 'future',
      symbols: [],
      mode: 'per-execution',
      applyOn: 'all',
      commission: 150,
      fee: 20,
      createdAt: expect.any(String),
    });
    const edited = await repo.feeRules.update(M, rule.id, {
      mode: 'per-contract',
      commission: 200,
    });
    expect(edited).toMatchObject({
      id: rule.id,
      createdAt: rule.createdAt,
      mode: 'per-contract',
      commission: 200,
      fee: 20,
    });
    await repo.feeRules.remove(M, rule.id);
    expect(await repo.feeRules.list(M)).toEqual([]);

    const log = (await rows('fee-rule')).map((r) => [
      r.action,
      r.source,
      r.field,
      r.oldValue,
      r.newValue,
      r.label,
    ]);
    const label = 'Futures, Future, All symbols';
    expect(log).toEqual([
      ['created', 'you', undefined, undefined, undefined, label],
      ['deleted', 'you', undefined, undefined, undefined, label],
      // The amounts are logged as cents; the reader formats them.
      ['edited', 'you', 'commission', 150, 200, label],
      ['edited', 'you', 'mode', 'per-execution', 'per-contract', label],
    ]);
  });

  test('the list is newest first, and symbols are tidied', async () => {
    const { repo, acc } = await rulesSetup();
    const a = await repo.feeRules.create(
      M,
      feeInput(acc.id, { symbols: [' mnq ', 'MNQ'] }),
    );
    const b = await repo.feeRules.create(M, feeInput(acc.id));
    expect(a.symbols).toEqual(['MNQ']);
    expect((await repo.feeRules.list(M)).map((r) => r.id)).toEqual([
      b.id,
      a.id,
    ]);
    expect(await repo.feeRules.list('sample')).toEqual([]);
  });

  test('a rule needs its account and costs in whole non-negative cents; nothing is written when it does not', async () => {
    const { repo, acc, rowCount } = await rulesSetup();
    const before = await rowCount();
    await expect(
      repo.feeRules.create(M, feeInput('nope')),
    ).rejects.toBeInstanceOf(NotFoundError);
    for (const over of [
      { commission: -1 },
      { fee: 1.5 },
      { commission: Number.NaN },
      { mode: 'per-lot' as never },
      { applyOn: 'half' as never },
      { assetClass: 'bond' as never },
    ])
      await expect(
        repo.feeRules.create(M, feeInput(acc.id, over)),
      ).rejects.toBeInstanceOf(RangeError);
    expect(await repo.feeRules.list(M)).toEqual([]);
    expect(await rowCount()).toBe(before);
    // Zero is allowed: the dialog opens at 0.00.
    await expect(
      repo.feeRules.create(M, feeInput(acc.id, { commission: 0, fee: 0 })),
    ).resolves.toMatchObject({ commission: 0, fee: 0 });
  });

  test('an edit is held to the same rules; unknown rules are not found; nothing changed logs nothing', async () => {
    const { repo, acc, rowCount } = await rulesSetup();
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    await expect(
      repo.feeRules.update(M, rule.id, { fee: -5 }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.feeRules.update(M, rule.id, { accountId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repo.feeRules.update(M, 'nope', { fee: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.feeRules.remove(M, 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const before = await rowCount();
    await repo.feeRules.update(M, rule.id, { commission: 150 });
    expect(await rowCount()).toBe(before);
    expect(await repo.feeRules.list(M)).toEqual([rule]);
  });

  test('a row that cannot be written takes the rule change back with it', async () => {
    const { repo, acc } = await rulesSetup();
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(
        repo.feeRules.update(M, rule.id, { fee: 1 }),
      ).rejects.toThrow('no id');
      await expect(repo.feeRules.remove(M, rule.id)).rejects.toThrow('no id');
      await expect(repo.feeRules.create(M, feeInput(acc.id))).rejects.toThrow(
        'no id',
      );
    } finally {
      spy.mockRestore();
    }
    expect(await repo.feeRules.list(M)).toEqual([rule]);
  });

  test('removing an account removes its rules, quietly', async () => {
    const { repo, acc, account, rows } = await rulesSetup();
    const other = await account('Other');
    await repo.feeRules.create(M, feeInput(other.id));
    const kept = await repo.feeRules.create(M, feeInput(acc.id));
    await repo.accounts.remove(M, other.id);
    expect((await repo.feeRules.list(M)).map((r) => r.id)).toEqual([kept.id]);
    expect(
      (await rows('fee-rule')).filter((r) => r.action === 'deleted'),
    ).toEqual([]);
  });
});

describe('applying a fee rule to existing trades', () => {
  test('apply to existing counts and logs with source rule', async () => {
    const { repo, acc, account, trip, manual, rows } = await rulesSetup();
    const other = await account('Other');
    const a = await trip(acc.id, 2, 6000, 6004);
    // A manual trade counts (B16); so does an open one.
    const b = await manual(acc.id, [['buy', 1, 6020, '15:00']]);
    const c = await trip(other.id, 2, 6000, 6004);
    const d = await trip(acc.id, 2, 190, 191, 'AAPL', ['16:00', '16:05']);
    const rule = await repo.feeRules.create(
      M,
      feeInput(acc.id, { mode: 'per-contract' }),
    );

    expect(await repo.feeRules.applyExisting(M, rule.id, false)).toBe(2);

    const after = Object.fromEntries(
      (await repo.trades.list(M)).map((t) => [t.id, t]),
    );
    // Two contracts in and out, at 150 + 20 each.
    expect(costs(after[a.id]!)).toEqual([
      [300, 40],
      [300, 40],
    ]);
    expect(after[a.id]!.fees).toBe(680);
    expect(after[a.id]!.net).toBe(a.net - 680);
    expect(after[a.id]!.gross).toBe(a.gross);
    expect(costs(after[b.id]!)).toEqual([[150, 20]]);
    expect(after[b.id]!.fees).toBe(170);
    for (const t of [c, d]) expect(after[t.id]).toEqual(t);

    const logged = (await rows('trade')).filter((r) => r.source === 'rule');
    expect(
      logged.map((r) => [
        r.entityId,
        r.action,
        r.field,
        r.oldValue,
        r.newValue,
        r.label,
      ]),
    ).toEqual(
      [
        [a.id, 'edited', 'fees', 0, 680, 'ESZ5 2026-11-19'],
        [b.id, 'edited', 'fees', 0, 170, 'ESZ5 2026-11-19'],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
    // Nothing is left to write.
    expect(await repo.feeRules.applyExisting(M, rule.id, false)).toBe(0);
    expect(
      (await rows('trade')).filter((r) => r.source === 'rule'),
    ).toHaveLength(2);
  });

  test('without override a trade with any costed fill is skipped; with override every matching fill is replaced', async () => {
    const { repo, acc, manual, trip, rows } = await rulesSetup();
    const costed = await manual(acc.id, [
      ['buy', 1, 6000, '14:30', { commission: 100 }],
      ['sell', 1, 6004, '14:40'],
    ]);
    const bare = await trip(acc.id, 1, 6000, 6004, 'ESZ5', ['15:00', '15:10']);
    const rule = await repo.feeRules.create(M, feeInput(acc.id));

    expect(await repo.feeRules.applyExisting(M, rule.id, false)).toBe(1);
    expect(costs((await repo.trades.get(M, costed.id))!)).toEqual([
      [100, 0],
      [0, 0],
    ]);
    expect(costs((await repo.trades.get(M, bare.id))!)).toEqual([
      [150, 20],
      [150, 20],
    ]);

    // Override replaces the costed trade's fills, and the bare trade is already as the rule has it.
    expect(await repo.feeRules.applyExisting(M, rule.id, true)).toBe(1);
    const replaced = (await repo.trades.get(M, costed.id))!;
    expect(costs(replaced)).toEqual([
      [150, 20],
      [150, 20],
    ]);
    expect(replaced.fees).toBe(340);
    expect(replaced.net).toBe(costed.net + costed.fees - 340);
    const row = (await rows('trade')).find(
      (r) => r.source === 'rule' && r.entityId === costed.id,
    );
    expect(row).toMatchObject({ field: 'fees', oldValue: 100, newValue: 340 });
  });

  test('the rule applies on entry or exit only, and the swap stays in the net', async () => {
    const { repo, acc, db, trip } = await rulesSetup();
    const t = await trip(acc.id, 1, 6000, 6004);
    // A trade that carries swap: it is inside the net and not in the gross.
    await db.trades.put({ ...t, swap: -325, net: t.net - 325 });
    const rule = await repo.feeRules.create(
      M,
      feeInput(acc.id, { applyOn: 'exit' }),
    );
    expect(await repo.feeRules.applyExisting(M, rule.id, false)).toBe(1);
    const after = (await repo.trades.get(M, t.id))!;
    expect(costs(after)).toEqual([
      [0, 0],
      [150, 20],
    ]);
    expect(after.swap).toBe(-325);
    expect(after.gross).toBe(t.gross);
    expect(after.net).toBe(t.gross - 170 - 325);
  });

  test('a trade settled in another currency than its account is left alone', async () => {
    const { repo, acc, db, trip } = await rulesSetup();
    const t = await trip(acc.id, 1, 6000, 6004);
    await db.trades.put({ ...t, pnlCurrency: 'JPY' });
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    expect(await repo.feeRules.applyExisting(M, rule.id, true)).toBe(0);
  });

  test('an archived account, or an unknown rule, refuses and writes nothing', async () => {
    const { repo, acc, trip, rowCount } = await rulesSetup();
    const t = await trip(acc.id, 1, 6000, 6004);
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    await repo.accounts.update(M, acc.id, { status: 'archived' });
    const before = await rowCount();
    await expect(
      repo.feeRules.applyExisting(M, rule.id, true),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
    expect(await repo.trades.get(M, t.id)).toEqual(t);
    expect(await rowCount()).toBe(before);
    await expect(
      repo.feeRules.applyExisting(M, 'nope', true),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('a row that cannot be written takes every trade of the apply back', async () => {
    const { repo, acc, trip } = await rulesSetup();
    const t = await trip(acc.id, 1, 6000, 6004);
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(
        repo.feeRules.applyExisting(M, rule.id, false),
      ).rejects.toThrow('no id');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.trades.get(M, t.id)).toEqual(t);
  });

  test('an apply that changed trades makes a pending import plan stale', async () => {
    const { repo, acc, trip, plan } = await rulesSetup();
    await trip(acc.id, 1, 6000, 6004);
    const rule = await repo.feeRules.create(M, feeInput(acc.id));
    const pending = await plan(
      'Date/Time,Symbol,Buy/Sell,Quantity,Price\n2026-11-20 09:30:00,NQZ5,Buy,1,21000\n',
      'imp-1',
    );
    expect(await repo.feeRules.applyExisting(M, rule.id, false)).toBe(1);
    await expect(repo.imports.commit(M, pending)).rejects.toMatchObject({
      name: 'StalePlanError',
    });
  });
});
