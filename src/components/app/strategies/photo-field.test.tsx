// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { templateById } from '@/content/strategy-templates';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { FileRejected, SHOT_MAX_BYTES } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView } from './strategies-view';
import { StrategyForm } from './strategy-form';
import { StrategyView } from './strategy-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const WS = SAMPLE_WORKSPACE.id;
const PNG = new Uint8Array([137, 80, 78, 71]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"/>';

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:photo-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
  fakeIntersectionObserver({ auto: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const file = (name: string, type: string, bytes: BlobPart = PNG) =>
  new File([bytes], name, { type });

/** A workspace in which `str-1` may already have a photo of this type. */
async function store(photo?: { name: string; type: string; bytes?: BlobPart }) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  let photoId: string | undefined;
  if (photo) {
    const bytes =
      typeof photo.bytes === 'string'
        ? new TextEncoder().encode(photo.bytes).buffer
        : PNG.buffer;
    const stored = await repo.files.add(
      WS,
      'strategy:str-1',
      { bytes: bytes as ArrayBuffer, type: photo.type, name: photo.name },
      // The template's own SVG cover is stored without the image-type check.
      { images: photo.type !== 'image/svg+xml' },
    );
    photoId = stored.id;
    await repo.strategies.update(WS, 'str-1', { photoId });
  }
  return { repo, photoId };
}

const band = () => screen.findByRole('img', { name: /photo$/ });
const here = () => window.location.pathname + window.location.search;
/** A strategy's own page, not the create form's. */
const CREATED = /^\/app\/strategies\/(?!new$)[^/?]+$/;

async function editForm(photo?: Parameters<typeof store>[0]) {
  const { repo, photoId } = await store(photo);
  const out = renderApp(<StrategyForm strategyId="str-1" />, {
    repository: repo,
    url: '/app/strategies/str-1/edit',
  });
  await screen.findByRole('heading', { name: 'Edit Opening range breakout' });
  return { ...out, repo, photoId };
}

async function createForm(url = '/app/strategies/new') {
  const { repo } = await store();
  const out = renderApp(<StrategyForm />, { repository: repo, url });
  await screen.findByRole('heading', { name: 'New strategy' });
  return { ...out, repo };
}

const photoInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"]')!;
const choose = (...files: File[]) =>
  fireEvent.change(photoInput(), { target: { files } });
const field = () => screen.getByRole('group', { name: 'Photo' });

test('the photo shows as a band and can be removed', async () => {
  const { repo, photoId } = await editForm({
    name: 'level-reversal.png',
    type: 'image/png',
  });
  // The field shows the photo, its name and size, with Replace and Remove.
  expect(await within(field()).findByText('level-reversal.png')).toBeTruthy();
  expect(within(field()).getByText('4 B')).toBeTruthy();
  expect(
    within(field()).getByRole('button', { name: 'Replace photo' }),
  ).toBeTruthy();
  expect(
    within(field()).getByText(
      "PNG, JPEG or WebP, up to 10 MB. It shows as a band on the strategy's card and page.",
    ),
  ).toBeTruthy();

  fireEvent.click(
    within(field()).getByRole('button', { name: 'Remove photo' }),
  );
  // Nothing is written until the form is saved.
  expect(await repo.files.get(WS, photoId!)).toBeDefined();
  expect(
    within(field()).getByRole('button', { name: 'Add a photo' }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Save strategy' }));
  await waitFor(async () =>
    expect((await repo.strategies.get(WS, 'str-1'))!.photoId).toBeUndefined(),
  );
  // The removed photo's file is deleted too.
  expect(await repo.files.get(WS, photoId!)).toBeUndefined();
  expect(await repo.files.list(WS, 'strategy:str-1')).toEqual([]);
  await waitFor(() => expect(here()).toBe('/app/strategies/str-1'));
});

test('the band is the strategy page header and the card, and a strategy with no photo has none', async () => {
  const { repo } = await store({ name: 'p.png', type: 'image/png' });
  renderApp(<StrategyView id="str-1" />, {
    repository: repo,
    url: '/app/strategies/str-1',
  });
  const page = await band();
  expect(page.getAttribute('aria-label')).toBe(
    "Opening range breakout's photo",
  );
  await waitFor(() =>
    expect(page.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/),
  );
  // The strategy's own icon stays beside its name.
  expect(
    screen
      .getByRole('heading', { name: /Opening range breakout/ })
      .querySelector('svg'),
  ).toBeTruthy();
  cleanup();

  renderApp(<StrategiesView />, { repository: repo, url: '/app/strategies' });
  const card = (
    await screen.findByRole('heading', { name: 'Opening range breakout' })
  ).closest('article')!;
  const onCard = await within(card).findByRole('img', {
    name: "Opening range breakout's photo",
  });
  await waitFor(() =>
    expect(onCard.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/),
  );
  cleanup();

  // Without a photo: no band on the page or the card.
  const { repo: bare } = await store();
  renderApp(<StrategyView id="str-1" />, {
    repository: bare,
    url: '/app/strategies/str-1',
  });
  await screen.findByRole('region', { name: 'Stats' });
  expect(screen.queryByRole('img', { name: /photo$/ })).toBeNull();
});

test('a photo upload refuses SVG and GIF but an SVG cover shows', async () => {
  const { repo } = await createForm();
  const none = () =>
    within(field()).getByRole('button', { name: 'Add a photo' });
  expect(none()).toBeTruthy();

  // An SVG or a GIF is refused, with the reason, and the field stays as it was.
  choose(file('logo.svg', 'image/svg+xml', SVG));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    "logo.svg isn't a PNG, JPEG or WebP image.",
  );
  expect(none()).toBeTruthy();
  choose(file('loop.gif', 'image/gif'));
  expect((await screen.findByRole('alert')).textContent).toBe(
    "loop.gif isn't a PNG, JPEG or WebP image.",
  );
  expect(none()).toBeTruthy();
  // A file whose type the browser cannot tell is not an image either.
  choose(file('mystery', ''));
  expect((await screen.findByRole('alert')).textContent).toBe(
    "mystery isn't a PNG, JPEG or WebP image.",
  );
  // Over 10 MB.
  choose(file('big.png', 'image/png', new Uint8Array(SHOT_MAX_BYTES + 1)));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'big.png is over 10 MB.',
  );
  expect(none()).toBeTruthy();
  // Nothing was stored by any of that.
  expect(await repo.files.list(WS, 'strategy:str-1')).toEqual([]);

  // A PNG, a JPEG and a WebP are taken, and a good file clears the refusal.
  for (const [name, type] of [
    ['a.png', 'image/png'],
    ['b.jpg', 'image/jpeg'],
    ['c.webp', 'image/webp'],
  ] as const) {
    choose(file(name, type));
    expect(await within(field()).findByText(name)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  }
  cleanup();

  // A stored SVG cover (a template's own drawing) shows, as a band and in the field.
  const svg = await store({
    name: 'london-range-break.svg',
    type: 'image/svg+xml',
    bytes: SVG,
  });
  renderApp(<StrategyView id="str-1" />, {
    repository: svg.repo,
    url: '/app/strategies/str-1',
  });
  const cover = await band();
  await waitFor(() =>
    expect(cover.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/),
  );
  cleanup();
  renderApp(<StrategyForm strategyId="str-1" />, {
    repository: svg.repo,
    url: '/app/strategies/str-1/edit',
  });
  await screen.findByRole('heading', { name: 'Edit Opening range breakout' });
  expect(
    await within(field()).findByText('london-range-break.svg'),
  ).toBeTruthy();
  expect(
    within(field()).getByRole('button', { name: 'Replace photo' }),
  ).toBeTruthy();
  // It can be replaced by a PNG, but not by another SVG.
  choose(file('mine.svg', 'image/svg+xml', SVG));
  expect((await screen.findByRole('alert')).textContent).toBe(
    "mine.svg isn't a PNG, JPEG or WebP image.",
  );
  expect(within(field()).getByText('london-range-break.svg')).toBeTruthy();
  choose(file('mine.png', 'image/png'));
  await within(field()).findByText('mine.png');
  fireEvent.click(screen.getByRole('button', { name: 'Save strategy' }));
  await waitFor(async () =>
    expect(
      (await svg.repo.files.list(WS, 'strategy:str-1')).map((f) => f.name),
    ).toEqual(['mine.png']),
  );
});

test('creating with a chosen photo stores it as the strategy’s own and shows it', async () => {
  const { repo } = await createForm();
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Fresh idea' },
  });
  choose(file('chart.png', 'image/png'));
  await within(field()).findByText('chart.png');
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  await waitFor(() => expect(here()).toMatch(CREATED));
  const made = (await repo.strategies.list(WS)).find(
    (s) => s.name === 'Fresh idea',
  )!;
  expect(made.photoId).toBeDefined();
  const files = await repo.files.list(WS, `strategy:${made.id}`);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatchObject({
    id: made.photoId,
    name: 'chart.png',
    type: 'image/png',
    size: 4,
  });
});

test('replacing a photo keeps the new one and deletes the old file', async () => {
  const { repo, photoId } = await editForm({
    name: 'old.png',
    type: 'image/png',
  });
  await within(field()).findByText('old.png');
  choose(file('new.webp', 'image/webp'));
  expect(await within(field()).findByText('new.webp')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save strategy' }));
  await waitFor(async () =>
    expect((await repo.strategies.get(WS, 'str-1'))!.photoId).not.toBe(photoId),
  );
  const kept = await repo.files.list(WS, 'strategy:str-1');
  expect(kept.map((f) => f.name)).toEqual(['new.webp']);
  expect((await repo.strategies.get(WS, 'str-1'))!.photoId).toBe(kept[0]!.id);
});

test('leaving the form without saving changes nothing', async () => {
  const { repo, photoId } = await editForm({
    name: 'keep.png',
    type: 'image/png',
  });
  await within(field()).findByText('keep.png');
  fireEvent.click(
    within(field()).getByRole('button', { name: 'Remove photo' }),
  );
  choose(file('other.png', 'image/png'));
  await within(field()).findByText('other.png');
  expect(await repo.files.list(WS, 'strategy:str-1')).toHaveLength(1);
  expect((await repo.strategies.get(WS, 'str-1'))!.photoId).toBe(photoId);
});

test('a form filled from a template shows its cover as the photo, which can be replaced or removed before creating', async () => {
  const london = templateById('london-range-break')!;
  const { repo } = await createForm(
    `/app/strategies/new?template=${london.id}`,
  );
  // The cover is the chosen photo (an SVG here: happy-dom cannot draw one to a PNG).
  expect(
    await within(field()).findByText(/^london-range-break\./),
  ).toBeTruthy();
  fireEvent.click(
    within(field()).getByRole('button', { name: 'Remove photo' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  await waitFor(() => expect(here()).toMatch(CREATED));
  const made = (await repo.strategies.list(WS)).find(
    (s) => s.templateId === london.id,
  )!;
  // Removed before creating: it keeps the link to the template and has no photo.
  expect(made.photoId).toBeUndefined();
  expect(await repo.files.list(WS, `strategy:${made.id}`)).toEqual([]);
});

test('a new strategy whose photo cannot be kept is not made, says so, and saving again makes one', async () => {
  const { repo } = await createForm();
  // The strategy and its photo are one write: a full store refuses both.
  const create = vi
    .spyOn(repo.strategies, 'create')
    .mockRejectedValueOnce(new FileRejected('quota'));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Half saved' },
  });
  choose(file('chart.png', 'image/png'));
  await within(field()).findByText('chart.png');
  fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  expect(
    await screen.findByText(
      'The photo could not be saved: this browser has no room left, so nothing was saved. Try again.',
    ),
  ).toBeTruthy();
  expect(here()).toBe('/app/strategies/new');
  expect(
    (await repo.strategies.list(WS)).filter((s) => s.name === 'Half saved'),
  ).toHaveLength(0);

  // Again: one strategy, with the photo, logged once as created.
  create.mockRestore();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create strategy' }));
  });
  await waitFor(() => expect(here()).toMatch(CREATED));
  const made = (await repo.strategies.list(WS)).filter(
    (s) => s.name === 'Half saved',
  );
  expect(made).toHaveLength(1);
  expect(made[0]!.photoId).toBeDefined();
  expect(
    (await repo.files.list(WS, `strategy:${made[0]!.id}`)).map((f) => f.id),
  ).toEqual([made[0]!.photoId]);
  expect(
    (await repo.history.list(WS))
      .filter((r) => r.entityId === made[0]!.id)
      .map((r) => r.action),
  ).toEqual(['created']);
});

test('saving before the photo has loaded leaves it alone', async () => {
  const { repo, photoId } = await store({
    name: 'keep.png',
    type: 'image/png',
  });
  // Its details arrive late: the field is still loading when Save is pressed.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const list = repo.files.list.bind(repo.files);
  vi.spyOn(repo.files, 'list').mockImplementation(async (...args) => {
    await gate;
    return list(...args);
  });
  renderApp(<StrategyForm strategyId="str-1" />, {
    repository: repo,
    url: '/app/strategies/str-1/edit',
  });
  await screen.findByRole('heading', { name: 'Edit Opening range breakout' });
  fireEvent.click(screen.getByRole('button', { name: 'Save strategy' }));
  await waitFor(async () =>
    expect((await repo.strategies.get(WS, 'str-1'))!.name).toBe(
      'Opening range breakout',
    ),
  );
  release();
  await waitFor(() => expect(here()).toBe('/app/strategies/str-1'));
  expect((await repo.strategies.get(WS, 'str-1'))!.photoId).toBe(photoId);
  expect(await repo.files.get(WS, photoId!)).toBeDefined();
});
