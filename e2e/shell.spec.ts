import { expect, test, type Locator, type Page } from '@playwright/test';

// The collapsible sidebar (#50, C47 to C49): the rail on every desktop page,
// remembered across loads; Home with no rail at all; day pages and phones
// unchanged. The prefs load a moment after the shell paints (the first frame
// is the full sidebar), so every check after a load waits for what it expects.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const collapseButton = (page: Page) =>
  page.getByRole('button', { name: 'Collapse the sidebar' });
const expandButton = (page: Page) =>
  page.getByRole('button', { name: 'Expand the sidebar' });
/** The desktop column, as a landmark: the pages have links of their own to the same places. */
const sidebar = (page: Page) =>
  page.getByRole('complementary', { name: 'Sidebar' });
const addTrade = (page: Page) =>
  sidebar(page).getByRole('link', { name: 'Add trade' });
const notLive = (page: Page) =>
  sidebar(page).getByRole('list', { name: 'Not live yet' });

/** The choice as the database holds it: the write lands a moment after the click. */
const saved = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('keel-data');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result
            .transaction('meta', 'readonly')
            .objectStore('meta')
            .get('prefs');
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result?.value?.sidebar);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );

/** Writes the choice into the database, as an earlier visit would have left it. */
const save = (page: Page, sidebar: 'expanded' | 'collapsed') =>
  page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keel-data');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const store = db.transaction('meta', 'readwrite').objectStore('meta');
          const get = store.get('prefs');
          get.onsuccess = () => {
            store.put({
              key: 'prefs',
              value: { ...(get.result?.value ?? {}), sidebar: value },
            });
            store.transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            store.transaction.onerror = () => reject(store.transaction.error);
          };
        };
      }),
    sidebar,
  );

/** Past the loading skeletons: the layout that matters is the data's. */
async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, {
    timeout: 30_000,
  });
}

const contentWidth = (page: Page) =>
  page
    .locator('main#content')
    .evaluate((el) => el.getBoundingClientRect().width);

test('collapse, reload: still collapsed; expand, reload: expanded again (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/trades');
  await settled(page);
  await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(notLive(page)).toBeVisible();
  await expect(addTrade(page)).toHaveCount(0);
  const expanded = await contentWidth(page);

  await collapseButton(page).click();
  await expect(expandButton(page)).toHaveAttribute('aria-expanded', 'false');
  // The rail: add trade first, then the modules as icons with names; the page widens.
  await expect(addTrade(page)).toHaveAttribute('href', '/app/trades/new');
  await expect(sidebar(page).getByText('Not live yet')).toHaveCount(0);
  await expect.poll(() => contentWidth(page)).toBeGreaterThan(expanded + 140);
  await expect.poll(() => saved(page)).toBe('collapsed');

  await page.reload();
  await settled(page);
  await expect(expandButton(page)).toBeVisible();
  await expect(addTrade(page)).toBeVisible();
  // The choice holds on another page, too.
  await page.goto('/app/calendar');
  await settled(page);
  await expect(expandButton(page)).toBeVisible();
  await expect(addTrade(page)).toBeVisible();

  // By keyboard the new toggle takes focus, so Tab carries on from the same place.
  await expandButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(collapseButton(page)).toBeFocused();
  await expect.poll(() => saved(page)).toBe('expanded');
  await page.reload();
  await settled(page);
  await expect(collapseButton(page)).toBeVisible();
  await expect(notLive(page)).toBeVisible();
  await expect(addTrade(page)).toHaveCount(0);
});

