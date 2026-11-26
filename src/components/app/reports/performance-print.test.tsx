// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { renderApp } from '../__fixtures__/render-app';
import {
  newYorkRepository,
  reportsSample,
} from '../__fixtures__/reports-sample';
import { REPORT_KEYS, type ReportKey } from './report-keys';
import { PerformanceView } from './performance';
import { ReportsPage } from './reports-shell';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

const URL = '/app/reports/performance';
const print = vi.fn();

beforeEach(() => {
  print.mockClear();
  window.print = print;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The page as the print layout reads it: the header block, in one line of text. */
async function header(): Promise<{ node: HTMLElement; text(): string }> {
  const node = await screen.findByTestId('print-header');
  return { node, text: () => node.textContent!.replace(/\s+/g, ' ').trim() };
}

test('Export PDF sits beside the P&L control and opens the print dialog', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const button = await screen.findByRole('button', { name: 'Export PDF' });
  // The same row as the basis control.
  expect(
    within(button.parentElement!).getByRole('radiogroup', { name: 'P&L' }),
  ).toBeTruthy();
  expect(print).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(print).toHaveBeenCalledTimes(1);
});

test('the P&L control beside it flips Gross and Net, and the print header follows', async () => {
  const { repo } = renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: URL,
  });
  const group = await screen.findByRole('radiogroup', { name: 'P&L' });
  const net = within(group).getByRole('radio', {
    name: 'Net',
  }) as HTMLInputElement;
  expect(net.checked).toBe(true);
  expect((await header()).text()).toContain('net of fees');
  fireEvent.click(within(group).getByRole('radio', { name: 'Gross' }));
  await waitFor(async () =>
    expect((await header()).text()).toContain('before fees'),
  );
  expect((await repo.prefs.get()).pnlBasis).toBe('gross');
});

// Overview, Day & time, Symbols, Risk, Strategies, Tags, Options, Wins vs
// losses, Compare and Calendar: Performance alone exports.
test.each(['overview', ...REPORT_KEYS.filter((k) => k !== 'performance')] as (
  ReportKey | 'overview'
)[])('%s has no Export PDF', async (report) => {
  renderApp(<ReportsPage report={report} />, {
    sample: reportsSample,
    url: report === 'overview' ? '/app/reports' : `/app/reports/${report}`,
  });
  // The page is up once its own test id is.
  await screen.findByTestId(`reports-${report}`, {}, { timeout: 5000 });
  // Some of them export a CSV; none exports a PDF.
  expect(screen.queryByRole('button', { name: /pdf/i })).toBeNull();
  expect(screen.queryByText(/pdf/i)).toBeNull();
});

test('Performance, through the shell, is the one tab with it', async () => {
  renderApp(<ReportsPage report="performance" />, {
    sample: reportsSample,
    url: URL,
  });
  expect(
    await screen.findByRole('button', { name: 'Export PDF' }),
  ).toBeTruthy();
});

test('the print header names the report, the workspace, the accounts, the range and the filters', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?account=acc-a&side=long&from=2026-11-03&to=2026-11-05`,
  });
  const h = await header();
  expect(
    within(h.node).getByRole('heading', {
      level: 1,
      name: 'Performance report',
    }),
  ).toBeTruthy();
  const text = h.text();
  expect(text).toContain('Sample workspace, Futures main.');
  expect(text).toContain('3 Nov to 5 Nov 2026.');
  expect(text).toContain('Filters: Side: Long.');
  expect(text).toContain('Shown in dollars, net of fees.');
});

test('with no filter the header says none, and all time is the days the trades fall on', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const text = (await header()).text();
  // The trades fall on Mon 2 to Thu 5 Nov 2026.
  expect(text).toContain('Sample workspace, all accounts.');
  expect(text).toContain('All time (2 Nov to 5 Nov 2026).');
  expect(text).toContain('Filters: none.');
});

test('several filters read as a list in the header', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?symbol=ES,NQ&side=short&wd=1,2`,
  });
  const text = (await header()).text();
  // Whatever the page's filters leave, the words name each.
  expect(text).toMatch(
    /Filters: Symbols: ES, NQ; Side: Short; Entry weekday: /,
  );
});

