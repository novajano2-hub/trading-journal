// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { ReportChart } from './report-chart';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const SERIES = [
  {
    label: 'Net P&L',
    kind: 'bar' as const,
    unit: 'money' as const,
    points: [
      { key: '2026-11-02', value: 10000 },
      { key: '2026-11-03', value: -4000 },
      { key: '2026-11-04', value: 2500 },
    ],
  },
  {
    label: 'Win rate',
    kind: 'line' as const,
    unit: 'pct' as const,
    points: [
      { key: '2026-11-02', value: 0.5 },
      { key: '2026-11-03', value: null },
      { key: '2026-11-04', value: 1 },
    ],
  },
];

test('the chart is an image with its label, and a hidden table holds the values', async () => {
  const { container } = renderApp(
    <ReportChart label="Net P&L and win rate by day" series={SERIES} />,
  );
  const chart = await screen.findByRole('img', {
    name: 'Net P&L and win rate by day',
  });
  expect(chart.getAttribute('tabindex')).toBe('0');
  const table = screen.getByRole('table', {
    name: 'Net P&L and win rate by day',
  });
  // The clip sits on a box around the table: overflow does nothing on a table,
  // so a clipped table would still stretch the page's scroll height.
  expect(table.parentElement!.classList.contains('sr-only')).toBe(true);
  expect(table.classList.contains('sr-only')).toBe(false);
  const rows = within(table).getAllByRole('row');
  expect(rows).toHaveLength(4);
  expect(rows[1]!.textContent).toContain('Mon 2 Nov');
  expect(rows[1]!.textContent).toContain('+$100.00');
  expect(rows[2]!.textContent).toContain('−$40.00');
  expect(rows[2]!.textContent).toContain('None');
  // Both kinds of mark are drawn: three bars and a line.
  expect(container.querySelectorAll('[data-mark="bar"]')).toHaveLength(3);
  expect(container.querySelectorAll('[data-mark="line"]')).toHaveLength(1);
});

test('focusing the chart and pressing the right arrow reads out the second period', async () => {
  renderApp(<ReportChart label="By day" series={SERIES} />);
  const chart = await screen.findByRole('img', { name: 'By day' });
  // The live region is always there, so a screen reader announces its changes.
  expect(screen.getByRole('status').textContent).toBe('');
  act(() => chart.focus());
  expect(screen.getByRole('status').textContent).toContain('Mon 2 Nov');
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  const readout = screen.getByRole('status');
  expect(readout.textContent).toContain('Tue 3 Nov');
  expect(readout.textContent).toContain('−$40.00');
  expect(readout.textContent).toContain('Win rate');
  fireEvent.keyDown(chart, { key: 'ArrowLeft' });
  expect(screen.getByRole('status').textContent).toContain('Mon 2 Nov');
  fireEvent.keyDown(chart, { key: 'End' });
  expect(screen.getByRole('status').textContent).toContain('Wed 4 Nov');
  fireEvent.blur(chart);
  expect(screen.getByRole('status').textContent).toBe('');
});

test('a tap reads out the tapped period and keeps it after the pointer leaves', async () => {
  renderApp(<ReportChart label="By day" series={SERIES} />);
  const chart = await screen.findByRole('img', { name: 'By day' });
  // Far right of the plot: the third of three periods.
  fireEvent.pointerDown(chart, { clientX: 700, clientY: 20 });
  act(() => chart.focus());
  expect(screen.getByRole('status').textContent).toContain('Wed 4 Nov');
  fireEvent.pointerLeave(chart);
  expect(screen.getByRole('status').textContent).toContain('Wed 4 Nov');
  // The keyboard continues from the tapped period.
  fireEvent.keyDown(chart, { key: 'ArrowLeft' });
  expect(screen.getByRole('status').textContent).toContain('Tue 3 Nov');
});

test('net bars take gain and loss colours when net is the only money series', async () => {
  const { container } = renderApp(
    <ReportChart label="By day" series={SERIES} />,
  );
  await screen.findByRole('img', { name: 'By day' });
  const fills = [...container.querySelectorAll('[data-mark="bar"]')].map((b) =>
    b.getAttribute('fill'),
  );
  expect(fills).toEqual([
    'var(--gain-fill)',
    'var(--loss-fill)',
    'var(--gain-fill)',
  ]);
});

