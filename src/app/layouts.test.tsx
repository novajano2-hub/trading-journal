// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import AppGroupLayout from './(app)/layout';
import WelcomeLayout from './(welcome)/layout';

// The layouts' own markup is what is under test: what they wrap is not.
vi.mock('@/data/query/provider', () => ({
  DataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/app/first-run-gate', () => ({
  FirstRunGate: ({ children }: { children: React.ReactNode }) => children,
  GateLoading: () => null,
  WelcomeGuard: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/app/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

test('the app layout marks its shell: the pinned bar the page keeps focus clear of', () => {
  const { container } = render(
    <AppGroupLayout>
      <p>page</p>
    </AppGroupLayout>,
  );
  const surface = container.querySelector('[data-surface="app"]');
  expect(surface?.hasAttribute('data-shell')).toBe(true);
});

test('the welcome surface uses the app’s tokens but has no shell, so no pinned bar to clear', () => {
  const { container } = render(
    <WelcomeLayout>
      <p>welcome</p>
    </WelcomeLayout>,
  );
  expect(container.querySelector('[data-surface="app"]')).not.toBeNull();
  expect(container.querySelector('[data-shell]')).toBeNull();
});

/** The app surface's attribute selector, as CSS may write it: single-quoted, double-quoted or bare. */
const APP_SURFACE = /\[data-surface\s*=\s*(['"]?)app\1\s*\]/;

test('the top scroll padding applies to the shell only, never to the bare app surface', () => {
  const css = readFileSync('src/app/globals.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  // A selector, then a declaration block (no nested braces) that sets it.
  const rules = [
    ...css.matchAll(/([^{}]+)\{[^{}]*scroll-padding-top[^{}]*\}/g),
  ];
  expect(rules.length).toBeGreaterThanOrEqual(2);
  for (const [, selector = ''] of rules) {
    expect(selector, selector.trim()).toContain('[data-shell]');
    expect(selector, selector.trim()).not.toMatch(APP_SURFACE);
  }
});

test('the guard sees the app surface selector in every way CSS can write it', () => {
  for (const written of [
    "[data-surface='app']",
    '[data-surface="app"]',
    '[data-surface=app]',
    "[data-surface = 'app' ]",
  ])
    expect(written).toMatch(APP_SURFACE);
  expect("[data-surface='marketing']").not.toMatch(APP_SURFACE);
  expect('[data-shell]').not.toMatch(APP_SURFACE);
});
