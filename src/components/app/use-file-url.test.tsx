// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from './__fixtures__/render-app';
import { fakeIntersectionObserver } from './__fixtures__/intersection';
import { useLazyFileUrl } from './use-file-url';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

const WS = fixtureSample().trades[0]!.workspaceId;

let made = 0;
beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:probe-${(made += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Probe({ id }: { id: string | undefined }) {
  const { ref, url, status } = useLazyFileUrl<HTMLDivElement>(id);
  return (
    <div ref={ref} data-testid="probe" data-status={status}>
      {url ?? 'no url'}
    </div>
  );
}

async function setup() {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const stored = await repo.files.add(
    WS,
    'note:n-1',
    {
      bytes: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
      type: 'image/png',
      name: 'shot.png',
    },
    { images: true },
  );
  const get = vi.spyOn(repo.files, 'get');
  return { repo, id: stored.id, get };
}

test('the bytes are read only once the element is near the viewport', async () => {
  const io = fakeIntersectionObserver();
  const { repo, id, get } = await setup();
  renderApp(<Probe id={id} />, { repository: repo });
  const probe = await screen.findByTestId('probe');
  // Mounted, but nowhere near the screen: nothing is read.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(get).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(probe.dataset.status).toBe('idle');
  // Near enough: one read, one object URL.
  act(() => io.reveal(probe));
  await waitFor(() => expect(probe.textContent).toBe('blob:probe-1'));
  expect(get).toHaveBeenCalledTimes(1);
  expect(probe.dataset.status).toBe('ready');
});

test('the observer looks a screenful ahead', async () => {
  const io = fakeIntersectionObserver();
  const { repo, id } = await setup();
  renderApp(<Probe id={id} />, { repository: repo });
  await screen.findByTestId('probe');
  const [options] = io.options();
  expect(options?.rootMargin).toMatch(/^\d+px/);
});

test('the object URL is revoked when the image goes', async () => {
  fakeIntersectionObserver({ auto: true });
  const { repo, id } = await setup();
  const view = renderApp(<Probe id={id} />, { repository: repo });
  await waitFor(() =>
    expect(screen.getByTestId('probe').textContent).toBe('blob:probe-1'),
  );
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:probe-1');
});

test('the observer is let go when the image goes', async () => {
  const io = fakeIntersectionObserver();
  const { repo, id } = await setup();
  const view = renderApp(<Probe id={id} />, { repository: repo });
  await screen.findByTestId('probe');
  expect(io.live()).toBe(1);
  view.unmount();
  expect(io.live()).toBe(0);
});

test('a file that is not stored reads as missing, with no URL', async () => {
  fakeIntersectionObserver({ auto: true });
  const { repo } = await setup();
  renderApp(<Probe id="gone" />, { repository: repo });
  await waitFor(() =>
    expect(screen.getByTestId('probe').dataset.status).toBe('missing'),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('with no id nothing is read and the status stays idle', async () => {
  fakeIntersectionObserver({ auto: true });
  const { repo, get } = await setup();
  renderApp(<Probe id={undefined} />, { repository: repo });
  const probe = await screen.findByTestId('probe');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(probe.dataset.status).toBe('idle');
  expect(get).not.toHaveBeenCalled();
});

test('where the browser has no IntersectionObserver the image loads at once', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const { repo, id } = await setup();
  renderApp(<Probe id={id} />, { repository: repo });
  await waitFor(() =>
    expect(screen.getByTestId('probe').textContent).toBe('blob:probe-1'),
  );
});

test('a failed read says so instead of throwing', async () => {
  fakeIntersectionObserver({ auto: true });
  const { repo, id, get } = await setup();
  get.mockRejectedValue(new Error('disk'));
  renderApp(<Probe id={id} />, { repository: repo });
  await waitFor(() =>
    expect(screen.getByTestId('probe').dataset.status).toBe('error'),
  );
});

test('a new id replaces the URL and revokes the old one', async () => {
  fakeIntersectionObserver({ auto: true });
  const { repo, id } = await setup();
  const other = await repo.files.add(
    WS,
    'note:n-1',
    {
      bytes: new Uint8Array([9]).buffer as ArrayBuffer,
      type: 'image/png',
      name: 'two.png',
    },
    { images: true },
  );
  function Swap() {
    const [now, setNow] = useState(id);
    return (
      <>
        <button onClick={() => setNow(other.id)}>next</button>
        <Probe id={now} />
      </>
    );
  }
  renderApp(<Swap />, { repository: repo });
  await waitFor(() =>
    expect(screen.getByTestId('probe').textContent).toBe('blob:probe-1'),
  );
  fireEvent.click(screen.getByText('next'));
  await waitFor(() =>
    expect(screen.getByTestId('probe').textContent).toBe('blob:probe-2'),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:probe-1');
});
