import { expect, test } from 'vitest';
import { BUTTON_SIZE, RAISED, buttonClasses } from './button-styles';

test('md is the top bar Import size: 34px, 13.5px, weight 600, 44px only on touch', () => {
  expect(BUTTON_SIZE.md).toContain('h-[34px]');
  expect(BUTTON_SIZE.md).toContain('text-[13.5px]');
  expect(BUTTON_SIZE.md).toContain('font-semibold');
  expect(BUTTON_SIZE.md).toContain('pointer-coarse:h-11');
  expect(BUTTON_SIZE.md).not.toMatch(/(^| )h-11/);
});

test('every variant at md shares one size; the primary is the raised accent', () => {
  const size = (c: string) => c.match(/h-\[34px\]/g)?.length;
  for (const v of ['primary', 'secondary', 'ghost'] as const)
    expect(size(buttonClasses(v))).toBe(1);
  expect(buttonClasses('primary')).toBe(buttonClasses('primary', 'md'));
  expect(buttonClasses('primary')).toContain(RAISED);
  expect(buttonClasses('secondary')).not.toContain(RAISED);
});
