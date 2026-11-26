// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import type { DashTemplate } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { TemplateMenu } from './template-menu';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

const review: DashTemplate = {
  id: 'review',
  name: 'Review',
  upper: [{ key: 'expectancy' }],
  lower: [{ key: 'drawdown' }],
};

async function repositoryWith(dashboards?: {
  inUse: string;
  templates: DashTemplate[];
}) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  if (dashboards) await repository.prefs.update({ dashboards });
  return repository;
}

test('with no template pref the button names the default template, Main', async () => {
  renderApp(<TemplateMenu />, { repository: await repositoryWith() });
  const button = await screen.findByRole('button', {
    name: 'Dashboard template: Main',
  });
  expect(button.getAttribute('title')).toBe('Dashboard template: Main');
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

test('the button names the template in use', async () => {
  renderApp(<TemplateMenu />, {
    repository: await repositoryWith({
      inUse: 'review',
      templates: [DEFAULT_TEMPLATE, review],
    }),
  });
  const button = await screen.findByRole('button', {
    name: 'Dashboard template: Review',
  });
  expect(button.getAttribute('title')).toBe('Dashboard template: Review');
});

test('until the prefs load the button waits, disabled, with no name to get wrong', () => {
  renderApp(<TemplateMenu />, { repository: undefined });
  const button = screen.getByRole('button', { name: 'Dashboard template' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

test('it opens a list of the templates, the one in use marked', async () => {
  renderApp(<TemplateMenu />, {
    repository: await repositoryWith({
      inUse: 'review',
      templates: [DEFAULT_TEMPLATE, review],
    }),
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Dashboard template: Review' }),
  );
  const panel = await screen.findByRole('dialog', {
    name: 'Dashboard templates',
  });
  const items = within(panel).getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual(['Main', 'ReviewIn use']);
  expect(items[0]!.getAttribute('aria-current')).toBeNull();
  expect(items[1]!.getAttribute('aria-current')).toBe('true');
});

test('Escape closes the list and gives focus back to the button', async () => {
  renderApp(<TemplateMenu />, { repository: await repositoryWith() });
  const button = await screen.findByRole('button', {
    name: 'Dashboard template: Main',
  });
  fireEvent.click(button);
  const panel = await screen.findByRole('dialog', {
    name: 'Dashboard templates',
  });
  fireEvent.keyDown(panel, { key: 'Escape' });
  await vi.waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Dashboard templates' }),
    ).toBeNull(),
  );
  await vi.waitFor(() => expect(document.activeElement).toBe(button));
});
