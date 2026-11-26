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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { FileRejected, SHOT_MAX_BYTES } from '@/data/repository';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { fakeIntersectionObserver } from '../__fixtures__/intersection';
import { renderApp } from '../__fixtures__/render-app';
import { TradeFiles } from './trade-files';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const WS = fixtureSample().trades[0]!.workspaceId;
const OWNER = 'trade:t-1';
const trade = makeTrade({ id: 't-1', workspaceId: WS, net: 8130 });

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:file-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
  // Every thumbnail counts as in sight, unless a test says otherwise.
  fakeIntersectionObserver({ auto: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PNG = new Uint8Array([137, 80, 78, 71]);

type Seed = { name: string; type: string; size?: number };

/** The card over a store that already holds `seed`, in that upload order. */
async function open(
  seed: Seed[] = [],
  readOnly = false,
  owner: string = OWNER,
) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  for (const s of seed)
    await repo.files.add(
      WS,
      owner,
      {
        bytes: (s.size ? new Uint8Array(s.size) : PNG).buffer as ArrayBuffer,
        type: s.type,
        name: s.name,
      },
      { images: false },
    );
  return renderApp(<TradeFiles trade={trade} readOnly={readOnly} />, {
    repository: repo,
  });
}

const card = () => screen.findByRole('region', { name: 'Attachments' });
const input = async () =>
  (await card()).querySelector('input[type="file"]') as HTMLInputElement;
const pick = async (...files: File[]) =>
  fireEvent.change(await input(), { target: { files } });
const file = (name: string, type: string, bytes: BlobPart = PNG) =>
  new File([bytes], name, { type });

test('with nothing attached there is a drop zone and a line about it', async () => {
  await open();
  const c = await card();
  expect(within(c).getByText('Drop files here')).toBeTruthy();
  expect(
    within(c).getByText('Images show as thumbnails. Up to 10 MB each.'),
  ).toBeTruthy();
  expect(within(c).getByRole('button', { name: 'Choose files' })).toBeTruthy();
  // No count while there is nothing to count.
  expect(c.textContent).not.toMatch(/\d files?/);
});

test('images show as thumbnails, other files as rows', async () => {
  await open([
    { name: 'EURUSD 15m entry.png', type: 'image/png' },
    { name: 'Statement 25 Nov.pdf', type: 'application/pdf', size: 412 * 1024 },
    { name: 'EURUSD 1h context.webp', type: 'image/webp' },
  ]);
  const c = await card();
  const thumbs = await within(c).findAllByRole('button', {
    name: /^Open image, /,
  });
  expect(thumbs.map((t) => t.getAttribute('aria-label'))).toEqual([
    'Open image, EURUSD 15m entry.png',
    'Open image, EURUSD 1h context.webp',
  ]);
  // Each picture arrives once its own bytes are read.
  for (const t of thumbs)
    await waitFor(() => expect(t.querySelector('img')).not.toBeNull());
  // The PDF is a named row with its size and an Open action, and no picture.
  const row = within(c).getByText('Statement 25 Nov.pdf').closest('li')!;
  expect(row.textContent).toContain('412 KB');
  expect(
    within(row).getByRole('button', { name: 'Open Statement 25 Nov.pdf' }),
  ).toBeTruthy();
  expect(row.querySelector('img')).toBeNull();
  expect(within(c).queryByText('EURUSD 15m entry.png')).toBeNull();
  expect(c.textContent).toContain('3 files');
});

test('a single file reads "1 file"', async () => {
  await open([{ name: 'a.pdf', type: 'application/pdf' }]);
  await screen.findByText('a.pdf');
  expect((await card()).textContent).toContain('1 file');
});

test('any type is taken, in the order it was added, with no count cap', async () => {
  const view = await open();
  const names = Array.from({ length: 14 }, (_, i) => `report-${i + 1}.xlsx`);
  await pick(...names.map((n) => file(n, 'application/octet-stream')));
  await waitFor(async () =>
    expect(await view.repo.files.list(WS, OWNER)).toHaveLength(14),
  );
  expect((await view.repo.files.list(WS, OWNER)).map((f) => f.name)).toEqual(
    names,
  );
  const rows = within(await card()).getAllByRole('listitem');
  expect(rows).toHaveLength(14);
  expect(rows[0]!.textContent).toContain('report-1.xlsx');
  expect(rows[13]!.textContent).toContain('report-14.xlsx');
  // Nothing in the picker narrows the type.
  expect((await input()).getAttribute('accept')).toBeNull();
  expect((await input()).multiple).toBe(true);
});

test('a dropped file is kept', async () => {
  const view = await open();
  const zone = (await card()).querySelector('[data-dropzone]')!;
  fireEvent.drop(zone, {
    dataTransfer: { files: [file('notes.txt', 'text/plain')] },
  });
  await waitFor(async () =>
    expect(await view.repo.files.list(WS, OWNER)).toHaveLength(1),
  );
  expect(await screen.findByText('notes.txt')).toBeTruthy();
});

test('a refused file says why', async () => {
  const view = await open();
  await pick(
    file(
      'huge.bin',
      'application/octet-stream',
      new Uint8Array(SHOT_MAX_BYTES + 1),
    ),
  );
  expect(await screen.findByText('huge.bin is over 10 MB.')).toBeTruthy();
  expect(await view.repo.files.list(WS, OWNER)).toHaveLength(0);
  // The refusal is announced.
  expect(screen.getByRole('alert').textContent).toContain('huge.bin');
});

test('the store refusing for size says the same, and a full store says "Couldn\'t save"', async () => {
  const view = await open();
  const add = vi.spyOn(view.repo.files, 'add');
  add.mockRejectedValueOnce(new FileRejected('size'));
  await pick(file('big.pdf', 'application/pdf'));
  expect(await screen.findByText('big.pdf is over 10 MB.')).toBeTruthy();

  add.mockRejectedValueOnce(new FileRejected('quota'));
  await pick(file('shot.png', 'image/png'));
  const alert = await screen.findByText(/Couldn.t save shot\.png/);
  expect(alert.textContent).toMatch(/no room|full/i);
  // The earlier line is replaced, not piled up.
  expect(screen.queryByText('big.pdf is over 10 MB.')).toBeNull();

  add.mockRejectedValueOnce(new Error('disk'));
  await pick(file('x.csv', 'text/csv'));
  expect(await screen.findByText(/Couldn.t save x\.csv/)).toBeTruthy();
});

test('one refused file does not stop the others', async () => {
  const view = await open();
  await pick(
    file(
      'huge.bin',
      'application/octet-stream',
      new Uint8Array(SHOT_MAX_BYTES + 1),
    ),
    file('ok.pdf', 'application/pdf'),
  );
  expect(await screen.findByText('huge.bin is over 10 MB.')).toBeTruthy();
  await waitFor(async () =>
    expect((await view.repo.files.list(WS, OWNER)).map((f) => f.name)).toEqual([
      'ok.pdf',
    ]),
  );
});

test('a thumbnail opens the viewer on that image, which steps through the images only', async () => {
  await open([
    { name: 'one.png', type: 'image/png' },
    { name: 'doc.pdf', type: 'application/pdf' },
    { name: 'two.gif', type: 'image/gif' },
  ]);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open image, two.gif' }),
  );
  const viewer = await screen.findByRole('dialog', { name: 'Image 2 of 2' });
  // The picture arrives once its bytes are read.
  expect(
    await within(viewer).findByRole('img', { name: 'two.gif' }),
  ).toBeTruthy();
  fireEvent.click(within(viewer).getByRole('button', { name: 'Previous' }));
  const first = await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  expect(
    await within(first).findByRole('img', { name: 'one.png' }),
  ).toBeTruthy();
});

