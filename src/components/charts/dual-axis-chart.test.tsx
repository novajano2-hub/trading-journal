// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../app/__fixtures__/render-app';
import { DualAxisChart, type DualSeries } from './dual-axis-chart';

vi.mock('next/navigation', () => import('../app/__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const XS = [0, 1, 2, 3];
const ticks = [
  { at: 0, text: 'Nov 2' },
  { at: 2, text: 'Nov 4' },
];
const axis = { lo: -0.5, hi: 3.5, ticks };

const bars: DualSeries = {
  key: 'day',
  label: 'Day net, left scale',
  kind: 'bars',
  axis: 'left',
  unit: 'money',
  tone: 'signed',
  values: [10_000, -4_000, 25_000, null],
};
const line: DualSeries = {
  key: 'run',
  label: 'Running total, right scale',
  kind: 'line',
  axis: 'right',
  unit: 'money',
  values: [10_000, 6_000, 31_000, 33_000],
};

const draw = (
  series: readonly DualSeries[] = [bars, line],
  extra: Partial<Parameters<typeof DualAxisChart>[0]> = {},
) =>
  renderApp(
    <DualAxisChart
      label="Daily and cumulative net P&L"
      xs={XS}
      pointLabel={(i) => `Day ${i + 1}`}
      xAxis={axis}
      series={series}
      {...extra}
    />,
  );

const chart = () =>
  screen.findByRole('img', { name: 'Daily and cumulative net P&L' });

test('the chart is an image with its label, and a hidden table holds every value', async () => {
  draw();
  const img = await chart();
  expect(img.getAttribute('tabindex')).toBe('0');
  const table = screen.getByRole('table', {
    name: 'Daily and cumulative net P&L',
  });
  expect(table.closest('.sr-only')).not.toBeNull();
  const rows = within(table).getAllByRole('row');
  // A header and a row a point.
  expect(rows).toHaveLength(5);
  expect(
    within(rows[0]!)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Point', 'Day net, left scale', 'Running total, right scale']);
  expect(within(rows[2]!).getByRole('rowheader').textContent).toBe('Day 2');
  expect(within(rows[2]!).getAllByRole('cell')[0]!.textContent).toBe('−$40.00');
  expect(within(rows[4]!).getAllByRole('cell')[0]!.textContent).toBe('None');
});

test('each series reads on its own scale: the left axis on the left, the right one beyond the plot', async () => {
  const { container } = draw();
  await chart();
  const side = (s: string) =>
    [...container.querySelectorAll(`[data-tick="${s}"]`)].map((t) => ({
      text: t.textContent,
      x: Number(t.getAttribute('x')),
      anchor: t.getAttribute('text-anchor'),
    }));
  const left = side('left');
  const right = side('right');
  expect(left.length).toBeGreaterThan(1);
  expect(right.length).toBeGreaterThan(1);
  expect(left.every((t) => t.anchor === 'end')).toBe(true);
  expect(right.every((t) => t.anchor === 'start')).toBe(true);
  // The two scales do not share their numbers: the line runs far past the bars.
  expect(Math.max(...left.map((t) => t.x))).toBeLessThan(
    Math.min(...right.map((t) => t.x)),
  );
  expect(left.map((t) => t.text).join()).not.toBe(
    right.map((t) => t.text).join(),
  );
});

test('with the zeros aligned both axes put $0 on one line', async () => {
  const { container } = draw([bars, line], { alignZero: true });
  await chart();
  const zero = (s: string) =>
    [...container.querySelectorAll(`[data-tick="${s}"]`)].find(
      (t) => t.textContent === '$0',
    );
  expect(zero('left')).toBeTruthy();
  expect(zero('right')).toBeTruthy();
  // The same line, to the pixel's rounding.
  expect(Number(zero('left')!.getAttribute('y'))).toBeCloseTo(
    Number(zero('right')!.getAttribute('y')),
    6,
  );
});

test('bars wear the gain and loss colours by sign, a gap is no bar, a line breaks at a gap', async () => {
  const gappy: DualSeries = { ...line, values: [1_000, null, 3_000, 4_000] };
  const { container } = draw([bars, gappy]);
  await chart();
  const fills = [...container.querySelectorAll('[data-mark="bar"]')].map((b) =>
    b.getAttribute('fill'),
  );
  expect(fills).toEqual([
    'var(--gain-fill)',
    'var(--loss-fill)',
    'var(--gain-fill)',
  ]);
  // One point, then two joined: a dot and a path.
  expect(container.querySelectorAll('[data-mark="line"] path')).toHaveLength(1);
  expect(container.querySelectorAll('[data-mark="line"] circle')).toHaveLength(
    1,
  );
});

test('a step line holds each value until the next point', async () => {
  const flows: DualSeries = {
    ...line,
    key: 'flows',
    kind: 'step',
    values: [0, 0, 5_000, 5_000],
  };
  const { container } = draw([flows]);
  await chart();
  const d = container
    .querySelector('[data-series="flows"] [data-mark="line"] path')!
    .getAttribute('d')!;
  expect(d).toMatch(/^M[\d.]+,[\d.]+( H[\d.]+ V[\d.]+)+/);
});

test('hovering reads the point nearest the pointer, every series at it', async () => {
  draw();
  const img = await chart();
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 720, height: 240 }) as DOMRect;
  const status = screen.getByRole('status');
  fireEvent.pointerMove(img, { clientX: 100000, clientY: 40 });
  expect(status.textContent).toContain('Day 4');
  expect(status.textContent).toContain('Running total, right scale');
  expect(status.textContent).toContain('+$330.00');
  // A series with no value there says None.
  expect(status.textContent).toContain('Day net, left scale');
  expect(status.textContent).toContain('None');
  fireEvent.pointerMove(img, { clientX: 0, clientY: 40 });
  expect(status.textContent).toContain('Day 1');
  expect(status.textContent).toContain('+$100.00');
  fireEvent.pointerLeave(img);
  expect(status.textContent).toBe('');
});

test('focus reads the first point; the arrows step, Home and End jump', async () => {
  draw();
  const img = await chart();
  const status = screen.getByRole('status');
  fireEvent.focus(img);
  expect(status.textContent).toContain('Day 1');
  fireEvent.keyDown(img, { key: 'ArrowRight' });
  expect(status.textContent).toContain('Day 2');
  fireEvent.keyDown(img, { key: 'End' });
  expect(status.textContent).toContain('Day 4');
  fireEvent.keyDown(img, { key: 'ArrowRight' });
  expect(status.textContent).toContain('Day 4');
  fireEvent.keyDown(img, { key: 'Home' });
  expect(status.textContent).toContain('Day 1');
});

test('a legend names each series with its key, and the note', async () => {
  const { container } = draw([bars, line], { note: 'Time of day in New York' });
  await chart();
  const legend = container.querySelector('ul[data-legend]')!;
  expect(
    [...legend.querySelectorAll('li')].map((li) => li.textContent),
  ).toEqual([
    'Day net, left scale',
    'Running total, right scale',
    'Time of day in New York',
  ]);
  // Net bars wear both of the pair; a line is a line.
  expect(legend.querySelectorAll('[data-swatch="signed"]')).toHaveLength(1);
  expect(legend.querySelectorAll('[data-swatch="line"]')).toHaveLength(1);
});

test('a card that names its one series can turn the legend off, and the note stays', async () => {
  const { container } = draw([line], {
    legend: false,
    note: 'Hours in New York',
  });
  await chart();
  expect(
    [...container.querySelectorAll('ul[data-legend] li')].map(
      (li) => li.textContent,
    ),
  ).toEqual(['Hours in New York']);
  cleanup();
  const bare = draw([line], { legend: false });
  await chart();
  expect(bare.container.querySelector('ul[data-legend]')).toBeNull();
  // The series is still in the table and the readout.
  expect(
    screen.getByRole('table', { name: 'Daily and cumulative net P&L' }),
  ).toBeTruthy();
});

test('a long run keeps its table to a sample that holds the first and the last point', async () => {
  const n = 500;
  const many: DualSeries = {
    ...line,
    values: Array.from({ length: n }, (_, i) => i * 100),
  };
  draw([many], {
    xs: Array.from({ length: n }, (_, i) => i),
    xAxis: { lo: -0.5, hi: n - 0.5, ticks: [] },
    pointLabel: (i) => `P${i}`,
  });
  await chart();
  const rows = within(
    screen.getByRole('table', { name: 'Daily and cumulative net P&L' }),
  ).getAllByRole('row');
  expect(rows.length).toBeLessThanOrEqual(122);
  expect(within(rows[1]!).getByRole('rowheader').textContent).toBe('P0');
  expect(
    within(rows[rows.length - 1]!).getByRole('rowheader').textContent,
  ).toBe(`P${n - 1}`);
});
