import { expect, test, type Page } from '@playwright/test';

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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      path,
    ).toBeLessThanOrEqual(0);
    if (!['/app/dashboard', '/app/import'].includes(path)) {
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
  await expect(page.getByRole('link', { name: 'Trades' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/trades\?range=last-week$/);
  await expect(page.getByRole('link', { name: 'Trades' })).toHaveAttribute(
    'aria-current',
    'page',
  );
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

test('below sm the first row stays put and the chips scroll away (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/dashboard');
  await ready(page);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  const title = await page.getByRole('heading', { level: 1 }).boundingBox();
  const chips = await page
    .getByRole('group', { name: 'Filters' })
    .boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(0);
  expect(title!.y).toBeLessThan(56);
  expect(chips!.y + chips!.height).toBeLessThan(0);
  await expect(page.getByRole('link', { name: 'Import' })).toBeInViewport();
});

const BUSY =
  '?from=2026-10-05&to=2026-11-20&symbol=AUDUSD&symbol=BTCUSD&side=short&strategy=sample-strategy-1&tag=sample-tag-4';

test('the chips sit beside the title while they fit, and never clip "Clear filters" (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const bar = page.getByRole('banner');
  for (const width of [1280, 1366, 1440, 1680]) {
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

test('an empty workspace shows the chips and Gross/Net unavailable, still in the tab order (desktop)', async ({
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
  await expect(
    page.getByRole('radiogroup', { name: 'P&L basis' }),
  ).toHaveAttribute('aria-disabled', 'true');
  await filters.getByRole('button', { name: 'Symbol' }).focus();
  await page.keyboard.press('Tab');
  await expect(side).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
