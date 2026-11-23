import { expect, test, type Page } from '@playwright/test';

// The times in the file and the account are read in one zone, so the days the
// calendar books them on do not depend on the machine running the suite.
test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function intoMyWorkspace(page: Page) {
  await page.goto('/app/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(
    page.getByRole('button', { name: /My workspace/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

test('import a fills file in My workspace, see it in the log and the calendar, then undo it', async ({
  page,
}) => {
  await intoMyWorkspace(page);

  // Upload.
  await page.goto('/app/import');
  await page.getByLabel('Import file').setInputFiles('e2e/fixtures/fills.csv');
  await expect(page.getByText('fills.csv').first()).toBeVisible();
  await page.getByRole('button', { name: 'Map columns' }).click();

  // Map: an account made on the spot, and the columns the file already matches.
  await expect(
    page.getByRole('heading', { name: 'Match your columns' }),
  ).toBeVisible();
  await expect(
    page.getByText('Required fields are all matched.'),
  ).toBeVisible();
  await page.getByLabel('Account name').fill('Journey account');
  await page.getByLabel('Broker').fill('Journey broker');
  await page.getByLabel('Starting balance').fill('50000');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: /^Preview 12 rows/ }).click();

  // Preview: six trades Keel built from twelve fills, nothing skipped.
  await expect(page.getByText('Trades built')).toBeVisible();
  const preview = page.getByRole('main');
  await expect(preview).toContainText('Net P&L of the 6 trades');
  await expect(preview).toContainText('+$812.50');
  await expect(preview).toContainText('Showing 6 of 6.');

  // Confirm.
  await page
    .getByRole('button', { name: 'Import 6 trades into Journey account' })
    .click();
  await expect(
    page.getByText('6 trades imported into Journey account.'),
  ).toBeVisible();

  // The log has them, and only them: My workspace was empty.
  await page.getByRole('button', { name: 'View trades' }).click();
  const log = page.getByRole('table', { name: 'Trades' });
  await expect(log).toBeVisible();
  await expect(log.locator('tbody tr')).toHaveCount(6);
  await expect(log).toContainText('ES Dec 26');
  await expect(log).toContainText('NQ Dec 26');

  // The calendar books them on the days they exited.
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByTestId('calendar-ready')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Wed 18 Nov.*3 trades/ }),
  ).toContainText('+$255.00');
  await expect(
    page.getByRole('button', { name: /^Thu 19 Nov.*3 trades/ }),
  ).toContainText('+$557.50');

  // Import history lists it, and Undo takes it out again.
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Logs' }).click();
  const history = page.getByRole('table');
  await expect(history).toContainText('fills.csv');
  await expect(history).toContainText('Journey account');
  await history.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Undo/ }).click();
  await expect(history).toContainText('Undone');

  await page.getByRole('link', { name: 'Trades', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No trades yet.' }),
  ).toBeVisible();
});