test('with Privacy on, the readout, the axis and the hidden table show $•••', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(
    <ReportChart label="By day" series={SERIES} />,
    {
      repository,
    },
  );
  const chart = await screen.findByRole('img', { name: 'By day' });
  act(() => chart.focus());
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('$•••'),
  );
  expect(container.textContent).not.toMatch(/\$\d/);
  expect(container.textContent).not.toMatch(/\$[\d,]+[kK]/);
});

test('with Privacy on, a profit factor series hides its readout, axis and table, and a Sharpe series does not', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const points = [
    { key: '2026-11-02', value: 1.5 },
    { key: '2026-11-03', value: 2.25 },
  ];
  const { container } = renderApp(
    <ReportChart
      label="Ratios"
      series={[
        {
          label: 'Profit factor',
          kind: 'line' as const,
          unit: 'moneyratio' as const,
          points,
        },
      ]}
    />,
    { repository },
  );
  const chart = await screen.findByRole('img', { name: 'Ratios' });
  act(() => chart.focus());
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('hidden ratio'),
  );
  expect(container.textContent).not.toMatch(/\d\.\d\d/);
  expect(container.textContent).not.toContain('2.25');
});

test('named periods label the axis with their own words instead of dates', async () => {
  const { container } = renderApp(
    <ReportChart
      label="Net P&L by weekday"
      xLabel={(k) => k.toUpperCase()}
      series={[
        {
          label: 'Net P&L',
          kind: 'bar',
          unit: 'money',
          points: [
            { key: 'mon', value: 100 },
            { key: 'tue', value: -50 },
          ],
        },
      ]}
    />,
  );
  await screen.findByRole('img', { name: 'Net P&L by weekday' });
  const axis = [...container.querySelectorAll('svg text')].map(
    (t) => t.textContent,
  );
  expect(axis).toContain('MON');
  expect(axis).toContain('TUE');
});

test('overlaid series share one axis, and a shade marks a stretch of it', async () => {
  const line = (label: string, values: number[]) => ({
    label,
    kind: 'line' as const,
    unit: 'money' as const,
    points: values.map((v, i) => ({ key: `2026-11-0${i + 2}`, value: v })),
  });
  const { container } = renderApp(
    <ReportChart
      label="Two lines"
      overlay
      series={[line('A', [0, 500, 300]), line('B', [0, -200, 100])]}
      shade={{
        name: 'drawdown',
        from: '2026-11-03',
        to: '2026-11-04',
        label: 'Max drawdown',
      }}
    />,
  );
  await screen.findByRole('img', { name: 'Two lines' });
  expect(container.querySelectorAll('[data-mark="line"]')).toHaveLength(2);
  // One set of y ticks, not one per series: $0 appears once.
  const zeros = [...container.querySelectorAll('svg text')].filter(
    (t) => t.textContent === '$0',
  );
  expect(zeros).toHaveLength(1);
  const band = container.querySelector('[data-band="drawdown"]');
  expect(band).not.toBeNull();
  expect(band!.textContent).toBe('Max drawdown');
});

const SYMBOLS = Array.from({ length: 20 }, (_, i) => `SYM${i}`);
const BY_SYMBOL = [
  {
    label: 'Net P&L',
    kind: 'bar' as const,
    unit: 'money' as const,
    points: SYMBOLS.map((key, i) => ({ key, value: (i % 2 ? -1 : 1) * 1000 })),
  },
  {
    label: 'Win rate',
    kind: 'dots' as const,
    unit: 'pct' as const,
    points: SYMBOLS.map((key, i) => ({ key, value: 0.4 + (i % 5) / 20 })),
    counts: SYMBOLS.map((_, i) => (i === 0 ? 200 : 10)),
  },
];

