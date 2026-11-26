import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function ready(page: Page) {
  await expect(
    page.getByRole('region', { name: 'History' }).getByRole('grid'),
  ).toBeVisible({ timeout: 20_000 });
}

test('the tiles show the streak, the score and today', async ({ page }) => {
  await page.goto('/app/progress');
  await ready(page);
  const tiles = page.getByRole('region', { name: 'Summary' });
  await expect(tiles).toContainText('Current streak');
  await expect(tiles).toContainText('Score');
  await expect(tiles).toContainText('Today');
  await expect(tiles).toContainText(/\d+ days?/);
});

test('a grid hover reads rules met', async ({ page }) => {
  await page.goto('/app/progress');
  await ready(page);
  const history = page.getByRole('region', { name: 'History' });
  await history.locator('[role="gridcell"][data-step]').last().hover();
  await expect(history.getByText(/\d+ of \d+ rules met/)).toBeVisible();
});

test('Edit rules: a trading day switched off shows in today, once saved', async ({
  page,
}) => {
  await page.goto('/app/progress');
  await ready(page);
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today).not.toContainText("isn't a trading day");
  // The caption names today's weekday, e.g. "Fri 20 Nov".
  const weekday = (await today.innerText()).match(
    /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/,
  )?.[1];
  expect(SHORT_DAYS).toContain(weekday);
  await page.getByRole('button', { name: 'Edit rules' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit rules' });
  const day = dialog
    .getByRole('group', { name: 'Trading days' })
    .getByRole('button', { name: weekday!, exact: true });
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(today).toContainText("isn't a trading day");
});

test("the dashboard card's link opens the page on the same range", async ({
  page,
}) => {
  await page.goto('/app/dashboard?from=2026-11-02&to=2026-11-20');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 20_000,
  });
  const card = page.getByRole('region', { name: 'Progress tracker' });
  await expect(card).toContainText(/\d+ of \d+ rules met/);
  await expect(
    card.getByRole('link', { name: "Today's checklist" }),
  ).toHaveAttribute(
    'href',
    /^\/app\/day\/\d{4}-\d{2}-\d{2}\/plan\?from=2026-11-02&to=2026-11-20$/,
  );
  await card.getByRole('link', { name: 'Open tracker' }).click();
  await expect(page).toHaveURL(
    /\/app\/progress\?from=2026-11-02&to=2026-11-20$/,
  );
  await ready(page);
});
