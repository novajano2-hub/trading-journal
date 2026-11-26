import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

interface StoredTrade {
  id: string;
  serial: number;
  accountId: string;
  pnlCurrency: string;
  grouping?: string;
  fees: number;
  net: number;
  executions: {
    id: string;
    accountId: string;
    fees: number;
    commission: number;
  }[];
}
interface StoredHistory {
  type: string;
  action: string;
  source: string;
  entityId: string;
  field?: string;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
}

/** Everything one store of the app's database holds, read straight from IndexedDB. */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('keel-data');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction(name).objectStore(name).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
        };
      }),
    store,
  ) as Promise<T[]>;
}

const trades = (page: Page) =>
  readStore<StoredTrade>(page, 'trades').then(
    (all) => new Map(all.map((t) => [t.serial, t])),
  );
const grouped = (page: Page) =>
  readStore<StoredHistory>(page, 'history').then((rows) =>
    rows.filter((r) => ['merged', 'split', 'moved'].includes(r.action)),
  );

const log = (page: Page) => page.getByRole('table', { name: 'Trades' });
const bar = (page: Page) => page.getByRole('toolbar');
const toast = (page: Page) => page.getByRole('status', { name: 'Result' });

/** A box in this app is a hidden input under a drawn one: click its label, then check it took. */
async function tick(box: Locator) {
  await box.locator('..').click();
  await expect(box).toBeChecked();
}

/** Opens the bar's grouping menu and chooses an item. */
async function choose(page: Page, item: RegExp) {
  await bar(page).getByRole('button', { name: 'Merge, split or move' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('merge two trades, split one back, move one; the history logs each', async ({
  page,
}) => {
  // Futures live, ES only: every trade in one account and one instrument.
  await page.goto('/app/trades?symbol=ES&account=sample-futures');
  await expect(log(page)).toBeVisible({ timeout: 30_000 });
  const rows = log(page).locator('tbody tr');
  await expect(rows.first()).toBeVisible();

  // The two newest trades: the older opened first, so it keeps its record.
  const label = async (i: number) =>
    (await rows.nth(i).getByRole('checkbox').getAttribute('aria-label'))!;
  const serialOf = async (i: number) =>
    Number((await label(i)).split(' ').pop());
  const newer = await serialOf(0);
  const older = await serialOf(1);
  const before = await trades(page);
  const fillsOlder = before.get(older)!.executions.length;
  const fillsNewer = before.get(newer)!.executions.length;
  const keptId = before.get(older)!.id;
  const goneId = before.get(newer)!.id;

  // Merge.
  await tick(rows.nth(0).getByRole('checkbox'));
  await tick(rows.nth(1).getByRole('checkbox'));
  await choose(page, /^Merge/);
  const merge = page.getByRole('dialog', { name: 'Merge 2 trades' });
  await expect(merge).toBeVisible();
  await expect(merge.getByText('There is no undo.')).toBeVisible();
  // Every execution ticked, a header box and one per fill.
  const total = fillsOlder + fillsNewer;
  await expect(merge.getByRole('checkbox')).toHaveCount(total + 1);
  await expect(merge.getByRole('checkbox', { checked: true })).toHaveCount(
    total + 1,
  );
  await merge.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(toast(page)).toContainText(
    `Merged 2 trades into trade ${older}.`,
  );
  await expect(bar(page)).toHaveCount(0);

  let now = await trades(page);
  expect(now.has(newer)).toBe(false);
  const merged = now.get(older)!;
  expect(merged.id).toBe(keptId);
  expect(merged.executions).toHaveLength(total);
  expect(merged.grouping).toBe('manual');
  let history = await grouped(page);
  const merges = history.filter((r) => r.action === 'merged');
  expect(merges).toHaveLength(2);
  expect(merges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'trade',
        source: 'you',
        entityId: keptId,
        field: 'fills',
        oldValue: fillsOlder,
        newValue: total,
      }),
      expect.objectContaining({
        entityId: goneId,
        field: 'fills',
        oldValue: fillsNewer,
        newValue: 0,
      }),
    ]),
  );

  // Split the newer trade's fills back out: the last ones in time.
  await page.reload();
  await expect(log(page)).toBeVisible({ timeout: 30_000 });
  await expect(
    log(page).getByRole('checkbox', { name: `Select trade ${older}` }),
  ).toBeVisible();
  await tick(
    log(page).getByRole('checkbox', { name: `Select trade ${older}` }),
  );
  await choose(page, /^Split/);
  const split = page.getByRole('dialog', { name: `Split trade ${older}` });
  await expect(split).toBeVisible();
  const ticks = split.locator('tbody').getByRole('checkbox');
  await expect(ticks).toHaveCount(total);
  await expect(
    split.getByRole('button', { name: 'Split', exact: true }),
  ).toBeDisabled();
  for (let i = total - fillsNewer; i < total; i++) await tick(ticks.nth(i));
  await split.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(toast(page)).toContainText(`Split trade ${older}.`);

  now = await trades(page);
  const parts = [...now.values()].filter((t) => t.grouping === 'manual');
  expect(parts).toHaveLength(2);
  expect(now.get(older)!.executions).toHaveLength(fillsOlder);
  const created = parts.find((t) => t.serial !== older)!;
  expect(created.executions).toHaveLength(fillsNewer);
  history = await grouped(page);
  const splits = history.filter((r) => r.action === 'split');
  expect(splits).toHaveLength(2);
  expect(splits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityId: keptId,
        field: 'fills',
        oldValue: total,
        newValue: fillsOlder,
      }),
      expect.objectContaining({
        entityId: created.id,
        field: 'fills',
        oldValue: 0,
        newValue: fillsNewer,
      }),
    ]),
  );

  // Move the new trade to another active account.
  await page.reload();
  await expect(log(page)).toBeVisible({ timeout: 30_000 });
  await tick(
    log(page).getByRole('checkbox', {
      name: `Select trade ${created.serial}`,
    }),
  );
  await choose(page, /^Move to account/);
  const move = page.getByRole('dialog', {
    name: `Move trade ${created.serial}`,
  });
  await expect(move).toBeVisible();
  await expect(move.getByText('There is no undo.')).toBeVisible();
  // Its own account is not offered, and the button waits for a pick.
  const group = move.getByRole('radiogroup', { name: 'Account' });
  await expect(group.getByRole('radio', { name: /^Futures live/ })).toHaveCount(
    0,
  );
  const go = move.getByRole('button', { name: 'Move 1 trade' });
  await expect(go).toBeDisabled();
  await tick(group.getByRole('radio', { name: /^Stocks & options/ }));
  await go.click();
  await expect(toast(page)).toContainText('Moved 1 trade to Stocks & options.');
  // The log is filtered to Futures live: the trade left it.
  await expect(
    log(page).getByRole('checkbox', { name: `Select trade ${created.serial}` }),
  ).toHaveCount(0);

  now = await trades(page);
  const moved = now.get(created.serial)!;
  expect(moved.accountId).not.toBe('sample-futures');
  expect(moved.executions.every((e) => e.accountId === moved.accountId)).toBe(
    true,
  );
  // It keeps its own currency (B6).
  expect(moved.pnlCurrency).toBe(created.pnlCurrency);
  history = await grouped(page);
  expect(history.filter((r) => r.action === 'moved')).toEqual([
    expect.objectContaining({
      type: 'trade',
      source: 'you',
      entityId: created.id,
      field: 'accountId',
      oldValue: 'sample-futures',
      newValue: moved.accountId,
    }),
  ]);
});

