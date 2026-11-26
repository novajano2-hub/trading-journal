import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// The sample's routine today is its asOf, 2026-11-19: a live, unfinished day
// with no session. 2026-11-18 is the day before, with trades.
const TODAY = '2026-11-19';
const PAST = '2026-11-18';

const stages = (page: Page) =>
  page.getByRole('navigation', { name: 'Day stages' });

/** Closes the day on the review page: asks first, then confirms. */
async function closeTheDay(page: Page) {
  await page.getByRole('button', { name: 'Close the day' }).click();
  const dialog = page.getByRole('dialog', { name: 'Close the day?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close the day' }).click();
  await expect(dialog).toBeHidden();
}

test('the daily loop: plan, tick, review, rate, close the day', async ({
  page,
}, info) => {
  // The start-my-day button lives in the desktop top bar.
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard');
  await page.getByRole('button', { name: 'Plan the day' }).click();
  await page
    .getByRole('dialog', { name: 'Plan the day' })
    .or(page.getByRole('group', { name: 'Pick a day' }))
    .first()
    .waitFor();
  await page.getByRole('gridcell', { name: '19 November 2026' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/day/${TODAY}/plan$`));

  const note = page.getByRole('textbox', { name: 'Daily note' });
  await note.click();
  await page.keyboard.type('Waited for the range, then took the break.');
  await page
    .getByRole('checkbox', { name: /Mark key levels before the open/ })
    .check();

  await stages(page).getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/day/${TODAY}/review$`));
  await page
    .getByRole('radiogroup', { name: 'Day rating, none' })
    .locator('label')
    .nth(3)
    .click();
  await expect(
    page.getByRole('radiogroup', { name: 'Day rating, 4 of 5' }),
  ).toBeVisible();

  await closeTheDay(page);
  await expect(page.getByText(/^Closed at \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByText('Locked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close the day' })).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole('radiogroup', { name: 'Day rating, 4 of 5' })
      .getByRole('radio')
      .first(),
  ).toBeDisabled();
  await expect(note).toHaveAttribute('contenteditable', 'false');
  // The stages still navigate.
  await stages(page).getByRole('link', { name: 'Plan' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/day/${TODAY}/plan$`));
  await expect(
    page.getByRole('textbox', { name: 'Daily note' }),
  ).toHaveAttribute('contenteditable', 'false');

  // The tracker's today row is closed: its ticks no longer take a click.
  await page.goto('/app/progress');
  const today = page.getByRole('region', { name: 'Today' });
  await expect(
    today.getByRole('checkbox', { name: /Mark key levels before the open/ }),
  ).toBeDisabled();
});

test('a closed day refuses edits from the trade page and the Notebook', async ({
  page,
}) => {
  // The sample's past days are already closed.
  await page.goto(`/app/day/${PAST}/review`);
  await expect(page.getByText(/^Closed at \d\d:\d\d$/)).toBeVisible();

  // A trade of that day: its Daily note is the same note, read-only.
  // (The phone lists the rows without a table, so find the trade by its link.)
  await page
    .getByRole('region', { name: 'Trades' })
    .locator('a[href^="/app/trades/"]')
    .first()
    .click();
  // The segmented control's input is visually hidden: click its label.
  await page
    .getByRole('radiogroup', { name: 'Note' })
    .getByText('Daily note', { exact: true })
    .click();
  await expect(page.getByText(/This day is closed/)).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Daily note' }),
  ).toHaveAttribute('contenteditable', 'false');

  await page.goto(`/app/notebook/daily/${PAST}`);
  await expect(page.getByText(/This day is closed/)).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Note', exact: true }),
  ).toHaveAttribute('contenteditable', 'false');
});

test('a day page never scrolls sideways from phone to wide desktop (D3)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const width of [390, 768, 1024, 1280, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [`${TODAY}/plan`, `${PAST}/review`]) {
      await page.goto(`/app/day/${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const [scroll, inner] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      expect(scroll, `${path} at ${width}`).toBeLessThanOrEqual(inner);
    }
  }
});
