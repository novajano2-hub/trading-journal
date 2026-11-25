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

// The sample's routine today is its asOf, 2026-11-19: a live, unfinished day.
// 2026-11-18 and 2026-11-17 are closed days before it, with trades.
const TODAY = '2026-11-19';

test('a mini calendar pick filters the Day view to that day, and the date chip clears it', async ({
  page,
}) => {
  await page.goto('/app/trades/day');
  await expect(page.getByRole('article').first()).toBeVisible({
    timeout: 30_000,
  });
  const calendar = page.getByRole('complementary', { name: 'November 2026' });
  await expect(calendar).toBeVisible();

  // Hovering a day previews its net and count.
  await calendar.getByRole('button', { name: /^Wed 18 Nov/ }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Wed 18 Nov');
  await expect(page.getByRole('tooltip')).toContainText(/12 trades/);

  // The calendar stays pinned while the list scrolls.
  await page.mouse.wheel(0, 1400);
  await expect(calendar).toBeInViewport();

  await calendar.getByRole('button', { name: /^Tue 17 Nov/ }).click();
  await expect(page).toHaveURL(/from=2026-11-17/);
  await expect(page).toHaveURL(/to=2026-11-17/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('article').first().getByRole('heading'),
  ).toHaveText('Tue 17 Nov 2026');
  // The picked day is outlined, and the other days stay underlined to pick from.
  await expect(
    calendar.getByRole('button', { name: /^Tue 17 Nov/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    calendar.getByRole('button', { name: /^Wed 18 Nov/ }),
  ).toHaveAttribute('data-tone', 'gain');

  // The date chip names the day and clears it.
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: /17 Nov 2026/ })
    .click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(page.getByRole('article').nth(1)).toBeVisible();
  await expect(
    calendar.getByRole('button', { name: /^Tue 17 Nov/ }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a day note is edited in the dialog, saved, and read again', async ({
  page,
}) => {
  await page.goto(`/app/trades/day?from=${TODAY}&to=${TODAY}`);
  const card = page.getByRole('article').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: /^(Add|View) note$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Day note' });
  await expect(dialog).toBeVisible();
  const note = dialog.getByRole('textbox', { name: 'Daily note' });
  await expect(note).toHaveAttribute('contenteditable', 'true');
  await note.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Held the retest, took half off.');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Reopened, and after a reload, the text is there.
  await card.getByRole('button', { name: 'View note' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Day note' })
      .getByRole('textbox', { name: 'Daily note' }),
  ).toContainText('Held the retest, took half off.');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await page
    .getByRole('article')
    .first()
    .getByRole('button', { name: 'View note' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Day note' }).getByRole('textbox', {
      name: 'Daily note',
    }),
  ).toContainText('Held the retest, took half off.');
});

test("a finished day's note dialog refuses edits and says why", async ({
  page,
}) => {
  // Close the day on its review page, as the daily loop does.
  await page.goto(`/app/day/${TODAY}/review`);
  await page
    .getByRole('radiogroup', { name: 'Day rating, none' })
    .locator('label')
    .nth(3)
    .click();
  await page.getByRole('button', { name: 'Close the day' }).click();
  const confirm = page.getByRole('dialog', { name: 'Close the day?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Close the day' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(/^Closed at \d\d:\d\d$/)).toBeVisible();

  await page.goto(`/app/trades/day?from=${TODAY}&to=${TODAY}`);
  const card = page.getByRole('article').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: /^(Add|View) note$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Day note' });
  await expect(dialog.getByText(/This day is closed/)).toBeVisible();
  await expect(
    dialog.getByRole('textbox', { name: 'Daily note' }),
  ).toHaveAttribute('contenteditable', 'false');
  await expect(dialog.getByRole('button', { name: 'Templates' })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('button', { name: 'More' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
});

test('the calendar waits behind a Calendar button on a phone, and a pick closes it and filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/trades/day');
  await expect(page.getByRole('article').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Calendar' });
  await sheet.getByRole('button', { name: /^Tue 17 Nov/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/from=2026-11-17/);
  await expect(page.getByRole('article')).toHaveCount(1);
  // No horizontal overflow with the three actions in a row.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
