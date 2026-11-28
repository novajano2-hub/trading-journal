// Test-only: the Dashboard over a small workspace whose template holds the
// widgets a test asks for, and what the widget tests share. Mock
// `next/navigation` with `./navigation` in the test file, as `renderApp` says.
import { screen } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { NewCashFlow, Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Trade, UserPrefs, WidgetKey, WidgetRef } from '@/domain/types';
import { DashboardView } from '../dashboard/dashboard-view';
import { renderApp } from './render-app';

// The sample as the app seeds it on 20 Nov 2026: 1,517 closed trades over six accounts
// (v8 merged two pairs and split one; v9 gives some forex trades swap, in
// pairs that sum to nothing each week, so the totals are the base's).
let seeded: SampleWorkspace | undefined;
export const theSample = (): SampleWorkspace =>
  (seeded ??= generateSampleWorkspace({
    seed: SAMPLE_SEED,
    endDate: '2026-11-19',
  }));

/**
 * The Dashboard over `sample`, in New York time, with `prefs` on top. Its
 * template holds `lower`, the widgets under test, and nothing above them (a
 * widget is drawn by its key, wherever its template puts it).
 */
export async function renderWidgets(
  lower: readonly (WidgetKey | WidgetRef)[],
  opts: {
    sample?: () => SampleWorkspace;
    prefs?: Partial<UserPrefs>;
    url?: string;
    /** Deposits and withdrawals to book before the page opens. */
    flows?: NewCashFlow[];
  } = {},
) {
  const sample = opts.sample ?? theSample;
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
  });
  await repository.prefs.update({
    timeZone: 'America/New_York',
    dashboards: {
      inUse: 't',
      templates: [
        {
          id: 't',
          name: 'Lower',
          upper: [],
          lower: lower.map((w) => (typeof w === 'string' ? { key: w } : w)),
        },
      ],
    },
    ...opts.prefs,
  });
  for (const flow of opts.flows ?? [])
    await repository.cashFlows.create(SAMPLE_WORKSPACE.id, flow);
  const rendered = renderApp(<DashboardView />, { repository, url: opts.url });
  await screen.findByTestId('dashboard-ready');
  return rendered;
}

/**
 * What another tab does while the page is open: saves a second template, "Other",
 * and puts it in use. The page's cache has not heard of it, so the template the
 * page draws is no longer the one in use. (A widget's settings write must keep both.)
 */
export async function saveTemplateElsewhere(repo: Repository): Promise<void> {
  const now = (await repo.prefs.get()).dashboards!;
  await repo.prefs.update({
    dashboards: {
      inUse: 'other',
      templates: [
        ...now.templates,
        { id: 'other', name: 'Other', upper: [], lower: [] },
      ],
    },
  });
}

export const widget = (key: WidgetKey): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-widget="${key}"]`)!;

/** What the widget shows, in one line: the words a screen reader alone gets are left out. */
export function said(key: WidgetKey): string {
  const copy = widget(key).cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A closed ES trade on `day` (New York), closing `i` minutes into the session. */
export function esTrade(
  i: number,
  day: string,
  net: number,
  over: Partial<Trade> = {},
): Trade {
  const minute = String(10 + i).padStart(2, '0');
  return makeTrade({
    id: `u-${i + 1}`,
    serial: i + 1,
    workspaceId: SAMPLE_WORKSPACE.id,
    accountId: 'acc-a',
    net,
    gross: net,
    fees: 0,
    instrument: resolveInstrument('ESZ5')!,
    avgEntry: 4500,
    avgExit: 4500,
    initialRisk: 10000,
    openedAt: `${day}T15:00:00Z`,
    closedAt: `${day}T15:${minute}:00Z`,
    ...over,
  });
}

/** The fixture workspace holding only the trades `make` gives, over acc-a ($50,000.00 to start). */
export function tradesSample(
  make: () => Trade[],
  accountEdit?: (s: SampleWorkspace) => void,
) {
  return (): SampleWorkspace => {
    const s = fixtureSample();
    s.trades = make();
    s.journal = [];
    accountEdit?.(s);
    return s;
  };
}

/** Net results by day, one trade each, in the order given. */
export const byDay = (rows: [day: string, net: number][]) =>
  tradesSample(() => rows.map(([day, net], i) => esTrade(i, day, net)));
