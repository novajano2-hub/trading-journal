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
  const trigger = await tabs().findByRole('button', { name: 'Symbols' });
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
  // The page behind says so plainly and shows no figures.
  expect(screen.getByText('This report arrives next')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\$\d/);
});

test('only the known report keys are reports', () => {
  expect(REPORT_KEYS).toHaveLength(10);
  expect(isReportKey('performance')).toBe(true);
  expect(isReportKey('overview')).toBe(false);
  expect(isReportKey('nope')).toBe(false);
});
