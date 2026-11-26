// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Repository } from '../repository';
import { VERSION_IDLE_MS, useVersionKeeper } from './hooks';
import { DataProvider } from './provider';

const MIN = 60_000;
const doc = (t: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

let keep: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Only the clock the keeper waits on: the data layer runs on promises.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  keep = vi.fn(async () => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function wrapper() {
  const repository = {
    workspaces: { getActive: async () => ({ id: 'mine' }) },
    noteVersions: { keep },
  } as unknown as Repository;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DataProvider repository={repository} queryClient={queryClient}>
        {children}
      </DataProvider>
    );
  };
}

/** Lets the keeper's write reach the repository. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function mount({ id: noteId }: { id: string | undefined } = { id: 'n-1' }) {
  return renderHook(
    ({ id, body }: { id: string | undefined; body: unknown }) =>
      useVersionKeeper(id, body),
    {
      wrapper: wrapper(),
      initialProps: { id: noteId, body: undefined as unknown },
    },
  );
}

test('a version is kept after 5 idle minutes and on leaving', async () => {
  expect(VERSION_IDLE_MS).toBe(5 * MIN);
  const view = mount();

  // Opened, not edited: nothing is kept, however long it stays open.
  await wait(20 * MIN);
  expect(keep).not.toHaveBeenCalled();

  // An edit starts the five minutes. Two edits inside them are one version.
  view.rerender({ id: 'n-1', body: doc('one') });
  await wait(2 * MIN);
  view.rerender({ id: 'n-1', body: doc('two') });
  await wait(2 * MIN + 59_000);
  await settle();
  expect(keep).not.toHaveBeenCalled();
  await wait(1000);
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
  // The newest text, as an automatic version of this note.
  expect(keep).toHaveBeenCalledWith('mine', 'n-1', doc('two'), 'auto');

  // Quiet again: nothing more, however long.
  await wait(30 * MIN);
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);

  // A new edit, then leaving before five minutes pass: kept on the way out.
  view.rerender({ id: 'n-1', body: doc('three') });
  await wait(MIN);
  expect(keep).toHaveBeenCalledTimes(1);
  view.unmount();
  await settle();
  expect(keep).toHaveBeenCalledTimes(2);
  expect(keep).toHaveBeenLastCalledWith('mine', 'n-1', doc('three'), 'auto');
  // The pending five-minute timer went with the editor.
  await wait(10 * MIN);
  await settle();
  expect(keep).toHaveBeenCalledTimes(2);
});

test('leaving a note that was not edited keeps nothing, and neither does leaving right after a kept version', async () => {
  const idle = mount();
  idle.unmount();
  await settle();
  expect(keep).not.toHaveBeenCalled();

  const edited = mount();
  edited.rerender({ id: 'n-1', body: doc('a') });
  await wait(5 * MIN);
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
  // The version already holds the text: leaving adds none.
  edited.unmount();
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
});

test('edits made before the note is stored are kept once it has an id', async () => {
  const view = mount({ id: undefined });
  view.rerender({ id: undefined, body: doc('typed first') });
  await wait(6 * MIN);
  await settle();
  // No note to keep it for yet: nothing is written.
  expect(keep).not.toHaveBeenCalled();

  // The first save gives the note an id; its five minutes start then.
  view.rerender({ id: 'n-9', body: doc('typed first') });
  await wait(4 * MIN);
  await settle();
  expect(keep).not.toHaveBeenCalled();
  await wait(MIN);
  await settle();
  expect(keep).toHaveBeenCalledWith('mine', 'n-9', doc('typed first'), 'auto');
});

test('leaving the page keeps what was typed, once', async () => {
  const view = mount();
  view.rerender({ id: 'n-1', body: doc('closing the tab') });
  await wait(MIN);
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
  // The editor going away afterwards finds nothing new to keep.
  view.unmount();
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
});

test('a version that could not be kept is tried again on leaving', async () => {
  keep.mockRejectedValueOnce(new Error('no room'));
  const view = mount();
  view.rerender({ id: 'n-1', body: doc('a') });
  await wait(5 * MIN);
  await settle();
  expect(keep).toHaveBeenCalledTimes(1);
  view.unmount();
  await settle();
  expect(keep).toHaveBeenCalledTimes(2);
});
