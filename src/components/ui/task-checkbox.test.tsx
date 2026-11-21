// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskCheckbox } from './task-checkbox';

afterEach(cleanup);

test('task checkbox is a real checkbox', () => {
  const onChange = vi.fn();
  render(
    <TaskCheckbox
      checked={false}
      onCheckedChange={onChange}
      aria-label="Kept the rule on ESZ5"
    />,
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Kept the rule on ESZ5' }),
  );
  expect(onChange).toHaveBeenCalledWith(true);
});

test('a visible label names the checkbox and clicking it toggles', () => {
  const onChange = vi.fn();
  render(
    <TaskCheckbox checked onCheckedChange={onChange}>
      Moved stop to breakeven
    </TaskCheckbox>,
  );
  const box = screen.getByRole('checkbox', {
    name: 'Moved stop to breakeven',
  }) as HTMLInputElement;
  expect(box.checked).toBe(true);
  fireEvent.click(screen.getByText('Moved stop to breakeven'));
  expect(onChange).toHaveBeenCalledWith(false);
});

test('disabled does not toggle', () => {
  const onChange = vi.fn();
  render(
    <TaskCheckbox
      checked={false}
      onCheckedChange={onChange}
      disabled
      aria-label="x"
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'x' }));
  expect(onChange).not.toHaveBeenCalled();
});

test('the ripple plays on checking, never on mount', () => {
  const { container, rerender } = render(
    <TaskCheckbox checked onCheckedChange={() => {}} aria-label="kept" />,
  );
  expect(container.querySelector('[data-ripple]')).toBeNull();
  rerender(
    <TaskCheckbox
      checked={false}
      onCheckedChange={() => {}}
      aria-label="kept"
    />,
  );
  expect(container.querySelector('[data-ripple]')).toBeNull();
  rerender(
    <TaskCheckbox checked onCheckedChange={() => {}} aria-label="kept" />,
  );
  expect(container.querySelector('[data-ripple]')).not.toBeNull();
});
