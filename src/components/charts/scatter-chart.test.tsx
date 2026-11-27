// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../app/__fixtures__/render-app';
import { ScatterChart, type ScatterDot } from './scatter-chart';

vi.mock('next/navigation', () => import('../app/__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const DOTS: ScatterDot[] = [
  { id: 'a', x: 570, y: 25_000 },
  { id: 'b', x: 600, y: -10_000 },
  { id: 'c', x: 660, y: 0 },
  { id: 'd', x: 720, y: 50_000 },
];
const AXIS = {
  lo: 540,
  hi: 780,
  ticks: [
    { at: 540, text: '09:00' },
    { at: 660, text: '11:00' },
    { at: 780, text: '13:00' },
  ],
};

const draw = (dots: readonly ScatterDot[] = DOTS) =>
  renderApp(
    <ScatterChart
      label="Trade time, four trades"
      dots={dots}
      xAxis={AXIS}
      note="Times in New York"
      describe={(id) => ({
        title: `Trade ${id}`,
        lines: [{ label: 'Held', value: '12m' }],
        href: `/app/trades/${id}`,
      })}
    />,
  );

const chart = () =>
  screen.findByRole('img', { name: 'Trade time, four trades' });

test('a filled dot above zero, a hollow one below and a quiet ring at zero', async () => {
  const { container } = draw();
  await chart();
  const dot = (id: string) =>
    container.querySelector<SVGCircleElement>(`[data-dot="${id}"]`)!;
  expect(dot('a').getAttribute('data-tone')).toBe('gain');
  expect(dot('a').getAttribute('fill')).toBe('var(--gain-fill)');
  // Shape as well as colour: the loss is a ring, with nothing inside it.
  expect(dot('b').getAttribute('data-tone')).toBe('loss');
  expect(dot('b').getAttribute('fill')).toBe('none');
  expect(dot('b').getAttribute('stroke')).toBe('var(--loss-fill)');
  expect(dot('c').getAttribute('data-tone')).toBe('flat');
  expect(dot('c').getAttribute('fill')).toBe('none');
  // Higher is better: the biggest win is the highest dot, the loss below the zero line.
  expect(Number(dot('d').getAttribute('cy'))).toBeLessThan(
    Number(dot('a').getAttribute('cy')),
  );
  expect(Number(dot('b').getAttribute('cy'))).toBeGreaterThan(
    Number(dot('c').getAttribute('cy')),
  );
});

test('both axes fit the trades: the x ticks are the ones given, the y scale holds zero and both ends', async () => {
  const { container } = draw();
  await chart();
  const xs = [...container.querySelectorAll('[data-axis-label="x"]')].map(
    (t) => t.textContent,
  );
  expect(xs).toEqual(['09:00', '11:00', '13:00']);
  const ys = [...container.querySelectorAll('[data-axis-label="y"]')].map(
    (t) => t.textContent!,
  );
  // The scale runs from just under the $100 loss to just over the $500 win, with zero among its ticks.
  expect(ys.sort()).toEqual(['$0', '+$200', '+$400']);
  // The dots stay inside the plot: x between its ends.
  const cx = [...container.querySelectorAll('[data-dot]')].map((c) =>
    Number(c.getAttribute('cx')),
  );
  expect(Math.min(...cx)).toBeGreaterThan(0);
  expect(cx).toEqual([...cx].sort((a, b) => a - b));
});

test('the legend says what a dot is, in shape and colour, and the note', async () => {
  const { container } = draw();
  await chart();
  const legend = container.querySelector('ul[data-legend]')!;
  expect(
    [...legend.querySelectorAll('li')].map((li) => li.textContent),
  ).toEqual(['Win', 'Loss', 'Times in New York']);
  expect(legend.querySelector('[data-swatch="win"]')).not.toBeNull();
  expect(legend.querySelector('[data-swatch="loss"]')).not.toBeNull();
});

test('focus reads a trade, the arrows step through them by time, Enter opens it', async () => {
  draw();
  const img = await chart();
  const status = screen.getByRole('status');
  fireEvent.focus(img);
  expect(status.textContent).toContain('Trade a');
  expect(status.textContent).toContain('Held');
  expect(status.textContent).toContain('12m');
  fireEvent.keyDown(img, { key: 'ArrowRight' });
  expect(status.textContent).toContain('Trade b');
  fireEvent.keyDown(img, { key: 'End' });
  expect(status.textContent).toContain('Trade d');
  fireEvent.keyDown(img, { key: 'ArrowLeft' });
  fireEvent.keyDown(img, { key: 'ArrowLeft' });
  expect(status.textContent).toContain('Trade b');
  fireEvent.keyDown(img, { key: 'Enter' });
  expect(window.location.pathname).toBe('/app/trades/b');
});

test('hovering a dot reads its trade and a click opens it; far from every dot reads nothing', async () => {
  const { container } = draw();
  const img = await chart();
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 720, height: 260 }) as DOMRect;
  const status = screen.getByRole('status');
  const dot = container.querySelector('[data-dot="d"]')!;
  const at = {
    clientX: Number(dot.getAttribute('cx')) + 2,
    clientY: Number(dot.getAttribute('cy')) - 1,
  };
  fireEvent.pointerMove(img, at);
  expect(status.textContent).toContain('Trade d');
  fireEvent.click(img, at);
  expect(window.location.pathname).toBe('/app/trades/d');
  window.history.pushState(null, '', '/app/dashboard');
  fireEvent.pointerMove(img, { clientX: 5, clientY: 5 });
  expect(status.textContent).toBe('');
  fireEvent.click(img, { clientX: 5, clientY: 5 });
  expect(window.location.pathname).toBe('/app/dashboard');
});

test('a tap with a finger reads the trade and offers it; a second tap opens it', async () => {
  const { container } = draw();
  const img = await chart();
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 720, height: 260 }) as DOMRect;
  const dot = container.querySelector('[data-dot="a"]')!;
  const at = {
    clientX: Number(dot.getAttribute('cx')),
    clientY: Number(dot.getAttribute('cy')),
  };
  fireEvent.pointerDown(img, { ...at, pointerType: 'touch' });
  fireEvent.click(img, at);
  expect(screen.getByRole('status').textContent).toContain('Trade a');
  expect(window.location.pathname).not.toBe('/app/trades/a');
  expect(
    screen.getByRole('link', { name: 'Open trade' }).getAttribute('href'),
  ).toBe('/app/trades/a');
  fireEvent.pointerDown(img, { ...at, pointerType: 'touch' });
  fireEvent.click(img, at);
  expect(window.location.pathname).toBe('/app/trades/a');
});

test('the tapped trade stays read while its link is pressed, and goes when the page is touched elsewhere', async () => {
  const { container } = draw();
  const img = await chart();
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 720, height: 260 }) as DOMRect;
  const dot = container.querySelector('[data-dot="a"]')!;
  const at = {
    clientX: Number(dot.getAttribute('cx')),
    clientY: Number(dot.getAttribute('cy')),
  };
  fireEvent.pointerDown(img, { ...at, pointerType: 'touch' });
  fireEvent.focus(img);
  fireEvent.click(img, at);
  // Pressing the link takes the focus from the chart: the link must still be there to be clicked.
  fireEvent.blur(img);
  expect(screen.getByRole('link', { name: 'Open trade' })).toBeTruthy();
  // A touch anywhere else on the page puts the readout away.
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole('status').textContent).toBe('');
});
