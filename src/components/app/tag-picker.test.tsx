// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import type { TagCategory } from '@/domain/types';
import { renderApp } from './__fixtures__/render-app';
import { TagPicker } from './tag-picker';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

async function sample(): Promise<SampleWorkspace> {
  const fx = fixtureSample();
  const ws = fx.tags[0]!.workspaceId;
  return {
    ...fx,
    tags: [
      ...fx.tags,
      {
        id: 'tag-revenge',
        workspaceId: ws,
        name: 'revenge',
        categoryId: 'mistakes',
      },
    ],
  };
}

function Harness({
  onChange,
  categories,
  allowCreate = true,
}: {
  onChange(ids: string[]): void;
  categories?: TagCategory[];
  allowCreate?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <TagPicker
      label="Tags"
      selected={selected}
      categories={categories}
      allowCreate={allowCreate}
      onChange={(ids) => {
        setSelected(ids);
        onChange(ids);
      }}
    />
  );
}

const box = () => screen.findByRole('combobox', { name: 'Tags' });

test('typing "rev" filters to revenge, and Enter selects it', async () => {
  const onChange = vi.fn();
  renderApp(<Harness onChange={onChange} />, { sample });
  const input = await box();
  await screen.findByRole('option', { name: 'revenge' });
  expect(screen.getAllByRole('option').length).toBe(3);
  fireEvent.change(input, { target: { value: 'rev' } });
  // The tags left, then the way to make "rev" itself.
  const options = screen.getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual([
    'revenge',
    "Create 'rev'",
  ]);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith(['tag-revenge']);
  expect(
    screen
      .getByRole('option', { name: 'revenge' })
      .getAttribute('aria-selected'),
  ).toBe('true');
});

test('the arrow keys move through the options across categories', async () => {
  const onChange = vi.fn();
  renderApp(<Harness onChange={onChange} />, { sample });
  const input = await box();
  await screen.findAllByRole('option');
  // By category name, then tag name: Mistakes (fomo, revenge), then Setups (breakout).
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith(['tag-revenge']);
  expect(
    within(screen.getByRole('group', { name: 'Mistakes' })).getAllByRole(
      'option',
    ),
  ).toHaveLength(2);
});

test('"Create newtag" makes the tag in Custom tags and selects it', async () => {
  const onChange = vi.fn();
  const { repo } = renderApp(<Harness onChange={onChange} />, { sample });
  const input = await box();
  await screen.findAllByRole('option');
  fireEvent.change(input, { target: { value: 'NewTag' } });
  expect(screen.queryAllByRole('option', { name: /^(?!Create)/ })).toHaveLength(
    0,
  );
  fireEvent.click(screen.getByRole('option', { name: "Create 'newtag'" }));
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const ws = (await repo.workspaces.getActive()).id;
  const made = (await repo.tags.list(ws)).find((t) => t.name === 'newtag');
  expect(made?.categoryId).toBe('custom-tags');
  expect(onChange).toHaveBeenLastCalledWith([made!.id]);
});

test('a scoped picker lists and creates in its first category only', async () => {
  const onChange = vi.fn();
  const fx = fixtureSample();
  const mistakes = fx.tagCategories.filter((c) => c.id === 'mistakes');
  const { repo } = renderApp(
    <Harness onChange={onChange} categories={mistakes} />,
    { sample },
  );
  const input = await box();
  await screen.findByRole('option', { name: 'fomo' });
  expect(screen.queryByRole('option', { name: 'breakout' })).toBeNull();
  fireEvent.change(input, { target: { value: 'chased' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const ws = (await repo.workspaces.getActive()).id;
  const made = (await repo.tags.list(ws)).find((t) => t.name === 'chased');
  expect(made?.categoryId).toBe('mistakes');
});

test('allowCreate off offers no create row', async () => {
  renderApp(<Harness onChange={vi.fn()} allowCreate={false} />, { sample });
  const input = await box();
  await screen.findAllByRole('option');
  fireEvent.change(input, { target: { value: 'zzz' } });
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByText('No tags match.')).toBeTruthy();
});