test('the rail by keyboard: every item in order, each named by a tooltip (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/trades');
  await settled(page);
  await collapseButton(page).click();
  await expect.poll(() => saved(page)).toBe('collapsed');
  await page.reload();
  await settled(page);
  await expect(expandButton(page)).toBeVisible();

  const order = [
    'Expand the sidebar',
    'Add trade',
    /^Workspace: /,
    'Home',
    'Dashboard',
    'Trades',
    'Calendar',
    'Reports',
    'Progress tracker',
    'Strategies',
    'Notebook',
    'Import',
    'Prop firms',
    'Backtesting',
    'Replay',
    'Mentors',
    'Assistant',
    'Settings',
  ];
  await sidebar(page).getByRole('link', { name: 'Keel' }).focus();
  for (const name of order) {
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAccessibleName(name);
    // A tooltip says the same, beside the glyph (the workspace has its own title).
    if (typeof name === 'string')
      await expect(page.getByRole('tooltip')).toHaveText(name);
  }
  // Past the last, focus goes on into the page rather than looping or sticking.
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).not.toHaveAccessibleName('Settings');
  await expect(sidebar(page).locator(':focus')).toHaveCount(0);

  // The tip sits beside its glyph, at its height. (The tooltip role is a hidden
  // copy for readers; the drawn card is Radix's popper wrapper, placed a frame late.)
  const reports = sidebar(page).getByRole('link', { name: 'Reports' });
  await reports.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Reports');
  const glyph = (await reports.boundingBox())!;
  await expect
    .poll(async () => {
      const at = await page
        .locator('[data-radix-popper-content-wrapper]')
        .boundingBox();
      if (!at) return false;
      return (
        at.x >= glyph.x + glyph.width &&
        Math.abs(at.y + at.height / 2 - (glyph.y + glyph.height / 2)) < 14
      );
    })
    .toBe(true);
});

test('Home collapses its sidebar and centres its content (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/home');
  await settled(page);
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible();
  await expect(page.locator('[data-centred="false"]')).toBeVisible();
  await collapseButton(page).focus();
  await page.keyboard.press('Enter');
  // No rail at all; the top bar has the way back, and focus is on it; the cards sit in a centred column.
  const back = page
    .getByRole('banner')
    .first()
    .getByRole('button', { name: 'Expand the sidebar' });
  await expect(back).toBeFocused();
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'App' })).toHaveCount(0);
  const column = page.locator('[data-centred="true"]');
  await expect(column).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await column.boundingBox())!;
      const left = box.x;
      const right = page.viewportSize()!.width - (box.x + box.width);
      return Math.abs(left - right) <= 1 && left >= 100;
    })
    .toBe(true);
  await expect.poll(() => saved(page)).toBe('collapsed');

  await page.reload();
  await settled(page);
  await expect(back).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.locator('[data-centred="true"]')).toBeVisible();

  // Another page shows the rail; back on Home, the bar's button expands.
  await page.goto('/app/trades');
  await settled(page);
  await expect(addTrade(page)).toBeVisible();
  await page.goto('/app/home');
  await settled(page);
  await back.click();
  await expect(collapseButton(page)).toBeVisible();
  await expect(sidebar(page)).toBeVisible();
  await expect(page.locator('[data-centred="false"]')).toBeVisible();
});

test('a day page keeps the slim rail whatever the choice, with no toggle (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const day = '/app/day/2026-11-20/plan';
  const railLeft = async () => {
    await expect(addTrade(page)).toBeVisible();
    // Past the prefs landing: the page is the same rail either way.
    await page.waitForTimeout(400);
    await expect(
      sidebar(page).getByRole('button', { name: /the sidebar$/ }),
    ).toHaveCount(0);
    await expect(sidebar(page).getByText('Not live yet')).toHaveCount(0);
    return (await addTrade(page).boundingBox())!.x;
  };
  await page.goto(day);
  const expanded = await railLeft();
  await page.goto('/app/trades');
  await settled(page);
  await collapseButton(page).click();
  await expect.poll(() => saved(page)).toBe('collapsed');
  await page.goto(day);
  expect(await railLeft()).toBe(expanded);
});

test('no horizontal overflow from 1024 to 1680, expanded and collapsed (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  const routes = [
    '/app/home',
    '/app/dashboard',
    '/app/trades',
    '/app/calendar',
  ];
  const widths = [1024, 1100, 1280, 1440, 1680];
  for (const state of ['expanded', 'collapsed'] as const) {
    if (state === 'collapsed') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/app/trades');
      await settled(page);
      await collapseButton(page).click();
      await expect.poll(() => saved(page)).toBe('collapsed');
    }
    for (const route of routes) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await settled(page);
      if (route === '/app/dashboard')
        await expect(page.getByTestId('dashboard-ready')).toBeVisible({
          timeout: 20_000,
        });
      await expect(
        state === 'collapsed' ? expandButton(page) : collapseButton(page),
      ).toBeVisible();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        await expect
          .poll(
            () =>
              page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
              ),
            { message: `${route} ${state} at ${width}` },
          )
          .toBeLessThanOrEqual(0);
      }
    }
  }
});

