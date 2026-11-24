import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function openReports(page: Page) {
  await page.goto('/app/reports');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
  await expect(page.getByTestId('reports-overview')).toBeVisible({
    timeout: 30_000,
  });
}

test('the Overview at 1440 ends at its last card: no blank tail under it', async ({
  page,
}) => {
  await openReports(page);
  // Let every chart draw before the page is measured.
  await expect(page.getByRole('img').first()).toBeVisible();
  const gap = await page.evaluate(() => {
    const root = document.scrollingElement!;
    const cards = [
      ...document.querySelectorAll('[data-testid="reports-overview"] section'),
    ];
    const bottom = Math.max(
      ...cards.map((c) => c.getBoundingClientRect().bottom + window.scrollY),
    );
    return root.scrollHeight - bottom;
  });
  expect(gap).toBeLessThanOrEqual(120);
});

test('the expanded chart fills its dialog: the plot reaches the bottom padding, reduced motion on', async ({
  page,
}) => {
  await page.goto('/app/reports/performance');
  await expect(page.getByTestId('reports-performance')).toBeVisible({
    timeout: 30_000,
  });
  // Two chart slots: this opens the first.
  await page
    .getByRole('region', { name: 'Chart 1', exact: true })
    .getByRole('button', { name: 'Expand chart' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-expanded-chart] svg')).toBeVisible();
  // Read at once, with no settling wait: the first frame must already fit.
  const gap = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')!;
    const svg = d.querySelector('[data-expanded-chart] svg')!;
    const body = document
      .querySelector('[data-expanded-chart]')!
      .parentElement!.getBoundingClientRect();
    // The body's bottom padding edge is its bottom less 16px.
    return body.bottom - 16 - svg.getBoundingClientRect().bottom;
  });
  expect(gap).toBeLessThanOrEqual(40);
  expect(gap).toBeGreaterThanOrEqual(-4);
});

test('Performance at 1440: two charts side by side, no sideways scroll, and Expand works on the second', async ({
  page,
}) => {
  await page.goto('/app/reports/performance');
  await expect(page.getByTestId('reports-performance')).toBeVisible({
    timeout: 30_000,
  });
  const one = page.getByRole('region', { name: 'Chart 1', exact: true });
  const two = page.getByRole('region', { name: 'Chart 2', exact: true });
  await expect(one.getByRole('img')).toBeVisible();
  await expect(two.getByRole('img')).toBeVisible();
  const [a, b] = await Promise.all([one.boundingBox(), two.boundingBox()]);
  // The same row, the first on the left, each about half the width.
  expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await two.getByRole('button', { name: 'Expand chart' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-expanded-chart] svg')).toBeVisible();
  await expect(dialog).toContainText('Average daily win/loss');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Remove the second: Add chart takes its place, and brings it back.
  await two.getByRole('button', { name: 'Remove chart 2' }).click();
  await expect(page).toHaveURL(/off=2/);
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Add chart' }).click();
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/off=/);

  // Back undoes the Add (the slot goes), and again undoes the Remove (it returns).
  await page.goBack();
  await expect(page).toHaveURL(/off=2/);
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/off=/);
  await expect(
    page.getByRole('region', { name: 'Chart 2', exact: true }),
  ).toBeVisible();
});

test('the Overview at 1440 puts the two P&L charts side by side', async ({
  page,
}) => {
  await openReports(page);
  const cumulative = page.getByRole('region', { name: 'Cumulative P&L' });
  const daily = page.getByRole('region', { name: 'Daily P&L' });
  await expect(cumulative.getByRole('img')).toBeVisible();
  await expect(daily.getByRole('img')).toBeVisible();
  const [a, b] = await Promise.all([
    cumulative.boundingBox(),
    daily.boundingBox(),
  ]);
  expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(2);
  // The plots start level, whatever the headers do.
  const [pa, pb] = await Promise.all([
    cumulative.getByRole('img').first().boundingBox(),
    daily.getByRole('img').first().boundingBox(),
  ]);
  expect(Math.abs(pa!.y - pb!.y)).toBeLessThanOrEqual(2);
});

