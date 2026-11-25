// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { zoneLabel } from '@/lib/time-zone-label';
import { renderApp } from '../__fixtures__/render-app';
import { USERNAME_MESSAGE } from '@/data/onboarding';
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

test('the first name and the base currency save when you leave the field', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const name = await screen.findByLabelText('First name');
  fireEvent.change(name, { target: { value: 'Sam' } });
  fireEvent.blur(name);
  const currency = screen.getByLabelText('Base currency');
  fireEvent.change(currency, { target: { value: 'eur' } });
  fireEvent.blur(currency);
  await waitFor(async () =>
    expect(await r.prefs.get()).toMatchObject({
      firstName: 'Sam',
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

test('Profile edits the first name, last name and username', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const last = await screen.findByLabelText('Last name');
  fireEvent.change(last, { target: { value: 'Rivera' } });
  fireEvent.blur(last);
  const user = screen.getByLabelText('Username');
  expect(
    screen.getByText(
      'Letters, digits, dots and underscores, 3 to 30 characters.',
    ),
  ).toBeTruthy();
  fireEvent.change(user, { target: { value: 'sam.rivera_1' } });
  fireEvent.blur(user);
  await waitFor(async () =>
    expect(await r.prefs.get()).toMatchObject({
      lastName: 'Rivera',
      username: 'sam.rivera_1',
    }),
  );
});

test('a bad username is announced and not saved', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const user = await screen.findByLabelText('Username');
  fireEvent.change(user, { target: { value: 'a b' } });
  fireEvent.blur(user);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(USERNAME_MESSAGE);
  expect(user.getAttribute('aria-describedby')).toBe(alert.id);
  expect((await r.prefs.saved()).username).toBeUndefined();
});

test('an old display name reads as the first name, and is kept in storage', async () => {
  const r = repo();
  await r.prefs.update({ displayName: 'Alex' });
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const name = (await screen.findByLabelText('First name')) as HTMLInputElement;
  await waitFor(() => expect(name.value).toBe('Alex'));
  expect((await r.prefs.saved()).displayName).toBe('Alex');
  expect((await r.prefs.saved()).firstName).toBeUndefined();
});

test('a set name can not be emptied: it shows the error and keeps the stored value', async () => {
  const r = repo();
  await r.prefs.update({
    firstName: 'Sam',
    lastName: 'Doe',
    username: 'sam.doe',
  });
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  for (const [label, message, key, value] of [
    ['First name', 'Enter your first name.', 'firstName', 'Sam'],
    ['Last name', 'Enter your last name.', 'lastName', 'Doe'],
    ['Username', 'Enter a username.', 'username', 'sam.doe'],
  ] as const) {
    const input = await screen.findByLabelText(label);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect((await screen.findByText(message)).getAttribute('id')).toBe(
      input.getAttribute('aria-describedby'),
    );
    expect((await r.prefs.saved())[key]).toBe(value);
  }
  expect(screen.queryByText('Optional.')).toBeNull();
});

test('a field that was never set may stay empty: nothing saved, no error', async () => {
  const r = repo();
  renderApp(<ProfileSettings />, {
    repository: r,
    url: '/app/settings/profile',
  });
  const last = await screen.findByLabelText('Last name');
  fireEvent.change(last, { target: { value: '  ' } });
  fireEvent.blur(last);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(screen.queryByRole('alert')).toBeNull();
  expect((await r.prefs.saved()).lastName).toBeUndefined();
});
