import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('add a withdrawal, archive an account, and read one of its trades read-only', async ({
  page,
}) => {
  await page.goto('/app/settings/accounts');
  const accounts = page.getByRole('table', { name: /^Accounts/ });
  await expect(accounts).toBeVisible({ timeout: 30_000 });
  const row = (name: string) =>
    accounts.getByRole('row', { name: new RegExp(`^${name}`) });
  await expect(row('Futures live')).toContainText('$60,860.55');

  // A withdrawal on one account moves its balance on its date.
  await page.getByRole('button', { name: 'Actions for Futures live' }).click();
  await page
    .getByRole('menuitem', { name: 'Deposits and withdrawals' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Balance adjustments' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add adjustment' }).click();
  const form = page.getByRole('form', { name: 'New deposit or withdrawal' });
  await form.getByLabel('Date').fill('2026-11-18');
  await form
    .getByRole('radiogroup', { name: 'Type' })
    .getByText('Withdrawal')
    .click();
  await form.getByLabel('Amount').fill('500');
  await form.getByLabel('Note').fill('Payout to bank');
  await form.getByRole('button', { name: 'Save' }).click();

  const adjustments = page.getByRole('table', { name: 'Balance adjustments' });
  await expect(adjustments).toContainText('Withdrawal');
  await expect(adjustments).toContainText('Payout to bank');
  await expect(adjustments).toContainText('−$500.00');
  await expect(row('Futures live')).toContainText('$60,360.55');

  // Archive another account: it keeps its history but is marked as gone.
  await page
    .getByRole('button', { name: 'Actions for Stocks & options' })
    .click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(row('Stocks & options')).toContainText('Archived');

  // Its trades open read-only: the review toggle is locked and a note says why.
  await page.getByRole('link', { name: 'Trades', exact: true }).first().click();
  await expect(page.getByRole('table', { name: 'Trades' })).toBeVisible();
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page
    .getByRole('menuitemcheckbox', { name: /Stocks & options/ })
    .click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/account=/);
  const first = page
    .getByRole('table', { name: 'Trades' })
    .locator('tbody tr')
    .first();
  await first.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/app\/trades\/(?!new)[^/?]+(\?.*)?$/);
  await expect(
    page.getByText('This account is archived. Its trades are read-only.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reviewed', exact: true }),
  ).toBeDisabled();
});

test('Accounts fits the card at 1440: Prop rules whole, clear of the actions', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'checked at desktop width');
  await page.goto('/app/settings/accounts');
  const table = page.getByRole('table', { name: /^Accounts/ });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const fit = await table.evaluate((t) => ({
    scroll: t.parentElement!.scrollWidth - t.parentElement!.clientWidth,
    page:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(fit).toEqual({ scroll: 0, page: 0 });
  const rules = await table.getByText('Does not apply').first().boundingBox();
  const actions = await table
    .getByRole('button', { name: /^Actions for/ })
    .first()
    .boundingBox();
  expect(rules!.x + rules!.width).toBeLessThanOrEqual(actions!.x);
  // The sample workspace shows no Last import line: imports never land there. The broker still reads whole (two lines, no ellipsis).
  await expect(table.getByText(/^Last import/)).toHaveCount(0);
  const broker = await table
    .getByRole('row', { name: /^Futures live/ })
    .locator('td:nth-child(2) span')
    .evaluate((e) => e.scrollHeight <= e.clientHeight);
  expect(broker).toBe(true);
});