test('Day & time: time of day in 15 minutes, by exit, cross-analysed by side', async ({
  page,
}) => {
  await openReports(page);
  await page
    .getByRole('navigation', { name: 'Reports' })
    .getByRole('button', { name: /^Reports/ })
    .click();
  await page.getByRole('menuitem', { name: 'Day & time' }).click();
  await expect(page.getByTestId('reports-day-time')).toBeVisible();

  await page.getByRole('tab', { name: 'Time of day' }).click();
  // A segmented option is its visible label; the radio itself is hidden.
  await page
    .getByRole('radiogroup', { name: 'Bucket' })
    .getByText('15 min')
    .click();
  await page
    .getByRole('radiogroup', { name: 'Time basis' })
    .getByText('Exit time')
    .click();
  await expect(page).toHaveURL(/tab=time/);
  await expect(page).toHaveURL(/bucket=15/);
  await expect(page).toHaveURL(/basis=exit/);
  await expect(
    page.getByRole('heading', { name: 'Each 15 minutes' }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Net P&L by time of day, by exit/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Time of day summary' }),
  ).toBeVisible();

  // Cross-analysis: each time bucket against the side of the trade.
  await page.getByRole('button', { name: /^Cross-analyse by/ }).click();
  await page.getByRole('menuitemradio', { name: 'Side' }).click();
  await expect(page).toHaveURL(/x=side/);
  const cross = page.getByRole('table', { name: 'Times by side' });
  await expect(cross).toBeVisible();
  await expect(cross.getByRole('columnheader', { name: 'Long' })).toBeVisible();
  await expect(
    cross.getByRole('columnheader', { name: 'Short' }),
  ).toBeVisible();
  // The tab, the bucket and the basis all held.
  await expect(page.getByRole('radio', { name: '15 min' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Exit time' })).toBeChecked();
});

test('Compare: ES against NQ, side by side', async ({ page }) => {
  await openReports(page);
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Group A' })).toBeVisible();

  const pick = async (group: string, symbol: string) => {
    await page
      .getByRole('group', { name: `${group} filters` })
      .getByRole('button', { name: /Symbol/ })
      .click();
    const box = page.getByRole('checkbox', { name: symbol, exact: true });
    await box.click();
    await expect(box).toBeChecked();
    await page.keyboard.press('Escape');
  };
  await pick('Group A', 'ES');
  await pick('Group B', 'NQ');

  const counts = async (group: string) =>
    Number(
      (
        await page
          .getByRole('region', { name: group, exact: true })
          .getByText(/closed trades?$/)
          .innerText()
      ).match(/^(\d+)/)![1],
    );
  await expect.poll(() => counts('Group A')).toBeGreaterThan(0);
  await expect.poll(() => counts('Group B')).toBeGreaterThan(0);
  const [a, b] = [await counts('Group A'), await counts('Group B')];
  expect(a).not.toBe(b);

  // The table sets one against the other, and the trades row agrees with the headers.
  const table = page.getByRole('table', { name: 'Comparison' });
  await expect(
    table.getByRole('columnheader', { name: 'Group A' }),
  ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Group B' }),
  ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Difference' }),
  ).toBeVisible();
  const tradesRow = table.getByRole('row', { name: /^Trades\b/ });
  await expect(tradesRow.getByRole('cell').nth(0)).toHaveText(String(a));
  await expect(tradesRow.getByRole('cell').nth(1)).toHaveText(String(b));
});

test('a weekday bar opens the log with exactly the trades it counted', async ({
  page,
}) => {
  await openReports(page);
  await page.goto('/app/reports/day-time?tab=weekday');
  await expect(page.getByTestId('reports-day-time')).toBeVisible({
    timeout: 30_000,
  });
  // The busiest weekday in the table, and how many trades it counted.
  const table = page.getByRole('table', { name: 'Weekday summary' });
  const counts = await table.getByRole('row').evaluateAll((rows) =>
    rows.slice(1).map((r) => {
      const cells = [...r.querySelectorAll('td')];
      return {
        name: cells[0]?.textContent ?? '',
        trades: Number(cells[1]?.textContent ?? 0),
      };
    }),
  );
  const busiest = counts.reduce((a, b) => (b.trades > a.trades ? b : a));
  expect(busiest.trades).toBeGreaterThan(0);

  // Click that weekday's bar in the chart.
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const wd = days.indexOf(busiest.name) + 1;
  await page
    .getByRole('img', { name: /Net P&L by weekday/ })
    .locator(`a[href*="wd=${wd}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/trades\\?.*wd=${wd}`));
  await expect(
    page.getByRole('radio', { name: `Closed ${busiest.trades}` }),
  ).toBeChecked();
  // The weekday shows as a chip the user can clear.
  await expect(page.getByText(`Entry weekday: ${busiest.name}`)).toBeVisible();
});

test('an instrument row opens the log with exactly its trades and a chip, and the column choice rides the address', async ({
  page,
}) => {
  await openReports(page);
  await page.goto('/app/reports/symbols?view=instrument');
  await expect(page.getByTestId('reports-symbols')).toBeVisible({
    timeout: 30_000,
  });
  const table = page.getByRole('table', { name: 'Instruments summary' });
  const first = table.getByRole('row').nth(1);
  const name = (await first.getByRole('cell').nth(0).textContent()) ?? '';
  const trades = Number(await first.getByRole('cell').nth(1).textContent());
  expect(trades).toBeGreaterThan(0);

  // Hiding a column writes cols and takes the column out.
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: 'Largest loss' }).uncheck();
  await expect(page).toHaveURL(/cols=/);
  await expect(
    table.getByRole('columnheader', { name: /Largest loss/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  await first.getByRole('link').click();
  await expect(page).toHaveURL(/\/app\/trades\?.*inst=/);
  await expect(
    page.getByRole('radio', { name: `Closed ${trades}` }),
  ).toBeChecked();
  await expect(page.getByText(`Instrument: ${name}`)).toBeVisible();
});

for (const [path, table] of [
  ['/app/reports/day-time?tab=weekday', 'Weekday summary'],
  ['/app/reports/symbols', 'Symbols summary'],
] as const)
  test(`the ${table} fits at 1440 with its default columns, no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReports(page);
    await page.goto(path);
    const t = page.getByRole('table', { name: table });
    await expect(t).toBeVisible({ timeout: 30_000 });
    const widths = await t.evaluate((el) => {
      const box = el.parentElement!;
      // The columns' own width, with the table not stretched to the card.
      const t = el as HTMLElement;
      t.style.width = 'auto';
      const natural = t.offsetWidth;
      t.style.width = '';
      return {
        scroll: box.scrollWidth,
        client: box.clientWidth,
        natural,
      };
    });
    expect(widths.scroll, JSON.stringify(widths)).toBeLessThanOrEqual(
      widths.client,
    );
    expect(widths.natural, JSON.stringify(widths)).toBeLessThanOrEqual(
      widths.client,
    );
  });
