// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { lastLogView, rememberLogView } from './log-view';

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

test('the last view is All until one is remembered', () => {
  expect(lastLogView()).toBe('all');
  rememberLogView('week');
  expect(lastLogView()).toBe('week');
  rememberLogView('day');
  expect(lastLogView()).toBe('day');
  rememberLogView('all');
  expect(lastLogView()).toBe('all');
});

test('blocked storage falls back to All and never throws', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => rememberLogView('day')).not.toThrow();
  expect(lastLogView()).toBe('all');
});