test('choose stats saves per user and survives a reload; attachments keep, show, open and delete', async ({
  page,
}) => {
  await page.goto('/app/trades');
  const list = page.getByRole('table', { name: 'Trades' });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await list.locator('tbody tr').first().getByRole('link').first().click();
  const exec = page.getByRole('region', { name: 'Execution' });
  await expect(exec.getByText('Gross P&L')).toBeVisible({ timeout: 30_000 });
  const here = page.url();

  // Every row is on; unticking two and saving hides them, here and on the next trade.
  await exec.getByRole('button', { name: 'Choose stats' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose stats' });
  await expect(chooser.getByRole('checkbox', { checked: false })).toHaveCount(
    0,
  );
  await chooser.getByRole('checkbox', { name: 'Swap' }).uncheck();
  await chooser.getByRole('checkbox', { name: 'Cost basis' }).uncheck();
  await chooser.getByRole('button', { name: 'Save' }).click();
  await expect(chooser).toBeHidden();
  await expect(exec.getByText('Cost basis')).toHaveCount(0);
  await expect(exec.getByText('Swap')).toHaveCount(0);
  await expect(exec.getByText('Gross P&L')).toBeVisible();
  await page.reload();
  await expect(exec.getByText('Gross P&L')).toBeVisible({ timeout: 30_000 });
  await expect(exec.getByText('Cost basis')).toHaveCount(0);
  // The header figures never go.
  const head = page.getByRole('region', { name: /^Trade \d+/ });
  await expect(head.getByText('Net P&L')).toBeVisible();

  // Reset to default clears the choice.
  await exec.getByRole('button', { name: 'Choose stats' }).click();
  await chooser.getByRole('button', { name: 'Reset to default' }).click();
  await chooser.getByRole('button', { name: 'Save' }).click();
  await expect(exec.getByText('Cost basis')).toBeVisible();
  await expect(exec.getByText('Swap', { exact: true })).toBeVisible();

  // Attachments: a PNG becomes a thumbnail, a text file a row; both survive a reload.
  const files = page.getByRole('region', { name: 'Attachments' });
  await files.locator('input[type="file"]').setInputFiles([
    {
      name: 'entry.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
  ]);
  await expect(files.getByText('2 files')).toBeVisible();
  await expect(
    files.getByRole('button', { name: 'Open image, entry.png' }),
  ).toBeVisible();
  await expect(files.getByText('notes.txt')).toBeVisible();
  await expect(files.getByText('2 B')).toBeVisible();
  await page.reload();
  await expect(files.getByText('2 files')).toBeVisible({ timeout: 30_000 });

  // The viewer shows the image; Delete asks first.
  await files.getByRole('button', { name: 'Open image, entry.png' }).click();
  const viewer = page.getByRole('dialog', { name: 'Image 1 of 1' });
  await expect(viewer.getByRole('img', { name: 'entry.png' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete this image?' });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Delete' }).click();
  await ask.getByRole('button', { name: 'Delete image' }).click();
  await expect(viewer).toBeHidden();
  await expect(files.getByText('1 file')).toBeVisible();
  await files.getByRole('button', { name: 'Delete notes.txt' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this file?' })
    .getByRole('button', { name: 'Delete file' })
    .click();
  await expect(files.getByText('Drop files here')).toBeVisible();
  expect(page.url()).toBe(here);
});

test('costs by hand: a fill’s fee saved with Enter moves the trade’s fees and net, and a credit moves them back past where they began', async ({
  page,
}) => {
  await page.goto('/app/trades?symbol=ES&account=sample-futures');
  const list = page.getByRole('table', { name: 'Trades' });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await list.locator('tbody tr').first().getByRole('link').first().click();
  const exec = page.getByRole('region', { name: 'Execution' });
  await expect(exec.getByText('Gross P&L')).toBeVisible({ timeout: 30_000 });
  const id = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
  const stored = async () =>
    (await readStore<StoredTrade>(page, 'trades')).find((t) => t.id === id)!;
  const fees = async () =>
    (await readStore<StoredHistory>(page, 'history')).filter(
      (r) => r.entityId === id && r.field === 'fees',
    );
  const head = page.getByRole('region', { name: /^Trade \d+/ });
  const fills = page.getByRole('table', { name: 'Executions' });
  const row = fills.locator('tbody tr').first();
  const before = await stored();
  const was = before.executions[0]!;
  const netBefore = await head.textContent();
  expect(await fees()).toEqual([]);

  // Open the first fill's exchange fee, type one, and confirm with Enter.
  await row.getByRole('button', { name: /^Edit exchange fee/ }).click();
  const fee = row.getByRole('textbox', { name: 'Exchange fee' });
  await expect(fee).toBeFocused();
  await expect(
    row.getByRole('button', { name: "Save this row's costs" }),
  ).toBeVisible();
  await fee.fill('2.43');
  await fee.press('Enter');
  await expect(row.getByRole('textbox')).toHaveCount(0);

  // The fill, the trade's fees and net moved by the change; gross stayed.
  const delta = 243 - was.fees;
  await expect
    .poll(async () => (await stored()).fees)
    .toBe(before.fees + delta);
  const first = await stored();
  expect(first.executions[0]).toMatchObject({
    fees: 243,
    commission: was.commission,
  });
  expect(first.net).toBe(before.net - delta);
  await expect(row).toContainText('$2.43');
  expect(await head.textContent()).not.toBe(netBefore);
  // One history row, the person's own, in raw cents.
  expect(await fees()).toEqual([
    expect.objectContaining({
      type: 'trade',
      action: 'edited',
      source: 'you',
      oldValue: before.fees,
      newValue: before.fees + delta,
    }),
  ]);

  // A credit: a negative fee is taken, lowers the fees below where they began, and raises the net.
  await row.getByRole('button', { name: /^Edit exchange fee/ }).click();
  await row.getByRole('textbox', { name: 'Exchange fee' }).fill('-5');
  await row.getByRole('textbox', { name: 'Exchange fee' }).press('Enter');
  await expect(row.getByRole('textbox')).toHaveCount(0);
  const credit = -500 - was.fees;
  await expect
    .poll(async () => (await stored()).fees)
    .toBe(before.fees + credit);
  expect((await stored()).net).toBe(before.net - credit);
  await expect(row).toContainText('−$5.00');
  // Two rows, both the person's own (the page's clock is fixed, so they are told apart by their values).
  expect(await fees()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'you',
        oldValue: before.fees,
        newValue: before.fees + delta,
      }),
      expect.objectContaining({
        source: 'you',
        oldValue: before.fees + delta,
        newValue: before.fees + credit,
      }),
    ]),
  );
  expect(await fees()).toHaveLength(2);

  // Something that is not an amount is refused in the row, and nothing is written.
  await row.getByRole('button', { name: /^Edit exchange fee/ }).click();
  await row.getByRole('textbox', { name: 'Exchange fee' }).fill('abc');
  await row.getByRole('button', { name: "Save this row's costs" }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Enter an amount.' }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Cancel the edit' }).click();
  expect((await stored()).fees).toBe(before.fees + credit);

  // It is all still there after a reload.
  await page.reload();
  await expect(fills).toBeVisible({ timeout: 30_000 });
  await expect(fills.locator('tbody tr').first()).toContainText('−$5.00');
});
