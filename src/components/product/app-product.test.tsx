import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatTicker } from './number-ticker';
import { Sparkline } from './sparkline';

test('formatTicker takes digits for pct and a currency for money', () => {
  expect(formatTicker('pct', 0.91, { digits: 0 })).toBe('91%');
  expect(formatTicker('pct', 0.912)).toBe('91.2%');
  expect(formatTicker('adherence', 199 / 200)).toBe('99.5%');
  expect(formatTicker('money', 1250, { currency: 'EUR' })).toBe('+€12.50');
  expect(formatTicker('money', 1250)).toBe('+$12.50');
});

test('Sparkline is a labelled image with an equity path', () => {
  const html = renderToStaticMarkup(<Sparkline series={[1, 3, 2]} label="Equity" />);
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Equity"');
  expect(html).toMatch(/d="M0 /);
});

test('Sparkline with no points renders nothing', () => {
  expect(renderToStaticMarkup(<Sparkline series={[]} label="Equity" />)).toBe('');
});
