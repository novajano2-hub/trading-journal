// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { RADAR, RadarChart, type RadarAxis } from './radar-chart';

const { cx: CX, cy: CY, radius: R } = RADAR;

afterEach(cleanup);

const AXES: RadarAxis[] = [
  { key: 'win', label: 'Win rate', value: 100, text: '81.2 of 100. Wins.' },
  { key: 'pf', label: 'Profit factor', value: 50, text: '38.3 of 100. Ratio.' },
  { key: 'wl', label: 'Win to loss', value: 25, text: '40.7 of 100. Ratio.' },
  { key: 'rec', label: 'Recovery', value: 0, text: '0 of 100. Nothing.' },
  { key: 'dd', label: 'Drawdown', value: 75, text: '69.7 of 100. Share.' },
  { key: 'con', label: 'Consistency', value: 90, text: '98.9 of 100. Spread.' },
];

const chart = () =>
  render(
    <RadarChart axes={AXES} label="Six parts of the score" caption="Parts" />,
  );

test('six axes clockwise from the top, five rings, each part at its own value', () => {
  const { container } = chart();
  expect(container.querySelectorAll('[data-ring]')).toHaveLength(5);
  expect(container.querySelectorAll('[data-spoke]')).toHaveLength(6);
  const at = (key: string) => {
    const dot = container.querySelector<SVGCircleElement>(
      `[data-axis="${key}"]`,
    )!;
    return [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))];
  };
  // The first axis is straight up; value 100 reaches the outer ring (radius 86 around 150, 130).
  expect(at('win')[0]).toBeCloseTo(CX, 5);
  expect(at('win')[1]).toBeCloseTo(CY - R, 5);
  // The second is 60 degrees round, to the right: half way out is 43.
  expect(at('pf')[0]).toBeCloseTo(CX + (R / 2) * Math.cos(-Math.PI / 6), 5);
  expect(at('pf')[1]).toBeCloseTo(CY + (R / 2) * Math.sin(-Math.PI / 6), 5);
  // Third at 30 degrees below the right, fourth straight down, then left.
  expect(at('wl')[1]).toBeCloseTo(CY + (R / 4) * Math.sin(Math.PI / 6), 5);
  expect(at('rec')[0]).toBeCloseTo(CX, 5);
  expect(at('rec')[1]).toBeCloseTo(CY, 5);
  expect(at('dd')[0]).toBeLessThan(CX);
  expect(at('con')[0]).toBeLessThan(CX);
  expect(at('con')[1]).toBeLessThan(CY);
});

test('draws the part names and no axis values', () => {
  const { container } = chart();
  const words = [...container.querySelectorAll('svg text')].map(
    (t) => t.textContent,
  );
  expect(words).toEqual(AXES.map((a) => a.label));
  // Nothing numeric is drawn: the readout and the table carry the values.
  expect(container.querySelector('svg')!.textContent).not.toMatch(/\d/);
});

test('the chart is an image with its label; a hidden table holds the parts', () => {
  const { container } = chart();
  const img = screen.getByRole('img', { name: 'Six parts of the score' });
  expect(img.getAttribute('tabindex')).toBe('0');
  const table = screen.getByRole('table', { name: 'Parts' });
  expect(table.closest('.sr-only')).not.toBeNull();
  const rows = within(table).getAllByRole('row');
  expect(rows).toHaveLength(6);
  expect(within(rows[0]!).getByRole('rowheader').textContent).toBe('Win rate');
  expect(within(rows[3]!).getByRole('cell').textContent).toBe(
    '0 of 100. Nothing.',
  );
  expect(container.querySelector('[role="status"]')!.textContent).toBe('');
});

test('focus reads the first part, the arrows step round and wrap, Home and End jump', () => {
  chart();
  const img = screen.getByRole('img', { name: 'Six parts of the score' });
  const status = () => screen.getByRole('status').textContent;
  fireEvent.focus(img);
  expect(status()).toContain('Win rate');
  expect(status()).toContain('81.2 of 100. Wins.');
  fireEvent.keyDown(img, { key: 'ArrowRight' });
  expect(status()).toContain('Profit factor');
  fireEvent.keyDown(img, { key: 'ArrowLeft' });
  fireEvent.keyDown(img, { key: 'ArrowLeft' });
  expect(status()).toContain('Consistency');
  fireEvent.keyDown(img, { key: 'Home' });
  expect(status()).toContain('Win rate');
  fireEvent.keyDown(img, { key: 'End' });
  expect(status()).toContain('Consistency');
  fireEvent.blur(img);
  expect(status()).toBe('');
});

test('hovering reads the part in the direction of the pointer', () => {
  const { container } = chart();
  const svg = container.querySelector('svg')!;
  // The drawing's own units, drawn at one pixel each from the page's corner.
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: RADAR.width, height: RADAR.height }) as DOMRect;
  const status = () => screen.getByRole('status').textContent;
  // Straight below the centre: the fourth part.
  fireEvent.pointerMove(svg, { clientX: CX, clientY: CY + 75 });
  expect(status()).toContain('Recovery');
  // Up and to the right, at 60 degrees from the top: the second.
  fireEvent.pointerMove(svg, { clientX: CX + 60, clientY: CY - 35 });
  expect(status()).toContain('Profit factor');
  fireEvent.pointerLeave(svg);
  expect(status()).toBe('');
});

test('values past the ends are drawn at the ends', () => {
  const { container } = render(
    <RadarChart
      axes={AXES.map((a, i) => ({ ...a, value: i === 0 ? 180 : -20 }))}
      label="x"
      caption="Parts"
    />,
  );
  const top = container.querySelector<SVGCircleElement>('[data-axis="win"]')!;
  expect(Number(top.getAttribute('cy'))).toBeCloseTo(CY - R, 5);
  const low = container.querySelector<SVGCircleElement>('[data-axis="rec"]')!;
  expect(Number(low.getAttribute('cy'))).toBeCloseTo(CY, 5);
});
