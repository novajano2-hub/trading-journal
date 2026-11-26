import { expect, test } from 'vitest';
import {
  fileIdOf,
  MAX_WIDTH,
  MIN_WIDTH,
  percentOf,
  refOf,
  widthOf,
} from './image-model';

test('a reference is keel-file: and the id, and only that is read back', () => {
  expect(refOf('f-1')).toBe('keel-file:f-1');
  expect(fileIdOf('keel-file:f-1')).toBe('f-1');
  // Nothing else is ever loaded: an address, a data URL, an empty id, a non-string.
  for (const src of [
    'https://example.com/a.png',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'keel-file:',
    '',
    null,
    undefined,
    7,
  ])
    expect(fileIdOf(src)).toBeUndefined();
});

test('a width is a whole percentage from 10 to 100, or none', () => {
  expect(MIN_WIDTH).toBe(10);
  expect(MAX_WIDTH).toBe(100);
  expect(widthOf(54.6)).toBe(55);
  expect(widthOf('40')).toBe(40);
  expect(widthOf(3)).toBe(10);
  expect(widthOf(400)).toBe(100);
  for (const v of [null, undefined, '', 'wide', NaN, Infinity])
    expect(widthOf(v)).toBeNull();
});

test('pixels become a percentage of the block, kept in range', () => {
  expect(percentOf(300, 600)).toBe(50);
  expect(percentOf(20, 600)).toBe(10);
  expect(percentOf(900, 600)).toBe(100);
  // A block with no width yet reads as full width, never NaN.
  expect(percentOf(300, 0)).toBe(100);
});
