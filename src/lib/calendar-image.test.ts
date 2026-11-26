import { describe, expect, test, vi } from 'vitest';
import { calendarMonth } from '@/data/calendar';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import type { CalendarStat, JournalEntry, Trade } from '@/domain/types';
import {
  calendarFileName,
  calendarSvg,
  svgDataUrl,
  svgSize,
  type CalendarImageOptions,
} from './calendar-image';

const ctx = defaultMetricContext('America/New_York');

const day = (date: string, net: number, extra: Partial<Trade> = {}): Trade =>
  makeTrade({
    net,
    gross: net,
    openedAt: `${date}T15:00:00Z`,
    closedAt: `${date}T16:00:00Z`,
    ...extra,
  });

const note = (date: string): JournalEntry => ({
  id: `n-${date}`,
  workspaceId: 'w',
  kind: 'daily-review',
  date,
  title: 'Review',
  body: {},
  linkedTradeIds: [],
  tags: [],
  updatedAt: '2026-11-20T00:00:00Z',
});

/**
 * November 2026, Sunday first (1 Nov is a Sunday): +$100.00 on the 2nd, −$50.00
 * on the 3rd (with a daily note), +$300.00 and −$100.00 on the 4th, a
 * breakeven day on the 5th, +$12.34 on the 19th. Week 1 is +$250.00 over four
 * trading days, week 3 +$12.34 over one; the other weeks have no trades. The
 * month is +$262.34 over five trading days.
 */
const month = calendarMonth(
  [
    day('2026-11-02', 10_000),
    day('2026-11-03', -5_000),
    day('2026-11-04', 30_000),
    day('2026-11-04', -10_000),
    day('2026-11-05', 0),
    day('2026-11-19', 1_234),
  ],
  [note('2026-11-03')],
  '2026-11',
  ctx,
);

/** A plain dollar figure, as the display's own would read. */
const money = (c: number) =>
  `${c < 0 ? '−' : c > 0 ? '+' : ''}$${(Math.abs(c) / 100).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`;

const opts = (
  over: Partial<CalendarImageOptions> = {},
): CalendarImageOptions => ({
  stats: ['net', 'trades', 'winRate'] satisfies CalendarStat[],
  fig: money,
  theme: 'light',
  title: 'November 2026',
  subtitle: 'Sample workspace, all accounts',
  ...over,
});