test('the legend pairs gain and loss for net bars, and a dot for the win-rate markers', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By symbol"
      xLabel={(k) => k}
      tiltLabels
      series={BY_SYMBOL}
    />,
  );
  await screen.findByRole('img', { name: 'By symbol' });
  const [net, win] = [...container.querySelectorAll('ul > li')];
  expect(
    [...net!.querySelectorAll('[data-swatch]')].map((s) =>
      s.getAttribute('data-swatch'),
    ),
  ).toEqual(['gain', 'loss']);
  expect(win!.querySelectorAll('[data-swatch="dot"]')).toHaveLength(1);
});

test('a dots series draws a marker per value and no line, sized and faded by its counts', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By symbol"
      xLabel={(k) => k}
      tiltLabels
      series={BY_SYMBOL}
    />,
  );
  await screen.findByRole('img', { name: 'By symbol' });
  expect(container.querySelectorAll('[data-mark="line"]')).toHaveLength(0);
  const dots = [...container.querySelectorAll('[data-mark="dot"]')];
  expect(dots).toHaveLength(20);
  const [big, small] = [dots[0]!, dots[1]!];
  expect(Number(big.getAttribute('r'))).toBeGreaterThan(
    Number(small.getAttribute('r')),
  );
  expect(Number(big.getAttribute('fill-opacity'))).toBeGreaterThan(
    Number(small.getAttribute('fill-opacity')),
  );
});

test('with rowRatio the later bands are that share of the first band', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By symbol"
      xLabel={(k) => k}
      height={200}
      rowRatio={0.4}
      series={BY_SYMBOL}
    />,
  );
  await screen.findByRole('img', { name: 'By symbol' });
  const heights = [...container.querySelectorAll('[data-series]')].map((g) =>
    Number(g.getAttribute('data-band-height')),
  );
  expect(heights).toEqual([200, 80]);
});

test('every named bar is labelled: the labels tilt when they would collide flat', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By symbol"
      xLabel={(k) => k}
      tiltLabels
      series={BY_SYMBOL}
    />,
  );
  await screen.findByRole('img', { name: 'By symbol' });
  const labels = [...container.querySelectorAll('[data-axis-label]')];
  expect(labels.map((l) => l.textContent)).toEqual(SYMBOLS);
  expect(labels[0]!.getAttribute('transform')).toContain('rotate(-45');
});

const LONG = [
  'Switched sides, green',
  'Switched sides, red',
  'Quick re-entries after a loss',
  'Held longer than usual',
  'Low return for the effort',
  'Losses outweighed wins',
  'Added to the position',
  'More trades than usual',
  'Busier than a green day',
  'Sized up after wins',
  'Exited in parts',
  'Large size',
];
const LONG_SERIES = [
  {
    label: 'Net P&L',
    kind: 'bar' as const,
    unit: 'money' as const,
    points: LONG.map((key, i) => ({ key, value: (i % 2 ? -1 : 1) * 1000 })),
  },
];

test('long names are cut to fourteen characters on the tilted axis, so two that share a start look alike', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By pattern"
      xLabel={(k) => k}
      tiltLabels
      series={LONG_SERIES}
    />,
  );
  await screen.findByRole('img', { name: 'By pattern' });
  const labels = [...container.querySelectorAll('[data-axis-label]')].map(
    (l) => l.textContent,
  );
  expect(labels.slice(0, 2)).toEqual(['Switched side…', 'Switched side…']);
});

test('tiltMaxChars lets a name run longer, so every bar keeps a label of its own', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By pattern"
      xLabel={(k) => k}
      tiltLabels
      tiltMaxChars={30}
      series={LONG_SERIES}
    />,
  );
  await screen.findByRole('img', { name: 'By pattern' });
  const labels = [...container.querySelectorAll('[data-axis-label]')].map(
    (l) => l.textContent,
  );
  expect(labels).toEqual(LONG);
  expect(new Set(labels).size).toBe(LONG.length);
});

test('a tilted first label shows whole: the plot starts far enough in that its name stays inside the chart', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By pattern"
      xLabel={(k) => k}
      tiltLabels
      tiltMaxChars={30}
      series={LONG_SERIES}
    />,
  );
  await screen.findByRole('img', { name: 'By pattern' });
  const [first] = [...container.querySelectorAll('[data-axis-label]')];
  expect(first!.getAttribute('transform')).toContain('rotate(-45');
  // Anchored at its end under the bar, the label runs down to the left: its
  // characters at 10.5px (about 6.6px each) over the 45 degree slant.
  const reach = first!.textContent!.length * 6.6 * Math.SQRT1_2;
  expect(Number(first!.getAttribute('x')) - reach).toBeGreaterThanOrEqual(0);
});

