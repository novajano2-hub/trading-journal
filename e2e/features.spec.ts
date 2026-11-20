import { expect, test } from '@playwright/test';
import { cutOffText } from './figures';

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

for (const slug of ['journal', 'strategies'])
  test(`${slug} tickets print every figure in full`, async ({ page }) => {
    await page.goto(`/features/${slug}`);
    const tickets = page.getByTestId('ticket-sample');
    await expect(tickets).toHaveCount(4);
    // No text node ends in "…" or "...", and none is clipped by its cell.
    expect(await cutOffText(tickets)).toEqual([]);
  });

test('unknown feature 404s', async ({ page }) => {
  expect((await page.goto('/features/nope'))!.status()).toBe(404);
});
