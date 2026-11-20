import { expect, test, type Page } from '@playwright/test';
import { cutOffText } from './figures';

const H1 = "Find out what's working in your trading.";
const FINAL = ['+$1,236.00', '50.0%', '3.17', '+$154.50'];

const hero = (page: Page) => page.getByRole('region', { name: H1 });

/**
 * The figure a sighted visitor sees in each KPI cell. Screen readers get a
 * separate copy of the final value, so only visible, aria-hidden text counts.
 */
function shownKpis(page: Page): Promise<string[]> {
  return page
    .getByTestId('kpi-strip')
    .locator('dd')
    .evaluateAll((dds) =>
      dds.map((dd) =>
        [...dd.querySelectorAll('[aria-hidden="true"]')]
          .filter((el) => el.checkVisibility())
          .map((el) => el.textContent)
          .join(''),
      ),
    );
}

const equityLine = (page: Page) =>
  hero(page)
    .getByRole('img', { name: /equity/i })
    .locator('path[fill="none"]');

/** Animations still running anywhere in the hero (CSS or Web Animations). */
const running = (page: Page) =>
  hero(page).evaluate((el) => el.getAnimations({ subtree: true }).length);

test('hero carries the contract copy and its two actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(H1);
  const h = hero(page);
  const start = h.getByRole('link', { name: 'Get started' });
  const how = h.getByRole('link', { name: 'See how it works' });
  await expect(start).toBeVisible();
  await expect(how).toBeVisible();
  await expect(start).toHaveAttribute('href', '/#how');
  await expect(how).toHaveAttribute('href', '#how');
  // The product composition is labelled as sample data, once.
  await expect(h.getByText('Sample data', { exact: true })).toHaveCount(1);
  await how.click();
  await expect(page.locator('#how')).toBeInViewport();
});

test('the landing page has no file input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
});

test('the KPI tickers settle on the engine figures', async ({ page }) => {
  await page.goto('/');
  // The entrance is declared when motion is welcome…
  const h1 = page.getByRole('heading', { level: 1 });
  expect(
    await h1.evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe('none');
  // …and every figure lands on the exact engine value.
  await expect.poll(() => shownKpis(page)).toEqual(FINAL);
  await expect
    .poll(() =>
      equityLine(page).evaluate((el) => getComputedStyle(el).strokeDashoffset),
    )
    .toBe('0px');
  await expect.poll(() => running(page)).toBe(0);
  // Screen readers get each final value once, never a counting number.
  await expect(page.getByTestId('kpi-strip').locator('.sr-only')).toHaveText(
    FINAL,
  );
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the hero is in its final state at once', async ({ page }) => {
    await page.goto('/');
    // Read once, without retrying: nothing may count, draw or slide.
    expect(await shownKpis(page)).toEqual(FINAL);
    expect(
      await equityLine(page).evaluate(
        (el) => getComputedStyle(el).strokeDashoffset,
      ),
    ).toBe('0px');
    expect(await running(page)).toBe(0);
    expect(
      await page
        .getByRole('heading', { level: 1 })
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
  });
});

test('the trade card shows one rule kept and one broken, in full', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.getByTestId('hero-trade');
  await expect(card).toContainText('NQZ5');
  await expect(card).toContainText('−$275.00');
  await expect(card.getByRole('listitem')).toHaveText([
    'Kept: Entered on the range break',
    'Broken: Stop stays where it was placed',
  ]);
  expect(await cutOffText(card)).toEqual([]);
});

test('the hero fits the first viewport at 1280×800 and the headline holds three lines at 1440', async ({
  page,
}) => {
  test.skip(test.info().project.name === 'mobile', 'desktop sizes');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const h = hero(page);
  await expect(h.getByRole('link', { name: 'Get started' })).toBeInViewport({
    ratio: 1,
  });
  await expect(
    h.getByRole('link', { name: 'See how it works' }),
  ).toBeInViewport({ ratio: 1 });

  await page.setViewportSize({ width: 1440, height: 900 });
  const lines = await page
    .getByRole('heading', { level: 1 })
    .evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        parseFloat(getComputedStyle(el).lineHeight),
    );
  expect(Math.round(lines)).toBeLessThanOrEqual(3);
});

for (const width of [1024, 1152, 1280]) {
  test(`the KPI figures show in full at ${width}`, async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'desktop sizes');
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect.poll(() => shownKpis(page)).toEqual(FINAL);
    const problems = await page
      .getByTestId('kpi-strip')
      .evaluate(async (dl) => {
        await document.fonts.ready;
        // The window clips its content, so a figure must sit inside it too.
        let clip: Element | null = dl.parentElement;
        while (clip && getComputedStyle(clip).overflow !== 'hidden')
          clip = clip.parentElement;
        const box = clip!.getBoundingClientRect();
        const out: string[] = [];
        for (const cell of [...dl.children]) {
          const fig = [
            ...cell.querySelectorAll('dd [aria-hidden="true"]'),
          ].find((el) => el.checkVisibility())!;
          const range = document.createRange();
          range.selectNodeContents(fig);
          const ink = range.getBoundingClientRect();
          const c = cell.getBoundingClientRect();
          if (ink.left < c.left - 0.5 || ink.right > c.right + 0.5)
            out.push(`${fig.textContent} spills past its cell`);
          if (ink.left < box.left || ink.right > box.right)
            out.push(`${fig.textContent} is clipped by the window`);
        }
        return out;
      });
    expect(problems).toEqual([]);
  });
}
