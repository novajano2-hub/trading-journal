// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import type { DashTemplate } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { DashboardEditProvider, useDashboardEdit } from './edit-session';
import { TemplateMenu } from './template-menu';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  const [main, inReview] = items.map(
    (li) => within(li).getAllByRole('button')[0]!,
  );
  expect(main!.getAttribute('aria-current')).toBeNull();
  expect(inReview!.getAttribute('aria-current')).toBe('true');
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

// ---------------------------------------------------------------------------
// Switching, editing and creating

/** Says what edit mode is editing, if it is on. */
function Editing(): React.JSX.Element {
  const edit = useDashboardEdit();
  return (
    <output data-testid="editing">
      {edit?.session ? edit.session.draft.name : 'none'}
    </output>
  );
}

/** The menu with the edit session beside it. */
const WithSession = (): React.JSX.Element => (
  <DashboardEditProvider>
    <TemplateMenu />
    <Editing />
  </DashboardEditProvider>
);

const two = { inUse: 'main', templates: [DEFAULT_TEMPLATE, review] };

async function menu(dashboards?: typeof two) {
  viewport();
  const repository = await repositoryWith(dashboards);
  renderApp(<WithSession />, { repository });
  fireEvent.click(
    await screen.findByRole('button', { name: /^Dashboard template:/ }),
  );
  return {
    repository,
    panel: await screen.findByRole('dialog', { name: 'Dashboard templates' }),
  };
}

test('each template has a button to pick it and an Edit control; New template follows', async () => {
  const { panel } = await menu(two);
  const rows = within(panel).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  within(rows[0]!).getByRole('button', { name: /^Main/ });
  within(rows[0]!).getByRole('button', { name: 'Edit Main' });
  within(rows[1]!).getByRole('button', { name: /^Review/ });
  within(rows[1]!).getByRole('button', { name: 'Edit Review' });
  within(panel).getByRole('button', { name: 'New template' });
});

test('picking a template switches at once: inUse is written and the button names it', async () => {
  const { repository, panel } = await menu(two);
  fireEvent.click(within(panel).getByRole('button', { name: /^Review/ }));
  await screen.findByRole('button', { name: 'Dashboard template: Review' });
  expect((await repository.prefs.get()).dashboards?.inUse).toBe('review');
  expect(
    screen.queryByRole('dialog', { name: 'Dashboard templates' }),
  ).toBeNull();
  // The list was not touched.
  expect((await repository.prefs.get()).dashboards?.templates).toHaveLength(2);
});

test('picking the template already in use writes nothing', async () => {
  const { repository, panel } = await menu();
  fireEvent.click(within(panel).getByRole('button', { name: /^Main/ }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Dashboard templates' }),
    ).toBeNull(),
  );
  expect((await repository.prefs.get()).dashboards).toBeUndefined();
});

test('Edit starts edit mode on that template and closes the menu', async () => {
  const { panel } = await menu(two);
  fireEvent.click(within(panel).getByRole('button', { name: 'Edit Review' }));
  await waitFor(() =>
    expect(screen.getByTestId('editing').textContent).toBe('Review'),
  );
  expect(
    screen.queryByRole('dialog', { name: 'Dashboard templates' }),
  ).toBeNull();
});

test('New template asks a name, filled in with a suggestion, and makes a copy of the template in use', async () => {
  const withSettings: DashTemplate = {
    ...review,
    lower: [{ key: 'trade-time', settings: { time: 'exit' } }],
  };
  const { repository, panel } = await menu({
    inUse: 'review',
    templates: [DEFAULT_TEMPLATE, withSettings],
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'New template' }));
  const field = within(panel).getByRole('textbox', {
    name: 'Name the new template',
  }) as HTMLInputElement;
  expect(field.value).toBe('Review copy');
  expect(field.maxLength).toBe(40);
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, { target: { value: ' Swing ' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Create' }));
  await waitFor(async () =>
    expect((await repository.prefs.get()).dashboards?.templates).toHaveLength(
      3,
    ),
  );
  const saved = (await repository.prefs.get()).dashboards!;
  const made = saved.templates[2]!;
  expect(made.name).toBe('Swing');
  expect(made.upper).toEqual(withSettings.upper);
  expect(made.lower).toEqual(withSettings.lower);
  expect(made.id).not.toBe('review');
  expect(saved.templates.map((t) => t.id)).toEqual(['main', 'review', made.id]);
  expect(saved.inUse).toBe(made.id);
  // The copy is where the arranging starts.
  await waitFor(() =>
    expect(screen.getByTestId('editing').textContent).toBe('Swing'),
  );
  expect(
    screen.queryByRole('dialog', { name: 'Dashboard templates' }),
  ).toBeNull();
});

test('a blank name for a new template is refused in words, and nothing is made', async () => {
  const { repository, panel } = await menu(two);
  fireEvent.click(within(panel).getByRole('button', { name: 'New template' }));
  const field = within(panel).getByRole('textbox', {
    name: 'Name the new template',
  });
  fireEvent.change(field, { target: { value: '  ' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Create' }));
  expect((await within(panel).findByRole('alert')).textContent).toBe(
    'Name the template, up to 40 characters.',
  );
  expect((await repository.prefs.get()).dashboards?.templates).toHaveLength(2);
  expect(screen.getByTestId('editing').textContent).toBe('none');
  // Cancel puts the New template button back.
  fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
  within(panel).getByRole('button', { name: 'New template' });
});

test('pressing Enter in the name field creates the template', async () => {
  const { repository, panel } = await menu();
  fireEvent.click(within(panel).getByRole('button', { name: 'New template' }));
  const field = within(panel).getByRole('textbox', {
    name: 'Name the new template',
  });
  fireEvent.change(field, { target: { value: 'Second' } });
  fireEvent.submit(field.closest('form')!);
  await waitFor(async () =>
    expect((await repository.prefs.get()).dashboards?.templates).toHaveLength(
      2,
    ),
  );
  const saved = (await repository.prefs.get()).dashboards!;
  expect(saved.templates.map((t) => t.name)).toEqual(['Main', 'Second']);
});
