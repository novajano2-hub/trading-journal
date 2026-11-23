import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from '../metrics/context';
import type { Account, Cents, Challenge, PropRuleSet } from '../types';
import {
  checkChallenge,
  drawdownLabel,
  findingText,
  type BreachFinding,
} from './challenge';

const ctx = defaultMetricContext('America/New_York');
const money = (c: Cents) =>
  `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const RULES: PropRuleSet = {
  firm: 'Firm',
  phase: 'evaluation',
  profitTarget: 300_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 400_000,
  drawdownType: 'static',
  minTradingDays: 2,
};
const account = (id: string, extra: Partial<Account> = {}): Account => ({
  id,
  workspaceId: 'w',
  name: id,
  broker: 'Firm',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 5_000_000,
  status: 'active',
  propRules: RULES,
  ...extra,
});
const ONE: Challenge['phases'] = [
  { step: 'step-1', accountId: 'a1' },
  { step: 'funded' },
];
const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  workspaceId: 'w',
  name: 'Two step',
  firm: 'Firm',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'a1' },
    { step: 'step-2', accountId: 'a2' },
    { step: 'funded' },
  ],
  phase: 'evaluation',
  status: 'active',
  ...over,
});
const trade = (accountId: string, net: Cents, day: string, serial: number) =>
  makeTrade({
    accountId,
    net,
    serial,
    closedAt: `${day}T15:00:00Z`,
    openedAt: `${day}T14:00:00Z`,
  });

describe('checkChallenge', () => {
  test('step 1 met its target and its days, so the current step is step 2', () => {
    const trades = [
      trade('a1', 200_000, '2026-11-09', 1),
      trade('a1', 150_000, '2026-11-10', 2),
    ];
    const check = checkChallenge(
      challenge(),
      [account('a1'), account('a2')],
      trades,
      ctx,
      '2026-11-12',
    );
    expect(check.currentStep).toBe('step-2');
    expect(check.health).toBe('active');
    expect(check.phases.map((p) => [p.step, p.state?.overall])).toEqual([
      ['step-1', 'target-reached'],
      ['step-2', 'in-progress'],
      ['funded', undefined],
    ]);
  });

  test('a step 1 that broke its daily loss is breached, with the finding', () => {
    const check = checkChallenge(
      challenge(),
      [account('a1'), account('a2')],
      [trade('a1', -124_000, '2026-11-12', 1)],
      ctx,
      '2026-11-13',
    );
    expect(check.currentStep).toBe('step-1');
    expect(check.health).toBe('breached');
    expect(check.finding).toEqual({
      rule: 'daily-loss',
      date: '2026-11-12',
      value: 124_000,
      limit: 100_000,
    });
    expect(findingText(check.finding!, money)).toBe(
      'Daily loss limit broken on 12 Nov (−$1,240.00 of −$1,000.00).',
    );
  });

  test('checking never changes the stored status', () => {
    const c = challenge();
    const before = JSON.stringify(c);
    checkChallenge(
      Object.freeze(c),
      [account('a1'), account('a2')],
      [trade('a1', -124_000, '2026-11-12', 1)],
      ctx,
      '2026-11-13',
    );
    expect(JSON.stringify(c)).toBe(before);
    expect(c.status).toBe('active');
  });

  test('the last evaluation step on target, with no funded account, reads target-met', () => {
    const check = checkChallenge(
      challenge({ steps: 1, phases: ONE }),
      [account('a1')],
      [
        trade('a1', 200_000, '2026-11-09', 1),
        trade('a1', 150_000, '2026-11-10', 2),
      ],
      ctx,
      '2026-11-12',
    );
    expect(check.health).toBe('target-met');
    // The funded phase is the trader's to start, so the met step stays current.
    expect(check.currentStep).toBe('step-1');
  });

  describe('the current step follows the stored phase and the links', () => {
    const MET = [
      trade('a1', 200_000, '2026-11-09', 1),
      trade('a1', 150_000, '2026-11-10', 2),
    ];
    const at = (
      c: Challenge,
      accounts: Account[],
      trades = MET,
    ): ReturnType<typeof checkChallenge> =>
      checkChallenge(c, accounts, trades, ctx, '2026-11-12');

    test('(a) step 1 met with step 2 unlinked: step 1 stays current and on target', () => {
      const check = at(
        challenge({
          phases: [
            { step: 'step-1', accountId: 'a1' },
            { step: 'step-2' },
            { step: 'funded' },
          ],
        }),
        [account('a1')],
      );
      expect(check.currentStep).toBe('step-1');
      expect(check.health).toBe('target-met');
    });

    test('(b) a funded account linked early does not take over a met evaluation step', () => {
      const funded = account('a3', {
        type: 'prop-funded',
        propRules: { ...RULES, phase: 'funded', profitTarget: 0 },
      });
      const breachedFunded = [...MET, trade('a3', -124_000, '2026-11-12', 3)];
      const check = at(
        challenge({
          steps: 1,
          phases: [
            { step: 'step-1', accountId: 'a1' },
            { step: 'funded', accountId: 'a3' },
          ],
        }),
        [account('a1'), funded],
        breachedFunded,
      );
      expect(check.currentStep).toBe('step-1');
      expect(check.health).toBe('target-met');
      expect(check.finding).toBeUndefined();
    });

    test('(b) step 2 unlinked, funded linked: the met step 1 is still current', () => {
      const check = at(
        challenge({
          phases: [
            { step: 'step-1', accountId: 'a1' },
            { step: 'step-2' },
            { step: 'funded', accountId: 'a3' },
          ],
        }),
        [account('a1'), account('a3')],
      );
      expect(check.currentStep).toBe('step-1');
    });

    test('(c) phase funded in Edit: the funded phase is current, and a stale step 1 breach is not offered', () => {
      const funded = account('a3', {
        type: 'prop-funded',
        propRules: { ...RULES, phase: 'funded', profitTarget: 0 },
      });
      const check = at(
        challenge({
          steps: 1,
          phase: 'funded',
          phases: [
            { step: 'step-1', accountId: 'a1' },
            { step: 'funded', accountId: 'a3' },
          ],
        }),
        [account('a1'), funded],
        [trade('a1', -124_000, '2026-11-09', 1)],
      );
      expect(check.currentStep).toBe('funded');
      expect(check.health).toBe('active');
      expect(check.finding).toBeUndefined();
    });

    test('(c) a funded phase that breaks its own daily loss is breached, with the finding', () => {
      const funded = account('a3', {
        type: 'prop-funded',
        propRules: { ...RULES, phase: 'funded', profitTarget: 0 },
      });
      const check = at(
        challenge({
          steps: 1,
          phase: 'funded',
          phases: [
            { step: 'step-1', accountId: 'a1' },
            { step: 'funded', accountId: 'a3' },
          ],
        }),
        [account('a1'), funded],
        [trade('a3', -124_000, '2026-11-12', 3)],
      );
      expect(check.currentStep).toBe('funded');
      expect(check.health).toBe('breached');
      expect(check.finding?.rule).toBe('daily-loss');
    });
  });

  test('a near drawdown reads near; the period counts the days left', () => {
    const rules = { ...RULES, periodDays: 30 };
    const check = checkChallenge(
      challenge({ steps: 1, phases: ONE }),
      [account('a1', { propRules: rules })],
      [
        trade('a1', -80_000, '2026-11-09', 1),
        trade('a1', -80_000, '2026-11-10', 2),
        trade('a1', -80_000, '2026-11-11', 3),
        trade('a1', -80_000, '2026-11-12', 4),
      ],
      ctx,
      '2026-11-13',
    );
    expect(check.health).toBe('near');
    // Day 1 is 9 Nov, so day 30 is 8 Dec: 25 days after the 13th.
    expect(check.daysLeft).toBe(25);
  });

  test('an archived account is marked, and an account without rules has no state', () => {
    const check = checkChallenge(
      challenge(),
      [
        account('a1', { status: 'archived' }),
        account('a2', { propRules: undefined }),
      ],
      [],
      ctx,
      '2026-11-12',
    );
    expect(check.phases[0]).toMatchObject({ archived: true });
    expect(check.phases[1]!.state).toBeUndefined();
  });

  test('a deposit moves the balance the phase reports, not the profit', () => {
    const check = checkChallenge(
      challenge({ steps: 1, phases: ONE }),
      [account('a1')],
      [trade('a1', 100_000, '2026-11-09', 1)],
      ctx,
      '2026-11-12',
      [
        {
          id: 'f',
          workspaceId: 'w',
          accountId: 'a1',
          date: '2026-11-10',
          amount: 500_000,
        },
      ],
    );
    expect(check.phases[0]!.balance).toBe(5_600_000);
    expect(check.phases[0]!.state!.profit.current).toBe(100_000);
  });
});

describe('phase balance (M7)', () => {
  test('counts trades from before the phase start date, as the account holds them', () => {
    const check = checkChallenge(
      challenge({
        steps: 1,
        phases: [
          { step: 'step-1', accountId: 'a1', startDate: '2026-11-10' },
          { step: 'funded' },
        ],
      }),
      [account('a1')],
      [
        trade('a1', 100_000, '2026-11-09', 1), // before the phase
        trade('a1', 50_000, '2026-11-10', 2),
      ],
      ctx,
      '2026-11-12',
    );
    expect(check.phases[0]!.balance).toBe(5_150_000);
    // The phase's own profit still starts at its start date.
    expect(check.phases[0]!.state!.profit.current).toBe(50_000);
  });
});

describe('drawdownLabel', () => {
  test('comes from the type (E22)', () => {
    expect(drawdownLabel('static')).toBe('Static drawdown');
    expect(drawdownLabel('eod-trailing')).toBe('End-of-day drawdown');
    expect(drawdownLabel('trailing')).toBe('Trailing drawdown');
  });
});

describe('findingText', () => {
  test('one sentence for each rule', () => {
    const f = (rule: BreachFinding['rule']): BreachFinding => ({
      rule,
      date: '2026-11-05',
      value: 210_000,
      limit: 200_000,
    });
    expect(findingText(f('max-drawdown'), money)).toBe(
      'Max drawdown limit broken on 5 Nov (−$2,100.00 of −$2,000.00).',
    );
    expect(findingText(f('period-ended'), money)).toBe(
      'The period ended on 5 Nov with the profit target unmet ($2,100.00 of $2,000.00).',
    );
    expect(findingText(f('consistency'), money)).toBe(
      'Best-day consistency broken: the best day, 5 Nov, made $2,100.00 against $2,000.00 allowed.',
    );
  });
});
