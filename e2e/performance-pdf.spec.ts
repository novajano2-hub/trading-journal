import { expect, test, type Page } from '@playwright/test';

// Export PDF on Reports > Performance (#51, C50 to C52): the button hands the
// page to the browser's print dialog, and the print layout is the page itself
// under `@media print`, with its own header and no app chrome. `emulateMedia`
// lays the page out as print does, so these check what paper would get.

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function openPerformance(page: Page) {
  await page.goto('/app/reports/performance');
  await expect(page.getByTestId('reports-performance')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('region', { name: 'Chart 1', exact: true }).getByRole('img'),
  ).toBeVisible();
}

const sidebar = (page: Page) =>
  page.getByRole('complementary', { name: 'Sidebar' });

test('Export PDF sits beside the P&L control, opens the print dialog and leaves no sideways scroll', async ({
  page,
}) => {
  // The dialog itself is the browser's: count the calls instead.
  await page.addInitScript(() => {
    (window as unknown as { prints: number }).prints = 0;
    window.print = () => {
      (window as unknown as { prints: number }).prints++;
    };
  });
  await openPerformance(page);
  const button = page.getByRole('button', { name: 'Export PDF' });
  const basis = page.getByRole('radiogroup', { name: 'P&L', exact: true });
  await expect(button).toBeVisible();
  const [a, b] = await Promise.all([button.boundingBox(), basis.boundingBox()]);
  // The same row, the button to the right of the control.
  expect(Math.abs(a!.y + a!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(
    4,
  );
  expect(a!.x).toBeGreaterThan(b!.x + b!.width - 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await button.click();
  expect(
    await page.evaluate(() => (window as unknown as { prints: number }).prints),
  ).toBe(1);
});

test('the P&L control beside it changes the basis the page and the top bar read', async ({
  page,
}) => {
  await openPerformance(page);
  const basis = page.getByRole('radiogroup', { name: 'P&L', exact: true });
  await expect(basis.getByRole('radio', { name: 'Net' })).toBeChecked();
  await basis.getByText('Gross', { exact: true }).click();
  await expect(basis.getByRole('radio', { name: 'Gross' })).toBeChecked();
  await expect(page.getByRole('button', { name: /^Gross, / })).toBeVisible();
});

test.describe('the print layout', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'one width is enough');
  });

  test('no app chrome and no controls; the header, both charts and the table are there; then back to the screen', async ({
    page,
  }) => {
    await openPerformance(page);
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByTestId('print-header')).toBeHidden();

    await page.emulateMedia({ media: 'print' });
    // The sidebar, the top bar (its title, chips and menus) and the report tabs.
    await expect(sidebar(page)).toBeHidden();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reports', exact: true }),
    ).toBeHidden();
    await expect(page.getByRole('button', { name: /^Symbol/ })).toBeHidden();
    await expect(
      page.getByRole('navigation', { name: 'Reports' }),
    ).toBeHidden();
    // The controls: the basis, Export itself, and each chart's own.
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeHidden();
    await expect(
      page.getByRole('radiogroup', { name: 'P&L', exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Add metric' }).first(),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Expand chart' }).first(),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: /^Remove chart/ }).first(),
    ).toBeHidden();

    // What prints: the header block, both charts and the table.
    const header = page.getByTestId('print-header');
    await expect(header).toBeVisible();
    await expect(
      header.getByRole('heading', { level: 1, name: 'Performance report' }),
    ).toBeVisible();
    await expect(header).toContainText('Sample workspace, all accounts.');
    await expect(header).toContainText('All time (');
    await expect(header).toContainText('Filters: none.');
    await expect(header).toContainText('Shown in dollars, net of fees.');
    await expect(header).toContainText(/Made \d{1,2} \w{3} 2026, \d\d:\d\d\./);
    for (const name of ['Chart 1', 'Chart 2'])
      await expect(
        page.getByRole('region', { name, exact: true }).getByRole('img'),
      ).toBeVisible();
    await expect(
      page.getByRole('table', { name: /^Summary by / }),
    ).toBeVisible();

    // Nothing runs off the page, and no chart is wider than its card.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const wide = await page.evaluate(
      () =>
        [...document.querySelectorAll('[role="img"] svg')].filter((svg) => {
          const card = svg.closest('section')!.getBoundingClientRect();
          return svg.getBoundingClientRect().right > card.right + 1;
        }).length,
    );
    expect(wide).toBe(0);

    // Back on the screen: the chrome returns and the header leaves.
    await page.emulateMedia({ media: 'screen' });
    await expect(sidebar(page)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export PDF' }),
    ).toBeVisible();
    await expect(header).toBeHidden();
  });

  test.describe('in graphite', () => {
    test.use({ colorScheme: 'dark' });

    test('paper is always light, whatever the appearance', async ({ page }) => {
      await openPerformance(page);
      // The surface token as a colour the browser resolves, however it is written.
      const read = () =>
        page.evaluate(() => {
          const probe = document.createElement('i');
          probe.style.background = 'var(--surface-1)';
          document.body.append(probe);
          const surface = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return {
            surface,
            ground: getComputedStyle(document.body).backgroundColor,
            text: getComputedStyle(document.body).color,
          };
        });
      // On screen it is graphite.
      expect((await read()).surface).toBe('rgb(20, 20, 20)');
      await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
      const print = await read();
      expect(print.surface).toBe('rgb(255, 255, 255)');
      expect(print.ground).toBe('rgb(255, 255, 255)');
      // Ink on white: the text token is the light theme's dark ink.
      expect(print.text).toBe('rgb(18, 22, 51)');
      await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
      expect((await read()).surface).toBe('rgb(20, 20, 20)');
    });
  });

  test('Privacy prints masked: no amount on the paper, the header says so', async ({
    page,
  }) => {
    await openPerformance(page);
    await page.getByRole('button', { name: /show as / }).click();
    await page.getByRole('menuitemradio', { name: 'Privacy' }).click();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ media: 'print' });
    const header = page.getByTestId('print-header');
    await expect(header).toContainText(
      'Shown with amounts hidden, net of fees.',
    );
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).toContain('$•••');
  });

  test('the filters and the range are named in words', async ({ page }) => {
    await page.goto(
      '/app/reports/performance?side=long&symbol=ES&from=2026-10-01&to=2026-10-31',
    );
    await expect(page.getByTestId('reports-performance')).toBeVisible({
      timeout: 30_000,
    });
    await page.emulateMedia({ media: 'print' });
    const header = page.getByTestId('print-header');
    await expect(header).toContainText('1 Oct to 31 Oct 2026.');
    await expect(header).toContainText('Filters: Symbol: ES; Side: Long.');
  });
});
