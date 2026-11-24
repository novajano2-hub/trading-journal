// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from './__fixtures__/render-app';
import { FilterBar } from './filter-bar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

async function openPanel(url = '/app/dashboard'): Promise<HTMLElement> {
  renderApp(<FilterBar />, { url });
  // The button is inert until the workspace loads, and then a new element.
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: /^More filters/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: /^More filters/ }));
  return screen.findByRole('dialog', { name: 'More filters' });
}

const check = (panel: HTMLElement, name: string) =>
  fireEvent.click(within(panel).getByRole('checkbox', { name }));

test('choosing Losses and Wednesday, then Apply, writes both and the button counts them', async () => {
  const panel = await openPanel();
  check(panel, 'Losses');
  check(panel, 'Wednesday');
  // Nothing is written before Apply.
  expect(window.location.search).toBe('');
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
  expect(window.location.search).toBe('?outcome=loss&wd=3');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const button = await screen.findByRole('button', {
    name: 'More filters, 2 active',
  });
  expect(button.textContent).toContain('2');
});

test('the Instrument toggles write the asset classes as inst', async () => {
  const panel = await openPanel();
  check(panel, 'Futures');
  check(panel, 'Forex');
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
  expect(window.location.search).toBe('?inst=future,forex');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    await screen.findByRole('button', { name: 'More filters, 1 active' }),
  ).toBeTruthy();
});

test('Cancel and Escape write nothing', async () => {
  let panel = await openPanel();
  check(panel, 'Losses');
  fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
  expect(window.location.search).toBe('');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  fireEvent.click(await screen.findByRole('button', { name: 'More filters' }));
  panel = await screen.findByRole('dialog', { name: 'More filters' });
  check(panel, 'Wins');
  fireEvent.keyDown(panel, { key: 'Escape' });
  expect(window.location.search).toBe('');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // A reopened panel starts from what is applied, not from the dropped draft.
  fireEvent.click(await screen.findByRole('button', { name: 'More filters' }));
  panel = await screen.findByRole('dialog', { name: 'More filters' });
  expect(
    (within(panel).getByRole('checkbox', { name: 'Wins' }) as HTMLInputElement)
      .checked,
  ).toBe(false);
});

test('Reset empties the draft, number fields included, and Apply then clears the URL', async () => {
  const panel = await openPanel('/app/dashboard?outcome=win&r=-1_2&side=long');
  expect(
    (within(panel).getByRole('checkbox', { name: 'Wins' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  const min = within(panel).getByRole('textbox', {
    name: 'Realized R, min',
  }) as HTMLInputElement;
  expect(min.value).toBe('-1');
  fireEvent.click(within(panel).getByRole('button', { name: 'Reset' }));
  expect(
    (
      within(panel).getByRole('textbox', {
        name: 'Realized R, min',
      }) as HTMLInputElement
    ).value,
  ).toBe('');
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
  // The side chip is not the panel's to reset.
  expect(window.location.search).toBe('?side=long');
});

test('ranges, windows, strategy match and no strategy write their params', async () => {
  const panel = await openPanel();
  const type = (name: string, value: string) =>
    fireEvent.change(within(panel).getByRole('textbox', { name }), {
      target: { value },
    });
  type('Realized R, min', '-1');
  type('Realized R, max', '2');
  type('Duration, min (minutes)', '5');
  fireEvent.click(
    within(panel).getAllByRole('button', { name: 'Add window' })[0]!,
  );
  fireEvent.change(within(panel).getByLabelText('Entry time window 1, from'), {
    target: { value: '09:30' },
  });
  fireEvent.change(within(panel).getByLabelText('Entry time window 1, to'), {
    target: { value: '11:00' },
  });
  // An empty second window is dropped on Apply.
  fireEvent.click(
    within(panel).getAllByRole('button', { name: 'Add window' })[0]!,
  );
  fireEvent.click(
    within(panel).getAllByRole('radio', { name: 'All selected' })[0]!,
  );
  check(panel, 'No strategy');
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
  const params = new URLSearchParams(window.location.search);
  expect(params.get('r')).toBe('-1_2');
  expect(params.get('dur')).toBe('5_');
  expect(params.get('entry')).toBe('09:30-11:00');
  expect(params.get('nostrat')).toBe('1');
  expect(params.get('stratmatch')).toBe('all');
  expect(params.get('entry')).not.toContain(',');
});

test('no tags, no initial risk, sessions and days to expiry write their params', async () => {
  const panel = await openPanel();
  check(panel, 'No tags');
  check(panel, 'No initial risk');
  check(panel, 'New York, entry');
  check(panel, 'London, exit');
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Days to expiry, min (options)',
    }),
    { target: { value: '2' } },
  );
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Days to expiry, max (options)',
    }),
    { target: { value: '7' } },
  );
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
  const params = new URLSearchParams(window.location.search);
  expect(params.get('notag')).toBe('1');
  expect(params.get('norisk')).toBe('1');
  expect(params.get('sess')).toBe('new-york');
  expect(params.get('xsess')).toBe('london');
  expect(params.get('dte')).toBe('2_7');
  expect(
    await screen.findByRole('button', { name: 'More filters, 5 active' }),
  ).toBeTruthy();
});

test('the panel opens on the filters a link brought', async () => {
  const panel = await openPanel(
    '/app/dashboard?notag=1&norisk=1&sess=asia&dte=_0',
  );
  const on = (name: string) =>
    (within(panel).getByRole('checkbox', { name }) as HTMLInputElement).checked;
  expect(on('No tags')).toBe(true);
  expect(on('No initial risk')).toBe(true);
  expect(on('Asia, entry')).toBe(true);
  expect(on('London, entry')).toBe(false);
  expect(
    (
      within(panel).getByRole('textbox', {
        name: 'Days to expiry, max (options)',
      }) as HTMLInputElement
    ).value,
  ).toBe('0');
});
