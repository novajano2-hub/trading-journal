import { expect, test } from '@playwright/test';

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
