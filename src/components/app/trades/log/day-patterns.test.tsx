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
import type { UserPrefs } from '@/domain/types';
import { everyString } from '../../__fixtures__/every-string';
import { patternsReportSample } from '../../__fixtures__/patterns-report-sample';
import { renderApp } from '../../__fixtures__/render-app';
import { TradesDayView } from './day-view';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

/** The patterns sample: Mon 2 Nov fires Quick re-entries after a loss (three losing trades, -$60.00); Tue 3 Nov, a winner, fires nothing. */
async function renderDays(
  prefs: Partial<UserPrefs> = {},
  sample = async () => patternsReportSample(),
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update({ timeZone: 'UTC', ...prefs });
  renderApp(<TradesDayView />, { repository, url: '/app/trades/day' });
  const cards = await screen.findAllByRole('article');
  return cards;
}

const trigger = (card: HTMLElement) =>
  within(card).getByRole('button', { name: /^Patterns/ });

test('a day card lists its day patterns', async () => {
  const [, mon] = await renderDays();
  // Mon 2 Nov: a count of the day's patterns, one of them.
  await waitFor(() => expect(trigger(mon!).textContent).toBe('Patterns1'));
  expect(trigger(mon!).getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger(mon!).getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(trigger(mon!));
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on Mon 2 Nov 2026',
  });
  // The date, the day's net after costs, the trade count: TradeZella's popup, in Keel's words.
  const head = within(pop).getByText('Mon 2 Nov 2026').parentElement!;
  expect(head.textContent).toContain('−$60.00');
  expect(head.textContent).toContain('3 trades');
  // Each pattern: its name with its definition, a tone word in a chip, the sentence with the figures.
  const rows = within(pop).getAllByRole('listitem');
  expect(rows).toHaveLength(1);
  expect(
    within(rows[0]!).getByText('Quick re-entries after a loss'),
  ).toBeTruthy();
  expect(
    rows[0]!.querySelector('[data-metric-tip="pattern-quick-reentries"]'),
  ).not.toBeNull();
  expect(within(rows[0]!).getByText('Hurts')).toBeTruthy();
  expect(rows[0]!.textContent).toContain(
    '2 trades entered within a minute of a loss, and they lost $30.00 together.',
  );
  // It lists the day's patterns, not the trades': Added to the position and Loss after a loss are trade patterns.
  expect(pop.textContent).not.toContain('Loss after a loss');
});

test('a day with no pattern has the control disabled, with its reason', async () => {
  const [tue] = await renderDays();
  await waitFor(() => expect(trigger(tue!).textContent).toBe('Patterns0'));
  const button = trigger(tue!);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  const reason = 'No patterns on this day.';
  expect(button.getAttribute('title')).toBe(reason);
  expect(
    document.getElementById(button.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toBe(reason);
  fireEvent.click(button);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test("the control ends the card header's quick actions, after Review", async () => {
  const [tue] = await renderDays();
  await waitFor(() => expect(trigger(tue!).textContent).toBe('Patterns0'));
  const header = tue!.querySelector('header')!;
  const names = [...header.querySelectorAll('button, a')].map(
    (el) => el.getAttribute('aria-label') ?? el.textContent,
  );
  // The toggle, then Review, then Patterns last (the note action, when given, sits between).
  expect(names[0]).toBe('Expand Tue 3 Nov 2026');
  expect(names.slice(1)).toEqual(['Review', 'Patterns0']);
});

test("the popover's net follows Privacy, for the eye and the ear", async () => {
  const [, mon] = await renderDays({ displayUnit: 'privacy' });
  await waitFor(() => expect(trigger(mon!).textContent).toBe('Patterns1'));
  fireEvent.click(trigger(mon!));
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on Mon 2 Nov 2026',
  });
  expect(pop.textContent).toContain('$•••');
  expect(everyString(document.body).filter((t) => /\$\d/.test(t))).toEqual([]);
  expect(pop.textContent).toContain('hidden amount');
});

test('Escape closes it and focus returns to the control', async () => {
  const [, mon] = await renderDays();
  await waitFor(() => expect(trigger(mon!).textContent).toBe('Patterns1'));
  fireEvent.click(trigger(mon!));
  await screen.findByRole('dialog', { name: 'Patterns on Mon 2 Nov 2026' });
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger(mon!)));
});

test('on a phone the control is a glyph with the count, and the popover a sheet with the date, net and trades', async () => {
  window.innerWidth = 390;
  const [, mon] = await renderDays();
  const glyph = await within(mon!).findByRole('button', {
    name: 'Patterns, 1',
  });
  // A glyph with a count badge, no word.
  expect(glyph.textContent).toBe('1');
  fireEvent.click(glyph);
  const sheet = await screen.findByRole('dialog', { name: 'Patterns' });
  expect(sheet.className).toMatch(/bottom-0/);
  expect(sheet.textContent).toContain('Mon 2 Nov');
  expect(sheet.textContent).toContain('−$60.00');
  expect(sheet.textContent).toContain('3 trades');
  expect(within(sheet).getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('on a phone a day with none has a disabled glyph that says so', async () => {
  window.innerWidth = 390;
  const [tue] = await renderDays();
  const glyph = await within(tue!).findByRole('button', {
    name: 'Patterns, none',
  });
  expect(glyph.getAttribute('aria-disabled')).toBe('true');
  expect(glyph.getAttribute('title')).toBe('No patterns on this day.');
  fireEvent.click(glyph);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a note-only day has no trades to read patterns from: the control is disabled', async () => {
  const [, ...rest] = await renderDays({}, async () => ({
    ...patternsReportSample(),
    trades: [],
    journal: [
      {
        id: 'note-2026-11-22',
        workspaceId: fixtureSample().trades[0]!.workspaceId,
        kind: 'daily-review',
        date: '2026-11-22',
        title: '2026-11-22',
        body: {},
        linkedTradeIds: [],
        tags: [],
        updatedAt: '2026-11-25T00:00:00Z',
      },
    ],
  }));
  void rest;
  const cards = screen.getAllByRole('article');
  await waitFor(() =>
    expect(trigger(cards[0]!).getAttribute('aria-disabled')).toBe('true'),
  );
});
