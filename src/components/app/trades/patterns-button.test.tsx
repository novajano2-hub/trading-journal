// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { PATTERNS, type PatternHit, type PatternId } from '@/domain/patterns';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { PatternSentence } from './pattern-text';
import { PatternsButton } from './patterns-button';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

const HOUR = 3_600_000;
const MIN = 60_000;

/** What a trade's hits look like: in the order the patterns are listed in. */
const HITS: PatternHit[] = [
  {
    id: 'held-longer',
    tradeId: 't',
    figures: {
      holdMs: 18 * HOUR + 40 * MIN,
      limitMs: 2 * HOUR + 5 * MIN,
      sample: 41,
      win: 1,
    },
  },
  {
    id: 'loss-after-loss',
    tradeId: 't',
    figures: { gapMs: 12_000, priorLoss: 8_550 },
  },
  {
    id: 'added-to-position',
    tradeId: 't',
    figures: { entries: 2, volume: 3 },
  },
];

const trigger = () => screen.getByRole('button', { name: /^Patterns/ });

test('the popover names, tone words and masked sentences', async () => {
  renderApp(<PatternsButton hits={HITS} />);
  // The button counts the patterns and says what it opens.
  expect(trigger().textContent).toBe('Patterns3');
  expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger().getAttribute('aria-disabled')).toBeNull();

  fireEvent.click(trigger());
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on this trade',
  });
  expect(within(pop).getByText('3 patterns')).toBeTruthy();
  expect(within(pop).getByText("read from this trade's fills")).toBeTruthy();
  const rows = within(pop).getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  // Each row: the pattern's name with its definition, a tone word in a chip, a sentence with the figures.
  const row = (name: string) =>
    rows.find((r) => within(r).queryByText(name) !== null)!;
  const held = row('Held longer than usual');
  expect(within(held).getByText('Neutral')).toBeTruthy();
  expect(held.textContent).toContain('Held 18h 40m.');
  expect(held.textContent).toContain(
    '75% of your wins in the past 60 days closed within 2h 5m.',
  );
  expect(
    held.querySelector('[data-metric-tip="pattern-held-longer"]'),
  ).not.toBeNull();
  const lal = row('Loss after a loss');
  expect(within(lal).getByText('Hurts')).toBeTruthy();
  // Money is the display's: a dollar amount in Dollar.
  expect(lal.textContent).toContain('Entered 12s after a losing trade closed.');
  expect(lal.textContent).toContain('$85.50');
  const added = row('Added to the position');
  expect(within(added).getByText('Neutral')).toBeTruthy();
  expect(added.textContent).toContain('Opened in 2 entries, 3 units in all.');
  // The tone is a word in a neutral chip: no green and no red.
  for (const tone of pop.querySelectorAll('[data-tone]'))
    expect(tone.firstElementChild!.className).toMatch(/bg-sunken/);
  expect(pop.innerHTML).not.toMatch(/gain|loss-soft|text-loss/);
});

test('Privacy hides the money in a sentence, for the eye and the ear', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<PatternsButton hits={HITS} />, { repository });
  await waitFor(() => expect(trigger()).toBeTruthy());
  fireEvent.click(trigger());
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on this trade',
  });
  await waitFor(() => expect(pop.textContent).toContain('$•••'));
  expect(everyString(document.body).filter((t) => /\$\d/.test(t))).toEqual([]);
  expect(pop.textContent).not.toContain('85.50');
  // A screen reader hears the figure's label, not the dots.
  expect(pop.textContent).toContain('hidden amount');
});

