import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('sizes and the cross-out saved in settings reach a note, and Reset to default takes them back', async ({
  page,
}) => {
  // A new note: a heading, a line of text and a ticked checklist item.
  await page.goto('/app/notebook');
  await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/[^/]+$/);
  const noteUrl = page.url();
  const body = page.getByRole('textbox', { name: 'Note', exact: true });
  await body.click();
  await page.keyboard.type('## Levels');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Overnight range held.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[ ] Mark the high and low');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Set size for the open');
  const ticked = body.locator('li[data-checked="true"] p');
  await body.locator('input[type="checkbox"]').first().click();
  await expect(ticked).toHaveText('Mark the high and low');
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // At the defaults: Heading 2 is 24 px, the text 14 px, the ticked item crossed out.
  const heading = body.locator('h2');
  await expect(heading).toHaveCSS('font-size', '24px');
  await expect(body).toHaveCSS('font-size', '14px');
  await expect(ticked).toHaveCSS('text-decoration-line', 'line-through');

  // Settings: Heading 2 at 30, the text at 18, the line through the item off.
  await page.goto('/app/settings/notebook');
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled({ timeout: 30_000 });
  await page.getByLabel('Heading 2').selectOption('30');
  await page.getByLabel('Body').selectOption('18');
  await page
    .getByRole('checkbox', { name: 'Cross out ticked checklist items' })
    .uncheck();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText(
    'Saved',
  );
  await expect(save).toBeDisabled();

  // The note takes all three.
  await page.goto(noteUrl);
  await expect(heading).toHaveCSS('font-size', '30px', { timeout: 30_000 });
  await expect(body).toHaveCSS('font-size', '18px');
  await expect(ticked).toHaveCSS('text-decoration-line', 'none');

  // Reset to default forgets them, and the note reads as it did.
  await page.goto('/app/settings/notebook');
  await expect(page.getByLabel('Heading 2')).toHaveValue('30', {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.getByLabel('Heading 2')).toHaveValue('24');
  await expect(page.getByLabel('Body')).toHaveValue('14');
  // Forgotten for good once the page says so.
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText(
    'Back to the defaults',
  );
  await page.goto(noteUrl);
  await expect(heading).toHaveCSS('font-size', '24px', { timeout: 30_000 });
  await expect(body).toHaveCSS('font-size', '14px');
  await expect(ticked).toHaveCSS('text-decoration-line', 'line-through');
});
