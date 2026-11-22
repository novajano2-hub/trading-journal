// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TradeLink } from './cells';

afterEach(cleanup);

test('the trade link encodes an id that holds a slash', () => {
  render(<TradeLink id="acc:EUR/USD:f1">EUR/USD</TradeLink>);
  expect(screen.getByRole('link').getAttribute('href')).toBe(
    '/app/trades/acc%3AEUR%2FUSD%3Af1',
  );
});
