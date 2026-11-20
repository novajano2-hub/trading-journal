import { expect, test } from '@playwright/test';

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
