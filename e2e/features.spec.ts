import { expect, test } from '@playwright/test';

for (const slug of [
  'journal',
  'analytics',
  'strategies',
  'notebook',
  'prop-firms',
  'backtesting',
  'replay',
  'mentors',
])
  test(`feature page ${slug}`, async ({ page }) => {
    const res = await page.goto(`/features/${slug}`);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (['backtesting', 'replay', 'mentors'].includes(slug))
      await expect(page.getByText('In development').first()).toBeVisible();
  });

test('unknown feature 404s', async ({ page }) => {
  expect((await page.goto('/features/nope'))!.status()).toBe(404);
});
