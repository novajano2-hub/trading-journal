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
