// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { StoredFile } from '@/domain/types';
import { FileViewer } from './file-viewer';

MotionGlobalConfig.skipAnimations = true;

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:viewer-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const stored = (n: number): StoredFile => ({
  id: `f-${n}`,
  workspaceId: 'ws',
  owner: 'trade:t-1',
  bytes: new Uint8Array([n]).buffer as ArrayBuffer,
  type: 'image/png',
  name: `shot-${n}.png`,
  size: 1,
  createdAt: `2026-11-20T10:0${n}:00.000Z`,
});

function Harness({
  files,
  start = 0,
  onDelete,
  deleteBody,
}: {
  files: StoredFile[];
  start?: number | null;
  onDelete?: (file: StoredFile) => Promise<void>;
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
  render(<Harness files={[stored(1), stored(2), stored(3)]} start={1} />);
  const viewer = await screen.findByRole('dialog', { name: 'Image 2 of 3' });
  expect(within(viewer).getByRole('img', { name: 'shot-2.png' })).toBeTruthy();
  expect(viewer.textContent).toContain('shot-2.png');
});

test('Previous and Next step through, and stop at the ends', async () => {
  render(<Harness files={[stored(1), stored(2)]} />);
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
  render(<Harness files={[stored(1), stored(2)]} />);
  const viewer = await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  fireEvent.keyDown(viewer, { key: 'ArrowRight' });
  await screen.findByRole('dialog', { name: 'Image 2 of 2' });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
  await screen.findByRole('dialog', { name: 'Image 1 of 2' });
});

test('without onDelete there is no Delete', async () => {
  render(<Harness files={[stored(1)]} />);
  await screen.findByRole('dialog');
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('Delete asks first, in words the caller can set, and calls onDelete only on confirm', async () => {
  const onDelete = vi.fn(async () => {});
  render(
    <Harness
      files={[stored(1), stored(2)]}
      onDelete={onDelete}
      deleteBody="It is removed from this note."
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  expect(ask.textContent).toContain('It is removed from this note.');
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(stored(1)));
});

test('a rejected delete says so in the confirmation and leaves the viewer open', async () => {
  render(
    <Harness
      files={[stored(1)]}
      onDelete={async () => {
        throw new Error('disk');
      }}
    />,
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
  render(<Harness files={[stored(1)]} onDelete={async () => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Escape closes it and focus returns to the opener', async () => {
  render(<Harness files={[stored(1)]} />);
  const viewer = await screen.findByRole('dialog');
  fireEvent.keyDown(viewer, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'opener' }),
  );
});

test('the object URL is made when the image shows and revoked when it goes', async () => {
  render(<Harness files={[stored(1), stored(2)]} />);
  await screen.findByRole('img', { name: 'shot-1.png' });
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('img', { name: 'shot-2.png' });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:viewer-1');
  cleanup();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:viewer-2');
});

test('closed, it draws nothing and makes no URL', () => {
  render(<Harness files={[stored(1)]} start={null} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
