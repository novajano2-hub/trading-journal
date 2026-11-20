import { expect, test } from '@playwright/test';

const isMobile = () => test.info().project.name === 'mobile';

test('header links and product menu by keyboard', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  if (isMobile()) {
    const open = header.getByRole('button', { name: 'Menu' });
    await open.click();
    await expect(open).toHaveAttribute('aria-expanded', 'true');
  }
  for (const name of [
    'Pricing',
    'Brokers',
    'Changelog',
    'Log in',
    'Get started',
  ])
    await expect(header.getByRole('link', { name })).toBeVisible();

  const product = header.getByRole('button', { name: 'Product' });
  await product.focus();
  await page.keyboard.press('Enter');
  await expect(product).toHaveAttribute('aria-expanded', 'true');
  await expect(header.getByRole('link', { name: 'Prop firms' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'AI assistant' })).toHaveCount(
    0,
  );
  await page.keyboard.press('ArrowDown');
  await expect(
    header.locator('a[href="/product/journal"]:visible'),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    header.locator('a[href="/product/analytics"]:visible'),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(product).toHaveAttribute('aria-expanded', 'false');
  await expect(product).toBeFocused();
});

test('product menu closes on outside click', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  if (isMobile()) await header.getByRole('button', { name: 'Menu' }).click();
  const product = header.getByRole('button', { name: 'Product' });
  await product.click();
  await expect(product).toHaveAttribute('aria-expanded', 'true');
  if (isMobile()) await page.mouse.click(380, 830);
  else await page.getByRole('heading', { level: 1 }).click();
  await expect(product).toHaveAttribute('aria-expanded', 'false');
});

test('mobile sheet closes with Escape and restores focus', async ({ page }) => {
  test.skip(!isMobile(), 'mobile only');
  await page.goto('/');
  const menu = page.getByRole('banner').getByRole('button', { name: 'Menu' });
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('footer carries the legal and module links', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  for (const name of ['Terms', 'Privacy', 'Pricing', 'Journal'])
    await expect(footer.getByRole('link', { name })).toBeVisible();
  await expect(footer).toContainText('© 2026 Keel');
});

test('no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
