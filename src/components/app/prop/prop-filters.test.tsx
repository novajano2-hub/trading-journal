// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { FilterBar } from '../filter-bar';
import { commitNavigation, deferNavigation } from '../__fixtures__/navigation';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { PropDashboard } from './prop-dashboard';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const URL = '/app/prop-firms';
const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});

function repo(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => structuredClone(sample),
  });
}

async function inNewYork(r: Repository): Promise<void> {
  await r.prefs.update({ timeZone: 'America/New_York' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
}

/** The bar the shell draws on this route, over the page it filters. */
function Page(): React.JSX.Element {
  return (
    <>
      <FilterBar />
      <PropDashboard />
    </>
  );
}

const names = (els: HTMLElement[]) => els.map((e) => e.textContent);
/** A chip once it is live: the bar draws it inert until the workspace has loaded. */
const chip = async (name: string | RegExp): Promise<HTMLElement> => {
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  return screen.getByRole('button', { name });
};
const openFilters = async () => {
  fireEvent.click(await chip(/^Filters/));
  return screen.findByRole('dialog', { name: 'Filters' });
};
const group = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole(
    /^(Phase|Status)$/.test(name) ? 'radiogroup' : 'group',
    {
      name,
    },
  );
const choices = (el: HTMLElement) =>
  [
    ...within(el).queryAllByRole('radio'),
    ...within(el).queryAllByRole('checkbox'),
  ].map((x) => x.parentElement?.textContent);
const params = () => new URLSearchParams(window.location.search);

test('on the prop Dashboard the bar holds the date range and Filters, and none of the trade chips (C37)', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  expect(await chip('All time')).toBeTruthy();
  expect(await chip('Filters')).toBeTruthy();
  for (const gone of ['Symbol', 'Side', 'Strategy', 'Tags', 'More filters'])
    expect(screen.queryByRole('button', { name: gone }), gone).toBeNull();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

test('the Filters popover holds the six filters, each with the workspace’s own choices', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  expect(
    [...dialog.querySelectorAll('[data-filter]')].map(
      (g) => g.querySelector('p')?.textContent,
    ),
  ).toEqual([
    'Firm',
    'Phase',
    'Status',
    'Account size',
    'Account type',
    'Strategy',
  ]);
  expect(choices(group(dialog, 'Firm'))).toEqual([
    'Sample data feed',
    'Sample prop firm',
  ]);
  expect(choices(group(dialog, 'Phase'))).toEqual([
    'Any',
    'Evaluation',
    'Funded',
  ]);
  expect(choices(group(dialog, 'Status'))).toEqual([
    'Any',
    'Active',
    'Breached',
  ]);
  expect(choices(group(dialog, 'Account size'))).toEqual([
    '$50,000.00',
    '$100,000.00',
  ]);
  expect(choices(group(dialog, 'Account type'))).toEqual([
    '1-step',
    '2-step',
    'Straight to funded',
  ]);
  // Only the strategies a challenge carries, by name.
  expect(choices(group(dialog, 'Strategy'))).toEqual([
    'Level reversal',
    'Opening range breakout',
    'Trend pullback',
  ]);
  // Nothing is set: Any is chosen and nothing is ticked.
  expect(
    (
      within(group(dialog, 'Phase')).getByRole('radio', {
        name: 'Any',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    within(dialog)
      .getAllByRole('checkbox')
      .every((c) => !(c as HTMLInputElement).checked),
  ).toBe(true);
});

test('choosing a firm writes it to the address, counts on the chip, and narrows the dashboard', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  fireEvent.click(
    within(group(dialog, 'Firm')).getByRole('checkbox', {
      name: 'Sample data feed',
    }),
  );
  expect(params().getAll('pfirm')).toEqual(['Sample data feed']);
  // The chip counts the filters set, not their values.
  expect(await chip('Filters 1')).toBeTruthy();
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Total spent' }).textContent,
    ).toBe('Total spent−$29.00fees and resets'),
  );
  // A second firm joins the first; the count stays one filter.
  fireEvent.click(
    within(group(dialog, 'Firm')).getByRole('checkbox', {
      name: 'Sample prop firm',
    }),
  );
  expect(params().getAll('pfirm')).toEqual([
    'Sample data feed',
    'Sample prop firm',
  ]);
  expect(await chip('Filters 1')).toBeTruthy();
});

test('Phase and Status are one choice or Any, and Any takes the filter off the address', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  fireEvent.click(
    within(group(dialog, 'Phase')).getByRole('radio', { name: 'Funded' }),
  );
  fireEvent.click(
    within(group(dialog, 'Status')).getByRole('radio', { name: 'Breached' }),
  );
  expect(params().get('pphase')).toBe('funded');
  expect(params().get('pstatus')).toBe('breached');
  expect(await chip('Filters 2')).toBeTruthy();
  fireEvent.click(
    within(group(dialog, 'Phase')).getByRole('radio', { name: 'Any' }),
  );
  expect(params().has('pphase')).toBe(false);
  expect(await chip('Filters 1')).toBeTruthy();
});

test('size, type and strategy are written as the cents, the type and the strategy’s id', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  fireEvent.click(
    within(group(dialog, 'Account size')).getByRole('checkbox', {
      name: '$100,000.00',
    }),
  );
  fireEvent.click(
    within(group(dialog, 'Account type')).getByRole('checkbox', {
      name: '2-step',
    }),
  );
  fireEvent.click(
    within(group(dialog, 'Strategy')).getByRole('checkbox', {
      name: 'Trend pullback',
    }),
  );
  expect(params().getAll('psize')).toEqual(['10000000']);
  expect(params().getAll('ptype')).toEqual(['2-step']);
  expect(params().getAll('pstrategy')).toEqual(['sample-strategy-2']);
  expect(await chip('Filters 3')).toBeTruthy();
});

