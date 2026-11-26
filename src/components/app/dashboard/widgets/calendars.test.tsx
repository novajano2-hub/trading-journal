// @vitest-environment happy-dom
// The calendar widgets (#46, Task 9B): the plain month, the mini month, the
// month with stats and the year, over a month whose days are worked by hand.
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { JournalEntry, UserPrefs, WidgetKey } from '@/domain/types';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { svgDataUrl } from '@/lib/calendar-image';
import {
  esTrade,
  renderWidgets,
  said,
  tradesSample,
  widget,
} from '../../__fixtures__/dashboard-widgets';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));

// The page has no canvas here: the image is made, not drawn.
vi.mock('@/lib/calendar-image', async (original) => ({
  ...(await original<typeof import('@/lib/calendar-image')>()),
  calendarPng: async () => new Blob(['png'], { type: 'image/png' }),
}));

// Animations finish at once here, as in dashboard-view.test.tsx.
MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z')); // Friday 20 Nov, 10:00 in New York
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const note = (date: string): JournalEntry => ({
  id: `n-${date}`,
  workspaceId: SAMPLE_WORKSPACE.id,
  kind: 'daily-review',
  date,
  title: 'Review',
  body: {},
  linkedTradeIds: [],
  tags: [],
  updatedAt: '2026-11-20T00:00:00Z',
});

/**
 * November 2026: +$100.00 on the 2nd, −$50.00 on the 3rd (with a daily note),
 * +$200.00 on the 4th and a breakeven day on the 5th. The month is +$250.00
 * over four trading days. The routine's today is the 19th (the fixture's).
 */
const november = tradesSample(
  () => [
    esTrade(0, '2026-11-02', 10_000),
    esTrade(1, '2026-11-03', -5_000),
    esTrade(2, '2026-11-04', 20_000),
    esTrade(3, '2026-11-05', 0),
  ],
  (s) => {
    s.journal.push(note('2026-11-03'));
  },
);

const day = (key: WidgetKey, date: string) =>
  widget(key).querySelector<HTMLElement>(`[data-date="${date}"]`)!;
const ready = (key: WidgetKey) =>
  waitFor(() =>
    expect(widget(key).querySelector('[data-date]')).not.toBeNull(),
  );

const PLAIN: WidgetKey = 'calendar';
const MINI: WidgetKey = 'calendar-mini';
const ADV: WidgetKey = 'calendar-adv';

