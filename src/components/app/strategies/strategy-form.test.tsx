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
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { StrategyForm } from './strategy-form';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const group = (name: string) => screen.getByRole('group', { name });
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

async function ready(strategyId?: string) {
  const out = renderApp(<StrategyForm strategyId={strategyId} />, {
    url: strategyId
      ? `/app/strategies/${strategyId}/edit`
      : '/app/strategies/new',
  });
  await screen.findByLabelText('Name');
  return out;
}

async function created(repo: Awaited<ReturnType<typeof ready>>['repo']) {
  await waitFor(async () =>
    expect((await repo.strategies.list(WS)).length).toBeGreaterThan(1),
  );
  const all = await repo.strategies.list(WS);
  return all.find((s) => s.id !== 'str-1')!;
}

test('creating with an empty name says what is missing and saves nothing', async () => {
  const { repo } = await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Give the strategy a name.',
  );
  expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe(
    'true',
  );
  expect(await repo.strategies.list(WS)).toHaveLength(1);
});

test('a new strategy starts with Entry, Exit, Risk and Management', async () => {
  await ready();
  const titles = screen
    .getAllByLabelText('Group name')
    .map((i) => (i as HTMLInputElement).value);
  expect(titles).toEqual(['Entry', 'Exit', 'Risk', 'Management']);
});

test('a rule added to Exit with show-when Winner is saved that way', async () => {
  const { repo } = await ready();
  type(screen.getByLabelText('Name'), 'Scalp');
  fireEvent.click(
    within(group('Exit')).getByRole('button', { name: 'Add rule to Exit' }),
  );
  type(within(group('Exit')).getByLabelText('Rule text'), 'Scale out at 2R');
  type(within(group('Exit')).getByLabelText('Show when'), 'winner');
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));

  const saved = await created(repo);
  expect(saved.name).toBe('Scalp');
  const exit = saved.groups.find((g) => g.title === 'Exit')!;
  expect(exit.rules).toMatchObject([
    { text: 'Scale out at 2R', showWhen: 'winner' },
  ]);
  await waitFor(() =>
    expect(window.location.pathname).toBe(`/app/strategies/${saved.id}`),
  );
});

test('renaming Risk to Sizing and adding the group News saves both', async () => {
  const { repo } = await ready();
  type(screen.getByLabelText('Name'), 'Swing');
  type(within(group('Risk')).getByLabelText('Group name'), 'Sizing');
  fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
  const names = screen.getAllByLabelText('Group name');
  type(names[names.length - 1]!, 'News');
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));

  const saved = await created(repo);
  expect(saved.groups.map((g) => g.title)).toEqual([
    'Entry',
    'Exit',
    'Sizing',
    'Management',
    'News',
  ]);
});

test('Move up puts a rule above the one before it', async () => {
  const { repo } = await ready();
  type(screen.getByLabelText('Name'), 'Order');
  const entry = () => within(group('Entry'));
  fireEvent.click(entry().getByRole('button', { name: 'Add rule to Entry' }));
  type(entry().getByLabelText('Rule text'), 'First');
  fireEvent.click(entry().getByRole('button', { name: 'Add rule to Entry' }));
  type(entry().getAllByLabelText('Rule text')[1]!, 'Second');

  expect(
    (
      entry().getByRole('button', {
        name: 'Move First up',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(entry().getByRole('button', { name: 'Move Second up' }));
  expect(
    entry()
      .getAllByLabelText('Rule text')
      .map((i) => (i as HTMLInputElement).value),
  ).toEqual(['Second', 'First']);

  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  const saved = await created(repo);
  expect(saved.groups[0]!.rules.map((r) => r.text)).toEqual([
    'Second',
    'First',
  ]);
});

test('removing a group with rules asks first', async () => {
  await ready();
  fireEvent.click(
    within(group('Exit')).getByRole('button', { name: 'Add rule to Exit' }),
  );
  type(within(group('Exit')).getByLabelText('Rule text'), 'Take profit');
  fireEvent.click(
    within(group('Exit')).getByRole('button', { name: 'Remove group Exit' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/1 rule/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove group' }));
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: 'Exit' })).toBeNull(),
  );
});

test('editing keeps the rules ids, so their trade checks survive a rename', async () => {
  const { repo } = await ready('str-1');
  await waitFor(() =>
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Opening range breakout',
    ),
  );
  type(screen.getByLabelText('Name'), 'ORB');
  fireEvent.click(screen.getByRole('button', { name: 'Save strategy' }));
  await waitFor(async () =>
    expect((await repo.strategies.get(WS, 'str-1'))!.name).toBe('ORB'),
  );
  const s = (await repo.strategies.get(WS, 'str-1'))!;
  expect(s.groups.flatMap((g) => g.rules.map((r) => r.id))).toEqual([
    'r-1',
    'r-2',
  ]);
});

test("Delete stays disabled until the strategy's trade count has loaded, so the confirm never says 0 trades", async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const list = repository.trades.list.bind(repository.trades);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  repository.trades.list = async (...a) => {
    await gate;
    return list(...a);
  };
  renderApp(<StrategyForm strategyId="str-1" />, {
    repository,
    url: '/app/strategies/str-1/edit',
  });
  const del = (await screen.findByRole('button', {
    name: 'Delete strategy',
  })) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  release();
  await waitFor(() => expect(del.disabled).toBe(false));
});
