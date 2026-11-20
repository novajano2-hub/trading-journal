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
    header.locator('a[href="/features/journal"]:visible'),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    header.locator('a[href="/features/analytics"]:visible'),
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
  // The open popover covers the headline's centre; click its corner instead.
  else
    await page
      .getByRole('heading', { level: 1 })
      .click({ position: { x: 8, y: 8 } });
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

test('mobile sheet closes when focus tabs past its last link', async ({
  page,
}) => {
  test.skip(!isMobile(), 'mobile only');
  await page.goto('/');
  const menu = page.getByRole('banner').getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page
    .locator('#mobile-sheet')
    .getByRole('link', { name: 'Get started' })
    .focus();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#mobile-sheet')).toBeHidden();
  // Focus is somewhere visible, never under the (now closed) sheet.
  const stuck = await page.evaluate(() => document.body.style.overflow);
  expect(stuck).toBe('');
});

test('mobile sheet closes and unlocks scrolling when the viewport reaches md', async ({
  page,
}) => {
  test.skip(!isMobile(), 'mobile only');
  await page.goto('/');
  const menu = page.getByRole('banner').getByRole('button', { name: 'Menu' });
  await menu.click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    'hidden',
  );
  await page.setViewportSize({ width: 1024, height: 800 });
  // At md the toggle is hidden, so address it without a role query.
  await expect(
    page.locator('button[aria-controls="mobile-sheet"]'),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('Get started leads to the how-it-works section, not a dead-end signup', async ({
  page,
}) => {
  await page.goto('/pricing');
  const header = page.getByRole('banner');
  if (isMobile()) await header.getByRole('button', { name: 'Menu' }).click();
  await expect(
    header.getByRole('link', { name: 'Get started' }),
  ).toHaveAttribute('href', '/#how');
});

test('footer carries the legal and module links', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  for (const name of ['Terms', 'Privacy', 'Pricing', 'Journal'])
    await expect(footer.getByRole('link', { name })).toBeVisible();
  await expect(
    footer.getByRole('button', { name: /Switch to (dark|light) theme/ }),
  ).toBeVisible();
  await expect(footer).toContainText('© 2026 Keel');
});

for (const width of [390, 768, 1024, 1280, 1440, 1680]) {
  test(`no horizontal scroll at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('header is 64-68px and the desktop nav sits on one line', async ({
  page,
}) => {
  test.skip(isMobile(), 'desktop only');
  for (const width of [1024, 1280, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const header = page.getByRole('banner');
    const box = await header.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(64);
    expect(box!.height).toBeLessThanOrEqual(68);
    const tops = await header
      .locator('nav[aria-label="Primary"] > *, nav[aria-label="Primary"] a')
      .evaluateAll((els) =>
        els.map((e) => Math.round(e.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBeLessThanOrEqual(2);
    const wrapped = await header
      .getByRole('link', { name: 'Get started' })
      .evaluate((e) => e.getBoundingClientRect().height <= 44);
    expect(wrapped).toBe(true);
  }
});

test('product menu shows two columns with the in-development chip', async ({
  page,
}) => {
  test.skip(isMobile(), 'popover is desktop only');
  await page.goto('/');
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: 'Product' }).click();
  const panel = header.locator('[data-product-panel]');
  await expect(panel).toBeVisible();
  const lefts = await panel
    .locator('a[data-item]')
    .evaluateAll((els) => [
      ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))),
    ]);
  expect(lefts).toHaveLength(2);
  await expect(panel.getByText('In development').first()).toBeVisible();
});

test('product menu closes after following a link', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  if (isMobile()) await header.getByRole('button', { name: 'Menu' }).click();
  const product = header.getByRole('button', { name: 'Product' });
  await product.click();
  await header.locator('a[href="/features/journal"]:visible').click();
  await expect(page).toHaveURL(/\/features\/journal$/);
  if (isMobile()) await header.getByRole('button', { name: 'Menu' }).click();
  await expect(product).toHaveAttribute('aria-expanded', 'false');
});

test('product menu closes when focus tabs out of it', async ({ page }) => {
  test.skip(isMobile(), 'popover is desktop only');
  await page.goto('/');
  const header = page.getByRole('banner');
  const product = header.getByRole('button', { name: 'Product' });
  await product.focus();
  await page.keyboard.press('Enter');
  await header.locator('a[href="/features/mentors"]:visible').focus();
  await page.keyboard.press('Tab');
  await expect(product).toHaveAttribute('aria-expanded', 'false');
});
