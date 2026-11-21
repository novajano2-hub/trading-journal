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
