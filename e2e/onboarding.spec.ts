import { expect, test, type Page } from '@playwright/test';

// A new browser: no storage, so the first run's gate applies.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const cont = (page: Page) => page.getByRole('button', { name: 'Continue' });

test('the first run: gate, welcome, six steps, the dialog, then the toast', async ({
  page,
}, info) => {
  // The sample link, from the sign-up page, is covered too.
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(page).toHaveURL(/\/app\/welcome\/1$/);
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await expect(cont(page)).toBeDisabled();
  await page
    .getByRole('radio', { name: '1 to 3 years' })
    .check({ force: true });
  await cont(page).click();

  await expect(page).toHaveURL(/\/app\/welcome\/2$/);
  await page
    .getByRole('checkbox', { name: 'My own money' })
    .check({ force: true });
  await page
    .getByRole('checkbox', { name: "A prop firm's money" })
    .check({ force: true });
  await cont(page).click();

  await expect(page).toHaveURL(/\/app\/welcome\/3$/);
  await page.getByRole('combobox', { name: 'Main broker' }).fill('inter');
  await page.getByRole('option', { name: 'Interactive Brokers' }).click();
  // A reload mid-survey resumes the answer.
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Main broker' })).toHaveValue(
    'Interactive Brokers',
  );
  await cont(page).click();

  await expect(page).toHaveURL(/\/app\/welcome\/4$/);
  await page.getByRole('checkbox', { name: 'Futures' }).check({ force: true });
  await cont(page).click();

  await expect(page).toHaveURL(/\/app\/welcome\/5$/);
  await page
    .getByRole('checkbox', { name: 'Journal every trade' })
    .check({ force: true });
  await cont(page).click();

  await expect(page).toHaveURL(/\/app\/welcome\/6$/);
  await page.getByRole('radio', { name: 'Other' }).check({ force: true });
  await expect(cont(page)).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Please say where' })
    .fill('A podcast');
  await cont(page).click();

  // Home, held as a skeleton behind the required dialog.
  await expect(page).toHaveURL(/\/app\/home$/);
  const dialog = page.getByRole('dialog', { name: 'Your profile' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  // Any other app route comes back to Home while the dialog is open.
  await page.goto('/app/trades');
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(dialog).toBeVisible();

  await expect(page.getByLabel('Time zone')).toHaveValue('America/New_York');
  await dialog.getByLabel('First name').fill('Sam');
  await dialog.getByLabel('Last name').fill('Doe');
  await dialog.getByLabel('Username').fill('sam.doe');
  await dialog.getByRole('button', { name: 'Finish setup' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Profile saved' }),
  ).toContainText('Re-timing your trades to US/Eastern.');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: /Sam/ })).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: '0 of 3 steps complete' }),
  ).toBeVisible();
  // No horizontal overflow, phone or desktop.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  // The first run is over for good: the welcome sends this browser on.
  await page.goto('/app/welcome');
  await expect(page).toHaveURL(/\/app\/home$/);

  // The switcher sits in the sidebar, which a phone doesn't show.
  if (info.project.name === 'desktop') {
    const switcher = page.getByRole('button', { name: /My workspace/ });
    await expect(switcher).toBeVisible();
    await switcher.click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /My account/ }),
    ).toBeVisible();
  }
});
