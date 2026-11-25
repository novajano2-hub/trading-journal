import { expect, test } from 'vitest';
import { decodedSegment } from './route-param';

test('a segment is percent-decoded, and a malformed one is kept as it is', () => {
  expect(decodedSegment('2026-11-19')).toBe('2026-11-19');
  expect(decodedSegment('a%20b')).toBe('a b');
  expect(decodedSegment('%E0%A4%A')).toBe('%E0%A4%A');
});
