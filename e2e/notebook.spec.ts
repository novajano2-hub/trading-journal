import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('make a folder and a note in it, favourite it, trash it and restore it', async ({
  page,
}) => {
  await page.goto('/app/notebook');
  const folders = page.getByRole('navigation', { name: 'Folders' });
  await expect(folders).toBeVisible({ timeout: 30_000 });

  // A folder of my own.
  await folders.getByRole('button', { name: 'New folder' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Gap ideas');
  await page.keyboard.press('Enter');
  await expect(
    folders.getByRole('list', { name: 'Your folders' }),
  ).toContainText('Gap ideas');

  // A plain note, made while that folder is open, lands in it.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/[^/]+$/);
  const title = page.getByRole('textbox', { name: 'Note title' });
  await title.fill('Fade the gap at the open');
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await expect(page.getByLabel('Move to folder')).toHaveValue(/.+/);
  await expect(
    page.getByLabel('Move to folder').locator('option:checked'),
  ).toHaveText('Gap ideas');
  const list = page.getByRole('list', { name: 'Notes' });
  await expect(list).toContainText('Fade the gap at the open');

  // Favourite it.
  const star = page.getByRole('button', { name: 'Favourite', exact: true });
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // Trash it: it leaves the folder, and Trash holds it.
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(
    page.getByRole('status', { name: 'Notebook notice' }),
  ).toContainText('Moved to Trash');
  // The folder held only this note: its list gives way to the empty state.
  await expect(list).toHaveCount(0);
  await folders.getByRole('button', { name: /^Trash/ }).click();
  await expect(list).toContainText('Fade the gap at the open');

  // Restore it: back in its folder, still a favourite.
  await page
    .getByRole('button', { name: 'Restore Fade the gap at the open' })
    .click();
  // The folder held only this note: its list gives way to the empty state.
  await expect(list).toHaveCount(0);
  await folders.getByRole('button', { name: /^Gap ideas/ }).click();
  await expect(list).toContainText('Fade the gap at the open');
  await list.getByRole('link', { name: /Fade the gap at the open/ }).click();
  await expect(
    page.getByRole('button', { name: 'Favourite', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
