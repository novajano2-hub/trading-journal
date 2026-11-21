// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MetricTip } from './metric-tip';

afterEach(cleanup);

test('the label is a button that shows its definition on focus and hides on Escape', async () => {
  render(<MetricTip id="win-rate" basis="net" />);
  const trigger = screen.getByRole('button', { name: 'Win rate' });
  expect(trigger.dataset.metricTip).toBe('win-rate');
  fireEvent.focus(trigger);
  expect((await screen.findByRole('tooltip')).textContent).toContain('Breakeven trades');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

test('a click toggles the definition for touch', async () => {
  render(<MetricTip id="pnl" basis="gross">Total</MetricTip>);
  const trigger = screen.getByRole('button', { name: 'Total' });
  fireEvent.click(trigger);
  expect((await screen.findByRole('tooltip')).textContent).toContain('gross P&L');
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

test('with a mouse, hover opens the tip and a click does not flip it back open', async () => {
  render(<MetricTip id="win-rate" basis="net" />);
  const trigger = screen.getByRole('button', { name: 'Win rate' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  expect(await screen.findByRole('tooltip')).toBeTruthy();
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});
