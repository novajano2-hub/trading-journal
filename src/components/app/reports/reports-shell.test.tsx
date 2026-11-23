// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { reportsSample } from '../__fixtures__/reports-sample';
import { isReportKey, REPORT_KEYS } from './report-keys';
import { ReportsPage } from './reports-shell';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const tabs = () => within(screen.getByRole('navigation', { name: 'Reports' }));

test('the tabs are Overview, Performance, Reports, Compare and Calendar, and carry the filters', async () => {
  renderApp(<ReportsPage report="overview" />, {
    sample: reportsSample,
    url: '/app/reports?side=long',
  });
  const nav = await screen.findByRole('navigation', { name: 'Reports' });
  const links = within(nav).getAllByRole('link');
  expect(links.map((l) => l.textContent)).toEqual([
    'Overview',
    'Performance',
    'Compare',
    'Calendar',
  ]);
  expect(within(nav).getByRole('button', { name: 'Reports' })).toBeTruthy();
  expect(
    within(nav)
      .getByRole('link', { name: 'Overview' })
      .getAttribute('aria-current'),
  ).toBe('page');
  expect(
    within(nav).getByRole('link', { name: 'Performance' }).getAttribute('href'),
  ).toBe('/app/reports/performance?side=long');
});

test('the Reports tab stays current while one of its reports is open, and its menu lists them all', async () => {
  renderApp(<ReportsPage report="symbols" />, {
    sample: reportsSample,
    url: '/app/reports/symbols',
  });
  const trigger = await tabs().findByRole('button', {
    name: 'Reports: Symbols',
  });
  expect(trigger.getAttribute('aria-current')).toBe('page');
  expect(
    tabs()
      .queryByRole('link', { name: 'Overview' })!
      .getAttribute('aria-current'),
  ).toBeNull();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const items = (await screen.findAllByRole('menuitem')).map(
    (i) => i.textContent,
  );
  expect(items).toEqual([
    'Day & time',
    'Symbols',
    'Risk',
    'Strategies',
    'Tags',
    'Options',
    'Wins vs losses',
  ]);
  // The page behind is the Symbols report itself.
  expect(await screen.findByTestId('reports-symbols')).toBeTruthy();
});

test('only the known report keys are reports', () => {
  expect(REPORT_KEYS).toHaveLength(10);
  expect(isReportKey('performance')).toBe(true);
  expect(isReportKey('overview')).toBe(false);
  expect(isReportKey('nope')).toBe(false);
});

test('the Compare link seeds Group A with the current filters and drops the global ones', async () => {
  renderApp(<ReportsPage report="overview" />, {
    sample: reportsSample,
    url: '/app/reports?side=long&symbol=ES&cur=EUR',
  });
  const nav = await screen.findByRole('navigation', { name: 'Reports' });
  const href = within(nav)
    .getByRole('link', { name: 'Compare' })
    .getAttribute('href')!;
  const url = new URL(href, 'http://keel.test');
  expect(url.pathname).toBe('/app/reports/compare');
  expect(new URLSearchParams(url.searchParams.get('a')!).toString()).toBe(
    'symbol=ES&side=long',
  );
  expect(url.searchParams.get('side')).toBeNull();
  expect(url.searchParams.get('symbol')).toBeNull();
  expect(url.searchParams.get('cur')).toBe('EUR');
});

test('on Compare its own link keeps both groups', async () => {
  renderApp(<ReportsPage report="compare" />, {
    sample: reportsSample,
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  const nav = await screen.findByRole('navigation', { name: 'Reports' });
  const url = new URL(
    within(nav).getByRole('link', { name: 'Compare' }).getAttribute('href')!,
    'http://keel.test',
  );
  expect(url.searchParams.get('a')).toBe('symbol=ES');
  expect(url.searchParams.get('b')).toBe('symbol=NQ');
});
