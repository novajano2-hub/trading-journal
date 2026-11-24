import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'journeys run at desktop width');
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test("open 19 Nov, see the day's trades, write its daily note and find it after a reload", async ({
  page,
}) => {
  await page.goto('/app/calendar');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^Thu 19 Nov/ }).click();
  await expect(page).toHaveURL(/day=2026-11-19/);

  // The day's panel: three trades exited on it.
  const panel = page.getByRole('complementary', { name: /Thu 19 Nov/ });
  await expect(panel).toContainText('Red day');
  const exits = panel.getByRole('table', {
    name: 'Trades that exited on Thu 19 Nov',
  });
  await expect(exits.locator('tbody tr')).toHaveCount(3);
  await expect(exits).toContainText('ES Dec 26');
  await expect(exits).toContainText('AUDUSD');

  // Its daily note: typed in, saved by itself.
  await panel.getByRole('link', { name: 'Open daily note' }).click();
  await expect(page).toHaveURL(/\/app\/notebook\/daily\/2026-11-19/);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  const text = 'Slow day, kept to the plan after the first loss.';
  await page.keyboard.type(text);
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // After a reload the text is still there.
  await page.reload();
  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
});

test('with every stat ticked, a 1440 cell stacks every line without clipping and the row follows the tallest cell', async ({
  page,
}) => {
  await page.goto('/app/calendar?month=2026-11');
  await expect(page.getByTestId('calendar-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Stats shown' }).click();
  const list = page.getByRole('list', { name: 'Stats shown' });
  for (const name of [
    'Trades',
    'Win rate',
    'R',
    'Fees',
    'Ticks',
    'Pips',
    'Points',
  ]) {
    const box = list.getByRole('checkbox', { name, exact: true });
    if (!(await box.isChecked())) {
      await list.getByText(name, { exact: true }).click();
      await expect(box).toBeChecked();
    }
  }
  await expect(list.getByRole('checkbox', { name: 'Points' })).toBeChecked();
  await page.keyboard.press('Escape');

  const grid = page.getByRole('grid', { name: 'November 2026' });
  const cell = grid.getByRole('button', { name: /^Thu 19 Nov/ });
  await expect(cell).toContainText('fees');
  await expect(cell).toContainText('ticks');
  // No line is cut off, ellipsized or spilling out of its cell. (The grid's
  // rows are `display: contents`, so each cell is measured on its own; the
  // phone's compact figure is hidden at this width and is not measured.)
  await page.evaluate(() => document.fonts.ready);
  const cut = await grid.getByRole('button').evaluateAll((buttons) => {
    const problems: string[] = [];
    for (const b of buttons) {
      const cell = b.getBoundingClientRect();
      const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        let box = n.parentElement;
        while (box && getComputedStyle(box).display === 'inline')
          box = box.parentElement;
        if (
          !text ||
          !box ||
          box.closest('.sr-only, [data-testid="day-compact"]')
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const ink = range.getBoundingClientRect();
        if (ink.width === 0) continue;
        const where = `${b.getAttribute('aria-label')}: "${text}"`;
        if (/(…|\.\.\.)$/.test(text))
          problems.push(`${where} ends in an ellipsis`);
        if (box.scrollWidth > box.clientWidth + 0.5)
          problems.push(`${where} is wider than its line`);
        if (
          ink.left < cell.left - 0.5 ||
          ink.right > cell.right + 0.5 ||
          ink.top < cell.top - 0.5 ||
          ink.bottom > cell.bottom + 0.5
        )
          problems.push(`${where} spills past its cell`);
      }
    }
    return problems;
  });
  expect(cut).toEqual([]);
  // Nothing hides under the cell's own clip: the cell is as tall as its content.
  const clipped = await grid
    .getByRole('button')
    .evaluateAll(
      (buttons) =>
        buttons.filter((b) => b.scrollHeight > b.clientHeight + 1).length,
    );
  expect(clipped).toBe(0);
  // The row follows its tallest cell: every cell of a week is as tall.
  const heights = await grid
    .getByTestId('week-row')
    .nth(2)
    .getByRole('button')
    .evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)),
    );
  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBeGreaterThan(92);
});
