// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdown } from '@/domain/metrics/breakdowns';
import { renderApp } from '../__fixtures__/render-app';
import { newYorkRepository } from '../__fixtures__/reports-sample';
import { DayTimeView } from './day-time-report';
import { writeParam } from './use-report-data';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
vi.mock('@/domain/metrics/breakdowns', async (original) => {
  const real = await original<typeof import('@/domain/metrics/breakdowns')>();
  return { ...real, breakdown: vi.fn(real.breakdown) };
});
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

// The nine trades open at 10:00 New York time and close at 11:00.
const URL = '/app/reports/day-time?tab=time&bucket=15';

const labels = (page: HTMLElement) =>
  within(within(page).getByRole('table', { name: /Time of day summary/ }))
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('td')!.textContent);

test('bucket=15 shows 15-minute labels', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: URL,
  });
  const page = await screen.findByTestId('reports-day-time');
  expect(labels(page)).toEqual(['10:00 to 10:15']);
  fireEvent.click(within(page).getByRole('radio', { name: '30 min' }));
  expect(labels(page)).toEqual(['10:00 to 10:30']);
  expect(new URLSearchParams(window.location.search).get('bucket')).toBe('30');
});

test('switching to Exit moves the trades to the bucket they closed in', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: URL,
  });
  const page = await screen.findByTestId('reports-day-time');
  expect(labels(page)).toEqual(['10:00 to 10:15']);
  fireEvent.click(within(page).getByRole('radio', { name: 'Exit time' }));
  expect(labels(page)).toEqual(['11:00 to 11:15']);
  expect(new URLSearchParams(window.location.search).get('basis')).toBe('exit');
  expect(within(page).getByRole('img', { name: /by exit/ })).toBeTruthy();
});

test('the URL holds the tab, the bucket and the basis, and the tabs are Weekday, Month, Time of day and Duration', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: '/app/reports/day-time?tab=time&bucket=15&basis=exit',
  });
  const page = await screen.findByTestId('reports-day-time');
  const tabs = within(page)
    .getAllByRole('tab')
    .map((t) => t.textContent);
  expect(tabs).toEqual(['Weekday', 'Month', 'Time of day', 'Duration']);
  expect(
    (within(page).getByRole('radio', { name: '15 min' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (within(page).getByRole('radio', { name: 'Exit time' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(within(page).getByRole('tab', { name: 'Weekday' }));
  expect(new URLSearchParams(window.location.search).get('tab')).toBe(
    'weekday',
  );
  // Nov 2 to 5 are Monday to Thursday.
  const week = within(
    within(page).getByRole('table', { name: /Weekday summary/ }),
  );
  const nets = week
    .getAllByRole('row')
    .slice(1)
    .map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
  // Weeks start on Sunday: it leads, empty, and Monday follows.
  expect(nets[0]![0]).toBe('Sun');
  expect(nets[1]![0]).toBe('Mon');
  expect(nets[1]![3]).toBe('+$60.00');
  // The bucket switch belongs to the time-of-day tab only.
  expect(within(page).queryByRole('radiogroup', { name: 'Bucket' })).toBeNull();
});

test('a re-render that changes nothing the report reads does not recompute the breakdown', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: URL,
  });
  const page = await screen.findByTestId('reports-day-time');
  const calls = vi.mocked(breakdown);
  expect(labels(page)).toEqual(['10:00 to 10:15']);
  const before = calls.mock.calls.length;
  act(() => writeParam('unrelated', '1'));
  expect(labels(page)).toEqual(['10:00 to 10:15']);
  expect(calls.mock.calls.length).toBe(before);
});

test('the chart card and the table card carry different titles', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: URL,
  });
  const page = await screen.findByTestId('reports-day-time');
  const titles = within(page)
    .getAllByRole('heading')
    .map((h) => h.textContent);
  expect(titles).toContain('By time of day');
  expect(titles).toContain('Each 15 minutes');
  expect(new Set(titles).size).toBe(titles.length);
});

test('weekday: its chart and table are not both called By weekday', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: '/app/reports/day-time?tab=weekday',
  });
  const page = await screen.findByTestId('reports-day-time');
  const titles = within(page)
    .getAllByRole('heading')
    .map((h) => h.textContent);
  expect(titles.filter((t) => t === 'By weekday')).toHaveLength(1);
  expect(titles).toContain('Each weekday');
});

test('the subtitle names the zone as a person says it, not the IANA key', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: URL,
  });
  const page = await screen.findByTestId('reports-day-time');
  expect(page.textContent).toMatch(/New York, UTC-0[45]:00, by entry time/);
  expect(page.textContent).not.toContain('America/New_York');
});

test('a weekday link reads the day the report buckets by: entry day, or exit day under Exit time', async () => {
  renderApp(<DayTimeView />, {
    repository: await newYorkRepository(),
    url: '/app/reports/day-time?tab=weekday',
  });
  const page = await screen.findByTestId('reports-day-time');
  const table = () =>
    within(page).getByRole('table', { name: 'Weekday summary' });
  const monday = () =>
    new globalThis.URL(
      within(table())
        .getAllByRole('link')
        .find((a) => a.getAttribute('aria-label')?.startsWith('Mon,'))!
        .getAttribute('href')!,
      'http://k',
    ).searchParams;
  expect(monday().get('wd')).toBe('1');
  expect(monday().get('xwd')).toBeNull();
  act(() => writeParam('basis', 'exit'));
  await within(page).findByRole('link', { name: /^Mon, open/ });
  expect(monday().get('xwd')).toBe('1');
  expect(monday().get('wd')).toBeNull();
});
