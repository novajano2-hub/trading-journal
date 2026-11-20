import { expect, test } from '@playwright/test';
import { cutOffText, inPlainView, stampCollisions } from './figures';

test('sample week and prop numbers come from the engine', async ({ page }) => {
  await page.goto('/');
  const week = page.getByRole('region', { name: /sample week/i });
  for (const s of ['+$1,236.00', '50.0%', '3.17', '+$154.50', '$280.00'])
    await expect(week).toContainText(s);
  const prop = page.getByRole('region', { name: /prop rules/i });
  for (const s of ['$49,236.00', '$2,000.00', '54%', 'Not met'])
    await expect(prop).toContainText(s);
  await expect(page.getByText('In development')).toHaveCount(4);
});

test('the equity curve has a name and the five day nets as its text', async ({
  page,
}) => {
  await page.goto('/');
  const week = page.getByRole('region', { name: /sample week/i });
  const curve = week.getByRole('img', { name: /equity/i });
  await expect(curve).toBeVisible();
  await expect(curve).toHaveAccessibleDescription(
    /\+\$195\.00.*\+\$281\.00.*\+\$670\.00.*−\$280\.00.*\+\$370\.00/,
  );
});

test('the loop follows sample ticket No. 000006 to the next trade', async ({
  page,
}) => {
  await page.goto('/');
  const loop = page.getByRole('region', { name: /all the way round/i });
  for (const s of ['No. 000006', '−$275.00', 'RULE BROKEN', 'No. 000007'])
    await expect(loop).toContainText(s);
});

test('hero and loop tickets print every figure in full', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('ticket-sample')).toHaveCount(4);
  expect(await cutOffText(page.getByTestId('ticket-sample'))).toEqual([]);
  const loop = page.getByRole('region', { name: /all the way round/i });
  expect(await cutOffText(loop.getByRole('listitem'))).toEqual([]);
});

test('hero stamps sit clear of figures, and RULE BROKEN shows in the stack', async ({
  page,
}) => {
  await page.goto('/');
  const tickets = page.getByTestId('ticket-sample');
  expect(await stampCollisions(tickets)).toEqual([]);
  const broken = page
    .getByTestId('ticket-stack')
    .locator('.rubber-stamp', { hasText: 'RULE BROKEN' });
  expect(await inPlainView(broken)).toBe(true);
});

test('each rack mark fills a real band, down to its card foot', async ({
  page,
}) => {
  await page.goto('/');
  const rack = page.getByRole('region', { name: /every tool/i });
  const marks = rack.locator('li svg:not(.lucide)');
  await expect(marks).toHaveCount(9);
  const bands = await marks.evaluateAll((svgs) =>
    svgs.map((svg) => {
      const card = svg.closest('.rack-card')!;
      const box = card.getBoundingClientRect();
      const foot =
        box.bottom - parseFloat(getComputedStyle(card).paddingBottom);
      const band = svg.parentElement!.getBoundingClientRect();
      const ink = [
        ...svg.querySelectorAll('path, rect, circle, polyline, text'),
      ]
        .map((el) => el.getBoundingClientRect())
        .map(({ left, right, top, bottom }) => ({ left, right, top, bottom }))
        .reduce((u, r) => ({
          left: Math.min(u.left, r.left),
          right: Math.max(u.right, r.right),
          top: Math.min(u.top, r.top),
          bottom: Math.max(u.bottom, r.bottom),
        }));
      return {
        height: band.height,
        toFoot: Math.abs(foot - band.bottom),
        fill: Math.max(
          (ink.right - ink.left) / band.width,
          (ink.bottom - ink.top) / band.height,
        ),
      };
    }),
  );
  for (const b of bands) {
    // A band of real height that runs down to the lip, not an icon strip…
    expect(b.height).toBeGreaterThanOrEqual(60);
    expect(b.toFoot).toBeLessThan(1);
    // …and a drawing scaled to it in at least one direction.
    expect(b.fill).toBeGreaterThan(0.75);
  }
});

test('the rack lifts on hover only when motion is welcome', async ({
  page,
}) => {
  await page.goto('/');
  const rack = page.getByRole('region', { name: /every tool/i });
  const card = rack.locator('a[href="/features/journal"]');
  await card.hover();
  await expect(card).toHaveCSS('translate', '0px -10px');

  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.hover();
  await expect(card).toHaveCSS('translate', 'none');
  // Keyboard focus (focus-visible) holds still too.
  await card.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(card).toBeFocused();
  await expect(card).toHaveCSS('translate', 'none');
});

test('the rack links live modules and leaves the assistant unlinked', async ({
  page,
}) => {
  await page.goto('/');
  const rack = page.getByRole('region', { name: /every tool/i });
  for (const slug of [
    'journal',
    'analytics',
    'strategies',
    'notebook',
    'prop-firms',
  ])
    await expect(rack.locator(`a[href="/features/${slug}"]`)).toHaveCount(1);
  await expect(rack.getByRole('link', { name: /AI assistant/ })).toHaveCount(0);
  await expect(rack).toContainText('AI assistant');
});

test('the closing call to action goes back to the drop', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Build my journal' });
  await expect(cta).toHaveAttribute('href', '#drop');
  await cta.click();
  await expect(page.locator('#drop')).toBeInViewport();
});
