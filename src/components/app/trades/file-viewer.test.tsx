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
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { StoredFileMeta } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { FileViewer } from './file-viewer';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const WS = fixtureSample().trades[0]!.workspaceId;

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:viewer-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

/** A store that holds `n` images (shot-1.png ...), and the metadata the viewer is given for them. */
async function seeded(n: number) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  for (let i = 1; i <= n; i += 1)
    await repo.files.add(
      WS,
      'trade:t-1',
      {
        bytes: new Uint8Array([i]).buffer as ArrayBuffer,
        type: 'image/png',
        name: `shot-${i}.png`,
      },
      { images: true },
    );
  return { repo, files: await repo.files.list(WS, 'trade:t-1') };
}

function Harness({
  files,
  start = 0,
  onDelete,
  deleteBody,
}: {
  files: StoredFileMeta[];
  start?: number | null;
  onDelete?: (file: StoredFileMeta) => Promise<void>;
  deleteBody?: string;
}) {
  const [index, setIndex] = useState<number | null>(start);
  const origin = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={origin}>opener</button>
      <FileViewer
        files={files}
        index={index}
        origin={origin}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
        onDelete={onDelete}
        deleteBody={deleteBody}
      />
    </>
  );
}

test('shows the file at its index, named by its place, with the file name under the title', async () => {
  const { repo, files } = await seeded(3);
  renderApp(<Harness files={files} start={1} />, { repository: repo });
  const viewer = await screen.findByRole('dialog', { name: 'Image 2 of 3' });
  // The picture arrives once its bytes are read.
  expect(
    await within(viewer).findByRole('img', { name: 'shot-2.png' }),
  ).toBeTruthy();
  expect(viewer.textContent).toContain('shot-2.png');
});

test('Previous and Next step through, and stop at the ends', async () => {
  const { repo, files } = await seeded(2);
  renderApp(<Harness files={files} />, { repository: repo });
  await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  const prev = () =>
    screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement;
  const next = () =>
    screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
  expect(prev().disabled).toBe(true);
  fireEvent.click(next());
  await screen.findByRole('dialog', { name: 'Image 2 of 2' });
  expect(next().disabled).toBe(true);
  fireEvent.click(prev());
  await screen.findByRole('dialog', { name: 'Image 1 of 2' });
});

test('the arrow keys step too', async () => {
  const { repo, files } = await seeded(2);
  renderApp(<Harness files={files} />, { repository: repo });
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  fireEvent.keyDown(viewer, { key: 'ArrowRight' });
  await screen.findByRole('dialog', { name: 'Image 2 of 2' });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
  await screen.findByRole('dialog', { name: 'Image 1 of 2' });
});

test('without onDelete there is no Delete', async () => {
  const { repo, files } = await seeded(1);
  renderApp(<Harness files={files} />, { repository: repo });
  await screen.findByRole('dialog');
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('Delete asks first, in words the caller can set, and calls onDelete only on confirm', async () => {
  const onDelete = vi.fn(async () => {});
  const { repo, files } = await seeded(2);
  renderApp(
    <Harness
      files={files}
      onDelete={onDelete}
      deleteBody="It is removed from this note."
    />,
    { repository: repo },
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  expect(ask.textContent).toContain('It is removed from this note.');
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(files[0]));
});

test('a rejected delete says so in the confirmation and leaves the viewer open', async () => {
  const { repo, files } = await seeded(1);
  renderApp(
    <Harness
      files={files}
      onDelete={async () => {
        throw new Error('disk');
      }}
    />,
    { repository: repo },
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  expect((await within(ask).findByRole('alert')).textContent).toContain(
    "Couldn't save",
  );
  // The confirmation is on top, so the viewer sits behind it, still open.
  expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
  expect(document.body.textContent).toContain('Image 1 of 1');
});

test('deleting the only image closes the viewer', async () => {
  const { repo, files } = await seeded(1);
  renderApp(<Harness files={files} onDelete={async () => {}} />, {
    repository: repo,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Escape closes it and focus returns to the opener', async () => {
  const { repo, files } = await seeded(1);
  renderApp(<Harness files={files} />, { repository: repo });
  const viewer = await screen.findByRole('dialog');
  fireEvent.keyDown(viewer, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'opener' }),
  );
});

test('the object URL is made when the image shows and revoked when it goes', async () => {
  const { repo, files } = await seeded(2);
  const get = vi.spyOn(repo.files, 'get');
  renderApp(<Harness files={files} />, { repository: repo });
  await screen.findByRole('img', { name: 'shot-1.png' });
  // Only the image on show is read, not its neighbours.
  expect(get).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('img', { name: 'shot-2.png' });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:viewer-1');
  cleanup();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:viewer-2');
});

test('closed, it draws nothing, reads nothing and makes no URL', async () => {
  const { repo, files } = await seeded(1);
  const get = vi.spyOn(repo.files, 'get');
  renderApp(<Harness files={files} start={null} />, { repository: repo });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});

test('an image that is no longer stored says so, and nothing breaks', async () => {
  const { repo, files } = await seeded(1);
  const gone: StoredFileMeta = { ...files[0]!, id: 'gone', name: 'old.png' };
  renderApp(<Harness files={[gone]} />, { repository: repo });
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 1' });
  expect((await within(viewer).findByText('Image not found')).textContent).toBe(
    'Image not found',
  );
  expect(within(viewer).queryByRole('img')).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
