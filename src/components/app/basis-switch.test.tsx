// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from './__fixtures__/render-app';
import { BasisSwitch } from './basis-switch';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

test('Gross/Net switches the saved basis', async () => {
  const { repo } = renderApp(<BasisSwitch />);
  await waitFor(() =>
    expect(
      screen
        .getByRole('radiogroup', { name: 'P&L basis' })
        .hasAttribute('aria-disabled'),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Gross' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).pnlBasis).toBe('gross'),
  );
});

test('with no trades in the workspace it shows, faint and in the tab order, and changes nothing', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.workspaces.setActive('mine');
  renderApp(<BasisSwitch />, { repository });
  const group = screen.getByRole('radiogroup', { name: 'P&L basis' });
  await waitFor(() => expect(group.getAttribute('aria-disabled')).toBe('true'));
  const gross = screen.getByRole('radio', { name: 'Gross' });
  expect(gross.hasAttribute('disabled')).toBe(false);
  fireEvent.click(gross);
  expect(
    (screen.getByRole('radio', { name: 'Net' }) as HTMLInputElement).checked,
  ).toBe(true);
  expect((await repository.prefs.get()).pnlBasis).toBe('net');
});
