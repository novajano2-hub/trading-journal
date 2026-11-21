// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { commitNavigation } from './__fixtures__/navigation';
import { ModulePlaceholder } from './module-placeholder';
import { Sidebar, SidebarNav } from './sidebar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

/** On a page whose URL carries filters and a param of its own. */
function at(url: string): void {
  window.history.replaceState(null, '', url);
  commitNavigation();
}

test('the active module is marked and filter-scoped links keep the filters', () => {
  render(
    <SidebarNav
      pathname="/app/dashboard"
      params={new URLSearchParams('side=short')}
    />,
  );
  const dashboard = screen.getByRole('link', { name: 'Dashboard' });
  expect(dashboard.getAttribute('aria-current')).toBe('page');
  expect(dashboard.getAttribute('href')).toBe('/app/dashboard?side=short');
  expect(
    screen.getByRole('link', { name: 'Trades' }).hasAttribute('aria-current'),
  ).toBe(false);
});

test('the current, other and not-live modules each have their own look', () => {
  render(
    <SidebarNav pathname="/app/dashboard" params={new URLSearchParams()} />,
  );
  const link = (name: string) => screen.getByRole('link', { name });
  const glyph = (name: string) =>
    link(name).querySelector<SVGElement>('svg[aria-hidden="true"]')!;
  // A white pill with a duotone accent glyph; bare in regular weight; faded.
  expect(link('Dashboard').className).toContain('bg-surface-1');
  expect(glyph('Dashboard').getAttribute('data-look')).toBe('current');
  expect(glyph('Dashboard').getAttribute('class')).toContain('text-accent-ink');
  expect(glyph('Dashboard').querySelector('[opacity]')).not.toBeNull();
  expect(link('Trades').className).not.toMatch(/(^|\s)bg-/);
  expect(glyph('Trades').getAttribute('data-look')).toBe('module');
  expect(glyph('Trades').querySelector('[opacity]')).toBeNull();
  expect(link('Replay').className).not.toMatch(/(^|\s)bg-/);
  expect(glyph('Replay').getAttribute('data-look')).toBe('not-live');
  expect(glyph('Replay').getAttribute('class')).toContain('opacity-70');
});

test('"Not live yet" is its own labelled list of four links', () => {
  render(
    <SidebarNav pathname="/app/dashboard" params={new URLSearchParams()} />,
  );
  const notLive = screen.getByRole('list', { name: 'Not live yet' });
  expect(within(notLive).getAllByRole('link')).toHaveLength(4);
});

test('a placeholder says the module is not built, with no figures', () => {
  const { container } = render(<ModulePlaceholder module="trades" />);
  const text = container.textContent ?? '';
  expect(text).toContain("Trades isn't built yet.");
  expect(text).not.toContain('$');
  expect(text).not.toMatch(/\d/);
});

test('the wordmark goes to the Dashboard with the filters', () => {
  at('/app/trades?side=short&by=pnl');
  render(<Sidebar />);
  expect(screen.getByRole('link', { name: 'Keel' }).getAttribute('href')).toBe(
    '/app/dashboard?side=short',
  );
});

test("a placeholder's way back keeps the filters", () => {
  at('/app/calendar?range=last-week&symbol=ES');
  render(<ModulePlaceholder module="calendar" />);
  expect(
    screen
      .getByRole('link', { name: 'Back to the Dashboard' })
      .getAttribute('href'),
  ).toBe('/app/dashboard?range=last-week&symbol=ES');
});