test('delete asks first: an image from the viewer, a file from its row', async () => {
  const view = await open([
    { name: 'one.png', type: 'image/png' },
    { name: 'two.png', type: 'image/png' },
    { name: 'doc.pdf', type: 'application/pdf' },
  ]);
  const left = async () =>
    (await view.repo.files.list(WS, OWNER)).map((f) => f.name);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Open image, one.png' }),
  );
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  fireEvent.click(within(viewer).getByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  expect(await left()).toHaveLength(3);
  // Cancel keeps it.
  fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Delete this image?' }),
    ).toBeNull(),
  );
  expect(await left()).toHaveLength(3);
  fireEvent.click(within(viewer).getByRole('button', { name: 'Delete' }));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this image?' }),
    ).getByRole('button', { name: 'Delete image' }),
  );
  await waitFor(async () =>
    expect(await left()).toEqual(['two.png', 'doc.pdf']),
  );
  // The viewer lands on the image that is left.
  expect(
    await screen.findByRole('dialog', { name: 'Image 1 of 1' }),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Image 1 of 1' }), {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // A file that is not an image is deleted from its row, and asked about too.
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete doc.pdf' }),
  );
  const askFile = await screen.findByRole('dialog', {
    name: 'Delete this file?',
  });
  expect(await left()).toHaveLength(2);
  fireEvent.click(within(askFile).getByRole('button', { name: 'Delete file' }));
  await waitFor(async () => expect(await left()).toEqual(['two.png']));
});

test('deleting the last image closes the viewer', async () => {
  const view = await open([{ name: 'only.png', type: 'image/png' }]);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open image, only.png' }),
  );
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 1' });
  fireEvent.click(within(viewer).getByRole('button', { name: 'Delete' }));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this image?' }),
    ).getByRole('button', { name: 'Delete image' }),
  );
  await waitFor(async () =>
    expect(await view.repo.files.list(WS, OWNER)).toHaveLength(0),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a failed delete says so and keeps the file', async () => {
  const view = await open([{ name: 'doc.pdf', type: 'application/pdf' }]);
  vi.spyOn(view.repo.files, 'remove').mockRejectedValue(new Error('disk'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete doc.pdf' }),
  );
  const ask = await screen.findByRole('dialog', { name: 'Delete this file?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete file' }));
  expect((await within(ask).findByRole('alert')).textContent).toContain(
    "Couldn't save",
  );
  expect(await view.repo.files.list(WS, OWNER)).toHaveLength(1);
});

