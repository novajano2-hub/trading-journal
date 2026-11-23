// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { CalendarReportView } from './calendar-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

test('the year view lists twelve months, and a month opens the Calendar on it', async () => {
  renderApp(<CalendarReportView />, {
    sample: breakdownSample,
    url: '/app/reports/calendar?year=2026',
  });
  const page = await screen.findByTestId('reports-calendar');
  const months = within(page).getAllByTestId('year-month');
  expect(months).toHaveLength(12);
  const nov = months[10]!;
  expect(nov.textContent).toContain('November');
  expect(nov.textContent).toContain('+$125.00');
  expect(nov.querySelector('a')!.getAttribute('href')).toBe(
    '/app/calendar?month=2026-11',
  );
});

test('the global filters ride along to the Calendar, and the year steps back and forward', async () => {
  renderApp(<CalendarReportView />, {
    sample: breakdownSample,
    url: '/app/reports/calendar?year=2026&symbol=ES',
  });
  const page = await screen.findByTestId('reports-calendar');
  const nov = within(page).getAllByTestId('year-month')[10]!;
  expect(nov.textContent).toContain('+$60.00');
  const href = nov.querySelector('a')!.getAttribute('href')!;
  expect(href.startsWith('/app/calendar?month=2026-11')).toBe(true);
  expect(href).toContain('symbol=ES');
  fireEvent.click(within(page).getByRole('button', { name: 'Previous year' }));
  expect(
    await within(page).findByRole('heading', { name: '2025' }),
  ).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get('year')).toBe('2025');
  expect(within(page).getAllByText('No trades')).toHaveLength(12);
});
