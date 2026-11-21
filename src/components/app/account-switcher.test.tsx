// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import { AccountSwitcher } from './account-switcher';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

function renderSwitcher(url: string) {
  window.history.replaceState(null, '', url);
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  render(
    <DataProvider repository={repository} queryClient={queryClient}>
      <AccountSwitcher />
    </DataProvider>,
  );
}

async function openMenu(name: RegExp): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

test('accounts toggle in place, archived ones listed apart, and "All accounts" clears them', async () => {
  renderSwitcher('/app/dashboard?side=long');
  const menu = await openMenu(/Sample workspace\s*All accounts/);
  expect(
    within(menu)
      .getByRole('menuitemcheckbox', { name: 'All accounts' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(within(menu).getByRole('group', { name: 'Archived' })).toBeTruthy();

  fireEvent.click(
    within(menu).getByRole('menuitemcheckbox', { name: 'Futures main' }),
  );
  expect(window.location.search).toBe('?account=acc-a&side=long');
  expect(screen.getByRole('menu')).toBe(menu);
  // The open menu hides the rest of the page from assistive tech, trigger included.
  await screen.findByRole('button', {
    name: /Sample workspace\s*Futures main/,
    hidden: true,
  });

  fireEvent.click(
    within(menu).getByRole('menuitemcheckbox', { name: 'All accounts' }),
  );
  expect(window.location.search).toBe('?side=long');
});

test('switching workspace clears account, strategy and tag filters and keeps the rest', async () => {
  renderSwitcher(
    '/app/dashboard?range=this-week&account=acc-a&symbol=ES&side=long&strategy=str-1&tag=tag-fomo',
  );
  const menu = await openMenu(/Sample workspace\s*Futures main/);
  fireEvent.click(
    within(menu).getByRole('menuitemradio', { name: 'My workspace' }),
  );
  await screen.findByRole('button', { name: /My workspace\s*All accounts/ });
  await waitFor(() =>
    expect(window.location.search).toBe('?range=this-week&symbol=ES&side=long'),
  );
});
