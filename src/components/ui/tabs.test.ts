import { describe, expect, test } from 'vitest';
import { nextTabIndex, panelId, tabId } from './tabs';

describe('tabs keyboard model', () => {
  test('arrows move one step and wrap at both ends', () => {
    expect(nextTabIndex('ArrowRight', 0, 5)).toBe(1);
    expect(nextTabIndex('ArrowRight', 4, 5)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 5)).toBe(4);
    expect(nextTabIndex('ArrowLeft', 3, 5)).toBe(2);
  });

  test('Home and End jump to the ends', () => {
    expect(nextTabIndex('Home', 3, 5)).toBe(0);
    expect(nextTabIndex('End', 1, 5)).toBe(4);
  });

  test('other keys are left to the browser', () => {
    expect(nextTabIndex('ArrowDown', 1, 5)).toBeNull();
    expect(nextTabIndex('Enter', 1, 5)).toBeNull();
    expect(nextTabIndex('a', 1, 5)).toBeNull();
  });

  test('ids tie each tab to the shared panel', () => {
    expect(tabId('reports', 'session')).toBe('reports-tab-session');
    expect(panelId('reports')).toBe('reports-panel');
  });
});
