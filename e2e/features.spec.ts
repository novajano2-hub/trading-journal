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

const SAMPLE_VISUALS: Record<string, RegExp> = {
  journal: /Moved stop|NQ/,
  analytics: /Sample data/,
  strategies: /Stop stays where it was placed/,
  'prop-firms': /Profit target/,
  notebook: /Daily review/,
};

for (const [slug, text] of Object.entries(SAMPLE_VISUALS))
  test(`${slug} hero carries its product component`, async ({ page }) => {
    await page.goto(`/features/${slug}`);
    const visual = page.getByTestId('feature-visual');
    await expect(visual).toBeVisible();
    await expect(visual.getByText(text).first()).toBeAttached();
    if (slug === 'analytics')
      await expect(
        visual.getByRole('img', { name: /Net P&L by hour/ }),
      ).toBeVisible();
    // The split hero: copy on the left, the component on the right (wide screens).
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const v = (await visual.boundingBox())!;
      expect(v.x).toBeGreaterThan(h1.x + h1.width - 1);
    }
  });

for (const slug of ['backtesting', 'replay', 'mentors'])
  test(`${slug} shows a plain placeholder, no fake data`, async ({ page }) => {
    await page.goto(`/features/${slug}`);
    const visual = page.getByTestId('feature-visual');
    await expect(visual).toContainText(/planned/i);
    await expect(visual.locator('table, [role="img"]')).toHaveCount(0);
    expect(await visual.innerText()).not.toMatch(/[$]\d|\d%/);
  });

for (const slug of ['journal', 'strategies', 'prop-firms'])
  test(`${slug} points are a two-column definition list`, async ({ page }) => {
    await page.goto(`/features/${slug}`);
    const list = page.getByTestId('feature-points');
    const terms = list.locator('dt');
    expect(await terms.count()).toBeGreaterThanOrEqual(4);
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      const a = (await terms.nth(0).boundingBox())!;
      const b = (await terms.nth(1).boundingBox())!;
      expect(b.x).toBeGreaterThan(a.x + a.width - 1); // side by side
    }
    await expect(page.locator('.ticket-stock')).toHaveCount(0);
  });

test('unknown feature 404s', async ({ page }) => {
  expect((await page.goto('/features/nope'))!.status()).toBe(404);
});