test('Open on a PDF opens it in a tab; any other file is downloaded, never opened in the app', async () => {
  await open([
    { name: 'Statement.pdf', type: 'application/pdf' },
    { name: 'page.html', type: 'text/html' },
  ]);
  const opened = vi.spyOn(window, 'open').mockReturnValue(null);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  const pdf = (await screen.findByText('Statement.pdf')).closest('li')!;
  fireEvent.click(
    within(pdf).getByRole('button', { name: 'Open Statement.pdf' }),
  );
  // The file's bytes are read when it is opened, not before.
  await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
  expect(opened.mock.calls[0]![0]).toMatch(/^blob:/);
  expect(opened.mock.calls[0]![2]).toContain('noopener');

  const html = (await screen.findByText('page.html')).closest('li')!;
  fireEvent.click(within(html).getByRole('button', { name: 'Open page.html' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(opened).toHaveBeenCalledTimes(1);
});

test('there are no captions: nothing to type into on the card or in the viewer', async () => {
  await open([{ name: 'one.png', type: 'image/png' }]);
  const c = await card();
  expect(within(c).queryByRole('textbox')).toBeNull();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open image, one.png' }),
  );
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 1' });
  expect(within(viewer).queryByRole('textbox')).toBeNull();
});

test('an archived account sees its files and can open them, but cannot add or delete', async () => {
  await open(
    [
      { name: 'one.png', type: 'image/png' },
      { name: 'doc.pdf', type: 'application/pdf' },
    ],
    true,
  );
  const c = await card();
  await screen.findByText('doc.pdf');
  expect(within(c).queryByText('Drop files here')).toBeNull();
  expect(within(c).queryByRole('button', { name: 'Choose files' })).toBeNull();
  expect(c.querySelector('input[type="file"]')).toBeNull();
  expect(within(c).queryByRole('button', { name: /^Delete/ })).toBeNull();
  expect(within(c).getByRole('button', { name: 'Open doc.pdf' })).toBeTruthy();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open image, one.png' }),
  );
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 1' });
  expect(within(viewer).queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('an archived account with nothing attached says so', async () => {
  await open([], true);
  expect((await card()).textContent).toContain('No attachments.');
});

test('thumbnails revoke their object URLs on unmount', async () => {
  await open([
    { name: 'one.png', type: 'image/png' },
    { name: 'two.png', type: 'image/png' },
  ]);
  await screen.findByRole('button', { name: 'Open image, two.png' });
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
  const urls = vi
    .mocked(URL.createObjectURL)
    .mock.results.map((r) => r.value as string);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  cleanup();
  for (const url of urls) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test('thumbnails load lazily', async () => {
  await open([{ name: 'one.png', type: 'image/png' }]);
  const thumb = await screen.findByRole('button', {
    name: 'Open image, one.png',
  });
  await waitFor(() => expect(thumb.querySelector('img')).not.toBeNull());
  expect(thumb.querySelector('img')!.getAttribute('loading')).toBe('lazy');
});

test('thumbnails read their bytes only when they are near the viewport', async () => {
  const io = fakeIntersectionObserver();
  const view = await open([
    { name: 'one.png', type: 'image/png' },
    { name: 'two.png', type: 'image/png' },
    { name: 'three.png', type: 'image/png' },
  ]);
  const get = vi.spyOn(view.repo.files, 'get');
  const one = await screen.findByRole('button', {
    name: 'Open image, one.png',
  });
  await screen.findByRole('button', { name: 'Open image, three.png' });
  // Listed, but none near the screen: no bytes read, no URL made.
  expect(get).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(one.querySelector('img')).toBeNull();
  io.reveal(one);
  await waitFor(() => expect(one.querySelector('img')).not.toBeNull());
  expect(get).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

test('an upload does not read the images already showing again', async () => {
  const view = await open([
    { name: 'one.png', type: 'image/png' },
    { name: 'two.png', type: 'image/png' },
  ]);
  const get = vi.spyOn(view.repo.files, 'get');
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  await pick(file('three.png', 'image/png'));
  await screen.findByRole('button', { name: 'Open image, three.png' });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  // Only the new image was read; the two before it kept their URLs.
  expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

test("another trade's files stay out of this card", async () => {
  const view = await open([{ name: 'mine.pdf', type: 'application/pdf' }]);
  await view.repo.files.add(
    WS,
    'trade:other',
    {
      bytes: PNG.buffer as ArrayBuffer,
      type: 'application/pdf',
      name: 'theirs.pdf',
    },
    { images: false },
  );
  await screen.findByText('mine.pdf');
  expect((await card()).textContent).not.toContain('theirs.pdf');
});
