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
import { createLocalRepository } from '@/data/local/local-repository';
import { patternsReportSample } from '../__fixtures__/patterns-report-sample';
import { renderApp } from '../__fixtures__/render-app';
import { TopBar } from '../top-bar';
import { DayView } from './day-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

/** The bar over the day page, as the shell lays them out. */
function Day({
  date,
  mode,
}: {
  date: string;
  mode: 'plan' | 'review';
}): React.JSX.Element {
  return (
    <>
      <TopBar basis={<button type="button">Display</button>} />
      <DayView date={date} mode={mode} />
    </>
  );
}

/** The patterns sample, read in UTC: Mon 2 Nov fires Quick re-entries after a loss over three trades (-$60.00). */
async function renderDay(
  date: string,
  mode: 'plan' | 'review' = 'review',
  prefs: { displayUnit?: 'privacy' } = {},
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => patternsReportSample(),
  });
  await repository.prefs.update({ timeZone: 'UTC', ...prefs });
  renderApp(<Day date={date} mode={mode} />, {
    repository,
    url: `/app/day/${date}/${mode}`,
  });
  return screen.findByRole('banner');
}

const trigger = (bar: HTMLElement) =>
  within(bar).getByRole('button', { name: /^Patterns/ });

test("the day page's header has the patterns control: the date, net, trades and the day's patterns", async () => {
  const bar = await renderDay('2026-11-02');
  await waitFor(() => expect(trigger(bar).textContent).toBe('Patterns1'));
  fireEvent.click(trigger(bar));
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on Mon 2 Nov',
  });
  const head = within(pop).getByText('Mon 2 Nov').parentElement!;
  expect(head.textContent).toContain('−$60.00');
  expect(head.textContent).toContain('3 trades');
  const rows = within(pop).getAllByRole('listitem');
  expect(rows).toHaveLength(1);
  expect(
    within(rows[0]!).getByText('Quick re-entries after a loss'),
  ).toBeTruthy();
  expect(within(rows[0]!).getByText('Hurts')).toBeTruthy();
});

test('a day with none has it disabled, with its reason, in plan as in review', async () => {
  for (const [date, mode] of [
    ['2026-11-03', 'review'],
    ['2026-11-28', 'plan'],
  ] as const) {
    const bar = await renderDay(date, mode);
    await waitFor(() => expect(trigger(bar).textContent).toBe('Patterns0'));
    expect(trigger(bar).getAttribute('aria-disabled')).toBe('true');
    expect(trigger(bar).getAttribute('title')).toBe('No patterns on this day.');
    fireEvent.click(trigger(bar));
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
  }
});

test("the net follows Privacy: the day page's money is the display's", async () => {
  const bar = await renderDay('2026-11-02', 'review', {
    displayUnit: 'privacy',
  });
  await waitFor(() => expect(trigger(bar).textContent).toBe('Patterns1'));
  fireEvent.click(trigger(bar));
  const pop = await screen.findByRole('dialog', {
    name: 'Patterns on Mon 2 Nov',
  });
  expect(pop.textContent).toContain('$•••');
  expect(pop.textContent).not.toMatch(/\$\d/);
});

test('on a phone it is a glyph with the count in the bar, opening a sheet', async () => {
  window.innerWidth = 390;
  const bar = await renderDay('2026-11-02');
  const glyph = await within(bar).findByRole('button', {
    name: 'Patterns, 1',
  });
  expect(glyph.textContent).toBe('1');
  fireEvent.click(glyph);
  const sheet = await screen.findByRole('dialog', { name: 'Patterns' });
  expect(sheet.textContent).toContain('3 trades');
  expect(sheet.textContent).toContain('−$60.00');
});
