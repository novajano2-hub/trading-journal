import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** "+$1,234.50" or "−$200.00" as dollars. */
const dollars = (text: string): number =>
  Number(text.replace(/[+$,]/g, '').replace('−', '-'));

/** A day's net as the Calendar's cell reads it: its label's first money figure. */
async function dayNet(page: Page, day: RegExp): Promise<number> {
  const cell = page
    .getByRole('grid', { name: 'November 2026' })
    .getByRole('button', { name: day });
  const label = (await cell.getAttribute('aria-label')) ?? '';
  const money = label.match(/[+−-]\$[\d,]+\.\d{2}/);
  expect(money, label).not.toBeNull();
  return dollars(money![0]);
}

/** The month's net, from the figure under the first Net P&L label of the Calendar's summary. */
async function monthNet(page: Page): Promise<number> {
  const figure = page
    .locator('[data-metric-tip="pnl"]')
    .first()
    .locator('xpath=../following-sibling::b[1]');
  return dollars((await figure.innerText()).trim());
}

async function openMonth(page: Page) {
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
}

test('switching Futures live to LIFO moves a partial exit to another day and leaves the month total alone', async ({
  page,
}) => {
  // The sample's trades all exit on the day they enter, where the method only
  // moves money inside a day. A scaled trade held over four days is what shows it:
  // two buys, then two sells on later days, each sell closing a different lot.
  await page.goto('/app/trades/new?account=sample-futures');
  await expect(page.getByRole('heading', { name: 'Instrument' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Asset type').selectOption('future');
  await page.getByLabel('Symbol').fill('MNQZ6');
  const fills = [
    { side: 'buy', date: '2026-11-16', price: '21000' },
    { side: 'buy', date: '2026-11-17', price: '21100' },
    { side: 'sell', date: '2026-11-18', price: '21050' },
    { side: 'sell', date: '2026-11-19', price: '21150' },
  ] as const;
  for (const [i, f] of fills.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add fill' }).click();
    const n = i + 1;
    await page.getByLabel(`Fill ${n} date`).fill(f.date);
    await page.getByLabel(`Fill ${n} time`).fill('10:00');
    await page.getByLabel(`Fill ${n} side`).selectOption(f.side);
    await page.getByLabel(`Fill ${n} quantity`).fill('1');
    await page.getByLabel(`Fill ${n} price`).fill(f.price);
  }
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByRole('heading', { name: 'Add a trade' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/\d+\s*$/);

  // First in first out: Wednesday's exit closes Monday's lot (+$100), Thursday's Tuesday's (+$100).
  await openMonth(page);
  const wed = /^Wed 18 Nov/;
  const thu = /^Thu 19 Nov/;
  const before = {
    wed: await dayNet(page, wed),
    thu: await dayNet(page, thu),
    month: await monthNet(page),
  };

  // Switch the account in Settings: the table says FIFO, the question says what can move.
  await page.goto('/app/settings/accounts');
  const table = page.getByRole('table', { name: /^Accounts/ });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const live = table.getByRole('row', { name: /^Select Futures live/ });
  await expect(live.getByRole('cell', { name: 'FIFO' })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Futures live' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit account' });
  await edit
    .getByRole('radiogroup', { name: 'Cost method' })
    .getByText('LIFO, last in first out')
    .click();
  await edit.getByRole('button', { name: 'Save' }).click();
  const ask = page.getByRole('dialog', {
    name: 'Switch Futures live to LIFO?',
  });
  await expect(ask).toContainText('worked out again from its fills');

  // Cancel keeps the old method.
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    edit
      .getByRole('radiogroup', { name: 'Cost method' })
      .getByRole('radio', { name: /^FIFO/ }),
  ).toBeChecked();
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(live.getByRole('cell', { name: 'FIFO' })).toBeVisible();

  // Switch for real.
  await page.getByRole('button', { name: 'Actions for Futures live' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await edit
    .getByRole('radiogroup', { name: 'Cost method' })
    .getByText('LIFO, last in first out')
    .click();
  await edit.getByRole('button', { name: 'Save' }).click();
  await ask.getByRole('button', { name: 'Switch to LIFO' }).click();
  await expect(live.getByRole('cell', { name: 'LIFO' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Last in first out: Wednesday's exit closes Tuesday's lot (-$100), Thursday's Monday's (+$300).
  await openMonth(page);
  expect(await dayNet(page, wed)).toBe(before.wed - 200);
  expect(await dayNet(page, thu)).toBe(before.thu + 200);
  // The trade's total did not move, so neither did the month's.
  expect(await monthNet(page)).toBe(before.month);

  // It holds after a reload: the rebuild is stored, not drawn.
  await page.reload();
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  expect(await dayNet(page, wed)).toBe(before.wed - 200);
});
