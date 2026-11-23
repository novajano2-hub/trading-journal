// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { newYorkRepository } from '../__fixtures__/reports-sample';
import { DayTimeView } from './day-time-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
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
  expect(nets[0]![0]).toBe('Mon');
  expect(nets[0]![3]).toBe('+$60.00');
  // The bucket switch belongs to the time-of-day tab only.
  expect(within(page).queryByRole('radiogroup', { name: 'Bucket' })).toBeNull();
});
