import { expect, test, type Locator, type Page } from '@playwright/test';

// The template menu and edit mode (spec 5.1; C2, C3, C6, C8). A wide screen edits
// on the page; a phone edits in a full-height sheet of two lists. Each test starts
// from the first run's browser state, so the default template ("Main") is all there is.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const DEFAULT_UPPER = [
  'net-pnl',
  'trade-win',
  'profit-factor',
  'day-win',
  'win-loss-ratio',
];
const DEFAULT_LOWER = [
  'score',
  'progress',
  'cum-pnl',
  'daily-pnl',
  'recent',
  'balance',
  'calendar-adv',
  'drawdown',
  'trade-time',
  'trade-duration',
];

async function ready(page: Page) {
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 30_000,
  });
}

/** The widgets on the page, in order, by `data-widget`. */
const widgets = (page: Page) =>
  page
    .locator('[data-widget]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.widget));

const templateButton = (page: Page, name?: string) =>
  page.getByRole('button', {
    name:
      name === undefined
        ? /^Dashboard template:/
        : `Dashboard template: ${name}`,
  });

async function openMenu(page: Page): Promise<Locator> {
  await templateButton(page).click();
  const menu = page.getByRole('dialog', { name: 'Dashboard templates' });
  await expect(menu).toBeVisible();
  return menu;
}

/** Where edit mode lives: the sheet on a phone, the page elsewhere. */
function editArea(page: Page, mobile: boolean): Locator {
  return mobile
    ? page.getByRole('dialog', { name: 'Edit template' })
    : page.getByTestId('dashboard-edit');
}

async function startEdit(page: Page, name: string, mobile: boolean) {
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: `Edit ${name}` }).click();
  await expect(editArea(page, mobile)).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Template name' }),
  ).toHaveValue(name);
}

async function save(page: Page, mobile: boolean) {
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(editArea(page, mobile)).toBeHidden();
  await ready(page);
}

/** Adds the lower widgets named, one after the other, from the picker. */
async function addLower(page: Page, titles: string[]) {
  await page
    .getByRole('button', { name: /Add a widget\s*Lower section/ })
    .click();
  const picker = page.getByRole('dialog', { name: 'Add a widget' });
  await expect(picker).toBeVisible();
  for (const title of titles)
    await picker.getByRole('button', { name: `Add ${title}` }).click();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
}

test('edit a template: rename, remove, move and add, save, reload and find the layout', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);
  expect(await widgets(page)).toEqual([...DEFAULT_UPPER, ...DEFAULT_LOWER]);

  await startEdit(page, 'Main', mobile);
  // A wide screen's bar says how to move; there is no reset anywhere.
  if (!mobile)
    await expect(
      page.getByText('Drag a widget, or use its arrows, to move it.'),
    ).toBeVisible();
  await expect(page.getByRole('button', { name: /reset/i })).toHaveCount(0);
  // The only template: no Delete.
  await expect(
    page.getByRole('button', { name: 'Delete template' }),
  ).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Template name' }).fill('Morning');
  await page.getByRole('button', { name: 'Remove Net P&L' }).click();
  await page.getByRole('button', { name: 'Move Edge score later' }).click();
  await addLower(page, ['Calendar']);
  await save(page, mobile);

  const upper = DEFAULT_UPPER.slice(1);
  const lower = ['progress', 'score', ...DEFAULT_LOWER.slice(2), 'calendar'];
  expect(await widgets(page)).toEqual([...upper, ...lower]);
  await expect(templateButton(page, 'Morning')).toBeVisible();

  await page.reload();
  await ready(page);
  expect(await widgets(page)).toEqual([...upper, ...lower]);
  await expect(templateButton(page, 'Morning')).toBeVisible();
  // The strip kept its four figures.
  await expect(page.getByRole('group', { name: 'Figures' })).toBeVisible();
});

