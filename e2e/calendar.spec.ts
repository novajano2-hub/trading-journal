import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test("open 19 Nov, see the day's trades, write its daily note and find it after a reload", async ({
  page,
}) => {
  await page.goto('/app/calendar');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^Thu 19 Nov/ }).click();
  await expect(page).toHaveURL(/day=2026-11-19/);

  // The day's panel: three trades exited on it.
  const panel = page.getByRole('complementary', { name: /Thu 19 Nov/ });
  await expect(panel).toContainText('Red day');
  const exits = panel.getByRole('table', {
    name: 'Trades that exited on Thu 19 Nov',
  });
  await expect(exits.locator('tbody tr')).toHaveCount(3);
  await expect(exits).toContainText('ES Dec 26');
  await expect(exits).toContainText('AUDUSD');

  // Its daily note: typed in, saved by itself.
  await panel.getByRole('link', { name: 'Open daily note' }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/daily\/2026-11-19/);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  const text = 'Slow day, kept to the plan after the first loss.';
  await page.keyboard.type(text);
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // After a reload the text is still there.
  await page.reload();
  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
});
