import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the Day and Week filters round-trip in the URL', async ({ page }) => {
  // A range from the address, a symbol from the Filters menu.
  await page.goto('/app/trades/day?from=2026-11-09&to=2026-11-20');
  const views = page.getByRole('navigation', { name: 'Trade views' });
  await expect(views).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('article').first()).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: /Symbol/ })
    .click();
  await page.getByRole('checkbox', { name: 'ES', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/symbol=ES/);

  // Week keeps both params, and shows a week card.
  await views.getByRole('link', { name: 'Week' }).click();
  await expect(page).toHaveURL(/\/app\/trades\/week\?/);
  await expect(page).toHaveURL(/symbol=ES/);
  await expect(page).toHaveURL(/from=2026-11-09/);
  await expect(page).toHaveURL(/to=2026-11-20/);
  await expect(page.getByRole('article').first()).toBeVisible({
    timeout: 30_000,
  });

  // And back: Day has them still.
  await views.getByRole('link', { name: 'Day' }).click();
  await expect(page).toHaveURL(/\/app\/trades\/day\?/);
  await expect(page).toHaveURL(/symbol=ES/);
  await expect(page).toHaveURL(/from=2026-11-09/);
  await expect(page).toHaveURL(/to=2026-11-20/);
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('a trade opened from the Day view backs out to the Day view, filters kept', async ({
  page,
}) => {
  await page.goto('/app/trades/day?from=2026-11-09&to=2026-11-20');
  const first = page.getByRole('article').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.getByRole('button', { name: /^Expand / }).click();
  await first.getByRole('table').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/app\/trades\/(?!day|week)[^/?]+\?/);
  await page
    .getByRole('heading', { level: 1 })
    .getByRole('link', { name: 'Trades' })
    .click();
  await expect(page).toHaveURL(
    /\/app\/trades\/day\?.*from=2026-11-09.*to=2026-11-20/,
  );
  await expect(page.getByRole('article').first()).toBeVisible();
});
