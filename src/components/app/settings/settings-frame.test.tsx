// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { UserPrefs } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { Sidebar } from '../sidebar';
import { SettingsFrame } from './settings-frame';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

async function repoWith(sidebar?: UserPrefs['sidebar']) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  if (sidebar) await repository.prefs.update({ sidebar });
  return repository;
}

const PAGE = <p>The open section</p>;
const frame = () =>
  screen.getByText('The open section').parentElement!.parentElement!;

test('Settings follows the sidebar: collapsed, the menu is an icon column and the page widens', async () => {
  renderApp(<SettingsFrame>{PAGE}</SettingsFrame>, {
    url: '/app/settings/profile',
    repository: await repoWith('collapsed'),
  });
  // The first paint cannot know the choice: the full menu until the prefs load.
  await waitFor(() => expect(frame().dataset.collapsed).toBe('true'));
  expect(frame().className).toContain('lg:grid-cols-[60px_minmax(0,1fr)]');
  const name = [
    ...screen.getByRole('link', { name: 'Accounts' }).querySelectorAll('span'),
  ].find((s) => s.textContent === 'Accounts')!;
  expect(name.className).toContain('lg:sr-only');
});

test('expanded, the menu is the 180px card beside the page', async () => {
  renderApp(<SettingsFrame>{PAGE}</SettingsFrame>, {
    url: '/app/settings/profile',
    repository: await repoWith('expanded'),
  });
  await screen.findByRole('navigation', { name: 'Settings' });
  expect(frame().dataset.collapsed).toBe('false');
  expect(frame().className).toContain('lg:grid-cols-[180px_minmax(0,1fr)]');
  expect(frame().className).not.toContain('60px');
});

test("the sidebar's own toggle collapses the menu with it, and expanding brings it back", async () => {
  renderApp(
    <>
      <Sidebar />
      <SettingsFrame>{PAGE}</SettingsFrame>
    </>,
    { url: '/app/settings/profile' },
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Collapse the sidebar' }),
  );
  await waitFor(() => expect(frame().dataset.collapsed).toBe('true'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Expand the sidebar' }),
  );
  await waitFor(() => expect(frame().dataset.collapsed).toBe('false'));
});