test('few bars keep flat labels', async () => {
  const { container } = renderApp(
    <ReportChart
      label="By weekday"
      xLabel={(k) => k.toUpperCase()}
      series={[
        {
          label: 'Net P&L',
          kind: 'bar',
          unit: 'money',
          points: ['mon', 'tue', 'wed'].map((key) => ({ key, value: 5 })),
        },
      ]}
    />,
  );
  await screen.findByRole('img', { name: 'By weekday' });
  const labels = [...container.querySelectorAll('[data-axis-label]')];
  expect(labels).toHaveLength(3);
  expect(labels[0]!.getAttribute('transform')).toBeNull();
});

const svgHeight = (root: HTMLElement) =>
  Number(root.querySelector('svg')!.getAttribute('height'));

test('Expand opens the chart full screen, taller; Escape closes it and focus returns', async () => {
  const { container } = renderApp(
    <ReportChart
      label="Net P&L by day, all time. Net P&L runs from $1 to $2."
      series={[SERIES[0]!]}
    />,
  );
  await screen.findByRole('img', { name: /^Net P&L by day/ });
  const inline = svgHeight(container);
  const expand = screen.getByRole('button', { name: 'Expand chart' });
  expand.focus();
  fireEvent.click(expand);
  const dialog = await screen.findByRole('dialog', {
    name: 'Net P&L by day, all time',
  });
  // The same chart again, with its values, and taller.
  const big = within(dialog).getByRole('img', { name: /^Net P&L by day/ });
  expect(big).toBeTruthy();
  expect(svgHeight(dialog)).toBeGreaterThan(inline);
  // One expanded chart has no Expand of its own.
  expect(
    within(dialog).queryByRole('button', { name: 'Expand chart' }),
  ).toBeNull();
  // The readout works in the expanded chart as it does inline.
  act(() => big.focus());
  fireEvent.keyDown(big, { key: 'ArrowRight' });
  expect(within(dialog).getByRole('status').textContent).toContain('Tue 3 Nov');

  fireEvent.keyDown(dialog, { key: 'Escape' });
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(expand);
});

test('the Close button closes the expanded chart too', async () => {
  renderApp(<ReportChart label="By day" series={SERIES} />);
  await screen.findByRole('img', { name: 'By day' });
  const expand = screen.getByRole('button', { name: 'Expand chart' });
  fireEvent.click(expand);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(expand);
});

test('an empty chart has nothing to expand', async () => {
  renderApp(<ReportChart label="Nothing" series={[]} />);
  await screen.findByText('Nothing to chart in this range.');
  expect(screen.queryByRole('button', { name: 'Expand chart' })).toBeNull();
});

