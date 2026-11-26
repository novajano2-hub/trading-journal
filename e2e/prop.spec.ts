import { expect, test, type Page } from '@playwright/test';

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

const card = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true });

test('the dashboard moves with the books: add a transaction, log a payout, mark a challenge breached, and read it', async ({
  page,
}) => {
  await page.goto('/app/prop-firms');
  // The sample: nine transactions and three challenges.
  await expect(card(page, 'Total spent')).toContainText('−$1,519.00');
  await expect(card(page, 'Total earned')).toContainText('+$4,500.00');
  await expect(card(page, 'Total earned')).toContainText('2 payouts');
  await expect(card(page, 'Net')).toContainText('+$2,981.00');
  await expect(card(page, 'Net')).toContainText('Return on spend 196.2%');
  await expect(card(page, 'Evaluation')).toContainText(
    '1 active evaluation account',
  );
  await expect(card(page, 'Funded')).toContainText('1 active funded account');
  const breaches = page.getByRole('list', { name: 'Reasons for breaches' });
  await expect(breaches).toContainText('Broke the max drawdown');
  await expect(card(page, 'Pass rate')).toContainText(
    '1 of 2 evaluations passed',
  );
  await expect(
    page.getByRole('img', { name: /^Return over time, 1 year to 20 Nov/ }),
  ).toHaveAccessibleName(
    'Return over time, 1 year to 20 Nov: income +$4,500.00, costs −$1,519.00, net +$2,981.00',
  );

  // A cost, added on Transactions.
  const tabs = page.getByRole('navigation', { name: 'Prop firms' });
  await tabs.getByRole('link', { name: 'Transactions' }).click();
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page
    .getByLabel('Description', { exact: true })
    .fill('E2E chart package');
  await page.getByLabel('Amount', { exact: true }).fill('-300');
  await page.getByLabel('Amount', { exact: true }).press('Enter');
  await expect(
    page
      .getByRole('table', { name: 'Transactions' })
      .locator('tr[data-txn]')
      .filter({ hasText: 'E2E chart package' }),
  ).toContainText('−$300.00');

  // A payout on the funded account.
  await page.getByRole('button', { name: 'Log payout' }).click();
  const payout = page.getByRole('dialog', { name: 'Log a payout' });
  await payout.getByLabel('Amount', { exact: true }).fill('1500');
  await payout.getByRole('button', { name: 'Add payout' }).click();
  await expect(payout).toBeHidden();

  // The evaluation that is still going breaks.
  await tabs.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('button', { name: 'Actions for Forex 100K' }).click();
  await page.getByRole('menuitem', { name: 'Mark as breached' }).click();
  const breach = page.getByRole('dialog', {
    name: 'Mark Forex 100K as breached',
  });
  await breach.getByText('Time pressure').click();
  await breach.getByRole('button', { name: 'Mark as breached' }).click();
  await expect(breach).toBeHidden();

  // The dashboard reads all three.
  await tabs.getByRole('link', { name: 'Dashboard' }).click();
  await expect(card(page, 'Total spent')).toContainText('−$1,819.00');
  await expect(card(page, 'Total earned')).toContainText('+$6,000.00');
  await expect(card(page, 'Total earned')).toContainText('3 payouts');
  await expect(card(page, 'Net')).toContainText('+$4,181.00');
  await expect(card(page, 'Net')).toContainText('Return on spend 229.9%');
  await expect(card(page, 'Evaluation')).toContainText(
    'No active evaluation account',
  );
  await expect(
    page.getByRole('img', { name: /^Return over time, 1 year to 20 Nov/ }),
  ).toHaveAccessibleName(
    'Return over time, 1 year to 20 Nov: income +$6,000.00, costs −$1,819.00, net +$4,181.00',
  );
  await expect(breaches.getByRole('listitem')).toHaveCount(2);
  await expect(breaches).toContainText('Time pressure');
  await expect(breaches).toContainText('Broke the max drawdown');
  await expect(card(page, 'Pass rate')).toContainText(
    '1 of 3 evaluations passed',
  );
  await expect(card(page, 'Pass rate')).toContainText('33.3%');
  // Where the money went: the new cost joins the one other uncategorized cost under its fee type.
  await page
    .getByRole('radiogroup', { name: 'Break down by' })
    .getByText('Fee', { exact: true })
    .click();
  await expect(
    page
      .getByRole('table', { name: 'Where the money went, by fee type' })
      .getByRole('row', { name: /^Uncategorized/ }),
  ).toContainText('−$329.00');
});

