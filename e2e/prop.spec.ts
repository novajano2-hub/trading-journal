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

const DETAILS = '/app/prop-firms/accounts/sample-challenge-futures-50k';

test("a row's View details opens the challenge: phases, balance by Day, Hour and Trade, rules, figures, trades and strategies", async ({
  page,
}) => {
  await page.goto('/app/prop-firms/accounts?tab=funded');
  await page
    .getByRole('table', { name: 'Challenges' })
    .getByRole('link', { name: 'Futures 50K' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${DETAILS}$`));
  await expect(
    page.getByRole('heading', { name: 'Futures 50K', level: 2 }),
  ).toBeVisible();

  // A tab for each phase with its state; the funded phase is the one shown.
  const phases = page.getByRole('navigation', { name: 'Phases' });
  await expect(phases.getByRole('link')).toHaveText([
    'Step 1 Passed',
    'Funded Active',
  ]);
  await expect(phases.locator('a[aria-current="page"]')).toHaveText(
    'Funded Active',
  );
  await expect(
    page.getByRole('heading', { name: 'Funded rules' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark as breached' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Move to funded' }),
  ).toHaveCount(0);

  // The balance, three ways.
  const balance = page.getByRole('radiogroup', { name: 'Balance by' });
  await expect(
    page.getByRole('img', { name: /^Balance by day/ }),
  ).toBeVisible();
  await balance.getByText('Hour').click();
  await expect(
    page.getByRole('img', { name: /^Balance by hour/ }),
  ).toBeVisible();
  await balance.getByText('Trade').click();
  await expect(
    page.getByRole('img', { name: /^Balance by trade/ }),
  ).toBeVisible();

  // The five figures, and the phase's trades: five, then the link to Trades.
  const figures = page.getByRole('region', { name: 'Funded phase figures' });
  for (const name of [
    'Win rate',
    'Average win',
    'Average loss',
    'Best day',
    'Worst day',
  ])
    await expect(figures.getByText(name, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Phase trades' }).getByRole('row'),
  ).toHaveCount(6);
  await expect(
    page.getByRole('link', { name: 'Import into this account' }),
  ).toHaveAttribute('href', '/app/import?account=sample-futures-50k-funded');

  // The step's own page, in the address.
  await phases.getByRole('link', { name: /^Step 1/ }).click();
  await expect(page).toHaveURL(/\?phase=step-1$/);
  await expect(
    page.getByRole('heading', { name: 'Step 1 rules' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark as breached' }),
  ).toHaveCount(0);

  // All its trades, in Trades.
  await page.getByRole('link', { name: /^All \d+ trades in Trades$/ }).click();
  await expect(page).toHaveURL(
    /\/app\/trades\?.*account=sample-futures-50k-eval/,
  );
});

test('attach and detach a strategy on the challenge, and a bad id is a plain page with a way back', async ({
  page,
}) => {
  await page.goto(DETAILS);
  const strategies = page.getByRole('region', { name: 'Strategies' }).or(
    page.locator('section', {
      has: page.getByRole('heading', { name: 'Strategies' }),
    }),
  );
  await strategies.getByRole('button', { name: 'Attach' }).click();
  const picker = page.getByRole('dialog', { name: 'Attach strategies' });
  await picker.getByText('Level reversal').click();
  await expect(
    strategies.getByRole('button', { name: 'Detach Level reversal' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  // Written to the challenge: it is still there after a reload.
  await page.reload();
  await expect(
    strategies.getByRole('button', { name: 'Detach Level reversal' }),
  ).toBeVisible();
  await strategies
    .getByRole('button', { name: 'Detach Level reversal' })
    .click();
  await expect(
    strategies.getByRole('button', { name: 'Detach Level reversal' }),
  ).toHaveCount(0);
  await expect(
    strategies.getByRole('button', { name: 'Detach Opening range breakout' }),
  ).toBeVisible();

  await page.goto('/app/prop-firms/accounts/no-such-challenge');
  await expect(page.getByText("That challenge isn't here.")).toBeVisible();
  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page).toHaveURL(/\/app\/prop-firms\/accounts$/);
});

test('Mark as breached from the details page asks why, and the challenge keeps no way back', async ({
  page,
}) => {
  await page.goto(DETAILS);
  await page.getByRole('button', { name: 'Mark as breached' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Mark Futures 50K as breached',
  });
  await dialog.getByText('Time pressure').click();
  await dialog.getByRole('button', { name: 'Mark as breached' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Breached .*: Time pressure$/)).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Phases' }).getByRole('link'),
  ).toHaveText(['Step 1 Passed', 'Funded Breached']);
  await expect(
    page.getByRole('button', { name: 'Mark as breached' }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Accounts' })).toHaveAttribute(
    'href',
    '/app/prop-firms/accounts?tab=breached',
  );
});

test('Move to funded from the details page asks first, then the funded phase is the one shown', async ({
  page,
}) => {
  await page.goto('/app/prop-firms/accounts/sample-challenge-forex-100k');
  const phases = page.getByRole('navigation', { name: 'Phases' });
  await expect(phases.locator('a[aria-current="page"]')).toHaveText(
    'Step 1 Active',
  );
  await page.getByRole('button', { name: 'Move to funded' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Move Forex 100K to funded?',
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Move to funded' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Move to funded' }).click();
  await dialog.getByRole('button', { name: 'Move to funded' }).click();
  await expect(dialog).toBeHidden();
  await expect(phases.locator('a[aria-current="page"]')).toHaveText(
    'Funded Active',
  );
  await expect(
    page.getByRole('button', { name: 'Move to funded' }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/sample-challenge-forex-100k$/);
});

test('a challenge page does not overflow sideways from 390 to 1680', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const id of [
    'sample-challenge-futures-50k',
    'sample-challenge-futures-100k',
    'sample-challenge-forex-100k',
  ]) {
    await page.goto(`/app/prop-firms/accounts/${id}`);
    await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole('navigation', { name: 'Phases' }),
    ).toBeVisible();
    for (const width of [390, 768, 1024, 1280, 1440, 1680]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { message: `${id} at ${width}` },
        )
        .toBeLessThanOrEqual(0);
    }
  }
});

test('Transactions: filter, add a row with Enter, set a status, change a category, Log a payout and delete, each in its place', async ({
  page,
}) => {
  await page.goto('/app/prop-firms/transactions');
  const table = page.getByRole('table', { name: 'Transactions' });
  const rows = table.locator('tr[data-txn]');
  await expect(rows).toHaveCount(9);
  // The filter keeps 9, 3, 6 and 3 rows of the sample, and shows no counts.
  const show = page.getByRole('radiogroup', { name: 'Show' });
  await expect(show).toHaveText('AllIncomeCostsTo review');
  for (const [name, count] of [
    ['Income', 3],
    ['Costs', 6],
    ['To review', 3],
    ['All', 9],
  ] as const) {
    await show.getByText(name, { exact: true }).click();
    await expect(rows, name).toHaveCount(count);
  }

  // A new row: today, uncategorized, not reviewed; Enter saves it.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    '2026-11-20',
  );
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue(
    'uncategorized',
  );
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue(
    'not-reviewed',
  );
  await page
    .getByLabel('Description', { exact: true })
    .fill('E2E chart package');
  await page.getByLabel('Amount', { exact: true }).fill('-300');
  await page.getByLabel('Amount', { exact: true }).press('Enter');
  const added = rows.filter({ hasText: 'E2E chart package' });
  await expect(added).toContainText('−$300.00');
  await expect(added).toContainText('Not reviewed');
  await expect(rows).toHaveCount(10);
  await expect(
    page.getByRole('button', { name: 'Add transaction' }),
  ).toBeFocused();

  // The category's edit control, and the row's menu.
  await page
    .getByRole('button', { name: 'Edit the category of E2E chart package' })
    .click();
  await page.getByRole('menuitemradio', { name: 'Reset fee' }).click();
  await expect(added).toContainText('Reset fee');
  await page
    .getByRole('button', { name: 'Actions for E2E chart package' })
    .click();
  await page.getByRole('menuitem', { name: 'Mark as ignored' }).click();
  await expect(added).toHaveAttribute('data-ignored', 'true');
  await expect(added).toContainText('Ignored');

  // Log a payout: only the funded challenge is listed, and it shows at once.
  await page.getByRole('button', { name: 'Log payout' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a payout' });
  await expect(dialog.getByLabel('Funded account')).toHaveText(
    'Futures 50K, Sample prop firm',
  );
  await dialog.getByLabel('Amount', { exact: true }).fill('1500');
  await dialog.getByRole('button', { name: 'Add payout' }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(11);
  await expect(rows.filter({ hasText: '+$1,500.00' })).toContainText('Payout');
  await expect(page.getByRole('button', { name: 'Log payout' })).toBeFocused();

  // Delete asks first and is for good.
  await page
    .getByRole('button', { name: 'Actions for E2E chart package' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', {
    name: 'Delete this transaction?',
  });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows).toHaveCount(11);
  await page
    .getByRole('button', { name: 'Actions for E2E chart package' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(rows).toHaveCount(10);
  await page.reload();
  await expect(rows).toHaveCount(10);
});

test('the Transactions and Accounts tabs do not overflow sideways from 390 to 1680, with the add row open', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const route of [
    '/app/prop-firms/transactions',
    '/app/prop-firms/accounts',
  ]) {
    await page.goto(route);
    await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    if (route.endsWith('transactions'))
      await page.getByRole('button', { name: 'Add transaction' }).click();
    for (const width of [390, 640, 768, 1024, 1280, 1440, 1680]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { message: `${route} at ${width}` },
        )
        .toBeLessThanOrEqual(0);
    }
  }
});
