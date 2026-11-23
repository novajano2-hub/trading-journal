import { expect, test, type Page } from '@playwright/test';
import { cutOffText } from './figures';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const tradeLog = (page: Page) => page.getByRole('table', { name: 'Trades' });

async function openLog(page: Page, query = '') {
  await page.goto(`/app/trades${query}`);
  await expect(tradeLog(page)).toBeVisible({ timeout: 30_000 });
}

/** The cell texts of one named column across the log's rows on this page. */
async function column(page: Page, name: string): Promise<string[]> {
  const heads = await tradeLog(page).getByRole('columnheader').allInnerTexts();
  const at = heads.findIndex((h) => h.trim() === name);
  expect(at, `a ${name} column`).toBeGreaterThan(-1);
  return tradeLog(page)
    .locator('tbody tr')
    .evaluateAll(
      (rows, i) =>
        rows.map((r) => r.querySelectorAll('td')[i]?.textContent?.trim() ?? ''),
      at,
    );
}

const dollars = (text: string) =>
  Number(text.replace(/[^0-9.−-]/g, '').replace('−', '-'));

test('filter to ES, sort by net, open the top trade, tag and note it, and see the tag in the log', async ({
  page,
}) => {
  await openLog(page);
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: /Symbol/ })
    .click();
  await page.getByRole('checkbox', { name: 'ES', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/symbol=ES/);
  // Every row left is an ES trade.
  await expect
    .poll(async () =>
      (await column(page, 'Instrument')).every((t) => /^ES\b/.test(t)),
    )
    .toBe(true);

  await tradeLog(page)
    .getByRole('button', { name: /Net P&L/ })
    .click();
  await expect(
    tradeLog(page).getByRole('columnheader', { name: /Net P&L/ }),
  ).toHaveAttribute('aria-sort', 'descending');
  const nets = (await column(page, 'Net P&L')).map(dollars);
  expect(nets[0]).toBeGreaterThanOrEqual(nets[1]!);
  expect(nets[0]).toBeGreaterThan(0);

  const first = tradeLog(page).locator('tbody tr').first();
  await first.getByRole('link').first().click();
  // The log's filters travel with the trade.
  await expect(page).toHaveURL(/\/app\/trades\/[^/?]+\?.*symbol=ES/);
  const tradeSerial = (
    await page.getByRole('heading', { level: 1 }).innerText()
  ).match(/(\d+)\s*$/)![1];

  // Tag it "fomo", made on the spot in the Mistakes category.
  await page.getByRole('button', { name: 'Add to Mistakes' }).click();
  await page.getByRole('combobox', { name: 'Mistakes tags' }).fill('fomo');
  await page.getByRole('option', { name: "Create 'fomo'" }).click();
  await expect(
    page.getByRole('group', { name: 'Mistakes' }).getByText('fomo'),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // A note, typed into the editor, saves by itself.
  const note = page
    .getByRole('textbox', { name: /note/i })
    .or(page.locator('[contenteditable="true"]'));
  await note.first().click();
  await page.keyboard.type('Chased the open, no plan.');
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // Back to the log, and find the trade by its serial: its Tags cell has the tag.
  await page.getByRole('link', { name: 'Trades', exact: true }).last().click();
  await expect(tradeLog(page)).toBeVisible();
  await expect(page).toHaveURL(/symbol=ES/);
  await page
    .getByRole('searchbox', { name: 'Search trades' })
    .fill(`#${tradeSerial}`);
  const row = tradeLog(page).locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('fomo', { exact: true })).toBeVisible();
});