test('a phone has the tab bar and More, and no sidebar toggle, whatever the saved choice (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  for (const choice of ['expanded', 'collapsed'] as const) {
    await page.goto('/app/trades');
    await settled(page);
    await save(page, choice);
    for (const route of ['/app/trades', '/app/home']) {
      await page.goto(route);
      await settled(page);
      await expect.poll(() => saved(page)).toBe(choice);
      // Past the prefs landing.
      await page.waitForTimeout(300);
      await expect(
        page.getByRole('navigation', { name: 'Main' }),
      ).toBeVisible();
      await expect(collapseButton(page)).toBeHidden();
      await expect(expandButton(page)).toBeHidden();
      await expect(sidebar(page)).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} ${choice}`,
      ).toBe(true);
    }
  }
});

// ---- The Settings menu: in groups, and collapsed with the sidebar (C48) -----

const settingsNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Settings' });
/** The box of what is drawn, once it is: a link remounts as the viewport crosses lg. */
async function boxOf(el: Locator) {
  let box: Awaited<ReturnType<Locator['boundingBox']>> = null;
  await expect.poll(async () => (box = await el.boundingBox())).not.toBeNull();
  return box!;
}
const navLink = (page: Page, name: string) =>
  settingsNav(page).getByRole('link', { name });
/** A link's name as drawn: the box of the span that holds its words. */
const nameBox = (page: Page, name: string) =>
  boxOf(navLink(page, name).locator('span'));
const divider = (page: Page) =>
  settingsNav(page).locator('li[aria-hidden="true"]');

test('Settings folds to an icon column with the sidebar and stays folded across a reload (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/settings/profile');
  await settled(page);
  const nav = settingsNav(page);
  const section = page.getByRole('region', { name: 'Profile' });

  // Expanded: the 180px card, names beside the glyphs, a divider after Profile.
  await expect(collapseButton(page)).toBeVisible();
  expect((await boxOf(nav)).width).toBeCloseTo(180, 0);
  expect((await nameBox(page, 'Accounts')).width).toBeGreaterThan(30);
  await expect(divider(page)).toHaveCount(1);
  const rule = await boxOf(divider(page));
  expect(rule.height).toBeLessThanOrEqual(1);
  expect(rule.width).toBeGreaterThan(100);
  const before = (await boxOf(section)).width;

  // Collapsed with the sidebar: 60px, glyphs alone, the divider kept, the page wider.
  await collapseButton(page).click();
  await expect(expandButton(page)).toBeVisible();
  await expect.poll(async () => (await boxOf(nav)).width).toBe(60);
  for (const name of ['Profile', 'Accounts', 'Trading', 'Tags', 'Logs']) {
    expect((await nameBox(page, name)).width, name).toBeLessThanOrEqual(1);
    const link = await boxOf(navLink(page, name));
    expect(link.width, name).toBeCloseTo(42, 0);
    expect(link.height, name).toBeGreaterThanOrEqual(36);
  }
  await expect(divider(page)).toHaveCount(1);
  expect((await boxOf(divider(page))).width).toBeGreaterThan(20);
  await expect
    .poll(async () => (await boxOf(section)).width)
    .toBeGreaterThan(before + 100);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect.poll(() => saved(page)).toBe('collapsed');

  // By keyboard each icon is named by a tooltip, and still by its link name.
  await navLink(page, 'Profile').focus();
  for (const name of ['Accounts', 'Trading', 'Tags', 'Logs']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAccessibleName(name);
    await expect(page.getByRole('tooltip')).toHaveText(name);
  }
  await expect(navLink(page, 'Profile')).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Reload: still folded, and on another section.
  await page.reload();
  await settled(page);
  await expect.poll(async () => (await boxOf(nav)).width).toBe(60);
  await navLink(page, 'Tags').click();
  await expect(page).toHaveURL(/\/app\/settings\/tags$/);
  await expect.poll(async () => (await boxOf(nav)).width).toBe(60);

  // Expanding the sidebar brings the words back.
  await expandButton(page).click();
  await expect.poll(async () => (await boxOf(nav)).width).toBe(180);
  expect((await nameBox(page, 'Tags')).width).toBeGreaterThan(20);
  await expect.poll(() => saved(page)).toBe('expanded');
});

test('below lg Settings keeps its labelled row, whatever the sidebar choice (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/settings/profile');
  await settled(page);
  await collapseButton(page).click();
  await expect.poll(() => saved(page)).toBe('collapsed');
  for (const width of [640, 768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    // A row: the pills side by side with their words, a divider upright between.
    await expect
      .poll(
        async () => {
          const profile = await boxOf(navLink(page, 'Profile'));
          const accounts = await boxOf(navLink(page, 'Accounts'));
          return (
            Math.abs(accounts.y - profile.y) < 2 &&
            accounts.x > profile.x + profile.width
          );
        },
        { message: `${width}` },
      )
      .toBe(true);
    expect((await nameBox(page, 'Accounts')).width, `${width}`).toBeGreaterThan(
      30,
    );
    const rule = await boxOf(divider(page));
    expect(rule.width, `${width}`).toBeLessThanOrEqual(1);
    expect(rule.height, `${width}`).toBeGreaterThan(15);
    // No tooltip where the words show.
    await navLink(page, 'Accounts').focus();
    await page.waitForTimeout(350);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}`,
    ).toBe(true);
  }
});

