import { describe, expect, test, vi } from 'vitest';
import { tradeRisk } from '@/domain/risk';
import { rulesSetup, M, targetInput } from '../__fixtures__/rules';
import { ArchivedAccountError, NotFoundError } from '../repository';

const LONG = { unit: 'price' as const };

describe('target rule storage', () => {
  test('create, edit and delete each log one row, with source you', async () => {
    const { repo, acc, rows } = await rulesSetup();
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    expect(rule).toMatchObject({
      id: expect.any(String),
      workspaceId: M,
      accountId: acc.id,
      assetClass: 'future',
      symbols: [],
      createdAt: expect.any(String),
    });
    const edited = await repo.targetRules.update(M, rule.id, {
      symbols: ['MNQ'],
      stop: undefined,
    });
    expect(edited.symbols).toEqual(['MNQ']);
    expect(edited).not.toHaveProperty('stop');
    // The rule keeps its identity and its creation time.
    expect(edited).toMatchObject({ id: rule.id, createdAt: rule.createdAt });
    await repo.targetRules.remove(M, rule.id);
    expect(await repo.targetRules.list(M)).toEqual([]);

    const label = 'Futures, Future, All symbols';
    expect(await rows('target-rule')).toEqual([
      {
        type: 'target-rule',
        action: 'created',
        source: 'you',
        entityId: rule.id,
        label,
        field: undefined,
        oldValue: undefined,
        newValue: undefined,
      },
      {
        type: 'target-rule',
        action: 'deleted',
        source: 'you',
        entityId: rule.id,
        label: 'Futures, Future, MNQ',
        field: undefined,
        oldValue: undefined,
        newValue: undefined,
      },
      {
        type: 'target-rule',
        action: 'edited',
        source: 'you',
        entityId: rule.id,
        label: 'Futures, Future, MNQ',
        field: 'stop',
        oldValue: JSON.stringify(targetInput(acc.id).stop),
        newValue: null,
      },
      {
        type: 'target-rule',
        action: 'edited',
        source: 'you',
        entityId: rule.id,
        label: 'Futures, Future, MNQ',
        field: 'symbols',
        oldValue: '',
        newValue: 'MNQ',
      },
    ]);
  });

  test('the list is newest first', async () => {
    const { repo, acc } = await rulesSetup();
    const a = await repo.targetRules.create(M, targetInput(acc.id));
    const b = await repo.targetRules.create(M, targetInput(acc.id));
    const c = await repo.targetRules.create(M, targetInput(acc.id));
    expect((await repo.targetRules.list(M)).map((r) => r.id)).toEqual([
      c.id,
      b.id,
      a.id,
    ]);
    // Rules belong to their workspace.
    expect(await repo.targetRules.list('sample')).toEqual([]);
  });

  test('symbols are trimmed, upper-cased and listed once', async () => {
    const { repo, acc } = await rulesSetup();
    const rule = await repo.targetRules.create(
      M,
      targetInput(acc.id, { symbols: [' es ', 'ES', '/nq', ''] }),
    );
    expect(rule.symbols).toEqual(['ES', 'NQ']);
  });

  test('a rule needs its account, a target or a stop, and levels that make sense; nothing is written when it does not', async () => {
    const { repo, acc, rowCount } = await rulesSetup();
    const before = await rowCount();
    await expect(
      repo.targetRules.create(M, targetInput('nope')),
    ).rejects.toBeInstanceOf(NotFoundError);
    const bad = [
      targetInput(acc.id, { target: undefined, stop: undefined }),
      targetInput(acc.id, {
        target: { ...LONG, levels: [{ value: 6010, pct: 0 }] },
      }),
      targetInput(acc.id, {
        stop: { ...LONG, levels: [{ value: 5995, pct: 101 }] },
      }),
      targetInput(acc.id, {
        target: { ...LONG, levels: [{ value: Number.NaN, pct: 100 }] },
      }),
      targetInput(acc.id, {
        target: { unit: 'pips', levels: [{ value: 5, pct: 100 }] },
      }),
      targetInput(acc.id, { assetClass: 'bond' as never }),
    ];
    for (const input of bad)
      await expect(repo.targetRules.create(M, input)).rejects.toBeInstanceOf(
        RangeError,
      );
    expect(await repo.targetRules.list(M)).toEqual([]);
    expect(await rowCount()).toBe(before);
  });

  test('an edit is held to the same rules, and an unknown rule is not found', async () => {
    const { repo, acc } = await rulesSetup();
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    await expect(
      repo.targetRules.update(M, rule.id, {
        target: undefined,
        stop: undefined,
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.targetRules.update(M, rule.id, { accountId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.targetRules.list(M)).toEqual([rule]);
    await expect(
      repo.targetRules.update(M, 'nope', { symbols: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.targetRules.remove(M, 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test('an edit that changes nothing logs nothing', async () => {
    const { repo, acc, rowCount } = await rulesSetup();
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    const before = await rowCount();
    await repo.targetRules.update(M, rule.id, {
      symbols: [],
      target: targetInput(acc.id).target,
    });
    expect(await rowCount()).toBe(before);
  });

  test('a row that cannot be written takes the rule change back with it', async () => {
    const { repo, acc } = await rulesSetup();
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(
        repo.targetRules.update(M, rule.id, { symbols: ['ES'] }),
      ).rejects.toThrow('no id');
      await expect(repo.targetRules.remove(M, rule.id)).rejects.toThrow(
        'no id',
      );
      await expect(
        repo.targetRules.create(M, targetInput(acc.id)),
      ).rejects.toThrow('no id');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.targetRules.list(M)).toEqual([rule]);
  });

  test('removing an account removes its rules, quietly', async () => {
    const { repo, acc, account, rows } = await rulesSetup();
    const other = await account('Other');
    await repo.targetRules.create(M, targetInput(other.id));
    const kept = await repo.targetRules.create(M, targetInput(acc.id));
    await repo.accounts.remove(M, other.id);
    expect((await repo.targetRules.list(M)).map((r) => r.id)).toEqual([
      kept.id,
    ]);
    // Its rules go under the account's one row.
    expect(
      (await rows('target-rule')).filter((r) => r.action === 'deleted'),
    ).toEqual([]);
  });
});

describe('applying a target rule to existing trades', () => {
  test('apply to existing counts and logs with source rule', async () => {
    const { repo, acc, account, trip, manual, rows } = await rulesSetup();
    const other = await account('Other');
    const a = await trip(acc.id, 2, 6000, 6004);
    // A manual trade in the account counts too (B16), and so does an open one.
    const b = await manual(acc.id, [['buy', 1, 6020, '15:00']]);
    // Not the account, not the kind of instrument.
    const c = await trip(other.id, 2, 6000, 6004);
    const d = await trip(acc.id, 2, 190, 191, 'AAPL', ['16:00', '16:05']);
    const rule = await repo.targetRules.create(M, targetInput(acc.id));

    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(2);

    const after = Object.fromEntries(
      (await repo.trades.list(M)).map((t) => [t.id, t]),
    );
    expect(after[a.id]!.targets).toEqual({
      unit: 'price',
      levels: [{ value: 6010, qty: 2 }],
    });
    expect(after[a.id]!.stops).toEqual({
      unit: 'price',
      levels: [{ value: 5995, qty: 2 }],
    });
    // The one path for risk: |6000 - 5995| x 2 contracts x 50 = $500.
    expect(after[a.id]!.initialRisk).toBe(50000);
    expect(after[a.id]!.initialRisk).toBe(tradeRisk(after[a.id]!));
    // The second trade is long from 6020: its target 6010 is below it, so only the stop lands.
    expect(after[b.id]!.targets).toBeUndefined();
    expect(after[b.id]!.stops).toEqual({
      unit: 'price',
      levels: [{ value: 5995, qty: 1 }],
    });
    // 25 points x 1 contract x $50.
    expect(after[b.id]!.initialRisk).toBe(125000);
    for (const t of [c, d]) {
      expect(after[t.id]!.targets).toBeUndefined();
      expect(after[t.id]!.stops).toBeUndefined();
    }

    // One row per changed side, for each trade it changed, with source rule.
    const logged = (await rows('trade')).filter((r) => r.source === 'rule');
    expect(
      logged.map((r) => [r.entityId, r.action, r.field, r.oldValue, r.label]),
    ).toEqual(
      [
        [a.id, 'edited', 'stops', null, 'ESZ5 2026-11-19'],
        [a.id, 'edited', 'targets', null, 'ESZ5 2026-11-19'],
        [b.id, 'edited', 'stops', null, 'ESZ5 2026-11-19'],
      ].sort(
        (x, y) =>
          String(x[0]).localeCompare(String(y[0])) ||
          String(x[2]).localeCompare(String(y[2])),
      ),
    );
    expect(
      logged.find((r) => r.field === 'targets' && r.entityId === a.id),
    ).toMatchObject({
      newValue: JSON.stringify({
        unit: 'price',
        levels: [{ value: 6010, qty: 2 }],
      }),
    });
    // Nothing else of a trade is rewritten: a second apply has nothing to do.
    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(0);
    expect(
      (await rows('trade')).filter((r) => r.source === 'rule'),
    ).toHaveLength(3);
  });

  test('without override a trade with a target or a stop is left, with override its levels are replaced', async () => {
    const { repo, acc, trip, rows } = await rulesSetup();
    const set = await trip(acc.id, 2, 6000, 6004);
    await repo.trades.update(M, set.id, {
      stops: { unit: 'price', levels: [{ value: 5990, qty: 2 }] },
    });
    const bare = await trip(acc.id, 2, 6000, 6004, 'ESZ5', ['15:00', '15:10']);
    const rule = await repo.targetRules.create(M, targetInput(acc.id));

    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(1);
    expect((await repo.trades.get(M, set.id))!.stops!.levels[0]!.value).toBe(
      5990,
    );
    expect((await repo.trades.get(M, bare.id))!.stops!.levels[0]!.value).toBe(
      5995,
    );

    expect(await repo.targetRules.applyExisting(M, rule.id, true)).toBe(1);
    const replaced = (await repo.trades.get(M, set.id))!;
    expect(replaced.stops!.levels).toEqual([{ value: 5995, qty: 2 }]);
    expect(replaced.targets!.levels).toEqual([{ value: 6010, qty: 2 }]);
    expect(replaced.initialRisk).toBe(50000);
    // The replaced stop is logged with what it was.
    const row = (await rows('trade')).find(
      (r) =>
        r.source === 'rule' && r.entityId === set.id && r.field === 'stops',
    );
    expect(row).toMatchObject({
      oldValue: JSON.stringify({
        unit: 'price',
        levels: [{ value: 5990, qty: 2 }],
      }),
      newValue: JSON.stringify({
        unit: 'price',
        levels: [{ value: 5995, qty: 2 }],
      }),
    });
  });

  test('a trade with only a legacy stop counts as having one, and override moves it into levels with its risk', async () => {
    const { repo, acc, db, trip } = await rulesSetup();
    const t = await trip(acc.id, 2, 6000, 6004);
    await db.trades.put({ ...t, plannedStop: 5990, initialRisk: 100000 });
    const rule = await repo.targetRules.create(
      M,
      targetInput(acc.id, { stop: undefined }),
    );
    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(0);
    // Override: the target is written, and the legacy stop moves into levels with its risk unchanged.
    expect(await repo.targetRules.applyExisting(M, rule.id, true)).toBe(1);
    const after = (await repo.trades.get(M, t.id))!;
    expect(after.targets!.levels).toEqual([{ value: 6010, qty: 2 }]);
    expect(after.stops!.levels).toEqual([{ value: 5990, qty: 2 }]);
    expect(after).not.toHaveProperty('plannedStop');
    expect(after.initialRisk).toBe(100000);
  });

  test('a stop on the wrong side is skipped for the trade and the rest is written', async () => {
    const { repo, acc, trip } = await rulesSetup();
    const t = await trip(acc.id, 2, 6000, 6004);
    const rule = await repo.targetRules.create(
      M,
      targetInput(acc.id, {
        stop: { unit: 'price', levels: [{ value: 6005, pct: 100 }] },
      }),
    );
    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(1);
    const after = (await repo.trades.get(M, t.id))!;
    expect(after.targets).toBeDefined();
    expect(after.stops).toBeUndefined();
    expect(after.initialRisk).toBeUndefined();
  });

  test('an archived account, or one that is gone, refuses and writes nothing', async () => {
    const { repo, acc, trip, rowCount } = await rulesSetup();
    const t = await trip(acc.id, 2, 6000, 6004);
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    const before = await rowCount();
    await repo.accounts.update(M, acc.id, { status: 'archived' });
    const archived = await rowCount();
    await expect(
      repo.targetRules.applyExisting(M, rule.id, true),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
    expect((await repo.trades.get(M, t.id))!.stops).toBeUndefined();
    expect(await rowCount()).toBe(archived);
    expect(archived).toBeGreaterThan(before);
    await expect(
      repo.targetRules.applyExisting(M, 'nope', false),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('a row that cannot be written takes every trade of the apply back', async () => {
    const { repo, acc, trip } = await rulesSetup();
    const t = await trip(acc.id, 2, 6000, 6004);
    const rule = await repo.targetRules.create(M, targetInput(acc.id));
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no id');
    });
    try {
      await expect(
        repo.targetRules.applyExisting(M, rule.id, false),
      ).rejects.toThrow('no id');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.trades.get(M, t.id)).toEqual(t);
  });

  test('an apply that changed trades makes a pending import plan stale; one that changed none does not', async () => {
    const { repo, acc, trip, plan } = await rulesSetup();
    await trip(acc.id, 2, 6000, 6004);
    const rule = await repo.targetRules.create(
      M,
      targetInput(acc.id, { symbols: ['ES'] }),
    );
    const file =
      'Date/Time,Symbol,Buy/Sell,Quantity,Price\n2026-11-20 09:30:00,NQZ5,Buy,1,21000\n';
    const pending = await plan(file, 'imp-1');
    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(1);
    await expect(repo.imports.commit(M, pending)).rejects.toMatchObject({
      name: 'StalePlanError',
    });
    // Applying again changes nothing, so a plan made after it stands.
    const fresh = await plan(file, 'imp-2');
    expect(await repo.targetRules.applyExisting(M, rule.id, false)).toBe(0);
    await expect(repo.imports.commit(M, fresh)).resolves.toMatchObject({
      id: 'imp-2',
    });
  });
});
