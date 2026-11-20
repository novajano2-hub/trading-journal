import { expect, test } from '@playwright/test';
import { cutOffText } from './figures';

const DROP = /drop your broker csv/i;

test('hero shows the contract copy and labelled sample tickets', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /FILE EVERY TRADE\.\s*FIND THE PATTERN\./,
  );
  await expect(page.getByText('SAMPLE TICKETS')).toBeVisible();
  await expect(
    page.getByTestId('ticket-stack').getByText('RULE BROKEN'),
  ).toBeVisible();
});

test("dropping a CSV prints the visitor's own tickets, then hands off", async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/sample-fills.csv');
  await expect(page.getByTestId('ticket-yours')).toHaveCount(4);
  await expect(page.getByTestId('ticket-yours').first()).toContainText('ESZ5');
  await expect(
    page.getByTestId('ticket-stack').getByText('RULE BROKEN'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Map columns and continue' }).click();
  await expect(page).toHaveURL(/\/app\/import$/);
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible(); // Review Focus 5
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText('No file waiting.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No file waiting.')).toBeVisible();
});

test("the visitor's fills print in the ticket clock, in full", async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/sample-fills.csv');
  const yours = page.getByTestId('ticket-yours');
  await expect(yours).toHaveCount(4);
  // The file's '2026-11-16 09:41:00' as the sample tickets print time.
  await expect(yours.first()).toContainText('16 NOV 09:41:00');
  await expect(yours.nth(3)).toContainText('16 NOV 10:48:00');
  await expect(page.getByTestId('ticket-stack')).not.toContainText('2026-');
  expect(await cutOffText(yours)).toEqual([]);

  // A US month-first time with AM/PM reads the same way.
  await page
    .getByLabel('Choose a different file')
    .setInputFiles('e2e/fixtures/one-fill.csv');
  await expect(yours).toHaveCount(1);
  await expect(yours).toContainText('16 NOV 14:05:00');
});

test('the drop status agrees with the number of fills', async ({ page }) => {
  await page.goto('/');
  const status = page.getByRole('main').getByRole('status');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/sample-fills.csv');
  await expect(
    page.getByText(
      'Its first 4 fills are printed as tickets. Check them, then map your columns.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(status).toHaveText(
    'Read sample-fills.csv. Its first 4 fills are printed as tickets.',
  );

  await page
    .getByLabel('Choose a different file')
    .setInputFiles('e2e/fixtures/one-fill.csv');
  await expect(
    page.getByText(
      'Its first fill is printed as a ticket. Check it, then map your columns.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(status).toHaveText(
    'Read one-fill.csv. Its first fill is printed as a ticket.',
  );
});

test('a file that cannot be removed stays, with a way out', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/sample-fills.csv');
  await page.getByRole('button', { name: 'Map columns and continue' }).click();
  await expect(page).toHaveURL(/\/app\/import$/);
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible();

  // Make the browser store refuse the delete, so clearPendingImport rejects.
  await page.evaluate(() => {
    IDBObjectStore.prototype.delete = () => {
      throw new DOMException('Refused for the test', 'UnknownError');
    };
  });
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    "Couldn't remove the file from this browser. Try again, or clear this site's data in your browser settings.",
  );
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove file' })).toBeVisible();

  // With the store working again, trying again removes it.
  await page.reload();
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText('No file waiting.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('unreadable file shows an error and keeps the sample', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/not-trades.csv');
  // Next's route announcer is also role=alert, so scope to the page content.
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    /couldn't read that file/,
  );
  await expect(page.getByText('SAMPLE TICKETS')).toBeVisible();
});

test('a header-only CSV is an error, not blank tickets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/header-only.csv');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    "We couldn't find any trades in that file.",
  );
  await expect(page.getByTestId('ticket-yours')).toHaveCount(0);
  await expect(page.getByText('SAMPLE TICKETS')).toBeVisible();
});

test('the drop slot is reachable by keyboard', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel(DROP);
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await input.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  // The ring is drawn on the slot, since the input itself is visually hidden.
  const slot = page.locator('label', { has: input });
  await expect(slot).toHaveCSS('outline-style', 'solid');
  // Once the tickets print, focus moves on to the next action.
  await input.setInputFiles('e2e/fixtures/sample-fills.csv');
  await expect(
    page.getByRole('button', { name: 'Map columns and continue' }),
  ).toBeFocused();
});

test('reduced motion prints the tickets without animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel(DROP).setInputFiles('e2e/fixtures/sample-fills.csv');
  const tickets = page.getByTestId('ticket-yours');
  await expect(tickets).toHaveCount(4);
  for (const name of await tickets.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).animationName),
  ))
    expect(name).toBe('none');
});