describe('the calendar (C12): net only, tinted by how the day ended', () => {
  test('the month is the heading, with arrows and the info tip; no stats menu, no snapshot, no week totals', async () => {
    await renderWidgets([PLAIN], { sample: november });
    await ready(PLAIN);
    const card = widget(PLAIN);
    expect(
      within(card).getByRole('heading', { name: 'November 2026' }),
    ).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Previous month' }),
    ).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Next month' }),
    ).toBeTruthy();
    expect(
      card.querySelector('[data-metric-tip="month-calendar"]'),
    ).not.toBeNull();
    expect(
      within(card).queryByRole('button', { name: /stats shown/i }),
    ).toBeNull();
    expect(
      within(card).queryByRole('button', { name: /snapshot/i }),
    ).toBeNull();
    expect(card.querySelector('[data-testid="week-total"]')).toBeNull();
    expect(within(card).queryByRole('list', { name: 'Weeks' })).toBeNull();
    expect(within(card).queryByText('Week')).toBeNull();
  });

  test('each day shows its net and nothing else: win, loss and breakeven tinted apart', async () => {
    await renderWidgets([PLAIN], { sample: november });
    await ready(PLAIN);
    // Net only: the day's name carries its net and its count, no win rate or fees.
    expect(day(PLAIN, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, +$100.00, 1 trade',
    );
    expect(day(PLAIN, '2026-11-03').getAttribute('aria-label')).toBe(
      'Tue 3 Nov, −$50.00, 1 trade',
    );
    expect(day(PLAIN, '2026-11-04').className).toContain('bg-gain-soft');
    expect(day(PLAIN, '2026-11-02').className).toContain('bg-gain-soft');
    expect(day(PLAIN, '2026-11-03').className).toContain('bg-loss-soft');
    // Inside the breakeven range: neither colour.
    expect(day(PLAIN, '2026-11-05').className).toContain('bg-accent-soft');
    expect(day(PLAIN, '2026-11-05').className).not.toMatch(
      /gain-soft|loss-soft/,
    );
    expect(day(PLAIN, '2026-11-09').className).not.toMatch(/-soft/);
    // The chosen cell stats of the Calendar page do not reach it.
    expect(day(PLAIN, '2026-11-02').textContent).not.toMatch(/win rate|fees/i);
  });

  test('today is ringed', async () => {
    await renderWidgets([PLAIN], { sample: november });
    await ready(PLAIN);
    expect(day(PLAIN, '2026-11-19').getAttribute('aria-current')).toBe('date');
    expect(day(PLAIN, '2026-11-18').getAttribute('aria-current')).toBeNull();
  });

  test('the arrows move the month, and the days follow', async () => {
    await renderWidgets([PLAIN], { sample: november });
    await ready(PLAIN);
    const card = widget(PLAIN);
    fireEvent.click(within(card).getByRole('button', { name: 'Next month' }));
    await waitFor(() =>
      expect(
        within(card).getByRole('heading', { name: 'December 2026' }),
      ).toBeTruthy(),
    );
    expect(day(PLAIN, '2026-12-01').getAttribute('aria-label')).toBe(
      'Tue 1 Dec, no trades',
    );
    expect(card.querySelector('[data-date="2026-11-02"]')).toBeNull();
    fireEvent.click(
      within(card).getByRole('button', { name: 'Previous month' }),
    );
    fireEvent.click(
      within(card).getByRole('button', { name: 'Previous month' }),
    );
    await waitFor(() =>
      expect(
        within(card).getByRole('heading', { name: 'October 2026' }),
      ).toBeTruthy(),
    );
  });

  test('a one-day date range does not touch the month: every day keeps its figures', async () => {
    await renderWidgets([PLAIN], {
      sample: november,
      url: '/app/dashboard?from=2026-11-19&to=2026-11-19',
    });
    await ready(PLAIN);
    expect(day(PLAIN, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, +$100.00, 1 trade',
    );
    expect(day(PLAIN, '2026-11-04').className).toContain('bg-gain-soft');
  });

  test('the other filters still apply', async () => {
    await renderWidgets([PLAIN], {
      sample: november,
      url: '/app/dashboard?symbol=ZZZ',
    });
    await ready(PLAIN);
    expect(day(PLAIN, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, no trades',
    );
  });

  test('a day opens its panel: the trades that exited, and the way into the Day view', async () => {
    await renderWidgets([PLAIN], { sample: november });
    await ready(PLAIN);
    fireEvent.click(day(PLAIN, '2026-11-03'));
    const panel = await screen.findByRole('dialog');
    expect(
      within(panel).getByRole('heading', { name: 'Tue 3 Nov' }),
    ).toBeTruthy();
    expect(panel.textContent).toContain('−$50.00');
    expect(
      within(panel)
        .getByRole('link', { name: 'Open in Trades' })
        .getAttribute('href'),
    ).toBe('/app/trades/day?from=2026-11-03&to=2026-11-03');
    fireEvent.click(within(panel).getByRole('button', { name: 'Close day' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('under Privacy no amount shows in a cell or in its name', async () => {
    await renderWidgets([PLAIN], {
      sample: november,
      prefs: { displayUnit: 'privacy' as UserPrefs['displayUnit'] },
    });
    await ready(PLAIN);
    const cell = day(PLAIN, '2026-11-02');
    expect(cell.getAttribute('aria-label')).toBe(
      'Mon 2 Nov, hidden amount, 1 trade',
    );
    expect(cell.textContent).not.toMatch(/\d{2,}/);
    expect(cell.textContent).toContain('$•••');
  });
});

describe('the currency the page shows', () => {
  // The USD month, and a euro account that traded on the 4th and the 9th.
  const twoCurrencies = tradesSample(
    () => [
      esTrade(0, '2026-11-02', 10_000),
      esTrade(1, '2026-11-04', 20_000, {
        accountId: 'acc-eur',
        pnlCurrency: 'EUR',
      }),
      esTrade(2, '2026-11-09', -3_000, {
        accountId: 'acc-eur',
        pnlCurrency: 'EUR',
      }),
    ],
    (s) => {
      s.accounts.push({
        ...s.accounts[0]!,
        id: 'acc-eur',
        name: 'Euro account',
        currency: 'EUR',
      });
    },
  );

  test('every calendar reads the one currency the page shows, and follows the switch', async () => {
    await renderWidgets([PLAIN, MINI, ADV, 'year'], { sample: twoCurrencies });
    await ready(PLAIN);
    // The base currency first: the euro days are not here.
    expect(day(PLAIN, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, +$100.00, 1 trade',
    );
    expect(day(PLAIN, '2026-11-04').getAttribute('aria-label')).toBe(
      'Wed 4 Nov, no trades',
    );
    expect(said(ADV)).toContain('Month +$100.00, 1 day');
    expect(said('year')).toContain('net +$100.00');
    // The year's month links name the currency, since the trades are in two.
    expect(
      within(widget('year')).getAllByRole('link')[10]!.getAttribute('href'),
    ).toBe('/app/calendar?month=2026-11&cur=USD');
    const group = screen.getByRole('radiogroup', { name: 'Currency' });
    fireEvent.click(within(group).getByRole('radio', { name: 'EUR' }));
    await waitFor(() =>
      expect(day(PLAIN, '2026-11-04').getAttribute('aria-label')).toBe(
        'Wed 4 Nov, +€200.00, 1 trade',
      ),
    );
    expect(day(PLAIN, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, no trades',
    );
    expect(day(MINI, '2026-11-04').dataset.tone).toBe('gain');
    expect(day(MINI, '2026-11-09').dataset.tone).toBe('loss');
    expect(day(MINI, '2026-11-02').dataset.tone).toBeUndefined();
    expect(said(ADV)).toContain('Month +€170.00, 2 days');
    expect(said('year')).toContain('net +€170.00');
    expect(
      within(widget('year')).getAllByRole('link')[10]!.getAttribute('href'),
    ).toBe('/app/calendar?month=2026-11&cur=EUR');
  });

  test('a currency whose trades all fall outside the date range can still be chosen: the calendars read every date', async () => {
    await renderWidgets([PLAIN], {
      sample: twoCurrencies,
      url: '/app/dashboard?from=2026-11-02&to=2026-11-02',
    });
    await ready(PLAIN);
    const group = screen.getByRole('radiogroup', { name: 'Currency' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['USD', 'EUR']);
    fireEvent.click(within(group).getByRole('radio', { name: 'EUR' }));
    await waitFor(() =>
      expect(day(PLAIN, '2026-11-04').getAttribute('aria-label')).toBe(
        'Wed 4 Nov, +€200.00, 1 trade',
      ),
    );
  });

  test('a currency with no closed trade in the range or outside it is not offered', async () => {
    await renderWidgets([PLAIN], {
      sample: tradesSample(
        () => [esTrade(0, '2026-11-02', 10_000)],
        (s) => {
          s.accounts.push({
            ...s.accounts[0]!,
            id: 'acc-eur',
            currency: 'EUR',
          });
        },
      ),
    });
    await ready(PLAIN);
    expect(screen.queryByRole('radiogroup', { name: 'Currency' })).toBeNull();
  });
});

describe('the mini calendar (C12): 6A’s month, a day opens its Day view', () => {
  test('the month with the info tip, the arrows and the days underlined by how they ended', async () => {
    await renderWidgets([MINI], { sample: november });
    await ready(MINI);
    const card = widget(MINI);
    expect(
      within(card).getByRole('heading', { name: 'November 2026' }),
    ).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Previous month' }),
    ).toBeTruthy();
    expect(
      card.querySelector('[data-metric-tip="mini-calendar"]'),
    ).not.toBeNull();
    expect(day(MINI, '2026-11-02').dataset.tone).toBe('gain');
    expect(day(MINI, '2026-11-03').dataset.tone).toBe('loss');
    expect(day(MINI, '2026-11-05').dataset.tone).toBe('flat');
    expect(day(MINI, '2026-11-19').getAttribute('aria-current')).toBe('date');
    // Its own words, not the Trades page's: a day opens its Day view.
    expect(said(MINI)).toContain('Pick a day to open its Day view.');
    expect(said(MINI)).not.toContain('Pick a day to see only its trades');
  });

  test('a day opens its Day view on that date, with the filters carried', async () => {
    await renderWidgets([MINI], {
      sample: november,
      url: '/app/dashboard?account=acc-a',
    });
    await ready(MINI);
    fireEvent.click(day(MINI, '2026-11-03'));
    await waitFor(() =>
      expect(window.location.pathname).toBe('/app/trades/day'),
    );
    const search = new URLSearchParams(window.location.search);
    expect(search.get('from')).toBe('2026-11-03');
    expect(search.get('to')).toBe('2026-11-03');
    expect(search.get('account')).toBe('acc-a');
  });

  test('a one-day date range does not narrow it: the month keeps its days, and none is outlined', async () => {
    await renderWidgets([MINI], {
      sample: november,
      url: '/app/dashboard?from=2026-11-19&to=2026-11-19',
    });
    await ready(MINI);
    expect(day(MINI, '2026-11-02').dataset.tone).toBe('gain');
    expect(day(MINI, '2026-11-19').getAttribute('aria-pressed')).toBe('false');
  });

  test('the other filters apply, and Privacy hides what a day’s hint says', async () => {
    await renderWidgets([MINI], {
      sample: november,
      url: '/app/dashboard?symbol=ZZZ',
    });
    await ready(MINI);
    expect(day(MINI, '2026-11-02').dataset.tone).toBeUndefined();
  });

  test('under Privacy the day’s name carries no amount', async () => {
    await renderWidgets([MINI], {
      sample: november,
      prefs: { displayUnit: 'privacy' as UserPrefs['displayUnit'] },
    });
    await ready(MINI);
    expect(day(MINI, '2026-11-02').getAttribute('aria-label')).not.toMatch(
      /\d,|\$\d/,
    );
  });
});

describe('the calendar with stats: Calendar page’s month, its Stats shown and its Snapshot', () => {
  test('the month stats beside the heading, a This month button and the Stats shown menu', async () => {
    await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    const card = widget(ADV);
    expect(
      within(card).getByRole('heading', { name: 'November 2026' }),
    ).toBeTruthy();
    expect(
      card.querySelector('[data-metric-tip="advanced-calendar"]'),
    ).not.toBeNull();
    // +$100 − $50 + $200 + $0 over four trading days.
    expect(said(ADV)).toContain('Month +$250.00, 4 days');
    expect(
      within(card).getByRole('button', { name: 'This month' }),
    ).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Stats shown' }),
    ).toBeTruthy();
    // The legend names the tints and the pencil; it does not explain the date range.
    expect(said(ADV)).toContain('Green day');
    expect(said(ADV)).toContain('Journal entry');
    expect(said(ADV)).not.toMatch(/whatever the date range/);
    expect(within(card).getByRole('button', { name: 'Snapshot' })).toBeTruthy();
  });

  test('below sm Stats shown is its icon alone, so the card’s controls keep one row; its name stays for assistive tech (D-04)', async () => {
    await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    const button = within(widget(ADV)).getByRole('button', {
      name: 'Stats shown',
    });
    // The word folds into the accessible name; only the icon (and its box) is drawn below sm.
    const word = [...button.querySelectorAll('span')].find(
      (el) => el.textContent === 'Stats shown',
    )!;
    expect(word.className).toContain('max-sm:sr-only');
    expect(button.className).toContain('max-sm:w-[30px]');
    expect(button.className).toContain('max-sm:px-0');
    expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  /** The SVG the open panel previews. */
  const previewSvg = async () => {
    const img = await screen.findByRole('img', {
      name: 'Preview of the November 2026 calendar image',
    });
    const src = img.getAttribute('src')!;
    return decodeURIComponent(src.slice(src.indexOf(',') + 1));
  };

  test('Snapshot opens the Calendar image panel with the widget’s own month, as it shows it', async () => {
    await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    fireEvent.click(
      within(widget(ADV)).getByRole('button', { name: 'Snapshot' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'Calendar image',
    });
    const svg = await previewSvg();
    // The days, the weekly column with its day count, the month's net and the foot.
    for (const figure of ['+$100.00', '−$50.00', '+$200.00', '+$250.00'])
      expect(svg).toContain(`>${figure}<`);
    expect(svg).toContain('>4 days<');
    expect(svg).toContain('+$250.00');
    expect(svg).toContain('4 trading days');
    expect(svg).toContain('data-note="2026-11-03"');
    expect(svg).toContain('>Keel<');
    expect(svg).toContain('Sample workspace, all accounts');
    expect(panel.textContent).toContain('keel-calendar-2026-11.png');
    expect(svgDataUrl(svg)).toBeTruthy();
  });

  test('the image follows the widget’s month and its Stats shown', async () => {
    await renderWidgets([ADV], {
      sample: november,
      prefs: { calendarStats: ['net'] },
    });
    await ready(ADV);
    fireEvent.click(
      within(widget(ADV)).getByRole('button', { name: 'Snapshot' }),
    );
    const svg = await previewSvg();
    expect(svg).not.toMatch(/\d trades?</);
    expect(svg).not.toContain('win rate');
  });

  test('under Privacy the image carries no amount', async () => {
    await renderWidgets([ADV], {
      sample: november,
      prefs: { displayUnit: 'privacy' as UserPrefs['displayUnit'] },
    });
    await ready(ADV);
    fireEvent.click(
      within(widget(ADV)).getByRole('button', { name: 'Snapshot' }),
    );
    const svg = await previewSvg();
    expect(svg).not.toMatch(/\$\d/);
    expect(svg).toContain('$•••');
  });

  test('a week total at the end of each row, and a pencil on the day with a note', async () => {
    await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    const totals = [
      ...widget(ADV).querySelectorAll('[data-testid="week-total"]'),
    ];
    // 1 Nov is a Sunday: weeks of 1 to 7, 8 to 14, 15 to 21, 22 to 28 and 29 to 30.
    expect(totals).toHaveLength(5);
    expect(totals[0]!.textContent).toContain('Week 1');
    expect(totals[0]!.textContent).toContain('+$250.00');
    expect(day(ADV, '2026-11-03').getAttribute('aria-label')).toContain(
      'daily note',
    );
    expect(day(ADV, '2026-11-02').getAttribute('aria-label')).not.toContain(
      'daily note',
    );
    expect(day(ADV, '2026-11-19').getAttribute('aria-current')).toBe('date');
  });

  test('the cell stats are the Calendar page’s own pref: unticking one here changes the cells and saves the pref', async () => {
    const { repo } = await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    // The pref's default: net, trades, win rate and day rating.
    expect(day(ADV, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, +$100.00, 1 trade, 100% win rate',
    );
    fireEvent.click(
      within(widget(ADV)).getByRole('button', { name: 'Stats shown' }),
    );
    const menu = await screen.findByRole('list', { name: 'Stats shown' });
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'Win rate' }));
    await waitFor(async () =>
      expect((await repo.prefs.get()).calendarStats).toEqual([
        'net',
        'trades',
        'rating',
      ]),
    );
    await waitFor(() =>
      expect(day(ADV, '2026-11-02').getAttribute('aria-label')).toBe(
        'Mon 2 Nov, +$100.00, 1 trade',
      ),
    );
  });

  test('a day with trades opens its panel, as the Calendar page does', async () => {
    await renderWidgets([ADV], { sample: november });
    await ready(ADV);
    fireEvent.click(day(ADV, '2026-11-04'));
    const panel = await screen.findByRole('dialog');
    expect(
      within(panel).getByRole('heading', { name: 'Wed 4 Nov' }),
    ).toBeTruthy();
    expect(panel.textContent).toContain('+$200.00');
    expect(
      within(panel).getByRole('link', { name: 'Open daily note' }),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole('link', { name: 'Open in Trades' })
        .getAttribute('href'),
    ).toBe('/app/trades/day?from=2026-11-04&to=2026-11-04');
  });

  test('a one-day date range does not touch it: the month, the stats and the week totals cover every day', async () => {
    await renderWidgets([ADV], {
      sample: november,
      url: '/app/dashboard?from=2026-11-19&to=2026-11-19',
    });
    await ready(ADV);
    expect(said(ADV)).toContain('Month +$250.00, 4 days');
    expect(day(ADV, '2026-11-02').getAttribute('aria-label')).toBe(
      'Mon 2 Nov, +$100.00, 1 trade, 100% win rate',
    );
  });

  test('under Privacy no amount shows in the month stats, a week total or a cell name', async () => {
    await renderWidgets([ADV], {
      sample: november,
      prefs: { displayUnit: 'privacy' as UserPrefs['displayUnit'] },
    });
    await ready(ADV);
    expect(said(ADV)).toContain('Month +$•••, 4 days');
    const totals = widget(ADV).querySelector('[data-testid="week-total"]')!;
    expect(totals.textContent).not.toMatch(/\$\d/);
    for (const b of widget(ADV).querySelectorAll('[data-date]'))
      expect(b.getAttribute('aria-label')).not.toMatch(/\$\d/);
  });
});

describe('the year calendar (C13): twelve months, a month opens the Calendar on it', () => {
  const months = () =>
    within(widget('year')).getAllByTestId('year-month') as HTMLElement[];

  test('the year as the heading, with arrows, the info tip and the year’s net', async () => {
    await renderWidgets(['year'], { sample: november });
    await waitFor(() => expect(months()).toHaveLength(12));
    const card = widget('year');
    expect(within(card).getByRole('heading', { name: '2026' })).toBeTruthy();
    expect(
      card.querySelector('[data-metric-tip="year-calendar"]'),
    ).not.toBeNull();
    expect(said('year')).toContain('4 trading days, net +$250.00');
    expect(
      within(card).getByRole('list', { name: '2026 by month' }),
    ).toBeTruthy();
  });

  test('the months answer to the width of their card: three across, four from 40rem', async () => {
    await renderWidgets(['year'], { sample: november });
    await waitFor(() => expect(months()).toHaveLength(12));
    const list = within(widget('year')).getByRole('list', {
      name: '2026 by month',
    });
    expect(list.className).toContain('grid-cols-3');
    expect(list.className).toContain('@[40rem]:grid-cols-4');
    expect(list.parentElement!.className).toContain('@container');
    // Not the screen's breakpoints: the Reports page keeps its own.
    expect(list.className).not.toMatch(/(^|\s)(sm|lg|xl):grid-cols/);
  });

  test('a month is a link to the Calendar on that month, the filters carried', async () => {
    await renderWidgets(['year'], {
      sample: november,
      url: '/app/dashboard?account=acc-a',
    });
    await waitFor(() => expect(months()).toHaveLength(12));
    const link = within(months()[10]!).getByRole('link');
    expect(link.getAttribute('href')).toBe(
      '/app/calendar?month=2026-11&account=acc-a',
    );
    expect(months()[10]!.textContent).toContain('November');
    expect(months()[10]!.textContent).toContain('+$250.00');
    expect(months()[10]!.textContent).toContain('4 trading days');
    expect(months()[0]!.textContent).toContain('No trades');
  });

  test('the arrows step a year', async () => {
    await renderWidgets(['year'], { sample: november });
    await waitFor(() => expect(months()).toHaveLength(12));
    const card = widget('year');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Previous year' }),
    );
    await waitFor(() =>
      expect(within(card).getByRole('heading', { name: '2025' })).toBeTruthy(),
    );
    expect(within(months()[10]!).getByRole('link').getAttribute('href')).toBe(
      '/app/calendar?month=2025-11',
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Next year' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Next year' }));
    await waitFor(() =>
      expect(within(card).getByRole('heading', { name: '2027' })).toBeTruthy(),
    );
  });

  test('a one-day date range does not touch it, and the other filters do', async () => {
    await renderWidgets(['year'], {
      sample: november,
      url: '/app/dashboard?from=2026-11-19&to=2026-11-19',
    });
    await waitFor(() => expect(months()).toHaveLength(12));
    expect(months()[10]!.textContent).toContain('+$250.00');
    cleanup();
    await renderWidgets(['year'], {
      sample: november,
      url: '/app/dashboard?symbol=ZZZ',
    });
    await waitFor(() => expect(months()).toHaveLength(12));
    expect(months()[10]!.textContent).toContain('No trades');
  });

  test('under Privacy a month’s net is hidden', async () => {
    await renderWidgets(['year'], {
      sample: november,
      prefs: { displayUnit: 'privacy' as UserPrefs['displayUnit'] },
    });
    await waitFor(() => expect(months()).toHaveLength(12));
    expect(widget('year').textContent).not.toMatch(/\$\d/);
    expect(said('year')).toContain('net +$•••');
  });
});