test('bulk-mark three trades reviewed', async ({ page }) => {
  await openLog(page);
  const count = async () => {
    const label = await page
      .getByText(/^Reviewed \d+$/)
      .first()
      .innerText();
    return Number(label.replace(/\D/g, ''));
  };
  const before = await count();
  // Three rows from the top of the log: they are not reviewed yet.
  const rows = tradeLog(page).locator('tbody tr');
  for (const n of [0, 1, 2]) {
    // The box is drawn on its label; the input itself is visually hidden.
    await rows.nth(n).locator('label:has(input[type="checkbox"])').click();
    await expect(rows.nth(n).getByRole('checkbox')).toBeChecked();
  }
  await expect(
    page.getByRole('toolbar', { name: '3 selected trades' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByRole('status', { name: 'Result' })).toContainText(
    'Marked 3 trades reviewed.',
  );
  await expect.poll(count).toBe(before + 3);
  for (const n of [0, 1, 2])
    await expect(rows.nth(n)).toContainText('Reviewed');
});

interface Fill {
  side: 'buy' | 'sell';
  time: string;
  qty: string;
  price: string;
}

/** Fills the manual form and saves; returns the new trade's serial. */
async function addTrade(
  page: Page,
  type: 'future' | 'stock',
  symbol: string,
  fills: Fill[],
): Promise<string> {
  await page.goto('/app/trades/new');
  await expect(page.getByRole('heading', { name: 'Instrument' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Asset type').selectOption(type);
  await page.getByLabel('Symbol').fill(symbol);
  for (const [i, f] of fills.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add fill' }).click();
    const n = i + 1;
    await page.getByLabel(`Fill ${n} date`).fill('2026-11-19');
    await page.getByLabel(`Fill ${n} time`).fill(f.time);
    await page.getByLabel(`Fill ${n} side`).selectOption(f.side);
    await page.getByLabel(`Fill ${n} quantity`).fill(f.qty);
    await page.getByLabel(`Fill ${n} price`).fill(f.price);
  }
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page).toHaveURL(/\/app\/trades\/(?!new)[^/?]+(\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Add a trade' })).toHaveCount(
    0,
  );
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText(/\d+\s*$/);
  return (await title.innerText()).match(/(\d+)\s*$/)![1]!;
}

test('add a manual NQ trade and see it on its page', async ({ page }) => {
  await addTrade(page, 'future', 'NQZ6', [
    { side: 'buy', time: '10:00', qty: '1', price: '21050.25' },
    { side: 'sell', time: '10:20', qty: '1', price: '21062.25' },
  ]);
  await expect(page.getByText('NQ Dec 26').first()).toBeVisible();
  // 12 points on one NQ contract, $20 a point: $240 before costs.
  await expect(page.getByText('+$240.00').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Executions' })).toBeVisible();
});

for (const qty of ['2500', '25000']) {
  test(`a quantity of ${qty} shows in full in the log at 1440`, async ({
    page,
  }) => {
    const serial = await addTrade(page, 'stock', 'AAPL', [
      { side: 'buy', time: '10:00', qty, price: '200.00' },
      { side: 'sell', time: '10:20', qty, price: '201.00' },
    ]);
    await openLog(page);
    await page
      .getByRole('searchbox', { name: 'Search trades' })
      .fill(`#${serial}`);
    const rows = tradeLog(page).locator('tbody tr');
    await expect(rows).toHaveCount(1);
    const cell = rows.locator('td').nth(4);
    await expect(cell).toHaveText(Number(qty).toLocaleString('en-US'));
    // The figure is whole inside its cell: no ellipsis, no clip.
    expect(await cutOffText(cell)).toEqual([]);
  });
}

test('the log fits the card at 1440: no sideways scroll, Strategy and Tags whole, the expiry out of the instrument', async ({
  page,
}) => {
  await openLog(page, '?range=all');
  const fit = await tradeLog(page).evaluate((table) => {
    const box = table.parentElement!;
    return {
      table: box.scrollWidth - box.clientWidth,
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(fit).toEqual({ table: 0, page: 0 });
  // Strategy keeps room for a name like "Opening range breakout".
  const strategy = tradeLog(page).getByRole('columnheader', {
    name: 'Strategy',
  });
  expect((await strategy.boundingBox())!.width).toBeGreaterThanOrEqual(165);
  // An option's expiry is in the tooltip, not beside the name.
  const option = tradeLog(page)
    .locator('tbody tr [title*=", expires "]')
    .first();
  await expect(option).toHaveAttribute(
    'title',
    /^[A-Z]+\d{6}[CP]\d+, expires /,
  );
  expect(await cutOffText(tradeLog(page).locator('tbody tr').first())).toEqual(
    [],
  );
});

test('the keyboard ring is themed on a bare link: 2px, 3px off, the chip radius', async ({
  page,
}) => {
  await openLog(page);
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.id = 'bare-link';
    a.href = '#';
    a.textContent = 'Bare';
    document.body.append(a);
  });
  await page.keyboard.press('Tab');
  await page.locator('#bare-link').focus();
  // Outline and radius can ease in over a frame; read them once they settle.
  await expect
    .poll(() =>
      page.locator('#bare-link').evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.outlineWidth, s.outlineOffset, s.borderTopLeftRadius];
      }),
    )
    .toEqual(['2px', '3px', '6px']);
});
