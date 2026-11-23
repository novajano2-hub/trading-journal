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
  expect(table.classList.contains('sr-only')).toBe(true);
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
