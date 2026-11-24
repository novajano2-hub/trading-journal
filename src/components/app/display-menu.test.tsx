// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from './__fixtures__/render-app';
import { DisplayMenu } from './display-menu';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

/** Radix opens its menu on pointer down, not click. */
function open(name: RegExp | string) {
  const button = screen.getByRole('button', { name });
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
  return button;
}

/** What the button shows from `sm`, and what it shows on a phone. */
const faces = (button: HTMLElement) => ({
  wide: button.querySelector('[data-face="wide"]')?.textContent,
  phone: button.querySelector('[data-face="phone"]')?.textContent,
});

test('the button names the unit and the basis, starts as Net, $, and its name contains its visible label', async () => {
  renderApp(<DisplayMenu />);
  const button = await screen.findByRole('button', {
    name: 'Net, $, show as Dollar',
  });
  // From sm the pair; on a phone the unit's mark alone, in a plain button.
  expect(faces(button)).toEqual({ wide: 'Net, $', phone: '$' });
  expect(button.getAttribute('aria-label')).toContain('Net, $');
  expect(button.className).toContain('max-sm:border-0');
});

test('choosing Privacy saves displayUnit and renames the button', async () => {
  const { repo } = renderApp(<DisplayMenu />);
  open('Net, $, show as Dollar');
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: 'Privacy' }),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).displayUnit).toBe('privacy'),
  );
  const button = await screen.findByRole('button', {
    name: 'Net, show as Privacy',
    hidden: true,
  });
  // A crossed eye, no unit word: the glyph is decoration, "Net" is the label.
  expect(button.textContent).toBe('Net');
});

test('Gross and Net save the basis, as the old switch did', async () => {
  const { repo } = renderApp(<DisplayMenu />);
  open('Net, $, show as Dollar');
  const net = await screen.findByRole('menuitemradio', { name: 'Net' });
  await waitFor(() => expect(net.hasAttribute('data-disabled')).toBe(false));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Gross' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).pnlBasis).toBe('gross'),
  );
  const renamed = await screen.findByRole('button', {
    name: 'Gross, $, show as Dollar',
    hidden: true,
  });
  expect(faces(renamed).wide).toBe('Gross, $');
});

test('the units are one radio group, the basis another', async () => {
  renderApp(<DisplayMenu />);
  open('Net, $, show as Dollar');
  const units = await screen.findByRole('group', { name: 'Show as' });
  expect(
    Array.from(units.querySelectorAll('[role="menuitemradio"]')).map((n) =>
      n.getAttribute('aria-label'),
    ),
  ).toEqual([
    'Dollar',
    'Percentage',
    'Privacy',
    'R-multiple',
    'Ticks',
    'Pips',
    'Points',
  ]);
  expect(screen.getByRole('group', { name: 'P&L' })).toBeTruthy();
});

test('with no trades the P&L group is unavailable and changes nothing; the unit still changes', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.workspaces.setActive('mine');
  renderApp(<DisplayMenu />, { repository });
  open('Net, $, show as Dollar');
  const gross = await screen.findByRole('menuitemradio', { name: 'Gross' });
  await waitFor(() => expect(gross.hasAttribute('data-disabled')).toBe(true));
  expect(
    screen.getByRole('group', { name: 'P&L' }).getAttribute('aria-disabled'),
  ).toBe('true');
  fireEvent.click(gross);
  expect((await repository.prefs.get()).pnlBasis).toBe('net');
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Percentage' }));
  await waitFor(async () =>
    expect((await repository.prefs.get()).displayUnit).toBe('percent'),
  );
});

test('under each unit that narrows the trades, the menu says which it keeps', async () => {
  renderApp(<DisplayMenu />);
  open('Net, $, show as Dollar');
  const keeps = async (name: string) => {
    const item = await screen.findByRole('menuitemradio', { name });
    const id = item.getAttribute('aria-describedby');
    return id === null ? null : document.getElementById(id)!.textContent;
  };
  expect(await keeps('R-multiple')).toBe('Trades with a stop only');
  expect(await keeps('Ticks')).toBe('Futures trades only');
  expect(await keeps('Pips')).toBe('Forex trades only');
  expect(await keeps('Points')).toBe('Futures trades only');
  // Its visible name leads the item, so the label is in the name.
  const ticks = await screen.findByRole('menuitemradio', { name: 'Ticks' });
  expect(ticks.textContent).toBe('TicksFutures trades only');
  for (const name of ['Dollar', 'Percentage', 'Privacy'])
    expect(await keeps(name)).toBeNull();
});
