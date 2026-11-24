// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { CATEGORIES } from '@/data/seed/templates';
import { SWATCHES, swatchName } from './colour-picker';
import { TagsSettings } from './tags';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const S = 'sample';
const URL = '/app/settings/tags';

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** Puts the Setups tag on all three trades; `f-3` is in an archived account, which is read-only, so it is opened for the write. */
async function tagEveryTrade(r: ReturnType<typeof repo>) {
  await r.accounts.update(S, 'acc-b', { status: 'active' });
  await r.trades.updateMany(S, ['f-1', 'f-2', 'f-3'], {
    tagIds: ['tag-setup'],
  });
  await r.accounts.update(S, 'acc-b', { status: 'archived' });
}

async function openMenu(label: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: label }), {
    key: 'Enter',
  });
}

function tab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

test('twelve swatches, each a valid #RRGGBB', () => {
  expect(SWATCHES).toHaveLength(12);
  for (const s of SWATCHES) expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
  expect(new Set(SWATCHES.map((s) => s.name)).size).toBe(12);
  expect(SWATCHES.map((s) => s.name)).toContain('Plum');
});

test('the palette leaves out the hues that have jobs: gain, loss, accent and cyan', () => {
  // theme.css fills and the accent, light and dark.
  const jobs = {
    gain: [0x19, 0xa6, 0x72],
    loss: [0xe5, 0x48, 0x4d],
    accent: [0x2b, 0x35, 0xaf],
    accentDark: [0x4c, 0x57, 0xdc],
    cyan: [0x16, 0x93, 0xbe],
  };
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const near = (a: number[], b: number[]) =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  for (const s of SWATCHES)
    for (const [job, c] of Object.entries(jobs))
      expect(near(rgb(s.hex), c), `${s.name} vs ${job}`).toBeGreaterThan(60);
  // Mistakes stays marigold.
  expect(SWATCHES.find((s) => s.name === 'Marigold')!.hex).toBe(
    CATEGORIES.mistakes.color,
  );
  // Every default category is one of the palette's colours.
  for (const c of Object.values(CATEGORIES))
    expect(SWATCHES.map((s) => s.hex)).toContain(c.color);
});

test('a colour is named by its swatch; the hex is the secondary hint', () => {
  expect(swatchName('#d97706')).toBe('Marigold');
  expect(swatchName('#123456')).toBe('Custom colour');
});

test('Categories lists each category with its tag count', async () => {
  renderApp(<TagsSettings />, { repository: repo(), url: URL });
  const table = await screen.findByRole('table', { name: 'Tag categories' });
  const row = within(table).getByRole('row', { name: /^Mistakes/ });
  expect(row.textContent).toContain('#D97706');
  const cells = within(row).getAllByRole('cell');
  // Name, colour, tags, menu.
  expect(cells[2]!.textContent).toBe('1');
});

test('Mistakes has no Delete; a user-made category has', async () => {
  renderApp(<TagsSettings />, { repository: repo(), url: URL });
  await openMenu('Actions for Mistakes');
  await screen.findByRole('menuitem', { name: 'Edit' });
  expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  await openMenu('Actions for Setups');
  expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeTruthy();
});

test('a built-in category can be renamed and recoloured', async () => {
  const r = repo();
  renderApp(<TagsSettings />, { repository: r, url: URL });
  await openMenu('Actions for Mistakes');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
  fireEvent.change(within(dialog).getByLabelText('Category name'), {
    target: { value: 'Errors' },
  });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Plum' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const plum = SWATCHES.find((s) => s.name === 'Plum')!.hex;
  await waitFor(async () =>
    expect(
      (await r.tagCategories.list(S)).find((c) => c.id === 'mistakes'),
    ).toMatchObject({
      name: 'Errors',
      color: plum,
      builtIn: true,
      role: 'mistake',
    }),
  );
});

