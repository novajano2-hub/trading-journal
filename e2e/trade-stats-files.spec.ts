import { expect, test } from '@playwright/test';

// No `page.clock.setFixedTime` here, unlike the other trade specs: nothing in
// this journey reads the date, and under a fixed clock (after a reload, which
// this journey does) the dialogs' exit animations stretch from about 0.2 s to
// seconds, which looks like a viewer that will not close. Every wait below is
// on the real signal: no dialog left in the page, then the text on the card.
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('choose stats saves per user and survives a reload; attachments keep, show, open and delete', async ({
  page,
}) => {
  /** Every modal has left the page (its exit has played), so the page is live again. */
  const noDialog = () => expect(page.getByRole('dialog')).toHaveCount(0);

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
  await noDialog();
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
  await noDialog();
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
  // The viewer's title follows its list, so "hidden" is not read from its name:
  // it is gone when no dialog is left, and only then is the page live again.
  await noDialog();
  await expect(files.getByText('1 file')).toBeVisible();
  await files.getByRole('button', { name: 'Delete notes.txt' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this file?' })
    .getByRole('button', { name: 'Delete file' })
    .click();
  await noDialog();
  await expect(files.getByText('Drop files here')).toBeVisible();
  expect(page.url()).toBe(here);
});
