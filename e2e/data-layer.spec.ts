import { expect, test } from '@playwright/test';

async function countTrades(): Promise<number> {
  if (!(await indexedDB.databases()).some((d) => d.name === 'keel-data'))
    return 0;
  return new Promise((resolve) => {
    const req = indexedDB.open('keel-data');
    req.onerror = () => resolve(0);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trades')) {
        db.close();
        resolve(0);
        return;
      }
      const c = db.transaction('trades').objectStore('trades').count();
      c.onsuccess = () => {
        db.close();
        resolve(c.result);
      };
    };
  });
}

test('the sample workspace seeds on the first app visit, once', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.goto('/app/import');
  await expect
    .poll(() => page.evaluate(countTrades), { timeout: 15000 })
    .toBeGreaterThan(1100);
  const first = await page.evaluate(countTrades);
  await page.reload();
  await expect.poll(() => page.evaluate(countTrades)).toBe(first);
});
