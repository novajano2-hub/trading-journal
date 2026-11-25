import { expect, test, type Page } from '@playwright/test';

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
  'Accounts open with the app release. Until then, sign-up is closed.';

for (const path of ['/login', '/signup'])
  test(`${path} is a focused, centred page: the mark, one column, no site navigation`, async ({
    page,
  }) => {
    await page.goto(path);
    const width = page.viewportSize()!.width;
    const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
    // No marketing header nav and no marketing footer.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
    // The Keel mark, centred at the top.
    const mark = (await page
      .getByRole('banner')
      .getByRole('link', { name: 'Keel' })
      .boundingBox())!;
    expect(Math.abs(centre(mark) - width / 2)).toBeLessThanOrEqual(2);
    expect(mark.y).toBeLessThan(80);
    // One centred column of about 400px holding the title, the note, the form and its two actions.
    const title = page.getByRole('heading', { level: 1 });
    const column = (await page
      .locator('main > div')
      .filter({ has: title })
      .boundingBox())!;
    expect(Math.abs(centre(column) - width / 2)).toBeLessThanOrEqual(2);
    expect(column.width).toBeLessThanOrEqual(400);
    expect(column.width).toBeGreaterThanOrEqual(Math.min(400, width - 40));
    for (const part of [
      title,
      page.getByText(CLOSED),
      page.getByLabel('Email', { exact: true }),
      page.getByRole('link', { name: 'Open the sample workspace' }),
    ]) {
      const b = (await part.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(column.x);
      expect(b.x + b.width).toBeLessThanOrEqual(column.x + column.width);
    }
    await expect(title).toHaveCSS('text-align', 'center');
    // The switch link, centred under the form.
    const swap = (await page
      .getByRole('main')
      .getByRole('link', { name: path === '/login' ? 'Sign up' : 'Log in' })
      .locator('..')
      .boundingBox())!;
    expect(swap.y).toBeGreaterThan(column.y + column.height);
    expect(Math.abs(centre(swap) - width / 2)).toBeLessThanOrEqual(2);
    // Only a minimal footer line.
    const foot = page.getByRole('contentinfo');
    await expect(foot.getByRole('link')).toHaveText(['Privacy', 'Terms']);
  });

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
  await page.goto('/app/import?side=short&by=day');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Import');
  // Step 1 of the import: the upload, with its drop zone and file picker.
  await expect(
    page.getByRole('heading', { name: 'Upload your trades' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Choose a file' }),
  ).toBeVisible();
  // Below sm the list is one line and a bar.
  await expect(
    page
      .getByRole('list', { name: 'Import steps' })
      .or(page.getByRole('progressbar', { name: 'Import progress' }))
      .filter({ visible: true }),
  ).toBeVisible();
  // A card as the Dashboard's are: a hairline border and the card shadow.
  await expect(page.locator('main .rounded-card').first()).not.toHaveCSS(
    'box-shadow',
    'none',
  );
  // The way to get a file is the broker export guide.
  await expect(
    page.getByRole('link', { name: 'How to export your CSV' }),
  ).toHaveAttribute('href', '/brokers#export');
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
    '/app/trades',
    '/app/backtesting',
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

test("today's pages claim no in-browser processing", async ({ page }) => {
  for (const path of ['/', '/signup', '/pricing']) {
    await page.goto(path);
    const text = await page.locator('main').innerText();
    expect(text, path).not.toMatch(/runs in your browser/i);
    expect(text, path).not.toMatch(/read in your browser/i);
  }
});

// ---- The app's routes (Plan 5), on the sample workspace -------------------

const APP_ROUTES = [
  '/app/dashboard',
  '/app/trades',
  '/app/trades/day',
  '/app/trades/week',
  '/app/trades/new',
  '/app/calendar',
  '/app/reports',
  ...[
    'performance',
    'day-time',
    'symbols',
    'risk',
    'strategies',
    'tags',
    'options',
    'wins-losses',
    'compare',
    'calendar',
  ].map((r) => `/app/reports/${r}`),
  '/app/strategies',
  '/app/strategies/new',
  '/app/notebook',
  '/app/import',
  '/app/prop-firms',
  '/app/settings/profile',
  '/app/settings/accounts',
  '/app/settings/trading',
  '/app/settings/tags',
  '/app/settings/import-history',
];

/** The ids a route needs, read from the lists that link to them. */
async function sampleIds(page: Page) {
  await page.goto('/app/trades');
  const trade = await page
    .getByRole('table', { name: 'Trades' })
    .locator('tbody tr')
    .first()
    .getByRole('link')
    .first()
    .getAttribute('href', { timeout: 30_000 });
  await page.goto('/app/strategies');
  const strategy = await page
    .getByRole('link', { name: 'Opening range breakout' })
    .first()
    .getAttribute('href', { timeout: 30_000 });
  await page.goto('/app/notebook');
  const note = await page
    .getByRole('list', { name: 'Notes' })
    .getByRole('link')
    .first()
    .getAttribute('href', { timeout: 30_000 });
  return { trade: trade!, strategy: strategy!, note: note! };
}

test('every app route renders without horizontal overflow at 390 and 1440', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets both widths itself');
  test.setTimeout(300_000);
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const ids = await sampleIds(page);
  const routes = [
    ...APP_ROUTES,
    ids.trade,
    `${ids.trade}/edit`,
    ids.strategy,
    `${ids.strategy}/edit`,
    ids.note,
    '/app/notebook/daily/2026-11-19',
  ];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible(
        {
          timeout: 30_000,
        },
      );
      // Past the loading skeletons: the overflow that matters is the data's.
      await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, {
        timeout: 30_000,
      });
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

test('Privacy hides every dollar figure on Trades (All, Day and Week), Calendar and Reports', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one width is enough');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /show as / }).click();
  await page.getByRole('menuitemradio', { name: 'Privacy' }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Net, show as Privacy' }),
  ).toBeVisible();

  const ready = {
    '/app/trades': () =>
      expect(page.getByRole('table', { name: 'Trades' })).toBeVisible(),
    '/app/trades/day': () =>
      expect(page.getByRole('article').first()).toBeVisible(),
    '/app/trades/week': () =>
      expect(page.getByRole('article').first()).toBeVisible(),
    '/app/calendar': () =>
      expect(page.getByTestId('calendar-ready')).toBeVisible(),
    '/app/reports': () =>
      expect(page.getByTestId('reports-overview')).toBeVisible(),
  };
  for (const [route, wait] of Object.entries(ready)) {
    await page.goto(route);
    await wait();
    await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0);
    // Figures are masked as $•••; no dollar sign is followed by a digit.
    expect(await page.locator('body').innerText(), route).toContain('$•••');
    expect(await page.locator('body').innerText(), route).not.toMatch(/\$\d/);
  }
});
