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
import type { ViewerFile } from './file-viewer';
import { FileViewer } from './file-viewer';

// Everything but the dialog's own exit (below) skips its animation.
MotionGlobalConfig.skipAnimations = true;

// The dialog's exit never ends here, as when a slow device or a stalled clock
// stretches the 160 ms fade: what the dialog says while it is still on screen
// is what the reader sees.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    animate: () => Object.assign(new Promise<void>(() => {}), { stop() {} }),
  };
});

// The viewer reads the image it shows through the data layer; a stub is enough.
vi.mock('../use-file-url', () => ({
  useFileUrl: (id: string | undefined) => ({
    url: id === undefined ? undefined : `blob:${id}`,
    status: id === undefined ? 'idle' : 'ready',
  }),
}));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const image = (n: number): ViewerFile => ({
  id: `f-${n}`,
  name: `shot-${n}.png`,
});

function Harness({ start }: { start: ViewerFile[] }) {
  const [files, setFiles] = useState(start);
  const [index, setIndex] = useState<number | null>(0);
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
        onDelete={async (file) => {
          setFiles((all) => all.filter((f) => f.id !== file.id));
        }}
      />
    </>
  );
}

async function deleteShown() {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = await screen.findByRole('dialog', { name: 'Delete this image?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete image' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Delete this image?' }),
    ).toBeNull(),
  );
}

test('deleting the last image does not make the dialog say "Image 1 of 0" while it fades out', async () => {
  render(<Harness start={[image(1)]} />);
  await screen.findByRole('dialog', { name: 'Image 1 of 1' });
  await deleteShown();
  // The list is empty and the exit is still playing: the dialog is on screen
  // and keeps naming the image it last showed.
  expect(screen.queryByRole('dialog', { name: 'Image 1 of 0' })).toBeNull();
  const viewer = screen.getByRole('dialog', { name: 'Image 1 of 1' });
  expect(viewer.textContent).toContain('shot-1.png');
});

test('deleting one of several keeps counting what is left', async () => {
  render(<Harness start={[image(1), image(2), image(3)]} />);
  await screen.findByRole('dialog', { name: 'Image 1 of 3' });
  await deleteShown();
  await screen.findByRole('dialog', { name: 'Image 1 of 2' });
  expect(screen.getByRole('dialog').textContent).toContain('shot-2.png');
});
