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
import { StorageUnavailableError, type Repository } from '@/data/repository';
import { AccountSwitcher } from './account-switcher';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSwitcher(
  url: string,
  patch: (repo: Repository) => Partial<Repository> = () => ({}),
  sample: () => ReturnType<typeof fixtureSample> = fixtureSample,
) {
  window.history.replaceState(null, '', url);
  const local = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
  });
  const repository = { ...local, ...patch(local) };
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
    within(menu).getByRole('menuitemcheckbox', { name: /Futures main/ }),
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

test('a workspace that cannot load says so, and clicking it reloads the page', async () => {
  renderSwitcher('/app/dashboard', (repo) => ({
    workspaces: {
      ...repo.workspaces,
      getActive: () => Promise.reject(new StorageUnavailableError()),
    },
  }));
  const retry = await screen.findByRole('button', {
    name: /Workspace unavailable\s*Try again/,
  });
  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });
  fireEvent.click(retry);
  expect(reload).toHaveBeenCalledOnce();
});

/** The fixture's two accounts plus a forex one at another broker. */
function withForex() {
  const s = fixtureSample();
  s.accounts.push({
    ...s.accounts[0]!,
    id: 'acc-fx',
    name: 'Forex prop',
    broker: 'Oanda',
  });
  return s;
}

test('the search narrows accounts by name or broker, and the rest stay out of the list', async () => {
  renderSwitcher('/app/dashboard', undefined, withForex);
  const menu = await openMenu(/Sample workspace\s*All accounts/);
  const search = within(menu).getByRole('searchbox', {
    name: 'Search accounts',
  });
  fireEvent.change(search, { target: { value: 'forex' } });
  const items = () =>
    within(menu)
      .getAllByRole('menuitemcheckbox')
      .map((i) => i.textContent);
  expect(items()).toEqual(['All accounts', 'Forex prop' + 'Oanda']);
  fireEvent.change(search, { target: { value: 'sample broker' } });
  expect(items()).toEqual([
    'All accounts',
    'Futures mainSample broker',
    'Old demoSample broker',
  ]);
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(within(menu).getByText('No accounts match.')).toBeTruthy();
});

test('selecting two accounts writes them as one list', async () => {
  renderSwitcher('/app/dashboard', undefined, withForex);
  const menu = await openMenu(/Sample workspace\s*All accounts/);
  fireEvent.click(
    within(menu).getByRole('menuitemcheckbox', { name: /Futures main/ }),
  );
  fireEvent.click(
    within(menu).getByRole('menuitemcheckbox', { name: /Forex prop/ }),
  );
  expect(window.location.search).toBe('?account=acc-a,acc-fx');
  expect(
    within(menu)
      .getByRole('menuitemcheckbox', { name: 'All accounts' })
      .getAttribute('aria-checked'),
  ).toBe('false');
  await screen.findByRole('button', {
    name: /Sample workspace\s*2 accounts/,
    hidden: true,
  });
});

test('the menu ends with a Manage accounts link to Settings accounts', async () => {
  renderSwitcher('/app/dashboard');
  const menu = await openMenu(/Sample workspace\s*All accounts/);
  const items = within(menu).getAllByRole('menuitem');
  const manage = within(menu).getByRole('menuitem', {
    name: 'Manage accounts',
  });
  expect(manage.getAttribute('href')).toBe('/app/settings/accounts');
  expect(items[items.length - 1]).toBe(manage);
});
