import { expect, test } from '@playwright/test';
import { cutOffText, stampCollisions } from './figures';

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

for (const slug of ['journal', 'strategies'])
  test(`${slug} stamps land clear of every label and figure`, async ({
    page,
  }) => {
    await page.goto(`/features/${slug}`);
    const tickets = page.getByTestId('ticket-sample');
    await expect(tickets).toHaveCount(4);
    let stamped = 0;
    for (const ticket of await tickets.all()) {
      const stamp = ticket.locator('.rubber-stamp');
      if ((await stamp.count()) === 0) continue;
      stamped++;
      const s = (await stamp.boundingBox())!;
      const pnl = (await ticket
        .locator('div:has(> dt:text-is("Net P&L")) > dd')
        .boundingBox())!;
      const apart =
        s.x + s.width <= pnl.x ||
        pnl.x + pnl.width <= s.x ||
        s.y + s.height <= pnl.y ||
        pnl.y + pnl.height <= s.y;
      expect(apart, `${await stamp.textContent()} clear of Net P&L`).toBe(true);
    }
    expect(stamped).toBe(2); // RULE BROKEN and A+ SETUP
    expect(await stampCollisions(tickets)).toEqual([]);
  });

test('unknown feature 404s', async ({ page }) => {
  expect((await page.goto('/features/nope'))!.status()).toBe(404);
});