test('an address with filters opens with them ticked, and the popover’s Clear drops the six and keeps the range', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, {
    repository: r,
    url: `${URL}?pphase=funded&pfirm=Sample%20prop%20firm&range=last-30-days&tab=funded`,
  });
  const dialog = await openFilters();
  expect(
    (
      within(group(dialog, 'Phase')).getByRole('radio', {
        name: 'Funded',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      within(group(dialog, 'Firm')).getByRole('checkbox', {
        name: 'Sample prop firm',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));
  expect(params().has('pphase')).toBe(false);
  expect(params().has('pfirm')).toBe(false);
  // The range and the page's own parameters stay.
  expect(params().get('range')).toBe('last-30-days');
  expect(params().get('tab')).toBe('funded');
});

test('the date chip is the global range: it writes range, leaves the prop filters and other parameters, and reads as the range', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, {
    repository: r,
    url: `${URL}?pstatus=active&pfirm=Sample%20prop%20firm&tab=funded`,
  });
  fireEvent.click(await chip('All time'));
  const dialog = await screen.findByRole('dialog', { name: 'Date' });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Last 30 days' }));
  expect(params().get('range')).toBe('last-30-days');
  expect(params().get('pstatus')).toBe('active');
  expect(params().getAll('pfirm')).toEqual(['Sample prop firm']);
  expect(params().get('tab')).toBe('funded');
  expect(await chip('Last 30 days')).toBeTruthy();
  // A custom range is two dates, and replaces the preset.
  fireEvent.click(within(dialog).getByRole('radio', { name: 'All time' }));
  expect(params().has('range')).toBe(false);
  expect(await chip('All time')).toBeTruthy();
});

test('Clear filters appears with any filter or range set, and drops them all', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, {
    repository: r,
    url: `${URL}?pphase=funded&from=2026-10-01&tab=funded`,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
  expect(params().has('pphase')).toBe(false);
  expect(params().has('from')).toBe(false);
  expect(params().get('tab')).toBe('funded');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull(),
  );
});

