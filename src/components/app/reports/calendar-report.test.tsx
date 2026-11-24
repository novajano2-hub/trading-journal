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

test('in R the months and the year read in R, as the Calendar does (I2)', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<CalendarReportView />, {
    repository,
    url: '/app/reports/calendar?year=2026',
  });
  const page = await screen.findByTestId('reports-calendar');
  // b-1 +2R and b-2 -1R; no other trade has a stop.
  const nov = within(page).getAllByTestId('year-month')[10]!;
  expect(nov.textContent).toContain('+1.00R');
  expect(nov.textContent).not.toContain('$');
  expect(page.textContent).toContain('net +1.00R');
});

test('with trades in two currencies a month link opens the Calendar on the one read (E143)', async () => {
  renderApp(<CalendarReportView />, {
    sample: async () => {
      const s = await breakdownSample();
      s.trades.push({
        ...s.trades[0]!,
        id: 'b-eur',
        serial: 99,
        pnlCurrency: 'EUR',
      });
      return s;
    },
    url: '/app/reports/calendar?year=2026&cur=EUR',
  });
  const page = await screen.findByTestId('reports-calendar');
  const href = within(page)
    .getAllByTestId('year-month')[10]!
    .querySelector('a')!
    .getAttribute('href')!;
  expect(new URL(href, 'http://x').searchParams.get('cur')).toBe('EUR');
  expect(new URL(href, 'http://x').searchParams.get('month')).toBe('2026-11');
});
