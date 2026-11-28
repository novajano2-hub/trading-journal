import { describe, expect, test } from 'vitest';
import {
  STRATEGY_TEMPLATES,
  STYLE_LABEL,
  exampleStats,
  templateById,
  type ExampleTrade,
  type StrategyTemplate,
} from './strategy-templates';

const num = (s: string): number => Number(s.replace(/,/g, ''));

const trade = (
  net: number,
  extra: Partial<ExampleTrade> = {},
): ExampleTrade => ({
  symbol: 'ES',
  side: 'long',
  openedAt: '2026-02-10T09:40:00',
  closedAt: '2026-02-10T10:20:00',
  net,
  ...extra,
});

const withExamples = (examples: ExampleTrade[]): StrategyTemplate => ({
  ...STRATEGY_TEMPLATES[0]!,
  examples,
});

test('six templates, each with examples', () => {
  expect(STRATEGY_TEMPLATES).toHaveLength(6);
  const covered = new Set(STRATEGY_TEMPLATES.flatMap((t) => t.assetClasses));
  for (const a of ['stock', 'future', 'forex', 'option', 'crypto'] as const)
    expect(covered.has(a), a).toBe(true);

  // One template per asset class, and the intraday playbook across two.
  const single = STRATEGY_TEMPLATES.filter((t) => t.assetClasses.length === 1);
  expect(single.map((t) => t.assetClasses[0]).sort()).toEqual([
    'crypto',
    'forex',
    'future',
    'option',
    'stock',
  ]);
  const playbook = STRATEGY_TEMPLATES.filter((t) => t.assetClasses.length > 1);
  expect(playbook).toHaveLength(1);
  expect(playbook[0]!.styles).toContain('intraday');

  expect(new Set(STRATEGY_TEMPLATES.map((t) => t.id)).size).toBe(6);
  expect(new Set(STRATEGY_TEMPLATES.map((t) => t.name)).size).toBe(6);
  for (const t of STRATEGY_TEMPLATES) {
    expect(t.name.trim(), t.id).not.toBe('');
    expect(t.description.trim(), t.id).not.toBe('');
    expect(t.styles.length, t.id).toBeGreaterThan(0);
    expect(t.examples.length, t.id).toBeGreaterThanOrEqual(3);
    expect(t.examples.length, t.id).toBeLessThanOrEqual(5);
    expect(t.groups.length, t.id).toBeGreaterThanOrEqual(3);
    for (const g of t.groups) {
      expect(g.title.trim(), t.id).not.toBe('');
      expect(g.rules.length, `${t.id} ${g.title}`).toBeGreaterThan(0);
      for (const r of g.rules) expect(r.text.trim()).not.toBe('');
    }
    // Rules are graded on winners or losers only where that is the point.
    const when = t.groups.flatMap((g) => g.rules.map((r) => r.showWhen));
    expect(when.filter((w) => w === 'always').length, t.id).toBeGreaterThan(3);
  }
});

test('every template has a drawn cover, never a photo', () => {
  for (const t of STRATEGY_TEMPLATES) {
    expect(t.cover.startsWith('<svg'), t.id).toBe(true);
    expect(t.cover, t.id).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(t.cover, t.id).toContain('viewBox="0 0 240 132"');
    // Drawn from shapes in the palette: no embedded raster and no script.
    expect(t.cover, t.id).not.toMatch(/<image|<script|data:image|href=/i);
    // Each colour is a token with its light value to fall back on, so the
    // same drawing reads in the theme on a page and as a standalone image.
    expect(t.cover, t.id).toMatch(/var\(--sunken,#[0-9a-f]{6}\)/i);
    expect(t.cover, t.id).not.toMatch(/(?:fill|stroke)="(?!var\(|none)/);
  }
});

test('examples are plain, ordered and agree with their side', () => {
  for (const t of STRATEGY_TEMPLATES) {
    for (const [i, e] of t.examples.entries()) {
      const at = `${t.id} example ${i + 1}`;
      expect(e.symbol.trim(), at).not.toBe('');
      expect(e.openedAt < e.closedAt, at).toBe(true);
      expect(Number.isInteger(e.net), at).toBe(true);
      expect(e.net, at).not.toBe(0);
      expect(e.r, at).toBeDefined();
      // The result's sign is the net's, and it is the side's move when prices are given.
      expect(Math.sign(e.r!), at).toBe(Math.sign(e.net));
      if (e.entry !== undefined && e.exit !== undefined) {
        const move =
          (num(e.exit) - num(e.entry)) * (e.side === 'long' ? 1 : -1);
        expect(Math.sign(move), at).toBe(Math.sign(e.net));
      }
    }
  }
});

test('the copy is Keel-written: no banned wording, no long dashes, author Keel', () => {
  const banned =
    /Zella|Create your own|Browse templates|Show every time|Insights|Select Default|Customize Info|Initial target|Held onto loser|Area to improve/i;
  for (const t of STRATEGY_TEMPLATES) {
    const words = [
      t.name,
      t.description,
      ...t.groups.flatMap((g) => [g.title, ...g.rules.map((r) => r.text)]),
      ...t.examples.map((e) => e.symbol),
    ].join('\n');
    expect(words, t.id).not.toMatch(banned);
    expect(words, t.id).not.toMatch(/[—–]/);
  }
});

test('templateById finds a template and knows an unknown id', () => {
  const t = STRATEGY_TEMPLATES[2]!;
  expect(templateById(t.id)).toBe(t);
  expect(templateById('no-such-template')).toBeUndefined();
  expect(templateById(undefined)).toBeUndefined();
});

test('each style has a label of its own', () => {
  expect(Object.keys(STYLE_LABEL).sort()).toEqual([
    'intraday',
    'scalping',
    'swing',
  ]);
});

describe('exampleStats', () => {
  test('exampleStats', () => {
    // Three winners and a loser: 75%, four trades, an average win of 300 over a loss of 200.
    expect(
      exampleStats(
        withExamples([trade(400), trade(300), trade(200), trade(-200)]),
      ),
    ).toEqual({ winRate: 0.75, trades: 4, winLoss: 1.5 });
  });

  test('it counts examples only: trades and win rate over every example', () => {
    const s = exampleStats(withExamples([trade(100), trade(-100), trade(0)]));
    expect(s.trades).toBe(3);
    expect(s.winRate).toBeCloseTo(1 / 3, 10);
  });

  test('no loser, no winner or no examples leaves the ratio None, and the rest zero', () => {
    expect(
      exampleStats(withExamples([trade(100), trade(50)])).winLoss,
    ).toBeNull();
    expect(exampleStats(withExamples([trade(-100)])).winLoss).toBeNull();
    expect(exampleStats(withExamples([]))).toEqual({
      winRate: 0,
      trades: 0,
      winLoss: null,
    });
  });

  test('every shipped template has a win rate and a ratio to show', () => {
    for (const t of STRATEGY_TEMPLATES) {
      const s = exampleStats(t);
      expect(s.trades, t.id).toBe(t.examples.length);
      expect(s.winRate, t.id).toBeGreaterThan(0);
      expect(s.winRate, t.id).toBeLessThan(1);
      expect(s.winLoss, t.id).not.toBeNull();
    }
  });
});
