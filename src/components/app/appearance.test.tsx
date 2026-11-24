// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  APPEARANCE_KEY,
  APPEARANCE_SCRIPT,
  resolveTheme,
} from '@/lib/appearance';
import { renderApp } from './__fixtures__/render-app';
import { AppearanceControl, AppearanceSync } from './appearance';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

/** The device says dark, or light. */
function deviceDark(dark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-color-scheme: dark') && dark,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root().dataset.theme;
  delete root().dataset.appearance;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('System follows the device; Light and Dark do not', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});

test('Settings offers System, Light and Dark, starting on System', async () => {
  deviceDark(false);
  renderApp(<AppearanceControl />, { url: '/app/settings/profile' });
  const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
  const radios = screen.getAllByRole('radio');
  expect(radios.map((r) => r.parentElement!.textContent)).toEqual([
    'System',
    'Light',
    'Dark',
  ]);
  await waitFor(() =>
    expect(
      (screen.getByRole('radio', { name: 'System' }) as HTMLInputElement)
        .checked,
    ).toBe(true),
  );
  expect(group.getAttribute('role')).toBe('radiogroup');
});

for (const [mode, device, theme] of [
  ['dark', false, 'dark'],
  ['light', true, 'light'],
  ['system', true, 'dark'],
] as const)
  test(`choosing ${mode} on a ${device ? 'dark' : 'light'} device saves it and shows ${theme}`, async () => {
    deviceDark(device);
    const { repo } = renderApp(<AppearanceControl />, {
      url: '/app/settings/profile',
    });
    // Start from another choice, so every pick is a change.
    if (mode === 'system') {
      fireEvent.click(await screen.findByRole('radio', { name: 'Light' }));
      await waitFor(async () =>
        expect((await repo.prefs.get()).appearance).toBe('light'),
      );
    }
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    fireEvent.click(await screen.findByRole('radio', { name: label }));
    // The page switches at once, before the save lands.
    expect(root().dataset.appearance).toBe(mode);
    expect(root().dataset.theme).toBe(theme);
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe(mode);
    await waitFor(async () =>
      expect((await repo.prefs.get()).appearance).toBe(mode),
    );
  });

test('the saved choice wins over the pre-paint copy once the prefs load', async () => {
  deviceDark(false);
  localStorage.setItem(APPEARANCE_KEY, 'light');
  const { repo } = renderApp(<AppearanceSync />);
  await repo.prefs.update({ appearance: 'dark' });
  cleanup();
  renderApp(<AppearanceSync />, { repository: repo });
  await waitFor(() => expect(root().dataset.theme).toBe('dark'));
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe('dark');
});

test('the prefs refuse an appearance that is not one of the three', async () => {
  const { repo } = renderApp(<AppearanceSync />);
  await expect(
    repo.prefs.update({ appearance: 'sepia' as never }),
  ).rejects.toThrow('Unknown appearance "sepia"');
});

for (const [stored, device, theme] of [
  [null, true, 'dark'],
  [null, false, 'light'],
  ['light', true, 'light'],
  ['dark', false, 'dark'],
  ['sepia', false, 'light'],
] as const)
  test(`before first paint, ${stored ?? 'nothing'} stored on a ${device ? 'dark' : 'light'} device shows ${theme}`, () => {
    deviceDark(device);
    if (stored) localStorage.setItem(APPEARANCE_KEY, stored);
    new Function(APPEARANCE_SCRIPT)();
    expect(root().dataset.theme).toBe(theme);
    expect(root().dataset.appearance).toBe(
      stored === 'light' || stored === 'dark' ? stored : 'system',
    );
  });
