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
    accounts.getByRole('row', { name: new RegExp(`^Select ${name}`) });
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
  // Trades opens the Day view; the account filter is tested on the All view.
  await page
    .getByRole('navigation', { name: 'Trade views' })
    .getByRole('link', { name: 'All' })
    .click();
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
  await expect(page).toHaveURL(
    /\/app\/trades\/(?!(?:new|day|week)(?:[/?]|$))[^/?]+(\?.*)?$/,
  );
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
    .getByRole('row', { name: /^Select Futures live/ })
    .locator('td:nth-child(2) span')
    .evaluate((e) => e.scrollHeight <= e.clientHeight);
  expect(broker).toBe(true);
});

test('Accounts with the selection box in the Name cell still fits at 1440, and the bulk bar sits clear of the table', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'checked at desktop width');
  await page.goto('/app/settings/accounts');
  const table = page.getByRole('table', { name: /^Accounts/ });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('checkbox', { name: 'Select all accounts' })
    .check({ force: true });
  const bar = page.getByRole('toolbar', { name: /selected$/ });
  await expect(bar).toBeVisible();
  const fit = await table.evaluate((t) => ({
    scroll: t.parentElement!.scrollWidth - t.parentElement!.clientWidth,
    page:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(fit).toEqual({ scroll: 0, page: 0 });
});

test('Accounts search and filters live in the address and survive a reload', async ({
  page,
}) => {
  await page.goto('/app/settings/accounts?q=futures&status=active');
  const table = page.getByRole('table', { name: /^Accounts/ });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('searchbox', { name: 'Search accounts' }),
  ).toHaveValue('futures');
  await expect(
    page.getByRole('button', { name: 'Clear filter Status: Active' }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search accounts' }).fill('zzz');
  await expect(page).toHaveURL(/q=zzz/);
  await expect(page.getByText('No account matches.')).toBeVisible();
});

test('Accounts: Back restores the search and filter after leaving the page', async ({
  page,
}) => {
  await page.goto('/app/settings/accounts');
  const box = page.getByRole('searchbox', { name: 'Search accounts' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.fill('futures');
  await page.getByRole('button', { name: /^Filter by/ }).click();
  await page.getByRole('checkbox', { name: 'Active' }).check();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Clear filter Status: Active' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Tags' }).first().click();
  await expect(page).toHaveURL(/settings\/tags/);
  await page.goBack();
  await expect(page).toHaveURL(/q=futures/);
  await expect(page).toHaveURL(/status=active/);
  await expect(
    page.getByRole('searchbox', { name: 'Search accounts' }),
  ).toHaveValue('futures');
  await expect(
    page.getByRole('button', { name: 'Clear filter Status: Active' }),
  ).toBeVisible();
});

test('an edit on a trade shows in the edit history on Logs, and the search narrows it', async ({
  page,
}) => {
  await page.goto('/app/trades');
  const log = page.getByRole('table', { name: 'Trades' });
  await expect(log).toBeVisible({ timeout: 30_000 });
  await log.locator('tbody tr').first().getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Trade \d+\s*$/,
  );

  // Two edits of one trade: its review mark and its rating.
  const reviewed = page.getByRole('button', { name: 'Reviewed' });
  const was = await reviewed.getAttribute('aria-pressed');
  await reviewed.click();
  await expect(reviewed).toHaveAttribute(
    'aria-pressed',
    was === 'true' ? 'false' : 'true',
  );
  const rating = page.getByRole('radiogroup', { name: /^Rating:/ });
  const stars =
    (await rating.getAttribute('aria-label')) === 'Rating: 5 of 5' ? 4 : 5;
  await rating
    .locator('label', {
      has: page.getByRole('radio', { name: `${stars} stars` }),
    })
    .click();
  await expect(
    page.getByRole('radiogroup', { name: `Rating: ${stars} of 5` }),
  ).toBeVisible();

  // Logs lists both, in the profile's zone, by you.
  await page.goto('/app/settings/import-history');
  const history = page.getByRole('table', { name: 'Edit history' });
  await expect(history).toBeVisible({ timeout: 30_000 });
  const rows = history.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('20 Nov, 10:00 GMT−5');
  await expect(rows.nth(0)).toContainText('Trade');
  await expect(rows.nth(0)).toContainText(`Rating`);
  await expect(rows.nth(0)).toContainText(`to ${stars} of 5`);
  await expect(rows.nth(1)).toContainText('Reviewed');
  await expect(rows.nth(1)).toContainText('Edited');
  await expect(rows.nth(1)).toContainText('You');
  await expect(page.getByText('1 to 2 of 2')).toBeVisible();

  // The search narrows them to the field asked for, then to none.
  const search = page.getByRole('searchbox', { name: 'Search edit history' });
  await search.fill('rating');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Rating');
  await expect(page.getByText('1 to 1 of 1')).toBeVisible();
  await search.fill('strategy');
  await expect(page.getByText('No changes match')).toBeVisible();
  await expect(history).toBeHidden();
});
