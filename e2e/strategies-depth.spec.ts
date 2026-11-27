import { expect, test, type Page } from '@playwright/test';

// No `page.clock.setFixedTime` here: under a fixed clock a dialog's exit
// animation stretches from a fraction of a second to many, which reads as a
// dialog that will not close. Every wait is on a real signal: the dialog gone
// from the page, the address, or the text that should now be there.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"/>',
);

/** Every modal has left the page: its exit has played and the page is live again. */
const noDialog = (page: Page) =>
  expect(page.getByRole('dialog')).toHaveCount(0);

/**
 * The sample's Trend pullback. Its name is short: on a strategy with a long
 * one (Opening range breakout) the top bar's chips-fit measurement can keep
 * flipping the header between 60, 68 and 140 px in headless Chrome at 1440,
 * and Playwright waits for ever on a click that never finds the page still.
 */
const STRATEGY = '/app/strategies/sample-strategy-2';
const NAME = 'Trend pullback';

test('a template is chosen, copied and marked added, and its cover is the copy’s photo', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.goto('/app/strategies');
  await page
    .getByRole('button', { name: 'New strategy' })
    .click({ timeout: 30_000 });

  // The chooser: Start blank, then the six templates; picking one opens the form filled, unsaved.
  const chooser = page.getByRole('dialog', { name: 'New strategy' });
  await expect(chooser.getByText('Start blank')).toBeVisible();
  await chooser.getByRole('button', { name: /London range break/ }).click();
  await expect(page).toHaveURL(
    /\/app\/strategies\/new\?template=london-range-break/,
  );
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'London range break',
  );
  // Its cover is the chosen photo, a PNG the browser drew from it.
  const field = page.getByRole('group', { name: 'Photo' });
  await expect(field.getByText('london-range-break.png')).toBeVisible();

  await page.getByRole('button', { name: 'Create strategy' }).click();
  await expect(page).toHaveURL(/\/app\/strategies\/(?!new)[^/?]+$/);
  await expect(
    page.getByText('A copy of the London range break template by Keel.'),
  ).toBeVisible();
  // The cover is the header's band.
  const band = page.getByRole('img', { name: "London range break's photo" });
  await expect(band).toBeVisible();
  await expect
    .poll(() =>
      band.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  // Its example trades are listed apart, and nothing counts them.
  await expect(
    page.getByRole('region', { name: 'Example trades' }),
  ).toBeVisible();

  // The Templates tab marks the template as added, and "+" still adds another.
  await page.goto('/app/strategies?tab=templates');
  const card = page
    .getByRole('heading', { name: 'London range break' })
    .locator('xpath=ancestor::article');
  await expect(card.getByText('Added')).toBeVisible({ timeout: 30_000 });
  await card
    .getByRole('button', {
      name: 'Add a copy of London range break to My strategies',
    })
    .click();
  await expect(page).toHaveURL(/\/app\/strategies\/(?!new)[^/?]+$/);
  await page.goto('/app/strategies');
  await expect(
    page.getByRole('heading', { name: 'London range break' }),
  ).toHaveCount(2);
});

