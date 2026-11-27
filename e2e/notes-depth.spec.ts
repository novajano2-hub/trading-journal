import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The print dialog is the browser's: record what the print layout holds
  // when it is asked to print, and leave the layout in place for the checks.
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: string[] };
    w.__printed = [];
    window.print = () => {
      w.__printed.push(document.getElementById('print-note')?.innerText ?? '');
    };
  });
});

const TITLE = 'Opening range notes';
const FIRST = 'Range held until the break';

/** Pastes a picture into the note as the clipboard would hand it over. */
async function pastePicture(body: Locator) {
  await body.evaluate(async (el) => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2b35af';
    ctx.fillRect(0, 0, 240, 120);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], 'range.png', { type: 'image/png' }));
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);

test('paste an image, format text, restore a version, export and import a note', async ({
  page,
}, info) => {
  await page.goto('/app/notebook');
  await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible({
    timeout: 30_000,
  });

  // A new plain note.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/[^/]+$/);
  const noteUrl = page.url();
  await page.getByRole('textbox', { name: 'Note title' }).fill(TITLE);
  const body = page.getByRole('textbox', { name: 'Note', exact: true });

  // Format text: a line made bold, then a heading.
  await body.click();
  await page.keyboard.type(FIRST);
  await body.locator('p').first().selectText();
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByRole('button', { name: /^Style:/ }).click();
  await page
    .getByRole('menuitemradio', { name: 'Heading 2', exact: true })
    .click();
  await expect(body.locator('h2 strong')).toHaveText(FIRST);

  // A second line, and a picture pasted after it: stored as the note's own file.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Entry on a close outside the range');
  await pastePicture(body);
  const picture = body.locator('img');
  await expect(picture).toBeVisible();
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // Leaving the note keeps a version of it. Come back: the text and picture are as left.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/notebook$/);
  await page.goForward();
  await expect(page).toHaveURL(noteUrl);
  await expect(body.locator('h2 strong')).toHaveText(FIRST);
  await expect(picture).toBeVisible();

  // Change the note, then look at the history: one version, from leaving, with its picture.
  await body
    .locator('h2')
    .first()
    .click({ position: { x: 2, y: 8 } });
  await page.keyboard.type('EDITED ');
  await expect(body).toContainText('EDITED');
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await expect(history).toBeVisible();
  const versions = history.getByRole('navigation', { name: 'Versions' });
  await expect(
    versions.getByRole('button', { name: /^Current/ }),
  ).toBeVisible();
  await expect(versions.getByRole('button')).toHaveCount(2);
  await expect(history.getByText('Read only')).toBeVisible();
  const preview = history.getByRole('textbox', { name: 'Version preview' });
  await expect(preview).toContainText(FIRST);
  await expect(preview).not.toContainText('EDITED');
  await expect(preview.locator('img')).toBeVisible();

  // Restore asks first; confirming brings the text back and leaves the title alone.
  await history.getByRole('button', { name: 'Restore this version' }).click();
  const ask = page.getByRole('dialog', { name: 'Restore this version?' });
  await expect(ask).toContainText('title and tags stay as they are');
  await ask.getByRole('button', { name: 'Restore' }).click();
  await expect(
    page.getByRole('status', { name: 'Version history' }),
  ).toContainText('Restored the version from');
  await expect(history).toBeHidden();
  await expect(body).not.toContainText('EDITED');
  await expect(body.locator('h2 strong')).toHaveText(FIRST);
  await expect(picture).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue(
    TITLE,
  );
  // What was replaced is kept, marked as saved before the restore.
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(history).toBeVisible();
  await expect(history.getByText('Before restore')).toBeVisible();
  await versions.getByRole('button', { name: /Before restore/ }).click();
  await expect(preview).toContainText('EDITED');
  await history.getByRole('button', { name: 'Close' }).last().click();
  await expect(history).toBeHidden();

  // Full screen fills the window; Escape leaves it.
  await page.getByRole('button', { name: 'Full screen' }).click();
  const full = page.getByRole('dialog', { name: 'Note, full screen' });
  await expect(full).toBeVisible();
  await expect(body).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(full).toHaveCount(0);

  // Export as a Keel note: a file with the title, the formatting and the picture's reference.
  await page.getByRole('button', { name: 'Export or import' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export as Keel note' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${TITLE}.json`);
  const saved = info.outputPath('note.json');
  await download.saveAs(saved);
  const file = JSON.parse(await readFile(saved, 'utf8')) as {
    kind: string;
    version: number;
    title: string;
    body: unknown;
  };
  expect(file).toMatchObject({ kind: 'keel-note', version: 1, title: TITLE });
  const text = JSON.stringify(file.body);
  expect(text).toContain('"bold"');
  expect(text).toContain('keel-file:');
  expect(text).not.toContain('EDITED');

  // Export as PDF: the print layout holds the note, and on paper it is all there is.
  await page.getByRole('button', { name: 'Export or import' }).click();
  await page.getByRole('menuitem', { name: 'Export as PDF' }).click();
  await expect.poll(() => printed(page).then((p) => p.length)).toBe(1);
  expect((await printed(page))[0]).toContain(TITLE);
  expect((await printed(page))[0]).toContain(FIRST);
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  const onPaper = await page.evaluate(() => {
    const layout = document.getElementById('print-note')!;
    const style = getComputedStyle(layout);
    const others = [...document.body.children].filter((c) => c !== layout);
    return {
      shown: style.display !== 'none' && style.position === 'static',
      othersHidden: others.every((c) => getComputedStyle(c).display === 'none'),
    };
  });
  expect(onPaper).toEqual({ shown: true, othersHidden: true });
  await page.emulateMedia({ media: null, reducedMotion: 'reduce' });
  // When the print dialog is done, the layout goes.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#print-note')).toHaveCount(0);

  // Import the file: a new note, with the same title and text, and it opens.
  await page.getByRole('button', { name: 'Export or import' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Import a Keel note' }).click(),
  ]);
  await chooser.setFiles(saved);
  await expect(page).toHaveURL(/\/app\/notebook\/[^/]+$/);
  await expect(page).not.toHaveURL(noteUrl);
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue(
    TITLE,
  );
  await expect(body.locator('h2 strong')).toHaveText(FIRST);
  // The picture is referenced, not copied: this workspace still has it.
  await expect(body.locator('img')).toBeVisible();

  // A file that is not a Keel note is refused, in words.
  const notANote = info.outputPath('trades.json');
  await writeFile(
    notANote,
    JSON.stringify({ kind: 'keel-trades', version: 1 }),
  );
  await page.getByRole('button', { name: 'Export or import' }).click();
  const [second] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Import a Keel note' }).click(),
  ]);
  await second.setFiles(notANote);
  const refused = page.getByRole('alertdialog', {
    name: "Couldn't import that file",
  });
  await expect(refused).toContainText("That file isn't a Keel note.");
  await refused.getByRole('button', { name: 'Close' }).click();
  await expect(refused).toBeHidden();
});

test('typing straight after a toolbar menu choice lands in the note, not on the menu that is fading', async ({
  page,
}) => {
  // Motion on: the closing menu stays in the page for its exit, under the pointer.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/app/notebook');
  await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/[^/]+$/);
  const body = page.getByRole('textbox', { name: 'Note', exact: true });
  await body.click();
  await page.keyboard.type('Range held');
  await body.locator('p').first().selectText();

  await page.getByRole('button', { name: /^Style:/ }).click();
  const item = page.getByRole('menuitemradio', {
    name: 'Heading 2',
    exact: true,
  });
  const at = (await item.boundingBox())!;
  await item.click();
  // The pointer moves over the menu as it fades, and the keys come at once:
  // neither may pull the keyboard to the menu (a space or Enter would choose
  // the item again and undo the heading).
  await page.mouse.move(at.x + 12, at.y + 10);
  await page.keyboard.press('End');
  await page.keyboard.type(' until the break held');
  await page.mouse.move(at.x + 14, at.y + 12);
  await page.keyboard.type(' and so did the plan');
  await expect(body.locator('h2')).toHaveText(
    'Range held until the break held and so did the plan',
  );
});
