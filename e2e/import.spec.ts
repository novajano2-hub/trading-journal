import { expect, test, type Page } from '@playwright/test';

// The times in the file and the account are read in one zone, so the days the
// calendar books them on do not depend on the machine running the suite.
test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function intoMyWorkspace(page: Page) {
  await page.goto('/app/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(
    page.getByRole('button', { name: /My workspace/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

test('import a fills file in My workspace, see it in the log and the calendar, then undo it', async ({
  page,
}) => {
  await intoMyWorkspace(page);

  // Upload.
  await page.goto('/app/import');
  await page.getByLabel('Import file').setInputFiles('e2e/fixtures/fills.csv');
  await expect(page.getByText('fills.csv').first()).toBeVisible();
  await page.getByRole('button', { name: 'Map columns' }).click();

  // Map: with no account yet the New account dialog opens over the columns; making one closes it.
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Account name').fill('Journey account');
  await dialog.getByLabel('Broker').fill('Journey broker');
  await dialog.getByLabel('Starting balance').fill('50000');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Match your columns' }),
  ).toBeVisible();
  await expect(
    page.getByText('Required fields are all matched.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Preview 12 rows/ }).click();

  // Preview: six trades Keel built from twelve fills, nothing skipped.
  await expect(page.getByText('Trades built')).toBeVisible();
  const preview = page.getByRole('main');
  await expect(preview).toContainText('Net P&L of the 6 trades');
  await expect(preview).toContainText('+$812.50');
  await expect(preview).toContainText('Showing 6 of 6.');

  // Confirm.
  await page
    .getByRole('button', { name: 'Import 6 trades into Journey account' })
    .click();
  await expect(
    page.getByText('6 trades imported into Journey account.'),
  ).toBeVisible();

  // The log has them, and only them: My workspace was empty.
  await page.getByRole('button', { name: 'View trades' }).click();
  const log = page.getByRole('table', { name: 'Trades' });
  await expect(log).toBeVisible();
  await expect(log.locator('tbody tr')).toHaveCount(6);
  await expect(log).toContainText('ES Dec 26');
  await expect(log).toContainText('NQ Dec 26');

  // The calendar books them on the days they exited.
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByTestId('calendar-ready')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Wed 18 Nov.*3 trades/ }),
  ).toContainText('+$255.00');
  await expect(
    page.getByRole('button', { name: /^Thu 19 Nov.*3 trades/ }),
  ).toContainText('+$557.50');

  // Import history lists it, and Undo takes it out again.
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Logs' }).click();
  const history = page.getByRole('table');
  await expect(history).toContainText('fills.csv');
  await expect(history).toContainText('Journey account');
  await history.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Undo/ }).click();
  await expect(history).toContainText('Undone');

  await page.getByRole('link', { name: 'Trades', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No trades yet.' }),
  ).toBeVisible();
});

/**
 * Round trips on ES, one contract each, ten minutes apart (the exit two minutes
 * after the entry): the entry at P and the exit at P + 1, so every trade is
 * +1 point, $50. Two fills a trade.
 */
function largeFills(trips: number): string {
  const lines = ['Date/Time,Symbol,Buy/Sell,Quantity,Price'];
  const first = Date.UTC(2020, 0, 6, 14, 30);
  const stamp = (ms: number) =>
    new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  for (let i = 0; i < trips; i++) {
    const at = first + Math.floor(i / 40) * 86_400_000 + (i % 40) * 600_000;
    const price = 6000 + (i % 50);
    lines.push(`${stamp(at)},ESZ6,Buy,1,${price}.00`);
    lines.push(`${stamp(at + 120_000)},ESZ6,Sell,1,${price + 1}.00`);
  }
  return lines.join('\n');
}

interface Probe {
  __tasks: { start: number; ms: number }[];
  __readDone: number;
  __observer: PerformanceObserver;
}

test('a file of 100,000 fills is planned off the page: the right trade count, and no task over the 50 ms budget once the file is read', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await intoMyWorkspace(page);
  await page.goto('/app/import');
  // The observer is on before the upload; a long task is any task over 50 ms.
  await page.evaluate(() => {
    const probe = window as unknown as Probe;
    probe.__tasks = [];
    probe.__observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        probe.__tasks.push({ start: e.startTime, ms: e.duration });
    });
    probe.__observer.observe({ type: 'longtask', buffered: true });
  });

  const csv = largeFills(50_000);
  expect(csv.length).toBeGreaterThan(3_900_000);
  await page.getByLabel('Import file').setInputFiles({
    name: 'large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  // Reading the file (decoding and parsing it) is a task of its own that the planning does not own: it is excused.
  // The step's button is enabled only once the rows are in.
  const toMap = page.getByRole('button', { name: /^Map columns/ });
  await expect(toMap).toBeEnabled({ timeout: 60_000 });
  await page.evaluate(() => {
    (window as unknown as Probe).__readDone = performance.now();
  });

  await toMap.click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Account name').fill('Large account');
  await dialog.getByLabel('Broker').fill('Large broker');
  await dialog.getByLabel('Starting balance').fill('50000');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Match your columns' }),
  ).toBeVisible();
  await expect(
    page.getByText('Required fields are all matched.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Preview 100,000 rows/ }).click();

  // Preview: every fill read, every trade built, in the worker.
  const tiles = page.getByRole('region', { name: 'What Keel read' });
  await expect(tiles).toBeVisible({ timeout: 240_000 });
  await expect(tiles).toContainText('Rows read100,000');
  await expect(tiles).toContainText('Trades built50,000');
  await expect(tiles).toContainText('Rows with issues0');
  await expect(page.getByRole('main')).toContainText('+$2,500,000.00');

  // The observer hands over its entries in a task of its own, so a long task that ended
  // just before Preview showed may not have been delivered: one turn of the event loop,
  // then what is queued but not yet delivered, before the tasks are read.
  const late = await page.evaluate(async () => {
    const probe = window as unknown as Probe;
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const e of probe.__observer.takeRecords())
      probe.__tasks.push({ start: e.startTime, ms: e.duration });
    return probe.__tasks.filter((t) => t.start >= probe.__readDone);
  });
  expect(late, 'tasks over 50 ms after the file was read').toEqual([]);
  expect(workers.length).toBeGreaterThan(0);
});

test('a file over 20 MB is refused with a sentence, and a file just under it is read', async ({
  page,
}) => {
  await page.goto('/app/import');
  const row = '2026-11-16 09:41:00,ESZ6,Buy,1,6010.00\n';
  const head = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
  const size = (mb: number) =>
    Math.floor((mb * 1024 * 1024 - head.length) / row.length);
  await page.getByLabel('Import file').setInputFiles({
    name: 'too-big.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(head + row.repeat(size(21))),
  });
  await expect(page.getByText('This file is larger than 20 MB')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole('button', { name: /^Map columns/ }),
  ).toBeDisabled();

  await page.getByLabel('Import file').setInputFiles({
    name: 'big-enough.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(head + row.repeat(size(19))),
  });
  await expect(page.getByRole('button', { name: /^Map columns/ })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.getByText('This file is larger than 20 MB')).toBeHidden();
});
