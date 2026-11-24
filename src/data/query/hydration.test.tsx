// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { AccountSwitcher } from '@/components/app/account-switcher';
import { commitNavigation } from '@/components/app/__fixtures__/navigation';
import { FilterBar } from '@/components/app/filter-bar';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import { DataProvider } from './provider';

vi.mock(
  'next/navigation',
  () => import('@/components/app/__fixtures__/navigation'),
);
afterEach(cleanup);

/**
 * The race behind E147: the server renders with no data, and a part of the
 * page that hydrates late finds the data already in the cache. Its first
 * client frame must still be the server's, or React keeps the server's
 * attributes (the chips stay disabled) or regenerates the tree.
 */
test('a late hydration over a full cache renders the server first frame, then goes live (E147)', async () => {
  window.history.replaceState(null, '', '/app/trades');
  commitNavigation();
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const tree = (
    <DataProvider repository={repository} queryClient={queryClient}>
      <FilterBar />
      <AccountSwitcher />
    </DataProvider>
  );
  // The server: a fresh cache, nothing loaded.
  const html = renderToString(
    <DataProvider
      repository={repository}
      queryClient={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FilterBar />
      <AccountSwitcher />
    </DataProvider>,
  );
  expect(html).toContain('disabled');

  // Another part of the page has loaded the data before this one hydrates.
  const warm = render(tree);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Symbol' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  warm.unmount();
  expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(3);

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const errors: string[] = [];
  const spy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: (e) => errors.push(String(e)),
    });
  });
  spy.mockRestore();
  // No mismatch, and the chips are live after hydration: not stuck disabled.
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
  await waitFor(() =>
    expect(
      (
        container.querySelector(
          'button[aria-label="Symbol"], button',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  const chips = [...container.querySelectorAll('[role="group"] button')];
  expect(chips.length).toBeGreaterThan(4);
  expect(chips.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  root.unmount();
});
