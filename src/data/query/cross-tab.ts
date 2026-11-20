import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const CROSS_TAB_CHANNEL = 'keel-data';

interface CrossTabMessage {
  keys: QueryKey[];
}

function isMessage(data: unknown): data is CrossTabMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as CrossTabMessage).keys)
  );
}

/** Invalidates `queryKeys` here, then tells the other tabs to do the same. */
export async function invalidate(
  qc: QueryClient,
  queryKeys: readonly QueryKey[],
  channel: BroadcastChannel | null,
): Promise<void> {
  await Promise.all(
    queryKeys.map((queryKey) => qc.invalidateQueries({ queryKey })),
  );
  try {
    channel?.postMessage({ keys: [...queryKeys] } satisfies CrossTabMessage);
  } catch {
    // a closed channel only costs the other tabs a refresh
  }
}

/** Invalidates what other tabs report, without re-posting it. Returns the unsubscribe. */
export function listenCrossTab(
  qc: QueryClient,
  channel: BroadcastChannel,
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isMessage(event.data)) return;
    for (const queryKey of event.data.keys) {
      void qc.invalidateQueries({ queryKey });
    }
  };
  channel.addEventListener('message', onMessage);
  return () => channel.removeEventListener('message', onMessage);
}