test('a missed trade is added, edited and deleted, and counts in no figure', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.goto(STRATEGY);
  const stats = page.getByRole('region', { name: 'Stats' });
  await expect(stats.getByText('Net P&L')).toBeVisible({ timeout: 30_000 });
  const figures = await stats.innerText();
  const trades = await page
    .getByRole('link', { name: /^View \d+ trades?$/ })
    .innerText();

  const card = page.getByRole('region', { name: 'Missed trades' });
  await expect(card.getByText('No missed trades yet.')).toBeVisible();
  await expect(page.getByText(/\d+ missed/)).toHaveCount(0);

  // Add: exactly a symbol, a date and time, a price, a commission and fees.
  await card.getByRole('button', { name: 'Add a missed trade' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a missed trade' });
  await expect(dialog.locator('input')).toHaveCount(5);
  await dialog.getByLabel('Symbol').fill('es');
  await dialog.getByLabel('Date and time').fill('2026-11-24T10:42');
  await dialog.getByLabel('Price').fill('6618.5');
  await dialog.getByLabel('Commission').fill('2.58');
  await dialog.getByLabel('Fees').fill('2.76');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await noDialog(page);

  const table = card.getByRole('table', { name: 'Missed trades' });
  const row = table.getByRole('row').nth(1);
  await expect(row).toContainText('Tue 24 Nov');
  await expect(row).toContainText('10:42');
  await expect(row).toContainText('ES');
  await expect(row).toContainText('6,618.50');
  await expect(row).toContainText('$2.58');
  await expect(row).toContainText('$2.76');
  // Counted beside the trades, and in no figure: the stats and the trade count are as they were.
  await expect(page.getByText('1 missed')).toBeVisible();
  await expect.poll(() => stats.innerText()).toBe(figures);
  await expect(
    page.getByRole('link', { name: /^View \d+ trades?$/ }),
  ).toHaveText(trades);
  // Kept apart on the page that lists strategies too: "n missed" beside the trade count.
  await page.reload();
  await expect(card.getByRole('table', { name: 'Missed trades' })).toBeVisible({
    timeout: 30_000,
  });

  // Edit.
  await table.getByRole('button', { name: /^Edit ES, / }).click();
  const edit = page.getByRole('dialog', { name: 'Edit missed trade' });
  await expect(edit.getByLabel('Symbol')).toHaveValue('ES');
  await expect(edit.getByLabel('Price')).toHaveValue('6618.5');
  await edit.getByLabel('Symbol').fill('NQ');
  await edit.getByLabel('Price').fill('');
  await edit.getByRole('button', { name: 'Save' }).click();
  await noDialog(page);
  await expect(table.getByRole('row').nth(1)).toContainText('NQ');
  await expect(table.getByRole('row').nth(1)).toContainText('None');

  // The list of strategies counts it beside the trades.
  await page.goto('/app/strategies');
  const listed = page
    .getByRole('heading', { name: NAME })
    .locator('xpath=ancestor::article');
  await expect(listed.getByText(/1 missed/)).toBeVisible({ timeout: 30_000 });
  await page.goto(STRATEGY);

  // Delete asks first.
  await table.getByRole('button', { name: /^Delete NQ, / }).click();
  const confirm = page.getByRole('dialog', {
    name: 'Delete this missed trade?',
  });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await noDialog(page);
  await expect(card.getByText('No missed trades yet.')).toBeVisible();
  await expect(page.getByText(/\d+ missed/)).toHaveCount(0);
  await expect.poll(() => stats.innerText()).toBe(figures);
});

test('a photo is added, shows as a band, refuses SVG, and is removed', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  const edit = `${STRATEGY}/edit`;
  await page.goto(edit);
  const field = page.getByRole('group', { name: 'Photo' });
  await expect(field.getByRole('button', { name: 'Add a photo' })).toBeVisible({
    timeout: 30_000,
  });
  const input = field.locator('input[type="file"]');

  // An SVG is not a photo; nothing is chosen.
  await input.setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: SVG,
  });
  await expect(field.getByRole('alert')).toHaveText(
    "logo.svg isn't a PNG, JPEG or WebP image.",
  );
  await expect(
    field.getByRole('button', { name: 'Add a photo' }),
  ).toBeVisible();

  // A PNG is, and shows as the band once saved.
  await input.setInputFiles({
    name: 'chart.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(field.getByText('chart.png')).toBeVisible();
  await expect(field.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save strategy' }).click();
  await expect(page).toHaveURL(new RegExp(`${STRATEGY}$`));
  const band = page.getByRole('img', { name: `${NAME}'s photo` });
  await expect(band).toBeVisible();
  await expect
    .poll(() =>
      band.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  // The strategy's own icon stays beside its name.
  await expect(
    page.getByRole('heading', { name: NAME }).locator('svg').first(),
  ).toBeVisible();

  // It survives a reload, and the card on the list wears it too.
  await page.goto('/app/strategies');
  const card = page
    .getByRole('heading', { name: NAME })
    .locator('xpath=ancestor::article');
  await expect(card.getByRole('img', { name: `${NAME}'s photo` })).toBeVisible({
    timeout: 30_000,
  });

  // Remove it: the form says so, nothing is written until Save, and the band is gone.
  await page.goto(edit);
  await expect(field.getByText('chart.png')).toBeVisible({ timeout: 30_000 });
  await field.getByRole('button', { name: 'Remove photo' }).click();
  await expect(
    field.getByRole('button', { name: 'Add a photo' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save strategy' }).click();
  await expect(page).toHaveURL(new RegExp(`${STRATEGY}$`));
  await expect(page.getByRole('region', { name: 'Stats' })).toBeVisible();
  await expect(page.getByRole('img', { name: `${NAME}'s photo` })).toHaveCount(
    0,
  );
  await page.goto('/app/strategies');
  await expect(page.getByRole('heading', { name: NAME })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('img', { name: `${NAME}'s photo` })).toHaveCount(
    0,
  );
});

test('on a phone a missed trade is two lines, its form is a sheet, and nothing overflows', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone layout');
  await page.goto(STRATEGY);
  const card = page.getByRole('region', { name: 'Missed trades' });
  await expect(card.getByText('No missed trades yet.')).toBeVisible({
    timeout: 30_000,
  });
  await card.getByRole('button', { name: 'Add a missed trade' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a missed trade' });
  // A full-height sheet with its footer fixed.
  await expect(
    dialog.getByRole('button', { name: 'Add', exact: true }),
  ).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeGreaterThan(700);
  await dialog.getByLabel('Symbol').fill('EURUSD');
  await dialog.getByLabel('Date and time').fill('2026-11-18T14:20');
  await dialog.getByLabel('Price').fill('1.1584');
  await dialog.getByLabel('Commission').fill('7');
  await dialog.getByLabel('Fees').fill('0');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await noDialog(page);

  const rows = card.getByRole('list', { name: 'Missed trades, one row each' });
  const row = rows.getByRole('listitem').first();
  await expect(row).toContainText('EURUSD');
  await expect(row).toContainText('1.1584');
  await expect(row).toContainText('Wed 18 Nov 14:20');
  await expect(row).toContainText('$7.00 commission');
  await expect(row).toContainText('$0.00 fees');
  // The table is a wide screen's.
  await expect(card.getByRole('table', { name: 'Missed trades' })).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The strategy form, with its photo field and a template's cover in it, fits the phone too.
  await page.goto('/app/strategies/new?template=london-range-break');
  const field = page.getByRole('group', { name: 'Photo' });
  await expect(field.getByText('london-range-break.png')).toBeVisible({
    timeout: 30_000,
  });
  const photoRow = await field
    .getByRole('button', { name: 'Remove photo' })
    .boundingBox();
  expect(photoRow!.x + photoRow!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
