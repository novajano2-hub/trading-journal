// @vitest-environment happy-dom
// A widget's settings control writes through the stored prefs (#46, B-01, C70):
// the page's cache may be behind another tab's save, and the write must not
// build the pref from it.
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { usePrefs } from '@/data/query/hooks';
import { DataProvider } from '@/data/query/provider';
import type { DashTemplate } from '@/domain/types';
import { WidgetTemplateContext } from './context';
import { useSetWidgetSetting } from './use-widget-setting';

afterEach(cleanup);

const tpl = (id: string, name: string): DashTemplate => ({
  id,
  name,
  upper: [],
  lower: [{ key: 'trade-time' }],
});

/** The prefs hold `templates` (the first in use) and the page has read them. */
async function setup(drawn: string | null, templates: DashTemplate[]) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await repository.prefs.update({
    dashboards: { inUse: templates[0]!.id, templates },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider repository={repository} queryClient={queryClient}>
      <WidgetTemplateContext.Provider value={drawn}>
        {children}
      </WidgetTemplateContext.Provider>
    </DataProvider>
  );
  const view = renderHook(
    () => ({ prefs: usePrefs(), set: useSetWidgetSetting('trade-time') }),
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(view.result.current.prefs.data?.dashboards).toBeDefined(),
  );
  return { repository, view };
}

test('a stale cache does not drop a template saved elsewhere, nor revert the one in use', async () => {
  const { repository, view } = await setup('a', [tpl('a', 'A')]);

  // Another tab makes a template B and picks it; this tab's cache has not heard.
  await repository.prefs.update({
    dashboards: { inUse: 'b', templates: [tpl('a', 'A'), tpl('b', 'B')] },
  });
  expect(view.result.current.prefs.data?.dashboards?.templates).toHaveLength(1);

  await act(async () => {
    view.result.current.set({ time: 'exit' });
  });
  await waitFor(async () => {
    const stored = (await repository.prefs.get()).dashboards!;
    expect(stored.templates[0]!.lower[0]!.settings).toEqual({ time: 'exit' });
  });
  const stored = (await repository.prefs.get()).dashboards!;
  expect(stored.inUse).toBe('b');
  expect(stored.templates.map((t) => t.id)).toEqual(['a', 'b']);
  // The patch went to the template the page draws (A), not the one in use now (B).
  expect(stored.templates[1]!.lower[0]).toEqual({ key: 'trade-time' });
});

test('a template that is gone elsewhere is not brought back by the write', async () => {
  const { repository, view } = await setup('a', [tpl('a', 'A'), tpl('b', 'B')]);
  await repository.prefs.update({
    dashboards: { inUse: 'b', templates: [tpl('b', 'B')] },
  });

  await act(async () => {
    view.result.current.set({ time: 'exit' });
  });
  await waitFor(() => expect(view.result.current.prefs.isFetching).toBe(false));
  const stored = (await repository.prefs.get()).dashboards!;
  expect(stored.templates.map((t) => t.id)).toEqual(['b']);
  expect(stored.inUse).toBe('b');
  expect(stored.templates[0]!.lower[0]).toEqual({ key: 'trade-time' });
});

test('with no template id from the page it patches the template in use, read afresh', async () => {
  const { repository, view } = await setup(null, [
    tpl('a', 'A'),
    tpl('b', 'B'),
  ]);
  await repository.prefs.update({
    dashboards: { inUse: 'b', templates: [tpl('a', 'A'), tpl('b', 'B')] },
  });
  await act(async () => {
    view.result.current.set({ time: 'exit' });
  });
  await waitFor(async () => {
    const stored = (await repository.prefs.get()).dashboards!;
    expect(stored.templates[1]!.lower[0]!.settings).toEqual({ time: 'exit' });
  });
  expect((await repository.prefs.get()).dashboards!.inUse).toBe('b');
});