test('the picker lists only what is not on the template; the upper strip stops at five', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);
  await startEdit(page, 'Main', mobile);

  // Full upper strip: no add place. The lower section ends with one.
  await expect(
    page.getByRole('button', { name: /Add a widget\s*Upper section/ }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: /Add a widget\s*Lower section/ })
    .click();
  const picker = page.getByRole('dialog', { name: 'Add a widget' });
  await expect(picker.getByRole('listitem')).toHaveCount(7);
  for (const placed of ['Edge score', 'Net daily P&L', 'Drawdown'])
    await expect(picker.getByText(placed, { exact: true })).toHaveCount(0);
  await expect(
    picker.getByText('Win rate, average win and average loss'),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // Take one figure off: an add place appears; filling it greys the picker and takes the place away.
  await page.getByRole('button', { name: 'Remove Profit factor' }).click();
  await page
    .getByRole('button', { name: /Add a widget\s*Upper section/ })
    .click();
  await expect(picker.getByRole('listitem')).toHaveCount(8);
  await expect(
    picker.getByText('Profit factor', { exact: true }),
  ).toBeVisible();
  await picker.getByRole('button', { name: 'Add Streaks' }).click();
  await expect(picker.getByText('The upper section is full.')).toBeVisible();
  for (const add of await picker.getByRole('button', { name: /^Add / }).all())
    await expect(add).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole('button', { name: /Add a widget\s*Upper section/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await ready(page);
});

test('New template copies the one in use; saving it, then switching templates, changes what the page shows', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);

  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'New template' }).click();
  const name = menu.getByRole('textbox', { name: 'Name the new template' });
  await expect(name).toHaveValue('Main copy');
  await name.fill('Review');
  await menu.getByRole('button', { name: 'Create' }).click();
  // The copy opens for arranging, and is already the one in use.
  await expect(editArea(page, mobile)).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Template name' }),
  ).toHaveValue('Review');
  // Two templates now: this one can go.
  await expect(
    page.getByRole('button', { name: 'Delete template' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove Drawdown' }).click();
  await page
    .getByRole('button', { name: 'Remove Trade time performance' })
    .click();
  await save(page, mobile);

  const review = [
    ...DEFAULT_UPPER,
    ...DEFAULT_LOWER.filter((k) => k !== 'drawdown' && k !== 'trade-time'),
  ];
  expect(await widgets(page)).toEqual(review);
  await expect(templateButton(page, 'Review')).toBeVisible();

  // Switching is immediate, and lasts across a reload.
  let list = await openMenu(page);
  await expect(list.getByRole('listitem')).toHaveText(['Main', 'ReviewIn use']);
  await list.getByRole('button', { name: /^Main/ }).click();
  await expect(templateButton(page, 'Main')).toBeVisible();
  await expect
    .poll(() => widgets(page))
    .toEqual([...DEFAULT_UPPER, ...DEFAULT_LOWER]);
  await page.reload();
  await ready(page);
  expect(await widgets(page)).toEqual([...DEFAULT_UPPER, ...DEFAULT_LOWER]);
  list = await openMenu(page);
  await list.getByRole('button', { name: /^Review/ }).click();
  await expect.poll(() => widgets(page)).toEqual(review);
});

test('Cancel drops the draft; Delete template asks, then the one that is left takes over', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);

  await startEdit(page, 'Main', mobile);
  await page.getByRole('button', { name: 'Remove Net P&L' }).click();
  await page.getByRole('textbox', { name: 'Template name' }).fill('Scratch');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(editArea(page, mobile)).toBeHidden();
  await ready(page);
  expect(await widgets(page)).toEqual([...DEFAULT_UPPER, ...DEFAULT_LOWER]);
  await expect(templateButton(page, 'Main')).toBeVisible();

  // A second template, then delete it.
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'New template' }).click();
  await menu.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Template name' }),
  ).toHaveValue('Main copy');
  await page.getByRole('button', { name: 'Delete template' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete this template?' });
  await expect(ask).toContainText('Main copy');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(editArea(page, mobile)).toBeVisible();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this template?' })
    .getByRole('button', { name: 'Delete template' })
    .click();
  await expect(editArea(page, mobile)).toBeHidden();
  await ready(page);
  await expect(templateButton(page, 'Main')).toBeVisible();
  const left = await openMenu(page);
  await expect(left.getByRole('listitem')).toHaveText(['MainIn use']);
});

test('leaving with unsaved changes asks first (a wide screen)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard');
  await ready(page);
  await startEdit(page, 'Main', false);
  const trades = page
    .getByRole('navigation', { name: 'App' })
    .getByRole('link', { name: 'Trades' });
  // With a change in the draft, a link that leaves the page is held back.
  await page.getByRole('button', { name: 'Remove Net P&L' }).click();
  await trades.click();
  const ask = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByTestId('dashboard-edit')).toBeVisible();
  await trades.click();
  await ask.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/app\/trades/);
  // The draft went with the page.
  await page
    .getByRole('navigation', { name: 'App' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await ready(page);
  expect(await widgets(page)).toEqual([...DEFAULT_UPPER, ...DEFAULT_LOWER]);
});

test('dragging a widget by its grip moves it (a wide screen)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard');
  await ready(page);
  await startEdit(page, 'Main', false);
  const grip = page
    .getByRole('region', { name: 'Edge score' })
    .locator('[data-edit-grip]');
  const target = page.getByRole('region', { name: 'Net daily P&L' });
  const from = (await grip.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await expect(target).toHaveAttribute('data-drop', 'true');
  await page.mouse.up();
  await expect(target).not.toHaveAttribute('data-drop', 'true');
  await save(page, false);
  expect(await widgets(page)).toEqual([
    ...DEFAULT_UPPER,
    'progress',
    'cum-pnl',
    'daily-pnl',
    'score',
    ...DEFAULT_LOWER.slice(4),
  ]);
  await page.reload();
  await ready(page);
  expect((await widgets(page)).slice(5, 9)).toEqual([
    'progress',
    'cum-pnl',
    'daily-pnl',
    'score',
  ]);
});

test('edit mode has no horizontal overflow, on a wide screen or a phone', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/app/dashboard');
  await ready(page);
  await startEdit(page, 'Main', mobile);
  for (const width of mobile ? [390] : [768, 1024, 1280, 1440, 1680]) {
    if (!mobile) await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `edit mode at ${width}`,
    ).toBeLessThanOrEqual(0);
  }
});
