// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { PlanTheDay } from './plan-the-day';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

// The fixture sample's routine today is 2026-11-19.
test('picking a future date opens its plan; a past one opens its review', async () => {
  renderApp(<PlanTheDay />);
  const open = async () => {
    // The button is disabled until the routine's today loads, and then replaced.
    await vi.waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Plan the day' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan the day' }));
  };
  await open();
  fireEvent.click(
    await screen.findByRole('gridcell', { name: '28 November 2026' }),
  );
  expect(window.location.pathname).toBe('/app/day/2026-11-28/plan');
  await open();
  fireEvent.click(
    await screen.findByRole('gridcell', { name: '3 November 2026' }),
  );
  expect(window.location.pathname).toBe('/app/day/2026-11-03/review');
});

test('the label can be changed', async () => {
  renderApp(<PlanTheDay label="Pick a day" />);
  expect(
    await screen.findByRole('button', { name: 'Pick a day' }),
  ).toBeTruthy();
});

test('the day it opens keeps the account selection', async () => {
  renderApp(<PlanTheDay />, { url: '/app/trades/day?account=acc-a' });
  await vi.waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Plan the day' })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Plan the day' }));
  fireEvent.click(
    await screen.findByRole('gridcell', { name: '28 November 2026' }),
  );
  expect(window.location.pathname).toBe('/app/day/2026-11-28/plan');
  expect(window.location.search).toBe('?account=acc-a');
});
