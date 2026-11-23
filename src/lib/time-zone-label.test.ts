import { expect, test } from 'vitest';
import { offsetLabel, zoneLabel } from './time-zone-label';

// A winter day and a summer day, so a zone with daylight time gives both offsets.
const WINTER = new Date('2026-01-15T12:00:00Z');
const SUMMER = new Date('2026-07-15T12:00:00Z');

test('an IANA name reads as a city and its offset', () => {
  expect(zoneLabel('Africa/Addis_Ababa', WINTER)).toBe(
    'Addis Ababa, UTC+03:00',
  );
  expect(zoneLabel('America/Chicago', WINTER)).toBe('Chicago, UTC-06:00');
  expect(zoneLabel('Asia/Kolkata', WINTER)).toBe('Kolkata, UTC+05:30');
});

test('the offset follows daylight time, and a deep path keeps its last city', () => {
  expect(zoneLabel('America/Chicago', SUMMER)).toBe('Chicago, UTC-05:00');
  expect(zoneLabel('America/Argentina/Buenos_Aires', WINTER)).toBe(
    'Buenos Aires, UTC-03:00',
  );
});

test('a zone without a city is its offset alone; an unknown name stays as typed', () => {
  expect(zoneLabel('UTC', WINTER)).toBe('UTC');
  expect(zoneLabel('Etc/GMT+5', WINTER)).toBe('UTC-05:00');
  expect(zoneLabel('Mars/Olympus', WINTER)).toBe('Mars/Olympus');
  expect(offsetLabel('Mars/Olympus')).toBe('');
});

test('no label carries a raw underscore or slash', () => {
  for (const z of [
    'Africa/Addis_Ababa',
    'America/New_York',
    'Asia/Ho_Chi_Minh',
  ])
    expect(zoneLabel(z, WINTER)).not.toMatch(/[_/]/);
});
