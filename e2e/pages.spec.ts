import { expect, test } from '@playwright/test';

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

const CLOSED =
  'Accounts open with the app release. Until then, everything runs in your browser.';

for (const [path, name] of [
  ['/login', 'Log in'],
  ['/signup', 'Create account'],
] as const)
  test(`${path} form follows the form rules`, async ({ page }) => {
    await page.goto(path);
    const submit = page.getByRole('button', { name });
    await expect(submit).toBeDisabled();
    await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
    // The reason is visible and tied to the button.
    await expect(page.getByText(CLOSED)).toBeVisible();
    await expect(submit).toHaveAttribute('aria-describedby', /auth-note/);
    // Label above input, with a helper slot and an error slot below.
    for (const field of ['Email', 'Password']) {
      const input = page.getByLabel(field, { exact: true });
      const label = page.locator('label', { hasText: field });
      const l = (await label.boundingBox())!;
      const i = (await input.boundingBox())!;
      expect(l.y + l.height).toBeLessThanOrEqual(i.y + 1);
      const id = await input.getAttribute('id');
      await expect(page.locator(`#${id}-help`)).toBeAttached();
      await expect(page.locator(`#${id}-error`)).toBeAttached();
      expect(await input.getAttribute('aria-describedby')).toContain(
        `${id}-error`,
      );
    }
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

test('brokers: mapping table, format pills, export steps', async ({ page }) => {
  await page.goto('/brokers');
  await expect(
    page.getByRole('table', { name: 'Column mapping' }),
  ).toBeVisible();
  await expect(page.locator('#export li')).toHaveCount(4);
  await expect(page.getByRole('list', { name: 'Futures roots' })).toBeVisible();
  await expect(page.locator('#sync')).toContainText('on the roadmap');
});

test('read pages hold a ~68ch measure and use no cards', async ({ page }) => {
  for (const path of ['/changelog', '/terms', '/privacy']) {
    await page.goto(path);
    const widths = await page
      .locator('main p')
      .evaluateAll((ps) => ps.map((p) => p.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeLessThanOrEqual(68 * 11 + 1);
    await expect(page.locator('main .rounded-card')).toHaveCount(0);
  }
});

test('/app/import is restyled, same behaviour', async ({ page }) => {
  await page.goto('/app/import');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Import');
  await expect(page.getByText('No file waiting.')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('no route overflows at any width', async ({ page }) => {
  const routes = [
    '/',
    '/pricing',
    '/brokers',
    '/changelog',
    '/login',
    '/signup',
    '/terms',
    '/privacy',
    '/app/import',
    ...[
      'journal',
      'analytics',
      'strategies',
      'notebook',
      'prop-firms',
      'backtesting',
      'replay',
      'mentors',
    ].map((s) => `/features/${s}`),
  ];
  for (const width of [390, 768, 1024, 1280, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    for (const r of routes) {
      await page.goto(r);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      expect(over, `${r} at ${width}`).toBeLessThanOrEqual(0);
    }
  }
});

test('privacy and brokers claim no file drop today', async ({ page }) => {
  for (const path of ['/privacy', '/brokers']) {
    await page.goto(path);
    expect(await page.locator('main').innerText(), path).not.toMatch(
      /\bdrop\b/i,
    );
  }
});
