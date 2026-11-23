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