test('on a phone the Settings pills keep their words, whatever the saved choice (mobile)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/settings/profile');
  await settled(page);
  await save(page, 'collapsed');
  await page.goto('/app/settings/accounts');
  await settled(page);
  await expect.poll(() => saved(page)).toBe('collapsed');
  await page.waitForTimeout(300);
  expect((await nameBox(page, 'Accounts')).width).toBeGreaterThan(30);
  expect((await boxOf(settingsNav(page))).height).toBeLessThan(80);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

// ---- Focus is never under what is pinned (E52, WCAG 2.4.11) ------------------

const BUSY =
  '?from=2026-10-05&to=2026-11-20&symbol=AUDUSD&symbol=BTCUSD&side=short&strategy=sample-strategy-1&tag=sample-tag-4';

/**
 * The lowest edge of what is pinned at the top: the bar, and the trade views' switch row under it.
 * (The sidebar is pinned too, but down the side, not across the top: it covers no content.)
 */
const pinnedBottom = (page: Page) =>
  page.evaluate(() =>
    Math.max(
      ...[
        ...document.querySelectorAll(
          '[data-pinned]:not([aria-label="Sidebar"])',
        ),
      ].map((el) => el.getBoundingClientRect().bottom),
    ),
  );

for (const route of ['/app/trades', '/app/trades/day']) {
  test(`shift-tabbing up ${route} from its middle never leaves a control under the top bar`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(route);
    await settled(page);
    // The log has filled in: a page long enough to scroll through.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBeGreaterThan(1800);
    // The middle of a long page: past the end first, then focus the last control in the page.
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.evaluate(() => {
      const all = [
        ...document.querySelectorAll<HTMLElement>(
          'main a[href], main button, main input, main [tabindex="0"]',
        ),
      ].filter(
        (el) =>
          el.getBoundingClientRect().width > 0 &&
          !el.closest('[data-pinned]') &&
          !(el as HTMLButtonElement).disabled,
      );
      all.at(-1)!.focus();
    });
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
    let checked = 0;
    let closest = Infinity;
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press('Shift+Tab');
      const at = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (
          !el ||
          el === document.body ||
          el.closest(
            '[data-pinned], [aria-label="Sidebar"], nav[aria-label="Main"]',
          )
        )
          return null;
        return el.getBoundingClientRect().top;
      });
      if (at === null) continue;
      checked += 1;
      const floor = await pinnedBottom(page);
      closest = Math.min(closest, at - floor);
      expect(
        at,
        `stop ${i + 1}: top ${at}, pinned down to ${floor}`,
      ).toBeGreaterThanOrEqual(floor - 0.5);
    }
    // The walk really crossed the page, up to the bar's edge.
    expect(checked).toBeGreaterThan(20);
    expect(closest).toBeLessThan(200);
  });
}

