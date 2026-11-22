import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function ready(page: Page) {
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 20_000,
  });
}

const ROUTES = [
  ['/app/dashboard', 'Dashboard'],
  ['/app/trades', 'Trades'],
  ['/app/calendar', 'Calendar'],
  ['/app/reports', 'Reports'],
  ['/app/strategies', 'Strategies'],
  ['/app/notebook', 'Notebook'],
  ['/app/import', 'Import'],
  ['/app/prop-firms', 'Prop firms'],
  ['/app/backtesting', 'Backtesting'],
  ['/app/replay', 'Replay'],
  ['/app/mentors', 'Mentors'],
  ['/app/assistant', 'Assistant'],
  ['/app/settings', 'Settings'],
] as const;

test('every app route renders its title without overflow; placeholders state it plainly', async ({
  page,
}) => {
  for (const [path, title] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    if (path === '/app/dashboard') await ready(page);
    if (path === '/app/trades')
      await expect(page.getByRole('table', { name: 'Trades' })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      path,
    ).toBeLessThanOrEqual(0);
    if (!['/app/dashboard', '/app/import', '/app/trades'].includes(path)) {
      await expect(page.locator('main')).toContainText(
        /isn't (built|live) yet\./,
      );
      await expect(page.locator('main')).not.toContainText('$');
    }
  }
});

test('/app goes to the Dashboard', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/dashboard$/);
});

test('sidebar by keyboard keeps the filters (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard?range=last-week');
  await ready(page);
  await page.getByRole('link', { name: 'Dashboard' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Trades', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/trades\?range=last-week$/);
  await expect(
    page.getByRole('link', { name: 'Trades', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('mobile drawer opens, closes on Escape, and returns focus (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/trades');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Calendar' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('⌘K focuses search (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/trades');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trades');
  const search = page.getByRole('combobox', { name: 'Search' });
  await expect(search).not.toBeFocused();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search).toBeFocused();
});

test('search opens on a click of its icon and finds a module (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/trades');
  const search = page.getByRole('combobox', { name: 'Search' });
  // The input's box is wider than its resting shell: click the icon end.
  await search.click({ position: { x: 10, y: 10 } });
  await expect(search).toBeFocused();
  await search.fill('Calendar');
  await page.getByRole('option', { name: /Calendar/ }).click();
  await expect(page).toHaveURL(/\/app\/calendar/);
});

test('switching workspace in the drawer closes it (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard?side=long');
  await ready(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const sheet = page.getByRole('dialog', { name: 'Navigation' });
  await sheet.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/app\/dashboard\?side=long$/);
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
});

test('below sm the menu and title stay put; the chips and controls scroll away (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard');
  await ready(page);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  const bar = page.getByRole('banner');
  for (const pinned of [
    bar.getByRole('heading', { level: 1 }),
    bar.getByRole('button', { name: 'Open navigation' }),
  ]) {
    const box = (await pinned.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(56);
  }
  for (const gone of [
    bar.getByRole('group', { name: 'Filters' }),
    bar.getByRole('link', { name: 'Import' }),
    bar.getByRole('button', { name: 'Switch to dark theme' }),
  ]) {
    const box = (await gone.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(0);
  }
});

const BUSY =
  '?from=2026-10-05&to=2026-11-20&symbol=AUDUSD&symbol=BTCUSD&side=short&strategy=sample-strategy-1&tag=sample-tag-4';

/**
 * Tabs from `from` through the top bar. Each Tab must land on the next of
 * `stops`, the Tab after them must leave the bar, and the stops must read in
 * that order on screen: row by row, left to right (WCAG 2.4.3). The chips
 * scroll inside one group, so the group stands for them on screen.
 */
async function walkBar(page: Page, from: Locator, stops: Locator[]) {
  await from.focus();
  for (const [i, stop] of stops.entries()) {
    await page.keyboard.press('Tab');
    await expect(stop, `stop ${i + 1}`).toBeFocused();
    await page.evaluate(
      (n) => document.activeElement!.setAttribute('data-walk', String(n)),
      i,
    );
  }
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('header')),
    'the Tab after the last stop leaves the bar',
  ).toBe(false);

  // Where each stop sits at rest: with focus gone the search folds back.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-walk]')]
      .sort((a, b) => Number(a.dataset.walk) - Number(b.dataset.walk))
      .map((el) => {
        // A radio is a visually hidden input: its group is what shows.
        const unit = el.closest('[role="group"], [role="radiogroup"]') ?? el;
        const r = unit.getBoundingClientRect();
        return { middle: (r.top + r.bottom) / 2, left: r.left };
      }),
  );
  for (let i = 1; i < boxes.length; i++) {
    const [a, b] = [boxes[i - 1]!, boxes[i]!];
    const sameRow = Math.abs(a.middle - b.middle) < 12;
    if (sameRow)
      expect(b.left, `stop ${i + 1} is right of stop ${i}`).toBeGreaterThan(
        a.left - 1,
      );
    else
      expect(
        b.middle,
        `stop ${i + 1} is on a row below stop ${i}`,
      ).toBeGreaterThan(a.middle);
  }
}

