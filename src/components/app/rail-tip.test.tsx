// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { RailTip, RailTips } from './rail-tip';

afterEach(cleanup);

function renderTip(control: React.ReactElement) {
  render(
    <RailTips>
      <RailTip label="Reports">{control}</RailTip>
    </RailTips>,
  );
}

test('the tip opens on keyboard focus and closes on blur', async () => {
  renderTip(<a href="#reports" aria-label="Reports" />);
  const link = screen.getByRole('link', { name: 'Reports' });
  act(() => link.focus());
  expect((await screen.findByRole('tooltip')).textContent).toBe('Reports');
  act(() => link.blur());
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

test('the tip is the control’s name, so it is not also its description (a screen reader would say it twice)', async () => {
  renderTip(<a href="#reports" aria-label="Reports" />);
  const link = screen.getByRole('link', { name: 'Reports' });
  act(() => link.focus());
  await screen.findByRole('tooltip');
  expect(link.hasAttribute('aria-describedby')).toBe(false);
  // The name stays, and the tip is still there for sight.
  expect(link.getAttribute('aria-label')).toBe('Reports');
});

test('a description the control already has is kept, while the tip is open and after', async () => {
  renderTip(
    <button type="button" aria-label="Reports" aria-describedby="hint">
      x
    </button>,
  );
  const button = screen.getByRole('button', { name: 'Reports' });
  expect(button.getAttribute('aria-describedby')).toBe('hint');
  act(() => button.focus());
  await screen.findByRole('tooltip');
  expect(button.getAttribute('aria-describedby')).toBe('hint');
  act(() => button.blur());
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  expect(button.getAttribute('aria-describedby')).toBe('hint');
});
