// @vitest-environment happy-dom
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { DayScore, RuleResult } from '@/domain/tracker/score';
import { defaultVersion } from '@/domain/tracker/defaults';
import type { TrackerVersion } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { DayRules } from './day-rules';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

const version: TrackerVersion = {
  ...defaultVersion('2026-11-02'),
  custom: [
    {
      id: 'c1',
      name: 'Mark key levels before the open',
      stage: 'prepare',
      days: [true, true, true, true, true, true, true],
    },
    {
      id: 'c2',
      name: 'Review every losing trade',
      stage: 'reflect',
      days: [true, true, true, true, true, true, true],
    },
  ],
};
const r = (
  p: Partial<RuleResult> & Pick<RuleResult, 'key' | 'stage' | 'status'>,
) =>
  ({
    points: p.status === 'met' ? 1 : 0,
    score: null,
    value: { kind: 'tick', ticked: p.status === 'met' },
    ...p,
  }) as RuleResult;
const score = (over: Partial<DayScore> = {}): DayScore => ({
  date: '2026-11-24',
  met: 3,
  active: 8,
  perfect: false,
  finished: false,
  rules: [
    r({
      key: 'startBy',
      stage: 'prepare',
      status: 'met',
      value: { kind: 'time', at: '08:47', limit: '09:30' },
    }),
    r({ key: 'custom:c1', stage: 'prepare', status: 'pending' }),
    r({
      key: 'strategy',
      stage: 'reflect',
      status: 'met',
      value: { kind: 'share', x: 4, y: 4 },
    }),
    r({
      key: 'stop',
      stage: 'reflect',
      status: 'pending',
      value: { kind: 'share', x: 3, y: 4 },
    }),
    r({
      key: 'lossPerTrade',
      stage: 'reflect',
      status: 'failed',
      value: { kind: 'share', x: 3, y: 4 },
    }),
    r({
      key: 'lossPerDay',
      stage: 'reflect',
      status: 'met',
      value: { kind: 'money', cents: 0, limit: 10_000 },
    }),
    r({ key: 'custom:c2', stage: 'reflect', status: 'failed' }),
  ],
  ...over,
});

async function show(
  over: Partial<Parameters<typeof DayRules>[0]> = {},
  prefs: Record<string, unknown> = {},
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  if (Object.keys(prefs).length) await repository.prefs.update(prefs);
  const onTick = vi.fn();
  renderApp(
    <DayRules
      score={score()}
      version={version}
      readOnly={false}
      detail="values"
      onTick={onTick}
      currency="USD"
      {...over}
    />,
    { repository },
  );
  await screen.findByText('Every trade has a strategy');
  return onTick;
}
const row = (name: string) =>
  screen.getByText(name).closest('[data-rule]') as HTMLElement;

test('rules group under Prepare, Trade and Reflect, empty groups left out', async () => {
  await show();
  const heads = screen
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);
  expect(heads).toEqual(['Prepare', 'Reflect']);
});

test('marks follow the status', async () => {
  await show();
  const met = row('Every trade has a strategy');
  expect(met.getAttribute('data-status')).toBe('met');
  expect(within(met).getByText('Met')).toBeTruthy();
  expect(met.querySelector('[data-mark="met"]')).toBeTruthy();
  const pending = row('Every trade has a planned stop');
  expect(within(pending).getByText('Pending')).toBeTruthy();
  expect(pending.querySelector('[data-mark="pending"]')).toBeTruthy();
  const failed = row('Keep every loss to $100 or less');
  expect(within(failed).getByText('Failed')).toBeTruthy();
  expect(failed.querySelector('[data-mark="failed"]')).toBeTruthy();
  // Met is gain, failed is loss, pending is faint.
  expect(met.querySelector('[data-mark]')!.className).toContain('text-gain');
  expect(failed.querySelector('[data-mark]')!.className).toContain('text-loss');
  expect(pending.querySelector('[data-mark]')!.className).toContain(
    'text-faint',
  );
});

test('custom rules tick unless read-only', async () => {
  const onTick = await show();
  const box = within(row('Mark key levels before the open')).getByRole(
    'checkbox',
  );
  expect((box as HTMLInputElement).checked).toBe(false);
  fireEvent.click(box);
  expect(onTick).toHaveBeenCalledWith('c1', true);
  expect(
    within(row('Mark key levels before the open')).getByText(
      'Tick it yourself',
    ),
  ).toBeTruthy();
  cleanup();

  const none = await show({ readOnly: true });
  const locked = within(row('Mark key levels before the open')).getByRole(
    'checkbox',
  ) as HTMLInputElement;
  expect(locked.disabled).toBe(true);
  fireEvent.click(locked);
  expect(none).not.toHaveBeenCalled();
  // A failed custom rule on a locked day reads as failed.
  expect(
    within(row('Review every losing trade')).getByText('Failed'),
  ).toBeTruthy();
});

test('values: each rule shows its value on the right', async () => {
  await show();
  const text = (n: string) => row(n).textContent!;
  expect(text('Start the day note by 09:30')).toContain('08:47');
  expect(text('Start the day note by 09:30')).toContain('by 09:30');
  expect(text('Every trade has a strategy')).toContain('4 of 4');
  expect(text('Every trade has a planned stop')).toContain('3 of 4');
  expect(text('Keep every loss to $100 or less')).toContain('3 of 4');
  expect(text('Keep every loss to $100 or less')).toContain('within $100');
  // The daily cap shows the day's loss against the limit: nothing lost on a green day.
  expect(text("Keep the day's loss to $100 or less")).toContain('$0.00');
  expect(text("Keep the day's loss to $100 or less")).toContain('of $100.00');
});

test('a start that was not logged reads None', async () => {
  const s = score();
  s.rules[0] = r({
    key: 'startBy',
    stage: 'prepare',
    status: 'pending',
    value: { kind: 'time', limit: '09:30' },
  });
  await show({ score: s });
  expect(row('Start the day note by 09:30').textContent).toContain('None');
});

test('names: no values and no count, only the start time', async () => {
  await show({ detail: 'names' });
  const all = document.body.textContent!;
  expect(all).not.toContain('4 of 4');
  expect(all).not.toContain('of $100.00');
  expect(all).not.toContain('Tick it yourself');
  expect(all).not.toMatch(/\d+ of \d+ met/);
  expect(row('Start the day note by 09:30').textContent).toContain('08:47');
  expect(row('Start the day note by 09:30').textContent).not.toContain(
    'by 09:30by',
  );
  // Custom rules still tick.
  expect(
    within(row('Mark key levels before the open')).getByRole('checkbox'),
  ).toBeTruthy();
});

test('Privacy hides money values', async () => {
  await show({}, { displayUnit: 'privacy' });
  await vi.waitFor(() => expect(document.body.textContent).toContain('$•••'));
  const failed = row('Keep every loss to $••• or less');
  expect(failed).toBeTruthy();
  const cap = row("Keep the day's loss to $••• or less");
  expect(cap.textContent).toContain('$•••');
  // No digit follows a currency sign anywhere on the list.
  expect(document.body.textContent).not.toMatch(/[$€£]\s?\d/);
  // The words a screen reader gets.
  expect(within(cap).getAllByText('hidden amount').length).toBeGreaterThan(0);
  // Counts stay.
  expect(failed.textContent).toContain('3 of 4');
});
