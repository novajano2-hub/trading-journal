// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { zoneLabel } from '@/lib/time-zone-label';
import { renderApp } from '../__fixtures__/render-app';
import { ProfileSettings } from './profile';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

test('with no time zone saved it reads Browser default and the browser zone', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const zone = (await r.prefs.get()).timeZone;
  expect(
    await screen.findByText(`Browser default (${zoneLabel(zone)})`),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: /Use browser default/ }),
  ).toBeNull();
});

test('picking Europe/London saves it, and Use browser default forgets it again', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const field = await screen.findByRole('combobox', { name: 'Time zone' });
  fireEvent.change(field, { target: { value: 'Europe/London' } });
  await waitFor(async () =>
    expect((await r.prefs.get()).timeZone).toBe('Europe/London'),
  );
  expect(await r.prefs.saved()).toMatchObject({ timeZone: 'Europe/London' });
  // The repository has the zone before the screen refetches it: wait for the
  // screen, never read it the instant the write lands.
  const forget = await screen.findByRole('button', {
    name: /Use browser default/,
  });
  expect(screen.queryByText(/^Browser default \(/)).toBeNull();
  fireEvent.click(forget);
  await waitFor(async () =>
    expect((await r.prefs.saved()).timeZone).toBeUndefined(),
  );
  expect(await screen.findByText(/^Browser default \(/)).toBeTruthy();
});

test('a name that is not a zone changes nothing', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const field = await screen.findByRole('combobox', { name: 'Time zone' });
  fireEvent.change(field, { target: { value: 'Mars/Olympus' } });
  expect(await screen.findByText(/doesn't know that time zone/)).toBeTruthy();
  expect((await r.prefs.saved()).timeZone).toBeUndefined();
});

test('the name and the base currency save when you leave the field', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const name = await screen.findByLabelText('Name');
  fireEvent.change(name, { target: { value: 'Sam' } });
  fireEvent.blur(name);
  const currency = screen.getByLabelText('Base currency');
  fireEvent.change(currency, { target: { value: 'eur' } });
  fireEvent.blur(currency);
  await waitFor(async () =>
    expect(await r.prefs.get()).toMatchObject({
      displayName: 'Sam',
      baseCurrency: 'EUR',
    }),
  );
});

test('a bad base currency is announced as an alert the field points to', async () => {
  renderApp(<ProfileSettings />, {
    repository: repo(),
    url: '/app/settings/profile',
  });
  const currency = await screen.findByLabelText('Base currency');
  fireEvent.change(currency, { target: { value: 'EU' } });
  fireEvent.blur(currency);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Use a three-letter currency code, like USD.');
  expect(currency.getAttribute('aria-describedby')).toBe(alert.id);
});