describe('calendarSvg', () => {
  test('is a self-contained SVG with a size', () => {
    const svg = calendarSvg(month, opts());
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // No page tokens: a standalone image has no stylesheet to read them from.
    expect(svg).not.toContain('var(');
    const { width, height } = svgSize(svg);
    expect(width).toBeGreaterThan(800);
    expect(height).toBeGreaterThan(400);
  });

  test('the header names the month, its net, its trading days, the workspace and the accounts', () => {
    const svg = calendarSvg(month, opts());
    expect(svg).toContain('>November 2026<');
    // The net label is a plain word, with the ampersand escaped.
    expect(svg).toContain('Net P&amp;L');
    expect(svg).toContain('+$262.34');
    expect(svg).toContain('5 trading days');
    expect(svg).toContain('Sample workspace, all accounts');
  });

  test('a gross basis reads Gross P&L', () => {
    expect(calendarSvg(month, opts({ basis: 'gross' }))).toContain(
      'Gross P&amp;L',
    );
  });

  test('a month with one trading day reads "1 trading day"', () => {
    const one = calendarMonth([day('2026-11-02', 10_000)], [], '2026-11', ctx);
    expect(calendarSvg(one, opts())).toContain('1 trading day,');
  });

  test('each traded day shows its figure through fig, its trades and its win rate', () => {
    const svg = calendarSvg(month, opts());
    for (const figure of ['+$100.00', '−$50.00', '+$200.00', '+$12.34'])
      expect(svg).toContain(`>${figure}<`);
    // A breakeven day reads as the unit reads zero.
    expect(svg).toContain('>$0.00<');
    expect(svg).toContain('>2 trades<');
    expect(svg).toContain('>50% win rate<');
    expect(svg).toContain('>1 trade<');
    expect(svg).toContain('>100% win rate<');
  });

  test('every money figure goes through fig: nothing else writes a dollar sign', () => {
    const marked = vi.fn((c: number) => `«${c}»`);
    const svg = calendarSvg(month, opts({ fig: marked }));
    expect(svg).not.toContain('$');
    // Days, weeks and the month, each as the day, week or month's own cents.
    for (const cents of [10_000, -5_000, 20_000, 0, 1_234, 25_000, 26_234])
      expect(svg).toContain(`«${cents}»`);
  });

  test('fig is handed the day, week or month the figure is for, so the unit can read it', () => {
    const seen = vi.fn((c: number) => String(c));
    calendarSvg(month, opts({ fig: seen }));
    // The day's net with its R and its ticks, pips and points.
    expect(seen).toHaveBeenCalledWith(
      10_000,
      null,
      expect.objectContaining({ ticks: expect.anything() }),
    );
    // A week's net, with the week's own units.
    expect(seen).toHaveBeenCalledWith(
      25_000,
      null,
      expect.objectContaining({ tradingDays: 4 }),
    );
  });

  test('Privacy: a masking fig hides every amount and leaves the counts', () => {
    const svg = calendarSvg(month, opts({ fig: () => '$•••' }));
    for (const amount of ['100.00', '50.00', '200.00', '250.00', '262.34'])
      expect(svg).not.toContain(amount);
    expect(svg).toContain('$•••');
    expect(svg).toContain('>2 trades<');
    expect(svg).toContain('5 trading days');
  });

  test('the weekly column has each week, its net and its day count', () => {
    const svg = calendarSvg(month, opts());
    for (let n = 1; n <= 5; n += 1) expect(svg).toContain(`>Week ${n}<`);
    expect(svg).toContain('>+$250.00<');
    expect(svg).toContain('>4 days<');
    expect(svg).toContain('>1 day<');
    // A week with nothing says so, as the grid does.
    expect(svg.match(/>No trades</g)).toHaveLength(3);
  });

  test('a note is marked on the day that has one and on no other', () => {
    const svg = calendarSvg(month, opts());
    expect(svg.match(/data-note="/g)).toHaveLength(1);
    expect(svg).toContain('data-note="2026-11-03"');
  });

  test('Keel’s wordmark is at the foot, below the last week', () => {
    const svg = calendarSvg(month, opts());
    expect(svg.match(/>Keel</g)).toHaveLength(1);
    const { height } = svgSize(svg);
    const mark = /<text[^>]*\sy="([\d.]+)"[^>]*>Keel</.exec(svg);
    expect(mark).not.toBeNull();
    expect(Number(mark![1])).toBeGreaterThan(height - 60);
    expect(Number(mark![1])).toBeLessThanOrEqual(height);
  });

  test('the weekday headers start on the first day of the first week', () => {
    const monday = calendarMonth([day('2026-11-02', 10_000)], [], '2026-11', {
      ...ctx,
      weekStart: 'monday',
    });
    const headers = (svg: string) =>
      [...svg.matchAll(/data-dow="(\w{3})"/g)].map((m) => m[1]);
    expect(headers(calendarSvg(month, opts()))).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(headers(calendarSvg(monday, opts()))).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  test('the cell stats are the ones chosen, in the order given', () => {
    const net = calendarSvg(month, opts({ stats: ['net'] }));
    expect(net).not.toMatch(/\d trades?</);
    expect(net).not.toContain('win rate');
    const more = calendarSvg(month, opts({ stats: ['trades', 'net', 'fees'] }));
    // The first stat leads: the trades come before the net in the day's cell.
    expect(more.indexOf('>2 trades<')).toBeLessThan(more.indexOf('>+$200.00<'));
    expect(more).toContain('fees<');
  });

  test('a stat a day has no value for leaves its line out, as the grid does', () => {
    const svg = calendarSvg(month, opts({ stats: ['net', 'rating'] }));
    // Nothing is rated: no star line anywhere.
    expect(svg).not.toContain('★');
  });

  test('a day with no value for a unit reads None', () => {
    const svg = calendarSvg(month, opts({ stats: ['net', 'pips'] }));
    expect(svg).toContain('>None<');
  });

  test('the theme colours the image: light on white, dark on graphite', () => {
    const light = calendarSvg(month, opts({ theme: 'light' }));
    const dark = calendarSvg(month, opts({ theme: 'dark' }));
    expect(light).toContain('#ffffff');
    expect(light).toContain('#ddf3e8');
    expect(light).not.toContain('#141414');
    expect(dark).toContain('#141414');
    expect(dark).toContain('#10261c');
    expect(dark).not.toContain('#ffffff');
    expect(dark).not.toContain('#ddf3e8');
  });

  test('a title and a subtitle with markup are escaped, never written as it', () => {
    const svg = calendarSvg(
      month,
      opts({ title: '<b>Nov</b> & "co"', subtitle: 'Apex <50K> & Co' }),
    );
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;Nov&lt;/b&gt; &amp; &quot;co&quot;');
    expect(svg).toContain('Apex &lt;50K&gt; &amp; Co');
  });

  test('a long figure is set smaller instead of spilling out of its cell', () => {
    const wide = calendarSvg(
      month,
      opts({ fig: (c) => `${money(c)},000,000,000` }),
    );
    // The lead figure normally sets at 17: this one has to give.
    const sizes = [...wide.matchAll(/font-size="([\d.]+)"[^>]*>\+\$100\.00,/g)];
    expect(sizes).toHaveLength(1);
    expect(Number(sizes[0]![1])).toBeLessThan(17);
  });

  test('the cells grow with the stats: more lines, a taller image', () => {
    const few = svgSize(calendarSvg(month, opts({ stats: ['net'] })));
    const many = svgSize(
      calendarSvg(
        month,
        opts({ stats: ['net', 'trades', 'winRate', 'fees', 'ticks', 'pips'] }),
      ),
    );
    expect(many.height).toBeGreaterThan(few.height);
    expect(many.width).toBe(few.width);
  });
});

describe('calendarFileName', () => {
  test('is keel-calendar-YYYY-MM.png', () => {
    expect(calendarFileName('2026-11')).toBe('keel-calendar-2026-11.png');
    expect(calendarFileName('2027-01')).toBe('keel-calendar-2027-01.png');
  });
});

describe('svgSize and svgDataUrl', () => {
  test('read the root’s size and carry the SVG as a data URL', () => {
    const svg = '<svg width="10.5" height="20" viewBox="0 0 10.5 20"></svg>';
    expect(svgSize(svg)).toEqual({ width: 10.5, height: 20 });
    expect(() => svgSize('<svg></svg>')).toThrow();
    const url = svgDataUrl('<svg a="#"/>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(
      '<svg a="#"/>',
    );
  });
});
