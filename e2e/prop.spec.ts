import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('create a 1-step challenge on a new prop account and see its card', async ({
  page,
}) => {
  await page.goto('/app/prop-firms/accounts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Prop firms',
  );
  await page.getByRole('button', { name: 'New challenge' }).click();

  const dialog = page.getByRole('dialog', { name: 'New challenge' });
  await dialog.getByLabel('Challenge name').fill('E2E 25K challenge');
  await dialog.getByLabel('Firm').fill('E2E Funding');
  await dialog
    .getByRole('radiogroup', { name: 'Steps' })
    .getByText('1 step')
    .click();
  const step = dialog.getByRole('group', { name: 'Step 1', exact: true });
  // The account is made on the spot, with the challenge's own balance.
  await step.getByLabel('Account', { exact: true }).selectOption('new');
  await step.getByLabel('New account name').fill('E2E 25K eval');
  await step.getByLabel('Starting balance').fill('25000');
  await step
    .getByRole('textbox', { name: 'Profit target', exact: true })
    .fill('1500');
  await step
    .getByRole('textbox', { name: 'Daily loss limit', exact: true })
    .fill('500');
  await step
    .getByRole('textbox', { name: 'Max drawdown', exact: true })
    .fill('1000');
  await dialog.getByRole('button', { name: 'Create challenge' }).click();
  await expect(dialog).toBeHidden();

  // Its row in the list, then its card in the grid: named, with the firm, the
  // account and its rules.
  await expect(
    page
      .getByRole('table', { name: 'Challenges' })
      .getByRole('link', { name: 'E2E 25K challenge' }),
  ).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Layout' })
    .getByText('Grid')
    .click();
  const card = page.getByRole('article', { name: /E2E 25K challenge/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('E2E Funding, evaluation');
  await expect(card).toContainText('Active');
  await expect(card).toContainText('$25,000.00 from $25,000.00, 1-step');
  await expect(card).toContainText('E2E 25K eval');
  await expect(card).toContainText('$0.00 of $1,500.00');
  await expect(card).toContainText('Max drawdown');

  // And the account it made is in Settings, as a prop account.
  await page.goto('/app/settings/accounts');
  await expect(
    page.getByRole('row', { name: /^Select E2E 25K eval.*Prop evaluation/ }),
  ).toBeVisible({ timeout: 30_000 });
});