test('Tab walks the top bar in the order it reads: title, chips, search, Display, Import, theme', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  const bar = page.getByRole('banner');
  const filters = bar.getByRole('group', { name: 'Filters' });
  const chip = (name: string) =>
    filters.getByRole('button', { name, exact: true });
  const tail = [
    bar.getByRole('combobox', { name: 'Search' }),
    bar.getByRole('button', { name: /show as / }),
    bar.getByRole('link', { name: 'Import' }),
    bar.getByRole('button', { name: 'Switch to dark theme' }),
  ];
  // What comes before the bar: the skip link on phones, the sidebar's last link on desktop.
  const before = mobile
    ? page.getByRole('link', { name: 'Skip to content' })
    : page.getByRole('link', { name: 'Settings' });
  const menu = mobile
    ? [page.getByRole('button', { name: 'Open navigation' })]
    : [];

  await page.goto('/app/dashboard');
  await ready(page);
  await walkBar(page, before, [
    ...menu,
    ...['All time', 'Symbol', 'Side', 'Strategy', 'Tags', 'More filters'].map(
      chip,
    ),
    ...tail,
  ]);

  // Busy filters: on desktop the chips take their own row, still read before search.
  await page.goto(`/app/dashboard${BUSY}`);
  await expect(chip('Short')).toBeEnabled();
  if (!mobile) await expect(bar).toHaveAttribute('data-chips', 'wrapped');
  await walkBar(page, before, [
    ...menu,
    ...[
      '5 Oct-20 Nov 2026',
      'AUDUSD, BTCUSD',
      'Short',
      'Opening range breakout',
      'Trend continuation',
      'More filters',
      'Clear filters',
    ].map(chip),
    ...tail,
  ]);
});

test('the chips sit beside the title while they fit, and never clip "Clear filters" (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const bar = page.getByRole('banner');
  // Busy chips are wider since the rebrand's 13.5px chips; they share the title's row from 1680 (the Display button is narrower than the Gross/Net switch was).
  for (const width of [1280, 1366, 1440, 1680, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/app/dashboard');
    await ready(page);
    await expect(bar, `${width} at rest`).toHaveAttribute(
      'data-chips',
      'inline',
    );

    await page.goto(`/app/dashboard${BUSY}`);
    const filters = page.getByRole('group', { name: 'Filters' });
    // The chips are live once the workspace loads, whatever the filters match.
    await expect(filters.getByRole('button', { name: 'Short' })).toBeEnabled();
    const clear = filters.getByRole('button', { name: 'Clear filters' });
    await expect(clear, `${width} busy`).toBeInViewport({ ratio: 1 });
    await expect(bar).toHaveAttribute(
      'data-chips',
      width >= 1680 ? 'inline' : 'wrapped',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  }
});

test('an empty workspace shows the chips and the P&L choice unavailable, still in the tab order (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard');
  await ready(page);
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  const filters = page.getByRole('group', { name: 'Filters' });
  const side = filters.getByRole('button', { name: 'Side' });
  await expect(side).toHaveAttribute('aria-disabled', 'true');
  // The Display button stays in the bar; its P&L group reads unavailable inside.
  const display = page
    .getByRole('banner')
    .getByRole('button', { name: /show as / });
  await display.click();
  await expect(page.getByRole('group', { name: 'P&L' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(
    page.getByRole('menuitemradio', { name: 'Gross' }),
  ).toHaveAttribute('data-disabled', '');
  await page.keyboard.press('Escape');
  // The menu's exit animation ends with Radix returning focus to its trigger.
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(display).toBeFocused();
  const symbol = filters.getByRole('button', { name: 'Symbol' });
  await symbol.focus();
  await expect(symbol).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(side).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
