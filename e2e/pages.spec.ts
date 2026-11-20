import { expect, test } from '@playwright/test';
import { textContrast } from './figures';

for (const path of [
  '/pricing',
  '/brokers',
  '/changelog',
  '/login',
  '/signup',
  '/terms',
  '/privacy',
])
  test(`page ${path}`, async ({ page }) => {
    expect((await page.goto(path))!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test('auth forms are honest', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /log in/i })).toBeDisabled();
  await expect(
    page.getByText(/Accounts open with the app release/),
  ).toBeVisible();
});

for (const [path, name] of [
  ['/login', 'Log in'],
  ['/signup', 'Create account'],
] as const)
  test(`${path} submit is closed in the world's own materials`, async ({
    page,
  }) => {
    await page.goto(path);
    const submit = page.getByRole('button', { name });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Opens with app release')).toBeVisible();
    // Card stock under the label, never a faded grey fill.
    await expect(submit).toHaveCSS('background-color', 'rgb(244, 246, 248)');
    await expect(submit).toHaveCSS('opacity', '1');
    expect(await textContrast(submit)).toBeGreaterThanOrEqual(4.5);
  });

test('pricing invents no price', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText(/to be announced/i).first()).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/\$\d/);
});

test('brokers page has the export anchor', async ({ page }) => {
  await page.goto('/brokers#export');
  await expect(page.locator('#export')).toBeVisible();
  await expect(
    page.getByText('Direct broker sync is on the roadmap.'),
  ).toBeVisible();
});
