import { expect, test, type Page } from '@playwright/test';

/** WCAG contrast of an element's text against its own background. */
async function contrast(page: Page, el: ReturnType<Page['locator']>) {
  return el.evaluate((node) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number);
      return m.slice(0, 3) as [number, number, number];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const s = getComputedStyle(node);
    const a = lum(parse(s.color));
    const b = lum(parse(s.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

const primary = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: 'Get started' }).first();

const tokens = (page: Page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return ['--bg', '--surface-1', '--line', '--text', '--muted'].map((v) =>
      s.getPropertyValue(v).trim().toLowerCase(),
    );
  });

/** The Appearance the prefs hold in IndexedDB, once the write has landed. */
const saved = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('keel-data');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const get = db.transaction('meta').objectStore('meta').get('prefs');
            get.onsuccess = () => {
              db.close();
              resolve(get.result?.value?.appearance ?? null);
            };
            get.onerror = () => {
              db.close();
              resolve(null);
            };
          } catch {
            db.close();
            resolve(null);
          }
        };
      }),
  );

/** Equal red, green and blue: a neutral grey, no blue cast. */
const neutral = (hex: string | undefined): boolean =>
  hex !== undefined &&
  hex.length === 7 &&
  hex.slice(1, 3) === hex.slice(3, 5) &&
  hex.slice(3, 5) === hex.slice(5, 7);

test.describe('appearance follows the device by default', () => {
  test.describe('on a light device', () => {
    test.use({ colorScheme: 'light' });
    test('the page is light', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute(
        'data-appearance',
        'system',
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(236, 238, 248)',
      );
      expect(await contrast(page, primary(page))).toBeGreaterThanOrEqual(4.5);
    });
  });

  test.describe('on a dark device', () => {
    test.use({ colorScheme: 'dark' });
    test('the page is graphite dark, its greys neutral', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const [bg, surface, line, text, muted] = await tokens(page);
      expect([bg, surface, line, text, muted].every(neutral)).toBe(true);
      expect(bg).toBe('#0b0b0b');
      expect(await contrast(page, primary(page))).toBeGreaterThanOrEqual(4.5);
    });
  });
});

test.describe('the Appearance setting', () => {
  test.use({ colorScheme: 'light' });

  test('Settings, Profile: Dark and Light persist across reloads and reach the marketing pages; System returns to the device', async ({
    page,
  }) => {
    await page.goto('/app/settings/profile');
    const appearance = page
      .getByRole('main')
      .getByRole('radiogroup', { name: 'Appearance' });
    await expect(appearance.getByRole('radio', { name: 'System' })).toBeChecked(
      { timeout: 30_000 },
    );

    await appearance.getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => saved(page)).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      page
        .getByRole('main')
        .getByRole('radiogroup', { name: 'Appearance' })
        .getByRole('radio', { name: 'Dark' }),
    ).toBeChecked();
    // The marketing site wears the same choice, from first paint.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.goto('/app/settings/profile');
    const again = page
      .getByRole('main')
      .getByRole('radiogroup', { name: 'Appearance' });
    await expect(again.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await again.getByText('Light', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => saved(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    // Light holds on a dark device.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page
      .getByRole('main')
      .getByRole('radiogroup', { name: 'Appearance' })
      .getByText('System', { exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => saved(page)).toBe('system');
    // System tracks the device as it changes.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('no sun or moon toggle anywhere in the app bar or the site', async ({
    page,
  }) => {
    for (const path of ['/app/dashboard', '/']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: /theme/i })).toHaveCount(0);
    }
  });
});