test.each([
  ['dollar', 'Shown in dollars, net of fees.'],
  ['percent', 'Shown in percent, net of fees.'],
  ['privacy', 'Shown with amounts hidden, net of fees.'],
] as const)('the header says the unit in words: %s', async (unit, words) => {
  const repository = await newYorkRepository();
  await repository.prefs.update({ displayUnit: unit });
  renderApp(<PerformanceView />, { repository, url: URL });
  expect((await header()).text()).toContain(words);
});

test('under Privacy no amount is on the page, the header included', async () => {
  const repository = await newYorkRepository();
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<PerformanceView />, {
    repository,
    url: `${URL}?m=net:bar,avg-trade:bar&bucket=day`,
  });
  const h = await header();
  await screen.findByRole('table', { name: 'Summary by day' });
  expect(h.text()).not.toMatch(/\$\s?\d/);
  // The words, the chart's label and its ticks, and the table: a dollar figure in none.
  expect(container.innerHTML).not.toMatch(/[$]\s?\d/);
  expect(container.textContent).toContain('hidden amount');
});

test('the header is stamped when the page is printed, in the trader’s zone', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T20:05:00Z'));
  const repository = await newYorkRepository();
  renderApp(<PerformanceView />, { repository, url: URL });
  const h = await header();
  expect(h.text()).toContain('Made 25 Nov 2026, 15:05.');
  // The page stays open; the print dialog comes a while later.
  vi.setSystemTime(new Date('2026-11-25T22:40:00Z'));
  act(() => {
    window.dispatchEvent(new Event('beforeprint'));
  });
  expect(h.text()).toContain('Made 25 Nov 2026, 17:40.');
  act(() => {
    window.dispatchEvent(new Event('afterprint'));
  });
  expect(h.text()).toContain('Made 25 Nov 2026, 17:40.');
});

test('a unit that left trades out says so in the header', async () => {
  const sample = async () => {
    const s = await reportsSample();
    // Two of the nine trades have a stop, so R keeps two.
    s.trades[0] = { ...s.trades[0]!, initialRisk: 5000 };
    s.trades[2] = { ...s.trades[2]!, initialRisk: 5000 };
    return s;
  };
  const repository = await newYorkRepository(sample);
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<PerformanceView />, { repository, url: URL });
  const text = (await header()).text();
  expect(text).toContain('Shown in R, net of fees.');
  expect(text).toContain(
    'R-multiple counts trades with a stop only, so 7 trades are left out.',
  );
});

test('an empty report has nothing to export and prints its empty state', async () => {
  const empty = async () => ({ ...fixtureSample(), trades: [], journal: [] });
  renderApp(<PerformanceView />, { sample: empty, url: URL });
  expect(
    await screen.findByText('No trades in this workspace yet.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Export PDF' })).toBeNull();
  expect(screen.queryByTestId('print-header')).toBeNull();
  // Nothing marks the empty state as chrome: the print sheet leaves it be.
  expect(
    screen
      .getByText('No trades in this workspace yet.')
      .closest('[data-print="hide"], [data-pinned]'),
  ).toBeNull();
});

test('on paper a chart is captioned with what it plots; with nothing plotted the caption stays as it is', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:bar,win-rate:line&bucket=day&m2=`,
  });
  const one = within(await screen.findByRole('region', { name: 'Chart 1' }));
  expect(one.getByText('Net P&L, Win rate, by day').className).toContain(
    'print:inline',
  );
  // The on-screen caption is the one that leaves the paper.
  expect(one.getByText('By day, all time').className).toContain('print:hidden');
  // Chart 2 plots nothing: no comma stranded before "by", and its caption prints.
  const two = within(screen.getByRole('region', { name: 'Chart 2' }));
  expect(two.queryByText(/^, by /)).toBeNull();
  expect(two.getByText(/^By week, all time$/).className).not.toContain(
    'print:hidden',
  );
});