test('the filters narrow the dashboard from the address, stay over a reload, and Accounts follows them', async ({
  page,
}) => {
  await page.goto('/app/prop-firms');
  await expect(card(page, 'Total spent')).toContainText('−$1,519.00');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Filters' });
  await popover.getByRole('checkbox', { name: 'Sample data feed' }).check();
  await expect(page).toHaveURL(/[?&]pfirm=Sample\+data\+feed(&|$)/);
  await expect(card(page, 'Total spent')).toContainText('−$29.00');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Filters 1' })).toBeVisible();
  await expect(card(page, 'Total spent')).toContainText('−$29.00');

  // The date chip is the global range and leaves the filter alone.
  await page.getByRole('button', { name: 'All time' }).click();
  const last30 = page
    .getByRole('dialog', { name: 'Date' })
    .getByRole('radio', { name: 'Last 30 days' });
  // The popover is placed a frame after it opens; a forced check does not retry.
  await expect(last30).toBeInViewport();
  await last30.check({ force: true });
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/range=last-30-days/);
  await expect(page).toHaveURL(/pfirm=Sample\+data\+feed/);

  // Clear filters drops both.
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(card(page, 'Total spent')).toContainText('−$1,519.00');
  await expect(page).not.toHaveURL(/pfirm|range/);

  // Accounts: the sub-tab counts follow the filters; Transactions has no chips.
  await page.goto('/app/prop-firms/accounts?pstatus=breached');
  await expect(
    page
      .getByRole('tablist', { name: 'Challenges' })
      .getByRole('tab')
      .filter({ hasText: 'Breached' }),
  ).toContainText('1');
  await expect(page.getByRole('tab', { name: 'Evaluations 0' })).toBeVisible();
  await page.goto('/app/prop-firms/accounts?pfirm=Nobody');
  await expect(
    page.getByText('No challenges match these filters.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByRole('tab', { name: 'Evaluations 1' })).toBeVisible();
  await page.goto('/app/prop-firms/transactions');
  await expect(page.getByRole('table', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Filters/ })).toHaveCount(0);
});

test('the Dashboard does not overflow sideways from 390 to 1680, filtered or not', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const route of [
    '/app/prop-firms',
    '/app/prop-firms?pfirm=Sample+prop+firm&pphase=funded&range=last-30-days',
  ]) {
    await page.goto(route);
    await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(card(page, 'Net')).toBeVisible();
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

test('the first run shows once in an empty My workspace: two rows, the totals, the end, the rows in Transactions, and no run after a reload (C71)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The sample has data: the dashboard, never the run.
  await page.goto('/app/prop-firms');
  await expect(card(page, 'Total spent')).toBeVisible();
  await expect(page.getByText('How do you trade?')).toHaveCount(0);

  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'How do you trade?' }),
  ).toBeVisible();
  // The run stands in for the dashboard: no tabs, no buttons of its own.
  await expect(
    page.getByRole('navigation', { name: 'Prop firms' }),
  ).toHaveCount(0);

  // Step 1: how you trade. Nothing is chosen for you.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page
    .getByRole('radiogroup')
    .locator('label', { hasText: 'Both' })
    .click();
  await expect(page.getByRole('radio', { name: /Both/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: two rows, the second added with Enter.
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    '2026-11-20',
  );
  await page.getByLabel('Firm', { exact: true }).fill('E2E firm');
  await page.getByLabel('Amount', { exact: true }).fill('-165');
  await page
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Evaluation fee' });
  await page.getByRole('button', { name: 'Add transaction' }).click();
  const added = page.getByRole('list', { name: 'Added' });
  await expect(added.getByRole('listitem')).toHaveCount(1);
  await expect(added).toContainText('−$165.00');
  await expect(page.getByLabel('Firm', { exact: true })).toBeFocused();
  await page.getByLabel('Firm', { exact: true }).fill('E2E firm');
  await page.getByLabel('Amount', { exact: true }).fill('1800');
  await page
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Payout' });
  await page.getByLabel('Amount', { exact: true }).press('Enter');
  await expect(added.getByRole('listitem')).toHaveCount(2);
  await expect(added.getByRole('listitem').first()).toContainText('+$1,800.00');

  // The card does not overflow the page, from a phone to a wide screen.
  for (const width of [390, 640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        { message: `step 2 at ${width}` },
      )
      .toBeLessThanOrEqual(0);
  }

  // Step 3: the totals of the two rows.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  const total = (label: string) =>
    page.getByText(label, { exact: true }).locator('xpath=ancestor::div[1]');
  await expect(total('Spent')).toContainText('−$165.00');
  await expect(total('Earned')).toContainText('+$1,800.00');
  await expect(total('Net')).toContainText('+$1,635.00');

  // Step 4, then the dashboard: its figures read the same rows.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Track your active accounts' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to the dashboard' }).click();
  await expect(card(page, 'Total spent')).toContainText('−$165.00');
  await expect(card(page, 'Total earned')).toContainText('+$1,800.00');
  await expect(card(page, 'Net')).toContainText('+$1,635.00');
  await expect(page.getByText('How do you trade?')).toHaveCount(0);

  // The rows are in Transactions.
  await page
    .getByRole('navigation', { name: 'Prop firms' })
    .getByRole('link', { name: 'Transactions' })
    .click();
  const table = page.getByRole('table', { name: 'Transactions' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table).toContainText('E2E firm');
  await expect(table).toContainText('Evaluation fee');
  await expect(table).toContainText('−$165.00');
  await expect(table).toContainText('+$1,800.00');

  // A reload: the dashboard, not the run.
  await page.goto('/app/prop-firms');
  await expect(card(page, 'Net')).toContainText('+$1,635.00');
  await expect(page.getByText('How do you trade?')).toHaveCount(0);
  await expect(page.getByText('Step 1 of 4')).toHaveCount(0);
});
