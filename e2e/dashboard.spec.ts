import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function ready(page: Page) {
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 20_000,
  });
}

test('filters change the numbers and the URL', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);
  const pnl = page.getByTestId('kpi-pnl');
  const all = await pnl.innerText();
  // Below sm the chips are one Filters button and a sheet of rows.
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  const row = async (name: string, exact = true) => {
    if (mobile) {
      if (!(await sheet.isVisible()))
        await page.getByRole('button', { name: /^Filters/ }).click();
      await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    } else await page.getByRole('button', { name, exact }).click();
  };
  await row('Side');
  await page.getByRole('radio', { name: 'Short' }).check();
  await expect(page).toHaveURL(/[?&]side=short(&|$)/);
  await expect.poll(() => pnl.innerText()).not.toBe(all);
  const short = await pnl.innerText();
  await page.reload();
  await ready(page);
  await expect.poll(() => pnl.innerText()).toBe(short);
  await row(mobile ? 'Date' : 'All time');
  await page.getByRole('radio', { name: 'Last week' }).check();
  await expect(page).toHaveURL(/range=last-week/);
  // The sheet is a modal: close it to read the page behind.
  if (mobile) await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: 'Your plan, 8-14 Nov' }),
  ).toBeVisible();
});

test('the account switcher writes the account filter (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard');
  await ready(page);
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Futures live/ }).click();
  await expect(page).toHaveURL(/[?&]account=sample-futures(&|$)/);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: /Sample workspace/ }),
  ).toContainText('Futures live');
});

test('a rule opens its trades on Enter and closes on Escape with focus restored', async ({
  page,
}) => {
  // Real animations: the component tests turn them off, so focus return is pinned here.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/app/dashboard');
  await ready(page);
  const first = page
    .getByRole('table', { name: 'Rules' })
    .getByRole('button', { name: /Show the trades\.$/ })
    .first();
  // The page behind an open dialog is hidden from the accessibility tree: read the name first.
  const name = (await first.getAttribute('aria-label'))!;
  const [, kept, total] = /Kept (\d+) of (\d+)/.exec(name)!.map(Number) as [
    unknown,
    number,
    number,
  ];
  await first.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const rows = dialog.getByRole('table', { name: 'Trades' }).getByRole('row');
  // A header row, then one row per broken check.
  await expect(rows).toHaveCount(total - kept + 1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
});

test('Gross/Net relabels P&L', async ({ page }) => {
  await page.goto('/app/dashboard');
  await ready(page);
  const pnl = page.getByTestId('kpi-pnl');
  await expect(pnl).toContainText('Net P&L');
  const display = page.getByRole('button', { name: /show as / });
  await display.click();
  await page.getByRole('menuitemradio', { name: 'Gross' }).click();
  await expect(pnl).toContainText('Gross P&L');
  await page.getByRole('menuitemradio', { name: 'Net' }).click();
  await expect(pnl).toContainText('Net P&L');
  await page.keyboard.press('Escape');
});

test('the Display menu hides every amount under Privacy and brings them back', async ({
  page,
}) => {
  await page.goto('/app/dashboard');
  await ready(page);
  await page.getByRole('button', { name: /show as / }).click();
  await page.getByRole('menuitemradio', { name: 'Privacy' }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Net, show as Privacy' }),
  ).toBeFocused();
  await expect(page.getByTestId('kpi-pnl')).toContainText('$•••');
  expect(await page.locator('body').innerText()).not.toMatch(/\$\d/);
  await page.getByRole('button', { name: /show as / }).click();
  await page.getByRole('menuitemradio', { name: 'Dollar' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('kpi-pnl')).toContainText(/\$\d/);
});

test('a filter that matches nothing and an empty workspace each show their own way out', async ({
  page,
}, info) => {
  await page.goto('/app/dashboard?symbol=ZZZ');
  // The empty state has the only "Clear filters" that is not in the top bar.
  const empty = page
    .getByRole('heading', { name: 'No trades match these filters.' })
    .locator('..');
  await expect(empty).toBeVisible({ timeout: 20_000 });
  // Below sm the top bar's chips are a button, so its Clear filters waits in the sheet.
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(
    info.project.name === 'mobile' ? 1 : 2,
  );
  await empty.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/symbol=/);
  await ready(page);

  // An empty workspace is a different state, with Import and the sample as its ways out.
  test.skip(info.project.name !== 'desktop');
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await page.keyboard.press('Escape');
  const none = page
    .getByRole('heading', { name: 'No trades in My workspace yet.' })
    .locator('..');
  await expect(none).toBeVisible();
  await expect(none.getByRole('link', { name: 'Import' })).toHaveAttribute(
    'href',
    '/app/import',
  );
  await none.getByRole('button', { name: 'Open the sample workspace' }).click();
  await ready(page);
});

test('no overflow at any width once loaded (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const width of [390, 768, 1024, 1280, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/dashboard');
    await ready(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `dashboard at ${width}`,
    ).toBeLessThanOrEqual(0);
  }
});