test('the expanded chart hides amounts under Privacy', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<ReportChart label="By day" series={SERIES} />, { repository });
  await screen.findByRole('img', { name: 'By day' });
  fireEvent.click(screen.getByRole('button', { name: 'Expand chart' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('$•••');
  expect(dialog.textContent).not.toMatch(/\$\d/);
});

test('durations read in hours and minutes, on the axis and in the table', async () => {
  const { container } = renderApp(
    <ReportChart
      label="Hold time"
      series={[
        {
          label: 'Average hold time',
          kind: 'line',
          unit: 'minutes',
          points: [
            { key: '2026-11-02', value: 45 },
            { key: '2026-11-03', value: 150 },
          ],
        },
      ]}
    />,
  );
  await screen.findByRole('img', { name: 'Hold time' });
  const table = screen.getByRole('table', { name: 'Hold time' });
  const cells = within(table)
    .getAllByRole('row')
    .map((r) => r.textContent);
  expect(cells[1]).toContain('45m');
  expect(cells[2]).toContain('2h 30m');
  // Ticks are whole minutes or hours, never decimals.
  const ticks = [...container.querySelectorAll('text')].map(
    (t) => t.textContent,
  );
  expect(
    ticks.some((t) => /^(\d+h)?( ?\d+m)?$/.test(t ?? '') && t !== ''),
  ).toBe(true);
  expect(ticks.join(' ')).not.toMatch(/\d\.\d/);
});

test('ratios of risk, quantities and counts have their own formats', async () => {
  renderApp(
    <ReportChart
      label="Formats"
      series={[
        {
          label: 'Average realized R',
          kind: 'line',
          unit: 'multiple',
          points: [
            { key: '2026-11-02', value: 1.25 },
            { key: '2026-11-03', value: -0.5 },
          ],
        },
        {
          label: 'Volume',
          kind: 'bar',
          unit: 'qty',
          points: [
            { key: '2026-11-02', value: 6.8 },
            { key: '2026-11-03', value: 1169 },
          ],
        },
      ]}
    />,
  );
  await screen.findByRole('img', { name: 'Formats' });
  const rows = within(screen.getByRole('table', { name: 'Formats' }))
    .getAllByRole('row')
    .map((r) => r.textContent);
  expect(rows[1]).toContain('+1.25R');
  expect(rows[1]).toContain('6.8');
  expect(rows[2]).toContain('−0.50R');
  expect(rows[2]).toContain('1,169');
});

const THREE = ['Net P&L', 'Win rate', 'Trades'].map((label, i) => ({
  label,
  kind: 'line' as const,
  unit: 'pct' as const,
  points: [
    { key: '2026-11-02', value: 0.2 + i * 0.1 },
    { key: '2026-11-03', value: 0.5 - i * 0.1 },
    { key: '2026-11-04', value: 0.4 },
  ],
}));

test('series colours keep the hue jobs: accent, ink, then a dashed tint; never cyan or marigold', async () => {
  const { container } = renderApp(
    <ReportChart label="Three lines" series={THREE} />,
  );
  await screen.findByRole('img', { name: 'Three lines' });
  const strokes = [
    ...container.querySelectorAll('[data-mark="line"] path'),
  ].map((p) => ({
    stroke: p.getAttribute('stroke') ?? '',
    dash: p.getAttribute('stroke-dasharray'),
  }));
  expect(strokes).toHaveLength(3);
  expect(strokes[0]).toEqual({ stroke: 'var(--accent)', dash: null });
  expect(strokes[1]).toEqual({ stroke: 'var(--muted)', dash: null });
  expect(strokes[2]!.stroke).toContain('var(--accent)');
  expect(strokes[2]!.dash).not.toBeNull();
  expect(container.innerHTML).not.toMatch(/info-fill|warn-fill/);
});

test('Expand sits in the card header slot when the card gives one', async () => {
  function Card() {
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    return (
      <>
        <header data-testid="head">
          <span ref={setSlot} />
        </header>
        <ReportChart label="Slotted" series={SERIES} expandSlot={slot} />
      </>
    );
  }
  renderApp(<Card />);
  await screen.findByRole('img', { name: 'Slotted' });
  const head = screen.getByTestId('head');
  expect(
    await within(head).findByRole('button', { name: 'Expand chart' }),
  ).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Expand chart' })).toHaveLength(
    1,
  );
});

test('a line with the loss tone is drawn in the loss colour, its readout dot too', async () => {
  const { container } = renderApp(
    <ReportChart
      label="Drawdown by day"
      series={[
        {
          label: 'Drawdown',
          kind: 'line',
          unit: 'money',
          tone: 'loss',
          points: [
            { key: '2026-11-02', value: 0 },
            { key: '2026-11-03', value: -4000 },
            { key: '2026-11-04', value: -1000 },
          ],
        },
      ]}
    />,
  );
  const chart = await screen.findByRole('img', { name: 'Drawdown by day' });
  const stroke = container
    .querySelector('[data-mark="line"] path:not([stroke="none"])')!
    .getAttribute('stroke');
  expect(stroke).toBe('var(--loss-fill)');
  fireEvent.focus(chart);
  const dot = container.querySelector('svg circle[stroke="var(--surface-1)"]');
  expect(dot!.getAttribute('fill')).toBe('var(--loss-fill)');
});
