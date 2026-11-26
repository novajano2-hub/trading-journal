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