test('creating the category Sessions in plum, then the tag London Open in it, stores london open', async () => {
  const r = repo();
  renderApp(<TagsSettings />, { repository: r, url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New category' }));
  const dialog = await screen.findByRole('dialog', { name: 'New category' });
  fireEvent.change(within(dialog).getByLabelText('Category name'), {
    target: { value: 'Sessions' },
  });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Plum' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const plum = SWATCHES.find((s) => s.name === 'Plum')!.hex;
  await waitFor(async () =>
    expect(
      (await r.tagCategories.list(S)).find((c) => c.name === 'Sessions')?.color,
    ).toBe(plum),
  );
  const sessions = (await r.tagCategories.list(S)).find(
    (c) => c.name === 'Sessions',
  )!;

  tab('Tags');
  fireEvent.click(await screen.findByRole('button', { name: 'New tag' }));
  const tagDialog = await screen.findByRole('dialog', { name: 'New tag' });
  fireEvent.change(within(tagDialog).getByLabelText('Tag name'), {
    target: { value: 'London Open' },
  });
  fireEvent.change(within(tagDialog).getByLabelText('Category'), {
    target: { value: sessions.id },
  });
  fireEvent.change(within(tagDialog).getByLabelText('Description'), {
    target: { value: 'First hour of London' },
  });
  fireEvent.click(within(tagDialog).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect(
      (await r.tags.list(S)).find((t) => t.categoryId === sessions.id),
    ).toMatchObject({
      name: 'london open',
      description: 'First hour of London',
    }),
  );
  expect(await screen.findByRole('row', { name: /^london open/ })).toBeTruthy();
});

test('the New tag dialog has an Add category shortcut that picks the new category', async () => {
  const r = repo();
  renderApp(<TagsSettings />, { repository: r, url: URL });
  tab('Tags');
  fireEvent.click(await screen.findByRole('button', { name: 'New tag' }));
  const tagDialog = await screen.findByRole('dialog', { name: 'New tag' });
  fireEvent.click(
    within(tagDialog).getByRole('button', { name: 'Add category' }),
  );
  const made = await screen.findByRole('dialog', { name: 'New category' });
  fireEvent.change(within(made).getByLabelText('Category name'), {
    target: { value: 'Sessions' },
  });
  fireEvent.click(within(made).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect(
      (await r.tagCategories.list(S)).some((c) => c.name === 'Sessions'),
    ).toBe(true),
  );
  const again = await screen.findByRole('dialog', { name: 'New tag' });
  await waitFor(() =>
    expect(
      (within(again).getByLabelText('Category') as HTMLSelectElement)
        .selectedOptions[0]!.textContent,
    ).toBe('Sessions'),
  );
});

test('a bad hex is refused, and a good one is stored upper case', async () => {
  const r = repo();
  renderApp(<TagsSettings />, { repository: r, url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New category' }));
  const dialog = await screen.findByRole('dialog', { name: 'New category' });
  fireEvent.change(within(dialog).getByLabelText('Category name'), {
    target: { value: 'Sessions' },
  });
  const hex = within(dialog).getByLabelText('Hex');
  fireEvent.change(hex, { target: { value: '#12G' } });
  const save = within(dialog).getByRole('button', {
    name: 'Save',
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(
    within(dialog).getByText('Use six digits, like #1693BE.'),
  ).toBeTruthy();
  // It is announced, and the field points to it.
  const alert = within(dialog).getByRole('alert');
  expect(alert.textContent).toBe('Use six digits, like #1693BE.');
  expect(hex.getAttribute('aria-describedby')).toBe(alert.id);
  fireEvent.change(hex, { target: { value: '#1a2b3c' } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(async () =>
    expect(
      (await r.tagCategories.list(S)).find((c) => c.name === 'Sessions')?.color,
    ).toBe('#1A2B3C'),
  );
});

test('deleting a tag used on 3 trades says so, and removes it', async () => {
  const r = repo();
  await tagEveryTrade(r);
  renderApp(<TagsSettings />, { repository: r, url: URL });
  tab('Tags');
  await openMenu('Actions for breakout');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Delete breakout?')).toBeTruthy();
  expect(within(dialog).getByText("It's removed from 3 trades.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete tag' }));
  await waitFor(async () =>
    expect((await r.tags.list(S)).map((t) => t.id)).toEqual(['tag-fomo']),
  );
  expect(
    (await r.trades.list(S)).filter((t) => t.tagIds.includes('tag-setup')),
  ).toEqual([]);
});

test("deleting a category counts its tags and the trades they're on", async () => {
  const r = repo();
  await r.tags.create(S, { name: 'Range', categoryId: 'setups' });
  await tagEveryTrade(r);
  renderApp(<TagsSettings />, { repository: r, url: URL });
  await openMenu('Actions for Setups');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText('Delete Setups and its 2 tags?'),
  ).toBeTruthy();
  expect(
    within(dialog).getByText("They're removed from 3 trades."),
  ).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete category' }),
  );
  await waitFor(async () =>
    expect((await r.tagCategories.list(S)).map((c) => c.id)).not.toContain(
      'setups',
    ),
  );
});

test('the Tags tab searches by name, category and description, and counts trades', async () => {
  const r = repo();
  await r.trades.updateMany(S, ['f-1'], { tagIds: ['tag-setup', 'tag-fomo'] });
  renderApp(<TagsSettings />, { repository: r, url: URL });
  tab('Tags');
  const table = await screen.findByRole('table', { name: 'Tags' });
  const fomo = within(table).getByRole('row', { name: /^fomo/ });
  const cells = within(fomo).getAllByRole('cell');
  // Name, category, description, trades, menu.
  expect(cells[1]!.textContent).toBe('Mistakes');
  expect(cells[2]!.textContent).toContain('Entered because');
  expect(cells[3]!.textContent).toBe('1');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), {
    target: { value: 'mistakes' },
  });
  await waitFor(() =>
    expect(within(table).queryByRole('row', { name: /^breakout/ })).toBeNull(),
  );
  expect(within(table).getByRole('row', { name: /^fomo/ })).toBeTruthy();
});

test('a failed trades read shows the failure, not a loader or a false empty state', async () => {
  const real = repo();
  const broken = {
    ...real,
    trades: {
      ...real.trades,
      list: async () => {
        throw new Error('no read');
      },
    },
  };
  const { container } = renderApp(<TagsSettings />, {
    repository: broken,
    url: '/app/settings/tags',
  });
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('alert').textContent).toContain(
    "couldn't read your tags",
  );
  expect(container.textContent).not.toContain('Loading');
});
