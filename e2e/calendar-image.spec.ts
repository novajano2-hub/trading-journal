import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== 'desktop' && !info.title.startsWith('at 390'),
    'journeys run at desktop width',
  );
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** The panel Snapshot opens. */
const panelOf = (page: Page) =>
  page.getByRole('dialog', { name: 'Calendar image' });

/** A PNG's width and height, from its header; throws when the bytes are not a PNG. */
async function pngSize(path: string) {
  const bytes = await readFile(path);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.subarray(0, 8)]).toEqual(signature);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('Snapshot on the Calendar opens the panel, and Download saves keel-calendar-2026-11.png at twice the size', async ({
  page,
}) => {
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  const snapshot = page.getByRole('button', { name: 'Snapshot' });
  await expect(snapshot).toBeVisible();
  await snapshot.click();

  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  const preview = panel.getByRole('img', {
    name: 'Preview of the November 2026 calendar image',
  });
  await expect(preview).toBeVisible();
  // The picture has loaded: it has a size of its own.
  await expect
    .poll(() => preview.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(900);
  await expect(panel).toContainText('keel-calendar-2026-11.png');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download image' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('keel-calendar-2026-11.png');
  const { width, height } = await pngSize((await download.path())!);
  // The SVG is about 1,034 wide; the file is drawn at 2x.
  expect(width).toBeGreaterThan(2000);
  expect(height).toBeGreaterThan(1200);

  // The panel does not hold the page: the Calendar behind answers, and Escape closes it.
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(panel).toContainText('keel-calendar-2026-12.png');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(snapshot).toBeFocused();
});

test('Copy image puts a PNG on the clipboard where the browser can, and says so', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Snapshot' }).click();
  const panel = panelOf(page);
  await panel.getByRole('button', { name: 'Copy image' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Copied to the clipboard.',
  );
  const types = await page.evaluate(async () =>
    (await navigator.clipboard.read()).flatMap((item) => item.types),
  );
  expect(types).toContain('image/png');
});

test('without ClipboardItem the Copy button is a line, never a dead button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'ClipboardItem');
  });
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Snapshot' }).click();
  const panel = panelOf(page);
  await expect(
    panel.getByText("This browser can't copy images. Download saves the file."),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /copy/i })).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Download image' }),
  ).toBeEnabled();
});

test("the dashboard's advanced calendar has a Snapshot too, and saves the same file", async ({
  page,
}) => {
  await page.goto('/app/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 20_000,
  });
  const widget = page.locator('[data-widget="calendar-adv"]');
  await widget.getByRole('button', { name: 'Snapshot' }).click();
  const panel = panelOf(page);
  await expect(
    panel.getByRole('img', {
      name: 'Preview of the November 2026 calendar image',
    }),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download image' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('keel-calendar-2026-11.png');
  await pngSize((await download.path())!);
});

test('at 390 the Snapshot is the camera alone and the panel is a bottom sheet', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone width');
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  const snapshot = page.getByRole('button', { name: 'Snapshot' });
  const button = await snapshot.boundingBox();
  // Icon only: no room for the word.
  expect(button!.width).toBeLessThan(50);
  await snapshot.click();

  const panel = panelOf(page);
  await expect(
    panel.getByRole('img', {
      name: 'Preview of the November 2026 calendar image',
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Download image' }),
  ).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  // A sheet: the full width, on the bottom edge.
  expect(box!.x).toBeCloseTo(0, 0);
  expect(box!.width).toBeCloseTo(viewport.width, 0);
  expect(box!.y + box!.height).toBeCloseTo(viewport.height, 0);
  // Nothing spills sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await expect(snapshot).toBeFocused();
});
