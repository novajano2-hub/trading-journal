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
}, info) => {
  for (const [path, title] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    if (path === '/app/dashboard') await ready(page);
    // The chips show only where the filters drive the page.
    // Below sm the chips are one "Filters" button.
    const chips =
      info.project.name === 'mobile'
        ? page.getByRole('banner').getByRole('button', { name: /^Filters/ })
        : page.getByRole('group', { name: 'Filters' });
    await expect(chips).toHaveCount(
      [
        '/app/dashboard',
        '/app/trades',
        '/app/calendar',
        '/app/reports',
        '/app/strategies',
      ].includes(path)
        ? 1
        : 0,
    );
    if (path === '/app/trades')
      await expect(
        page.getByRole(info.project.name === 'mobile' ? 'list' : 'table', {
          name: 'Trades',
        }),
      ).toBeVisible();
    if (path === '/app/calendar')
      await expect(page.getByTestId('calendar-ready')).toBeVisible();
    if (path === '/app/strategies')
      await expect(
        page.getByRole('link', { name: 'Opening range breakout' }),
      ).toBeVisible();
    // Daily journal: the seed's 20 daily reviews and its 95 pre-market plans.
    if (path === '/app/notebook')
      await expect(
        page.getByRole('list', { name: 'Notes' }).getByRole('listitem'),
      ).toHaveCount(115, { timeout: 20_000 });
    // Settings opens on Profile, with its five sections.
    if (path === '/app/settings') {
      await expect(page).toHaveURL(/\/app\/settings\/profile$/);
      await expect(
        page
          .getByRole('navigation', { name: 'Settings' })
          .locator('a[aria-current="page"]'),
      ).toHaveText('Profile');
    }
    if (path === '/app/reports')
      await expect(page.getByTestId('reports-overview')).toBeVisible({
        timeout: 20_000,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      path,
    ).toBeLessThanOrEqual(0);
    if (
      ![
        '/app/dashboard',
        '/app/import',
        '/app/trades',
        '/app/calendar',
        '/app/reports',
        '/app/strategies',
        '/app/notebook',
        '/app/prop-firms',
        '/app/settings',
      ].includes(path)
    ) {
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
  await expect(page).toHaveURL(/\/app\/trades\/day\?range=last-week$/);
  await expect(
    page.getByRole('link', { name: 'Trades', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('below sm a tab bar navigates: Dashboard, Trades, Calendar, Reports and More (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard?side=long');
  await ready(page);
  // No hamburger and no drawer on a phone.
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeHidden();
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs.getByRole('listitem')).toHaveText([
    'Dashboard',
    'Trades',
    'Calendar',
    'Reports',
    'More',
  ]);
  // Pinned to the foot, every target at least 44px.
  const bar = (await tabs.boundingBox())!;
  expect(Math.round(bar.y + bar.height)).toBe(844);
  for (const item of await tabs.getByRole('listitem').all()) {
    const box = (await item.locator('a, button').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(tabs.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await tabs.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/\/app\/calendar\?side=long$/);
  await expect(tabs.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const more = tabs.getByRole('button', { name: 'More' });
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(
    sheet.getByRole('button', { name: /Sample workspace/ }),
  ).toBeVisible();
  for (const name of [
    'Strategies',
    'Notebook',
    'Import',
    'Prop firms',
    'Settings',
  ])
    await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(
    sheet.getByRole('list', { name: 'Not live yet' }).getByRole('link'),
  ).toHaveCount(4);
  await expect(
    sheet.getByRole('radiogroup', { name: 'Appearance' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();

  await more.click();
  await sheet.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings\/profile$/);
  await expect(sheet).toBeHidden();
  // More holds the current page, so it reads as the current tab.
  await expect(more).toHaveClass(/text-accent-ink/);
});

test('from sm to lg the drawer still opens, closes on Escape, and returns focus (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/app/trades');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
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

test('switching workspace in the More sheet closes it (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard?side=long');
  await ready(page);
  const more = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'More' });
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await sheet.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/app\/dashboard\?side=long$/);
  await expect(more).toBeFocused();
});

test('below sm the bar is one row pinned to the top, and the page scrolls clear of the tab bar (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard');
  await ready(page);
  const bar = page.getByRole('banner');
  // One 56px row: the title with its badge, then plain icons. No Import, no theme.
  const top = (await bar.boundingBox())!;
  expect(Math.round(top.height)).toBe(56);
  for (const control of [
    bar.getByRole('heading', { level: 1 }),
    bar.getByRole('button', { name: /^Filters/ }),
    bar.getByRole('combobox', { name: 'Search' }),
    bar.getByRole('button', { name: /show as / }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(56);
  }
  await expect(bar.getByText('Sample', { exact: true })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Import' })).toBeHidden();
  // Icons, not boxes: no border on the resting controls.
  for (const control of [
    bar.getByRole('button', { name: /^Filters/ }),
    bar.getByRole('button', { name: /show as / }),
  ])
    await expect(control).toHaveCSS('border-top-width', '0px');

  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  const pinned = (await bar.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(pinned.y).toBeGreaterThanOrEqual(0);
  expect(pinned.y + pinned.height).toBeLessThanOrEqual(56);

  // At the very end, the last card sits above the tab bar.
  await page.mouse.wheel(0, 100_000);
  await expect
    .poll(() =>
      page.evaluate(
        () => innerHeight + scrollY >= document.body.scrollHeight - 1,
      ),
    )
    .toBe(true);
  const tabs = (await page
    .getByRole('navigation', { name: 'Main' })
    .boundingBox())!;
  const last = await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Recent trades' }) })
    .boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(tabs.y);
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

test('Tab walks the top bar in the order it reads: title, chips, search, Display, Import', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  const bar = page.getByRole('banner');
  const filters = bar.getByRole('group', { name: 'Filters' });
  const chip = (name: string) =>
    filters.getByRole('button', { name, exact: true });
  // A phone reaches Import from More, so its bar ends at Display.
  const tail = [
    bar.getByRole('combobox', { name: 'Search' }),
    bar.getByRole('button', { name: /show as / }),
    ...(mobile ? [] : [bar.getByRole('link', { name: 'Import' })]),
  ];
  // What comes before the bar: the skip link on phones, the sidebar's last link on desktop.
  const before = mobile
    ? page.getByRole('link', { name: 'Skip to content' })
    : page.getByRole('link', { name: 'Settings' });
  // No menu button on a phone: the tab bar navigates.
  const menu: Locator[] = [];

  await page.goto('/app/dashboard');
  await ready(page);
  // Below sm the chips are one Filters button (its sheet is tested in trades.spec).
  const sheet = bar.getByRole('button', { name: /^Filters/ });
  await walkBar(page, before, [
    ...menu,
    ...(mobile
      ? [sheet]
      : ['All time', 'Symbol', 'Side', 'Strategy', 'Tags', 'More filters'].map(
          chip,
        )),
    ...tail,
  ]);

  // Busy filters: on desktop the chips take their own row, still read before search.
  await page.goto(`/app/dashboard${BUSY}`);
  await expect(mobile ? sheet : chip('Short')).toBeEnabled();
  if (!mobile) await expect(bar).toHaveAttribute('data-chips', 'wrapped');
  await walkBar(page, before, [
    ...menu,
    ...(mobile
      ? [sheet]
      : [
          '5 Oct-20 Nov 2026',
          'AUDUSD, BTCUSD',
          'Short',
          'Opening range breakout',
          'trend continuation',
          'More filters',
          'Clear filters',
        ].map(chip)),
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
