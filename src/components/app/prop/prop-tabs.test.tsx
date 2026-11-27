// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { PropTabs } from './prop-tabs';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

test('the tabs are Dashboard, Accounts and Transactions, each a route, with no counts (C35, C73)', async () => {
  renderApp(
    <PropTabs active="accounts">
      <p>the page</p>
    </PropTabs>,
    { url: '/app/prop-firms/accounts' },
  );
  const nav = await screen.findByRole('navigation', { name: 'Prop firms' });
  const links = within(nav).getAllByRole('link');
  expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Dashboard', '/app/prop-firms'],
    ['Accounts', '/app/prop-firms/accounts'],
    ['Transactions', '/app/prop-firms/transactions'],
  ]);
  expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([
    null,
    'page',
    null,
  ]);
  expect(screen.getByText('the page')).toBeTruthy();
});

test('each tab marks itself current', async () => {
  for (const [active, name] of [
    ['dashboard', 'Dashboard'],
    ['transactions', 'Transactions'],
  ] as const) {
    renderApp(<PropTabs active={active}>{null}</PropTabs>, {
      url: '/app/prop-firms',
    });
    const nav = await screen.findByRole('navigation', { name: 'Prop firms' });
    expect(
      within(nav).getByRole('link', { name }).getAttribute('aria-current'),
    ).toBe('page');
    expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(
      1,
    );
    cleanup();
  }
});

test('New challenge opens the form', async () => {
  renderApp(<PropTabs active="dashboard">{null}</PropTabs>, {
    url: '/app/prop-firms',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'New challenge' }));
  expect(
    await screen.findByRole('dialog', { name: 'New challenge' }),
  ).toBeTruthy();
});

test('Log payout sits beside New challenge on every tab and opens the payout dialog', async () => {
  for (const active of ['dashboard', 'accounts', 'transactions'] as const) {
    renderApp(<PropTabs active={active}>{null}</PropTabs>, {
      url: '/app/prop-firms',
    });
    const buttons = await screen.findAllByRole('button', {
      name: /Log payout|New challenge/,
    });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Log payout',
      'New challenge',
    ]);
    fireEvent.click(buttons[0]!);
    expect(
      await screen.findByRole('dialog', { name: 'Log a payout' }),
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Focus is back on the button that opened it.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Log payout' }),
    );
    cleanup();
  }
});

test('?new=challenge opens the new-challenge form once and leaves the address clean', async () => {
  renderApp(<PropTabs active="dashboard">{null}</PropTabs>, {
    url: '/app/prop-firms?new=challenge&phase=funded',
  });
  expect(
    await screen.findByRole('dialog', { name: 'New challenge' }),
  ).toBeTruthy();
  // The param goes with a replace; the rest of the address stays.
  expect(window.location.search).toBe('?phase=funded');
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
