import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layouts run at 390');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const noOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('Trades at 390: a Filters button and sheet, a 2 by 2 summary, two-line rows, a Sort dropdown', async ({
  page,
}) => {
  await page.goto('/app/trades?side=short');
  const list = page.getByRole('list', { name: 'Trades' });
  await expect(list).toBeVisible({ timeout: 30_000 });
  // The chips are one button counting the filter in use.
  const filters = page.getByRole('button', { name: 'Filters, 1 active' });
  await expect(page.getByRole('button', { name: 'Symbol' })).toHaveCount(0);
  await filters.click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'More filters' }),
  ).toBeVisible();
  await sheet.getByRole('button', { name: /^Strategy/ }).click();
  await expect(
    sheet.getByRole('button', { name: /^Strategy/ }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(filters).toBeFocused();

  // The summary: four figures, two columns.
  const strip = page.getByRole('region', { name: 'Summary' });
  const kpis = strip.locator('[data-kpi]');
  await expect(kpis).toHaveCount(4);
  const boxes = await kpis.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top) };
    }),
  );
  expect(new Set(boxes.map((b) => b.x)).size).toBe(2);
  expect(new Set(boxes.map((b) => b.y)).size).toBe(2);

  // A row is one link; line two sits under line one.
  const first = list.getByRole('listitem').first();
  await expect(first.getByRole('link')).toHaveCount(1);
  const [one, two] = await first
    .locator('[data-line]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(two!).toBeGreaterThan(one!);
  await expect(first.getByRole('checkbox')).toHaveCount(1);

  const sort = page.getByRole('button', { name: 'Sort, Newest first' });
  await sort.click();
  await page.getByRole('menuitemradio', { name: 'Net, best first' }).click();
  await expect(
    page.getByRole('button', { name: 'Sort, Net, best first' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sort,/ })).toBeFocused();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);

  // The trade page: Net, ROI and R in one row, and no "Back to trades" beside the crumb.
  await first.getByRole('link').click();
  const head = page.getByRole('region', { name: /^Trade \d+/ });
  await expect(head).toBeVisible();
  const tops = await head
    .locator(':scope > div')
    .evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
  expect(tops[1]).toBe(tops[2]);
  expect(tops[2]).toBe(tops[3]);
  await expect(page.getByRole('link', { name: 'Back to trades' })).toBeHidden();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('Calendar day sheet opens on its heading; the import stepper is one line', async ({
  page,
}) => {
  await page.goto('/app/calendar?month=2026-11&day=2026-11-19');
  const dialog = page.getByRole('dialog', { name: /19 Nov/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('heading', { name: /19 Nov/ })).toBeFocused();

  await page.goto('/app/import');
  await expect(page.getByText('Step 1 of 4: Upload')).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Import progress' }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Import steps' })).toBeHidden();
});

test('Performance at 390: the two chart slots stack, each the full width', async ({
  page,
}) => {
  await page.goto('/app/reports/performance');
  await expect(page.getByTestId('reports-performance')).toBeVisible({
    timeout: 30_000,
  });
  const one = page.getByRole('region', { name: 'Chart 1', exact: true });
  const two = page.getByRole('region', { name: 'Chart 2', exact: true });
  await expect(one.getByRole('img')).toBeVisible();
  const [a, b] = await Promise.all([one.boundingBox(), two.boundingBox()]);
  // One above the other, and neither narrower than the other.
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
  expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('Performance at 390: Remove and Add chart work, and Back restores the chart', async ({
  page,
}) => {
  await page.goto('/app/reports/performance');
  await expect(page.getByTestId('reports-performance')).toBeVisible({
    timeout: 30_000,
  });
  const remove = page.getByRole('button', { name: 'Remove chart 2' });
  await remove.click();
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Add chart' });
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  await add.click();
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toHaveCount(0);
});

test('Accounts at 390: a box leads each two-line row and the bulk bar floats above the tab bar', async ({
  page,
}) => {
  await page.goto('/app/settings/accounts');
  const first = page.getByRole('checkbox', { name: /^Select (?!all)/ }).first();
  await expect(first).toBeAttached({ timeout: 30_000 });
  await first.check({ force: true });
  const bar = page.getByRole('toolbar', { name: /selected$/ });
  await expect(bar).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  const box = (await bar.boundingBox())!;
  const tabs = (await page
    .getByRole('navigation', { name: /primary|main/i })
    .last()
    .boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(tabs.y);
});

// The rating row of a trade with five stars is the widest thing on the page at
// 390. With a coarse pointer the stars are 44px targets (228px for five), which
// pushed "5 of 5" and Clear past the card and the page (451px wide). A fine
// pointer has the same row at 28px stars, 20px too wide for its card.
for (const touch of [false, true]) {
  test.describe(`The trade page at 390, ${touch ? 'touch' : 'mouse'}`, () => {
    test.use({ hasTouch: touch });

    test('a five-star rating keeps its words and Clear inside the card, and the page no wider than the screen', async ({
      page,
    }) => {
      await page.goto('/app/trades');
      const list = page.getByRole('list', { name: 'Trades' });
      await expect(list).toBeVisible({ timeout: 30_000 });
      await list.getByRole('listitem').first().getByRole('link').click();
      const tags = page.getByRole('region', { name: 'Tags and rating' });
      await expect(tags).toBeVisible();
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(touch);

      await tags
        .locator('label', { has: page.getByRole('radio', { name: '5 stars' }) })
        .click();
      const clear = tags.getByRole('button', { name: 'Clear' });
      await expect(clear).toBeVisible();
      const [card, edge, label] = await Promise.all([
        tags.boundingBox(),
        clear.boundingBox(),
        tags.getByText('5 of 5').boundingBox(),
      ]);
      expect(edge!.x + edge!.width).toBeLessThanOrEqual(card!.x + card!.width);
      expect(label!.x + label!.width).toBeLessThanOrEqual(
        card!.x + card!.width,
      );
      // The page is the screen's width: nothing hangs past 390.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  });
}
