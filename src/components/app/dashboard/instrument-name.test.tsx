// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import { InstrumentName } from './shared';

afterEach(cleanup);

// Opened 2 Mar 2026, expiring 20 Nov 2026: the expiry is another day.
const option = () =>
  makeTrade({
    net: 100,
    instrument: resolveInstrument('TSLA261120P00370000')!,
  });

test('with the expiry shown it sits beside the name', () => {
  render(<InstrumentName trade={option()} />);
  expect(screen.getByTitle('TSLA261120P00370000').textContent).toBe(
    'TSLA 370 Putexpires 20 Nov',
  );
});

test('in a table cell the expiry leaves the cell and moves into the title with the full instrument', () => {
  const { container } = render(
    <InstrumentName trade={option()} showExpiry={false} />,
  );
  const name = screen.getByTitle('TSLA261120P00370000, expires 20 Nov');
  // The text a sighted reader gets is the name alone; a screen reader still hears the date.
  expect(container.querySelector('.truncate')).toBeNull();
  expect(name.textContent).toBe('TSLA 370 Putexpires 20 Nov');
  expect(container.querySelector('.sr-only:not(:has(*))')).not.toBeNull();
});
