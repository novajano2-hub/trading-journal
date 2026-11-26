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

/** The widgets on the page, in order, by `data-widget`. */
const widgets = (page: Page) =>
  page
    .locator('[data-widget]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.widget));

const DEFAULT_WIDGETS = [
  'net-pnl',
  'trade-win',
  'profit-factor',
  'day-win',
  'win-loss-ratio',
  'score',
  'progress',
  'cum-pnl',
  'daily-pnl',
  'recent',
  'balance',
  'calendar-adv',
  'drawdown',
  'trade-time',
  'trade-duration',
];

test('the default template shows its fifteen widgets in order, and none of the retired cards', async ({
  page,
}) => {
  await page.goto('/app/dashboard');
  await ready(page);
  expect(await widgets(page)).toEqual(DEFAULT_WIDGETS);
  await expect(
    page.getByRole('region', { name: 'Progress tracker' }),
  ).toBeVisible();
  for (const name of [/your plan/i, /^mistakes/i, /^performance/i])
    await expect(page.getByRole('heading', { name })).toHaveCount(0);
});

test('filters change the URL, and the widgets stay', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);
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
  await page.reload();
  await ready(page);
  expect(await widgets(page)).toEqual(DEFAULT_WIDGETS);
  await row(mobile ? 'Date' : 'All time');
  await page.getByRole('radio', { name: 'Last week' }).check();
  await expect(page).toHaveURL(/range=last-week/);
  // The sheet is a modal: close it to read the page behind.
  if (mobile) await page.keyboard.press('Escape');
  expect(await widgets(page)).toEqual(DEFAULT_WIDGETS);
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

test('the upper strip shows its five figures, each with its info tip', async ({
  page,
}) => {
  await page.goto('/app/dashboard');
  await ready(page);
  const strip = page.getByRole('group', { name: 'Figures' });
  const pnl = strip.locator('[data-widget="net-pnl"]');
  // A signed amount over a trade count; no fees line.
  await expect(pnl).toContainText(/[+−]\$[\d,]+\.\d\d/);
  await expect(pnl).toContainText(/[\d,]+ trades/);
  await expect(pnl).not.toContainText(/fee/i);
  await expect(strip.locator('[data-widget="trade-win"]')).toContainText(
    /\d+\.\d%.*\d+ won, \d+ breakeven, \d+ lost/,
  );
  await expect(strip.locator('[data-widget="day-win"]')).toContainText(
    /\d+ green, \d+ flat, \d+ red/,
  );
  // The profit factor is a bare ratio: no amount beside it.
  await expect(
    strip.locator('[data-widget="profit-factor"]'),
  ).not.toContainText('$');
  await expect(strip.locator('[data-widget="win-loss-ratio"]')).toContainText(
    /\d\.\d\d.*[+−]\$[\d,.]+ \/ [+−]\$[\d,.]+/,
  );
  // Each split bar is a picture of the words beside it.
  await expect(strip.locator('[data-split-bar]')).toHaveCount(4);
  for (const bar of await strip.locator('[data-split-bar]').all())
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
  for (const key of ['net-pnl', 'trade-win', 'profit-factor'])
    await expect(
      strip.locator(`[data-widget="${key}"] [data-metric-tip]`),
    ).toBeVisible();
});

test('the upper strip is five across from 1280px, three below it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const columns = () =>
    page
      .getByRole('group', { name: 'Figures' })
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
      );
  for (const [width, want] of [
    [1440, 5],
    [1280, 5],
    [1279, 3],
    [768, 3],
    [767, 2],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/dashboard');
    await ready(page);
    expect(await columns(), `columns at ${width}`).toBe(want);
  }
});

test('Gross/Net relabels the P&L widget', async ({ page }) => {
  await page.goto('/app/dashboard');
  await ready(page);
  const pnl = page.locator('[data-widget="net-pnl"]');
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
  await expect(page.locator('[data-widget="net-pnl"]')).toContainText('$•••');
  // The profit factor and the average win to loss are amounts' ratios: hidden too.
  await expect(page.locator('[data-widget="profit-factor"]')).toContainText(
    '•••',
  );
  await expect(page.locator('[data-widget="win-loss-ratio"]')).toContainText(
    '$•••',
  );
  expect(await page.locator('body').innerText()).not.toMatch(/\$\d/);
  await page.getByRole('button', { name: /show as / }).click();
  await page.getByRole('menuitemradio', { name: 'Dollar' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-widget="net-pnl"]')).toContainText(/\$\d/);
});

test('the template button names the template in use and lists the templates', async ({
  page,
}, info) => {
  await page.goto('/app/dashboard');
  await ready(page);
  const button = page.getByRole('button', {
    name: 'Dashboard template: Main',
  });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('title', 'Dashboard template: Main');
  // On a touch screen a 44px target.
  const box = (await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(
    info.project.name === 'mobile' ? 44 : 34,
  );
  await button.click();
  const list = page.getByRole('dialog', { name: 'Dashboard templates' });
  await expect(list.getByRole('listitem')).toHaveText(['MainIn use']);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(button).toBeFocused();
});

test('a filter that matches nothing keeps the widgets; an empty workspace shows its own way out', async ({
  page,
}, info) => {
  await page.goto('/app/dashboard?symbol=ZZZ');
  await ready(page);
  expect(await widgets(page)).toEqual(DEFAULT_WIDGETS);

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
  expect(await widgets(page)).toEqual(DEFAULT_WIDGETS);
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

test("the calendar widget's controls keep one row on a phone: Stats shown is its icon alone (mobile)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  for (const width of [390, 375, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/dashboard');
    await ready(page);
    const widget = page.locator('[data-widget="calendar-adv"]');
    const stats = widget.getByRole('button', { name: 'Stats shown' });
    // The word is for assistive tech here; the icon is drawn alone.
    expect((await stats.boundingBox())!.width, `${width}`).toBeLessThan(50);
    const tops = await Promise.all(
      [
        widget.getByRole('button', { name: 'Previous month' }),
        widget.getByRole('button', { name: 'Next month' }),
        widget.getByRole('button', { name: 'This month' }),
        stats,
        widget.getByRole('button', { name: 'Snapshot' }),
      ].map(async (control) => Math.round((await control.boundingBox())!.y)),
    );
    expect(new Set(tops).size, `the controls' tops at ${width}`).toBe(1);
  }
});