test('no patterns: the count reads 0 and the button is disabled with its reason', () => {
  renderApp(<PatternsButton hits={[]} />);
  const button = trigger();
  expect(button.textContent).toBe('Patterns0');
  expect(button.getAttribute('aria-disabled')).toBe('true');
  const reason = 'No patterns on this trade.';
  expect(button.getAttribute('title')).toContain(reason);
  const described = document.getElementById(
    button.getAttribute('aria-describedby')!,
  );
  expect(described?.textContent).toContain(reason);
  // It keeps its tab stop and opens nothing.
  fireEvent.click(button);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('while the patterns are read the button waits, with no count and no reason yet', () => {
  renderApp(<PatternsButton hits={undefined} />);
  expect(trigger().textContent).toBe('Patterns');
  expect(trigger().getAttribute('aria-disabled')).toBe('true');
  expect(trigger().getAttribute('aria-busy')).toBe('true');
  // "No patterns on this trade" is for a trade known to have none, not for one still being read.
  expect(trigger().getAttribute('title')).toBeNull();
  expect(trigger().getAttribute('aria-describedby')).toBeNull();
  expect(document.body.textContent).not.toContain('No patterns');
});

test('the desktop button is named with its count, as the phone glyph is', () => {
  const { unmount } = renderApp(<PatternsButton hits={HITS} />);
  expect(trigger().getAttribute('aria-label')).toBe('Patterns, 3');
  unmount();
  renderApp(<PatternsButton hits={[]} />);
  expect(trigger().getAttribute('aria-label')).toBe('Patterns, none');
  cleanup();
  renderApp(<PatternsButton hits={undefined} />);
  expect(trigger().getAttribute('aria-label')).toBe('Patterns');
  // The visible text still starts the name.
  expect(screen.getByRole('button', { name: 'Patterns' })).toBeTruthy();
});

test('Escape closes it and focus returns to the button', async () => {
  renderApp(<PatternsButton hits={HITS} />);
  fireEvent.click(trigger());
  await screen.findByRole('dialog', { name: 'Patterns on this trade' });
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger()));
});

test('on a phone the popover is a sheet with a Close button', async () => {
  window.innerWidth = 390;
  renderApp(<PatternsButton hits={HITS} />);
  fireEvent.click(trigger());
  const sheet = await screen.findByRole('dialog', { name: 'Patterns' });
  expect(within(sheet).getAllByRole('listitem')).toHaveLength(3);
  expect(sheet.className).toMatch(/bottom-0/);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

/** Figures that read plausibly for each pattern. */
const FIGURES: Record<PatternId, Record<string, number>> = {
  'held-longer': { holdMs: 5 * HOUR, limitMs: HOUR, sample: 30, win: 0 },
  'long-loss-hold': {
    holdMs: 3 * HOUR,
    limitMs: HOUR,
    loss: 12_000,
    avgLoss: 7_000,
    sample: 20,
  },
  'loss-after-loss': { gapMs: 0, priorLoss: 4_000 },
  'added-to-position': { entries: 3, volume: 1.5 },
  'exited-in-parts': { exits: 2 },
  'large-size': { volume: 12, limit: 8, sample: 50 },
  'losses-outweighed': {
    winRate: 0.6,
    avgWin: 5_000,
    avgLoss: 15_000,
    net: -20_000,
  },
  'switched-sides-red': { changes: 4, trades: 7, net: -9_000 },
  'switched-sides-green': { changes: 3, trades: 6, net: 12_000 },
  'one-strong-trade': { r: 3.456, net: 50_000 },
  'low-return': { net: 2_000, avgGreenNet: 10_000, trades: 4, greenDays: 12 },
  'sized-up-after-wins': {
    streak: 3,
    size: 4,
    previousSize: 2,
    loss: 30_000,
    avgLoss: 9_000,
  },
  'more-trades': { trades: 12, average: 7.3333, days: 40 },
  'waited-then-won': { waitMinutes: 135, net: 25_000 },
  'quick-reentries': { trades: 2, loss: 18_000 },
  'rushed-red-day': {
    trades: 9,
    medianHoldMs: 90_000,
    medianGapMs: 45_000,
    net: -31_000,
  },
  'busier-than-green': { trades: 14, average: 5.5, greenDays: 20 },
};

test('every pattern writes a sentence from its figures, in Keel words', () => {
  const hitOf = (id: PatternId): PatternHit => ({
    id,
    ...(PATTERNS.find((p) => p.id === id)!.level === 'day'
      ? { date: '2026-11-18' }
      : { tradeId: 't' }),
    figures: FIGURES[id],
  });
  const { container } = renderApp(
    <ul>
      {PATTERNS.map((p) => (
        <li key={p.id} data-id={p.id}>
          <PatternSentence hit={hitOf(p.id)} />
        </li>
      ))}
    </ul>,
  );
  const items = [...container.querySelectorAll('li')];
  expect(items).toHaveLength(17);
  for (const li of items) {
    const id = li.getAttribute('data-id');
    const text = li.textContent ?? '';
    expect(text.length, id!).toBeGreaterThan(15);
    expect(text, id!).toMatch(/\d/);
    expect(text, id!).not.toMatch(/undefined|NaN|\[object|[—–]/);
    expect(text, id!).not.toMatch(/Zella|Insight|Strength|Area to improve/i);
    expect(text.endsWith('.'), id!).toBe(true);
  }
});
