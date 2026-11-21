// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ModulePlaceholder } from './module-placeholder';
import { SidebarNav } from './sidebar';

afterEach(cleanup);

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

test('the current, other and not-live modules each have their own tile', () => {
  render(
    <SidebarNav pathname="/app/dashboard" params={new URLSearchParams()} />,
  );
  const tile = (name: string) =>
    screen
      .getByRole('link', { name })
      .querySelector<HTMLElement>('[aria-hidden="true"]')!;
  const current = tile('Dashboard');
  const other = tile('Trades');
  const notLive = tile('Replay');
  // Filled cobalt-soft; bare with a cobalt duotone layer; a bare faint outline.
  expect(current.dataset.tone).toBe('accent');
  expect(current.className).toContain('bg-accent-soft');
  expect(other.dataset.tone).toBe('neutral');
  expect(other.className).not.toMatch(/(^|\s)bg-/);
  expect(other.className).toContain('[&_[opacity]]:fill-accent');
  expect(notLive.dataset.tone).toBe('faint');
  expect(notLive.className).not.toMatch(/(^|\s)bg-/);
  expect(notLive.className).toContain('[&_[opacity]]:opacity-0');
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
