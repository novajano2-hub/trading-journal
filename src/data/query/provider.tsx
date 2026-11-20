'use client';

import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
} from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createLocalRepository } from '../local/local-repository';
import type { Repository } from '../repository';
import { CROSS_TAB_CHANNEL, invalidate, listenCrossTab } from './cross-tab';
import { invalidationsFor, keys, type WriteKind } from './keys';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

export function activeWorkspaceQuery(repo: Repository) {
  return queryOptions({
    queryKey: keys.activeWorkspace(),
    queryFn: () => repo.workspaces.getActive(),
  });
}

interface DataContextValue {
  repository: Repository;
  queryClient: QueryClient;
  invalidate: (write: WriteKind, ws: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function useDataContext(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('DataProvider is missing above this component');
  return value;
}

export function DataProvider(props: {
  children: React.ReactNode;
  repository?: Repository;
  queryClient?: QueryClient;
}): React.JSX.Element {
  const [repository] = useState(
    () => props.repository ?? createLocalRepository(),
  );
  const [queryClient] = useState(
    () => props.queryClient ?? createQueryClient(),
  );
  const channel = useRef<BroadcastChannel | null>(null);
  const [value] = useState<DataContextValue>(() => ({
    repository,
    queryClient,
    invalidate: (write, ws) =>
      invalidate(queryClient, invalidationsFor(write, ws), channel.current),
  }));

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (typeof BroadcastChannel !== 'undefined') {
      const opened = new BroadcastChannel(CROSS_TAB_CHANNEL);
      channel.current = opened;
      unlisten = listenCrossTab(queryClient, opened);
    }
    // The first visit to any /app route seeds the sample workspace.
    void queryClient.prefetchQuery(activeWorkspaceQuery(repository));
    return () => {
      unlisten?.();
      channel.current?.close();
      channel.current = null;
    };
  }, [queryClient, repository]);

  return (
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={value}>
        {props.children}
      </DataContext.Provider>
    </QueryClientProvider>
  );
}

export function useRepository(): Repository {
  return useDataContext().repository;
}

export function useInvalidate(): (
  write: WriteKind,
  ws: string,
) => Promise<void> {
  return useDataContext().invalidate;
}
