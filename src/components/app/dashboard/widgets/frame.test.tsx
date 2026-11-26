// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../../__fixtures__/render-app';
import { WidgetFrame } from './frame';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));

afterEach(cleanup);

test('a lower widget is a card: a heading, its info tip, the caption, its end and the body', async () => {
  renderApp(
    <WidgetFrame
      widgetKey="drawdown"
      title="Drawdown"
      caption="By trading day"
      tip="daily-drawdown"
      end={<button type="button">Do</button>}
    >
      <p>the body</p>
    </WidgetFrame>,
  );
  const card = await screen.findByRole('region', { name: 'Drawdown' });
  expect(card.getAttribute('data-widget')).toBe('drawdown');
  expect(
    within(card).getByRole('heading', { level: 2, name: 'Drawdown' }),
  ).toBeTruthy();
  const tip = within(card).getByRole('button', { name: 'About Drawdown' });
  expect(tip.dataset.metricTip).toBe('daily-drawdown');
  expect(card.textContent).toContain('By trading day');
  expect(within(card).getByRole('button', { name: 'Do' })).toBeTruthy();
  expect(within(card).getByText('the body')).toBeTruthy();
  expect(card.className).toContain('rounded-card');
  expect(card.getAttribute('aria-busy')).toBeNull();
});

test('an upper widget is a small card whose label is the info tip, with no heading', async () => {
  renderApp(
    <WidgetFrame
      widgetKey="net-pnl"
      title="Net P&L"
      tip="net-pnl"
      end={<span>1,226 trades</span>}
    >
      <span>figure</span>
    </WidgetFrame>,
  );
  const card = await screen.findByRole('region', { name: 'Net P&L' });
  expect(card.getAttribute('data-widget')).toBe('net-pnl');
  expect(within(card).queryByRole('heading')).toBeNull();
  const tip = within(card).getByRole('button', { name: 'Net P&L' });
  expect(tip.dataset.metricTip).toBe('net-pnl');
  expect(card.textContent).toContain('1,226 trades');
  expect(card.textContent).toContain('figure');
});

test('while it loads the card keeps its header and shows a skeleton instead of the body', async () => {
  renderApp(
    <WidgetFrame
      widgetKey="cum-pnl"
      title="Cumulative net P&L"
      tip="cumulative-pnl"
      state="loading"
    >
      <p>the body</p>
    </WidgetFrame>,
  );
  const card = await screen.findByRole('region', {
    name: 'Cumulative net P&L',
  });
  expect(card.getAttribute('aria-busy')).toBe('true');
  expect(within(card).queryByText('the body')).toBeNull();
  expect(card.textContent).not.toMatch(/\d/);
  expect(card.querySelector('[data-skeleton]')).toBeTruthy();
  expect(
    within(card).getByRole('button', { name: 'About Cumulative net P&L' }),
  ).toBeTruthy();
});

test('with no data it says so in its own words, in place of the body', async () => {
  renderApp(
    <WidgetFrame
      widgetKey="drawdown"
      title="Drawdown"
      tip="daily-drawdown"
      state="empty"
      empty="No closed trades in these filters."
    >
      <p>the body</p>
    </WidgetFrame>,
  );
  const card = await screen.findByRole('region', { name: 'Drawdown' });
  expect(card.textContent).toContain('No closed trades in these filters.');
  expect(within(card).queryByText('the body')).toBeNull();
  expect(card.getAttribute('aria-busy')).toBeNull();
});
