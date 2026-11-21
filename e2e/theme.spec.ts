import { expect, test, type Page } from '@playwright/test';

const toggle = (page: Page) => page.getByRole('button', { name: /theme/i });

/** WCAG contrast of the primary button's text against its background. */
async function primaryContrast(page: Page) {
  return page
    .getByRole('main')
    .getByRole('link', { name: 'Get started' })
    .first()
    .evaluate((el) => {
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
      const s = getComputedStyle(el);
      const a = lum(parse(s.color));
      const b = lum(parse(s.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
}

test.describe('theme', () => {
  test.use({ colorScheme: 'dark' }); // light stays default regardless of OS

  test('light by default, even with an OS dark preference', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(236, 238, 248)',
    );
    expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5);
  });

  test('toggle sets data-theme, persists across reload, keeps contrast', async ({
    page,
  }) => {
    await page.goto('/');
    await toggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5);
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return [s.getPropertyValue('--bg'), s.getPropertyValue('--accent')].map(
        (v) => v.trim().toLowerCase(),
      );
    });
    expect(tokens).toEqual(['#0c0e1c', '#4c57dc']);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).not.toHaveCSS(
      'background-color',
      'rgb(236, 238, 248)',
    );
    await toggle(page).click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-theme',
      'dark',
    );
  });
});
