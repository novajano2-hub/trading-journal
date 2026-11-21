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
import { MobileNav } from './mobile-nav';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

// The sheet's exit would otherwise wait on an animation happy-dom never ends.
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

test('switching workspace inside the drawer closes it', async () => {
  renderApp(<MobileNav switcher={<AccountSwitcher />} />, {
    url: '/app/dashboard?side=long',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
  const trigger = await within(sheet).findByRole('button', {
    name: /Sample workspace/,
  });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const menu = await screen.findByRole('menu');
  fireEvent.click(
    within(menu).getByRole('menuitemradio', { name: 'My workspace' }),
  );

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // The switch still finished its work: the filters it keeps are kept.
  await waitFor(() => expect(window.location.search).toBe('?side=long'));
  expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
});

test('the drawer stays open while the workspace first loads', async () => {
  renderApp(<MobileNav switcher={<AccountSwitcher />} />);
  // Opened before the active workspace is known.
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
  await within(sheet).findByRole('button', { name: /Sample workspace/ });
  expect(screen.getByRole('dialog', { name: 'Navigation' })).toBe(sheet);
});

test("the drawer's wordmark goes to the Dashboard with the filters", async () => {
  renderApp(<MobileNav />, { url: '/app/reports?side=long&by=day' });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
  expect(
    within(sheet).getByRole('link', { name: 'Keel' }).getAttribute('href'),
  ).toBe('/app/dashboard?side=long');
});