test('a control in the bar takes focus without moving the page, chips scroller included', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto(`/app/dashboard${BUSY}`);
  await settled(page);
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 20_000,
  });
  await page.evaluate(() => scrollTo(0, 500));
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(100);
  const bar = page.getByRole('banner');
  const stops = mobile
    ? [
        bar.getByRole('button', { name: /^Filters/ }),
        bar.getByRole('combobox', { name: 'Search' }),
        bar.getByRole('button', { name: /show as / }),
      ]
    : [
        bar
          .getByRole('group', { name: 'Filters' })
          .getByRole('button', { name: 'Short', exact: true }),
        bar
          .getByRole('group', { name: 'Filters' })
          .getByRole('button', { name: 'Clear filters' }),
        bar.getByRole('combobox', { name: 'Search' }),
        bar.getByRole('link', { name: 'Import' }),
      ];
  for (const stop of stops) {
    await stop.focus();
    await expect(stop).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(y);
  }
});

// The sidebar and the rail are `sticky top-0` in the page's own scroller, so
// their head controls sit in the band the scroll padding keeps clear for the
// bar. Focus there with the page scrolled must not move the page (it would
// try to uncover what it never can); it is why they are pinned rows too.

/** The Trades log, long enough to scroll, scrolled; returns where it stopped. */
async function scrolledTrades(page: Page) {
  await page.goto('/app/trades');
  await settled(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(1800);
  await page.evaluate(() => scrollTo(0, 500));
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(100);
  return y;
}

const pageY = (page: Page) => page.evaluate(() => scrollY);

test('the sidebar takes focus without moving the page: wordmark, toggle and Add trade, expanded and collapsed (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const y = await scrolledTrades(page);
  const barBottom = (await page.getByRole('banner').first().boundingBox())!;
  const band = barBottom.y + barBottom.height;

  const stops = async (names: Locator[]) => {
    for (const stop of names) {
      // Each one sits inside the band the page's scroll padding holds for the bar
      // (Add trade, lower down, is the control).
      await stop.focus();
      await expect(stop).toBeFocused();
      expect(await pageY(page), await stop.innerText()).toBe(y);
    }
  };
  const wordmark = sidebar(page).getByRole('link', { name: 'Keel' });
  expect((await wordmark.boundingBox())!.y).toBeLessThan(band);
  expect((await collapseButton(page).boundingBox())!.y).toBeLessThan(band);
  await stops([wordmark, collapseButton(page)]);

  // A mouse collapse leaves focus where it is; the rail's head is then the same band.
  await collapseButton(page).click();
  await expect(expandButton(page)).toBeVisible();
  expect(await pageY(page)).toBe(y);
  expect((await expandButton(page).boundingBox())!.y).toBeLessThan(band);
  await stops([wordmark, expandButton(page), addTrade(page)]);
});

test('a keyboard collapse and expand with the page scrolled keep the page where it was (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const y = await scrolledTrades(page);
  await collapseButton(page).focus();
  await expect(collapseButton(page)).toBeFocused();
  expect(await pageY(page)).toBe(y);
  // The toggle that replaces the pressed one takes focus, up at the rail's head.
  await page.keyboard.press('Enter');
  await expect(expandButton(page)).toBeFocused();
  expect(await pageY(page)).toBe(y);
  await page.keyboard.press('Enter');
  await expect(collapseButton(page)).toBeFocused();
  expect(await pageY(page)).toBe(y);
});

// ---- The padding belongs to the shell (E-03) --------------------------------
// (The welcome, which has no bar and so none, is checked in onboarding.spec.ts.)

test('the app pages keep clear of the bar, and a phone of its tab bar too', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/trades');
  await settled(page);
  const css = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { top: style.scrollPaddingTop, bottom: style.scrollPaddingBottom };
  });
  expect(parseFloat(css.top)).toBeGreaterThanOrEqual(mobile ? 56 : 68);
  if (mobile) expect(parseFloat(css.bottom)).toBeGreaterThanOrEqual(56);
});
