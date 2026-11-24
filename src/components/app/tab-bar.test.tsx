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
import { renderApp } from './__fixtures__/render-app';
import { AccountSwitcher } from './account-switcher';
import { TabBar } from './tab-bar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

// The sheet's exit would otherwise wait on an animation happy-dom never ends.
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const tabs = () => screen.getByRole('navigation', { name: 'Main' });

test('the bar holds Dashboard, Trades, Calendar, Reports and More, phone only', () => {
  renderApp(<TabBar />, { url: '/app/trades' });
  const bar = tabs();
  expect(bar.className).toContain('sm:hidden');
  expect(bar.className).toContain('fixed');
  expect(bar.className).toContain('pb-[env(safe-area-inset-bottom)]');
  expect(
    within(bar)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Dashboard', 'Trades', 'Calendar', 'Reports', 'More']);
});

test('the current tab is marked in accent ink, its glyph filled; the rest carry the filters', () => {
  renderApp(<TabBar />, { url: '/app/trades?side=short&by=pnl' });
  const bar = tabs();
  const trades = within(bar).getByRole('link', { name: 'Trades' });
  expect(trades.getAttribute('aria-current')).toBe('page');
  expect(trades.className).toContain('text-accent-ink');
  // No pill or box behind it.
  expect(trades.className).not.toMatch(/(^|\s)(bg-|border|shadow)/);
  const calendar = within(bar).getByRole('link', { name: 'Calendar' });
  expect(calendar.hasAttribute('aria-current')).toBe(false);
  expect(calendar.className).toContain('text-faint');
  expect(calendar.getAttribute('href')).toBe('/app/calendar?side=short');
  // Each target at least 44px: the tabs are 56px tall.
  expect(trades.className).toContain('min-h-14');
});

test('More is current on a page it holds', () => {
  renderApp(<TabBar />, { url: '/app/settings/profile' });
  const more = within(tabs()).getByRole('button', { name: 'More' });
  expect(more.className).toContain('text-accent-ink');
  expect(
    within(tabs())
      .getAllByRole('link')
      .some((a) => a.hasAttribute('aria-current')),
  ).toBe(false);
});

test('More opens a sheet with the switcher, the other modules, Settings, "Not live yet" and Appearance', async () => {
  renderApp(<TabBar switcher={<AccountSwitcher appearance={false} />} />, {
    url: '/app/dashboard?side=long',
  });
  const more = within(tabs()).getByRole('button', { name: 'More' });
  fireEvent.click(more);
  const sheet = await screen.findByRole('dialog', { name: 'More' });
  await within(sheet).findByRole('button', { name: /Sample workspace/ });
  const nav = within(sheet).getByRole('navigation', { name: 'More' });
  const [modules, notLive] = within(nav).getAllByRole('list');
  expect(
    within(modules!)
      .getAllByRole('link')
      .map((a) => a.textContent),
  ).toEqual(['Strategies', 'Notebook', 'Import', 'Prop firms', 'Settings']);
  expect(within(sheet).getByRole('list', { name: 'Not live yet' })).toBe(
    notLive,
  );
  expect(within(notLive!).getAllByRole('link')).toHaveLength(4);
  // Strategies keeps the filters, as the sidebar's link does.
  expect(
    within(sheet)
      .getByRole('link', { name: 'Strategies' })
      .getAttribute('href'),
  ).toBe('/app/strategies?side=long');
  expect(
    within(sheet).getByRole('radiogroup', { name: 'Appearance' }),
  ).toBeTruthy();

  fireEvent.keyDown(sheet, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(more);
});

test('switching workspace inside More closes it and keeps the filters it can', async () => {
  renderApp(<TabBar switcher={<AccountSwitcher appearance={false} />} />, {
    url: '/app/dashboard?side=long',
  });
  fireEvent.click(within(tabs()).getByRole('button', { name: 'More' }));
  const sheet = await screen.findByRole('dialog', { name: 'More' });
  const trigger = await within(sheet).findByRole('button', {
    name: /Sample workspace/,
  });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const menu = await screen.findByRole('menu');
  // The phone's switcher leaves Appearance to the sheet.
  expect(within(menu).queryByRole('group', { name: 'Appearance' })).toBeNull();
  fireEvent.click(
    within(menu).getByRole('menuitemradio', { name: 'My workspace' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(window.location.search).toBe('?side=long'));
});

test("the desktop switcher's menu ends with Appearance", async () => {
  renderApp(<AccountSwitcher />);
  const trigger = await screen.findByRole('button', {
    name: /Sample workspace/,
  });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const menu = await screen.findByRole('menu');
  const group = within(menu).getByRole('group', { name: 'Appearance' });
  expect(
    within(group)
      .getAllByRole('menuitemradio')
      .map((i) => i.textContent),
  ).toEqual(['System', 'Light', 'Dark']);
});