test('under Privacy a size reads hidden in the popover, as it does everywhere else', async () => {
  const r = repo();
  await inNewYork(r);
  await r.prefs.update({ displayUnit: 'privacy' });
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  expect(group(dialog, 'Account size').textContent).not.toMatch(/\d,\d{3}/);
  expect(group(dialog, 'Firm').textContent).toContain('Sample prop firm');
});

test('on a phone the chips are one Filters button; its sheet holds the date and the six filters', async () => {
  viewport({ phone: true });
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  fireEvent.click(await chip('Filters'));
  const sheet = await screen.findByRole('dialog', { name: 'Filters' });
  const rows = within(sheet).getAllByRole('button', { expanded: false });
  expect(names(rows.filter((b) => b.hasAttribute('aria-controls')))).toEqual([
    'DateAll time',
    'FirmAny',
    'PhaseAny',
    'StatusAny',
    'Account sizeAny',
    'Account typeAny',
    'StrategyAny',
  ]);
  fireEvent.click(within(sheet).getByRole('button', { name: /^Firm\s*Any/ }));
  fireEvent.click(
    within(sheet).getByRole('checkbox', { name: 'Sample data feed' }),
  );
  expect(params().getAll('pfirm')).toEqual(['Sample data feed']);
  // What is set reads on the row and the button.
  expect(
    within(sheet).getByRole('button', { name: /^Firm\s*Sample data feed/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Filters, 1 active', hidden: true }),
  ).toBeTruthy();
  // A phase is a choice among three.
  fireEvent.click(within(sheet).getByRole('button', { name: /^Phase\s*Any/ }));
  fireEvent.click(within(sheet).getByRole('radio', { name: 'Funded' }));
  expect(params().get('pphase')).toBe('funded');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Clear filters' }));
  expect(params().has('pfirm')).toBe(false);
  expect(params().has('pphase')).toBe(false);
});

test('before the workspace loads the chips are inert and show no counts', () => {
  renderApp(<Page />, { repository: repo(), url: `${URL}?pphase=funded` });
  const filters = screen.getByRole('button', { name: /^Filters/ });
  expect(filters.hasAttribute('disabled')).toBe(true);
});

test('a choice shows at once, before the address has landed, and the address then takes over', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: URL });
  const dialog = await openFilters();
  const firm = () =>
    within(group(dialog, 'Firm')).getByRole('checkbox', {
      name: 'Sample data feed',
    }) as HTMLInputElement;
  // Next applies the new address in a transition: the router has not heard of it yet.
  deferNavigation();
  fireEvent.click(firm());
  expect(firm().checked).toBe(true);
  expect(await chip('Filters 1')).toBeTruthy();
  // The date range stands the same way.
  fireEvent.click(await chip('All time'));
  const date = await screen.findByRole('dialog', { name: 'Date' });
  fireEvent.click(within(date).getByRole('radio', { name: 'Last month' }));
  expect(
    (
      within(date).getByRole('radio', {
        name: 'Last month',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  act(() => commitNavigation());
  expect(params().getAll('pfirm')).toEqual(['Sample data feed']);
  expect(params().get('range')).toBe('last-month');
  expect(await chip('Last month')).toBeTruthy();
});

test('back to an address before a write lands shows that address, not the write', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Page />, { repository: r, url: `${URL}?pphase=funded` });
  const dialog = await openFilters();
  deferNavigation();
  fireEvent.click(
    within(group(dialog, 'Status')).getByRole('radio', { name: 'Breached' }),
  );
  window.history.pushState(null, '', `${URL}?pphase=evaluation`);
  act(() => commitNavigation());
  expect(await chip('Filters 1')).toBeTruthy();
  expect(
    (
      within(group(dialog, 'Phase')).getByRole('radio', {
        name: 'Evaluation',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      within(group(dialog, 'Status')).getByRole('radio', {
        name: 'Breached',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});
