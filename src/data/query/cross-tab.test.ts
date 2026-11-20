import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { invalidate, listenCrossTab } from './cross-tab';
import { keys } from './keys';

const channels: BroadcastChannel[] = [];
function channel(): BroadcastChannel {
  const c = new BroadcastChannel('keel-test');
  channels.push(c);
  return c;
}
afterEach(() => {
  for (const c of channels.splice(0)) c.close();
});

test('an invalidation in one tab invalidates the same keys in another, without echoing', async () => {
  const a = new QueryClient();
  const b = new QueryClient();
  const chA = channel();
  const chB = channel();
  a.setQueryData(keys.tags('sample'), []);
  b.setQueryData(keys.tags('sample'), []);
  listenCrossTab(b, chB);
  const posted = vi.spyOn(chB, 'postMessage');
  const received = vi.fn();
  chA.addEventListener('message', received);

  await invalidate(a, [keys.tags('sample')], chA);

  await vi.waitFor(() =>
    expect(b.getQueryState(keys.tags('sample'))!.isInvalidated).toBe(true),
  );
  expect(posted).not.toHaveBeenCalled();
  expect(received).not.toHaveBeenCalled();
});

test('with no channel it only invalidates locally', async () => {
  const a = new QueryClient();
  a.setQueryData(keys.tags('sample'), []);
  await invalidate(a, [keys.tags('sample')], null);
  expect(a.getQueryState(keys.tags('sample'))!.isInvalidated).toBe(true);
});
