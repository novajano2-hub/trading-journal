import { expect, test, type Page } from '@playwright/test';
import { cutOffText } from './figures';

const how = (page: Page) =>
  page.getByRole('region', {
    name: 'Keel does the logging. You do the review.',
  });
const reports = (page: Page) =>
  page.getByRole('region', { name: 'See where the money comes from.' });

/** The ranked side list, one "label value" string per row. */
const ranked = (page: Page) =>
  reports(page)
    .getByRole('tabpanel')
    .getByRole('listitem')
    .evaluateAll((lis) =>
      lis.map((li) =>
        [...li.children].map((c) => c.textContent?.trim()).join(' '),
      ),
    );

test('how it works: four steps, each with a real fragment', async ({
  page,
}) => {
  await page.goto('/');
  const section = how(page);
  await expect(section).toHaveAttribute('id', 'how');
  await expect(section.getByRole('heading', { level: 3 })).toHaveText([
    'Import',
    'Journal',
    'Review',
    'Improve',
  ]);
  // guessColumns maps the broker's headers onto Keel's columns.
  const mapping = section.getByRole('list', { name: 'Column mapping' });
  await expect(mapping.getByRole('listitem')).toHaveText([
    'Date/Time to Time',
    'Buy/Sell to Side',
  ]);
  // Trade 6's own tags, its rule checks, and the best hour from the engine.
  await expect(section.getByRole('list', { name: 'Tags' })).toContainText(
    'Moved stop',
  );
  await expect(section).toContainText('3 kept');
  await expect(section).toContainText('1 broken');
  await expect(section).toContainText('Best hour 09:00');
  await expect(section).toContainText('+$1,160.00');
  expect(await cutOffText(section)).toEqual([]);
});

test('reports: the tablist switches the breakdown by keyboard', async ({
  page,
}) => {
  await page.goto('/');
  const r = reports(page);
  const list = r.getByRole('tablist', { name: 'Break down by' });
  await expect(list.getByRole('tab')).toHaveText([
    'Hour',
    'Session',
    'Setup',
    'Symbol',
    'Mistake',
  ]);
  const tab = (name: string) => list.getByRole('tab', { name });
  await expect(tab('Hour')).toHaveAttribute('aria-selected', 'true');
  await expect(r.getByRole('img', { name: 'Net P&L by hour' })).toBeVisible();

  await tab('Hour').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Session')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Session')).toBeFocused();
  await expect(tab('Hour')).toHaveAttribute('aria-selected', 'false');
  await expect(tab('Hour')).toHaveAttribute('tabindex', '-1');
  await expect(
    r.getByRole('img', { name: 'Net P&L by session' }),
  ).toBeVisible();
  await expect(r.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    (await tab('Session').getAttribute('id'))!,
  );

  await page.keyboard.press('End');
  await expect(tab('Mistake')).toBeFocused();
  await expect(
    r.getByRole('img', { name: 'Net P&L by mistake' }),
  ).toBeVisible();
  expect(await ranked(page)).toEqual([
    'Untagged +$1,511.00',
    'Moved stop −$275.00',
  ]);
  await page.keyboard.press('ArrowRight');
  await expect(tab('Hour')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('Mistake')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Hour')).toHaveAttribute('aria-selected', 'true');
});

test('reports: a ranked list by net, re-derived on gross', async ({ page }) => {
  await page.goto('/');
  const r = reports(page);
  await expect(r.getByText('Sample data', { exact: true })).toHaveCount(1);
  expect(await ranked(page)).toEqual([
    '09:00 +$1,160.00',
    '10:00 +$120.00',
    '12:00 $0.00',
    '14:00 $0.00',
    '15:00 $0.00',
    '13:00 −$5.00',
    '11:00 −$39.00',
  ]);

  await r.getByText('Gross', { exact: true }).click();
  await expect(r.getByRole('radio', { name: 'Gross' })).toBeChecked();
  await expect(r.getByRole('img', { name: 'Gross P&L by hour' })).toBeVisible();
  await expect.poll(() => ranked(page)).toContain('09:00 +$1,180.00');

  await r.getByRole('tab', { name: 'Setup' }).click();
  expect(await ranked(page)).toEqual([
    'Opening range break +$787.50',
    'Fade +$675.00',
    'Pullback +$325.00',
    'Range $0.00',
    'Breakout −$515.00',
  ]);
  expect(await cutOffText(r.getByRole('tabpanel'))).toEqual([]);
});

test('reports: the active fill follows the selected tab', async ({ page }) => {
  await page.goto('/');
  const r = reports(page);
  const list = r.getByRole('tablist', { name: 'Break down by' });
  await list.scrollIntoViewIfNeeded();
  const fill = list.getByTestId('tab-fill');
  for (const name of ['Symbol', 'Hour']) {
    await list.getByRole('tab', { name }).click();
    const tab = await list.getByRole('tab', { name }).boundingBox();
    await expect
      .poll(async () => {
        const f = await fill.boundingBox();
        return Math.abs(f!.x - tab!.x) + Math.abs(f!.width - tab!.width);
      })
      .toBeLessThan(1);
  }
});

for (const width of [390, 768, 1024, 1280, 1440, 1680]) {
  test(`no horizontal overflow at ${width}, longest labels showing`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const r = reports(page);
    await r.getByRole('tab', { name: 'Setup' }).click();
    await r.getByRole('tab', { name: 'Setup' }).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('no em or en dash anywhere on the landing page', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
    /[—–]/,
  );
});
