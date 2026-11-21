// Test-only: renders a component the way the /app layout does, over a fresh
// IndexedDB. Mock `next/navigation` with `./navigation` in the test file.
import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { ReactElement } from 'react';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import type { Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { commitNavigation } from './navigation';

export function renderApp(
  ui: ReactElement,
  opts: {
    /** Seeds the sample workspace; default `fixtureSample()`. */
    sample?: (now: Date) => Promise<SampleWorkspace>;
    /** Default '/app/dashboard'. */
    url?: string;
    /** Wins over `sample`. */
    repository?: Repository;
  } = {},
): RenderResult & { repo: Repository } {
  window.history.replaceState(null, '', opts.url ?? '/app/dashboard');
  commitNavigation();
  const repo =
    opts.repository ??
    createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: opts.sample ?? (async () => fixtureSample()),
    });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const result = render(
    <DataProvider repository={repo} queryClient={queryClient}>
      {ui}
    </DataProvider>,
  );
  return { ...result, repo };
}
