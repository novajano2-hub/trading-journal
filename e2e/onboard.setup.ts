import { expect, test as setup } from '@playwright/test';

const FILE = 'e2e/.state/onboarded.json';

/**
 * Every other spec runs as a returning user: the first run's gate would send a
 * new browser to the welcome. This opens the app once (which seeds the sample),
 * marks the preferences onboarded, as the upgrade does for existing users, and
 * saves the browser's storage for the other projects to start from.
 */
setup(
  'a browser that has finished the first run',
  async ({ page, context }) => {
    await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
    await page.goto('/app/welcome');
    // The welcome shows once the database is open and the sample is seeded.
    await expect(
      page.getByRole('heading', { name: 'Welcome to Keel' }),
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          page.evaluate(async () =>
            (await indexedDB.databases()).some((d) => d.name === 'keel-data'),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('keel-data');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const store = db
              .transaction('meta', 'readwrite')
              .objectStore('meta');
            const get = store.get('prefs');
            get.onsuccess = () => {
              const value = {
                ...(get.result?.value ?? {}),
                onboarding: {
                  status: 'done',
                  at: '2026-11-20T15:00:00.000Z',
                  existing: true,
                },
              };
              store.put({ key: 'prefs', value });
              store.transaction.oncomplete = () => {
                db.close();
                resolve();
              };
              store.transaction.onerror = () => reject(store.transaction.error);
            };
          };
        }),
    );
    await context.storageState({ path: FILE, indexedDB: true });
  },
);
