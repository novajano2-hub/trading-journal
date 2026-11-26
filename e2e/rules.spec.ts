import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York' });

// No fixed clock here: with Playwright's frozen Date, the dialogs' exit animation never ends after a
// reload, and this journey closes dialogs and goes on. Nothing in it depends on today's date.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

interface StoredTrade {
  id: string;
  serial: number;
  instrument: { root: string };
  fees: number;
  targets?: { unit: string; levels: { value: number; qty: number }[] };
  stops?: { unit: string; levels: { value: number; qty: number }[] };
  executions: { qty: number; commission: number; fees: number }[];
}

/** Everything one store of the app's database holds, read straight from IndexedDB. */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('keel-data');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction(name).objectStore(name).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
        };
      }),
    store,
  ) as Promise<T[]>;
}

/** The trades of My workspace, by serial. */
const mine = (page: Page) =>
  readStore<StoredTrade & { workspaceId: string }>(page, 'trades').then((all) =>
    all
      .filter((t) => t.workspaceId === 'mine')
      .sort((a, b) => a.serial - b.serial),
  );

async function intoMyWorkspace(page: Page) {
  await page.goto('/app/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Sample workspace/ }).click();
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click();
  await expect(
    page.getByRole('button', { name: /My workspace/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

/** Imports a fills file; the first time it makes the account in the mapping step. */
async function importFile(page: Page, file: string, firstTime: boolean) {
  await page.goto('/app/import');
  await page.getByLabel('Import file').setInputFiles(`e2e/fixtures/${file}`);
  await expect(page.getByText(file).first()).toBeVisible();
  await page.getByRole('button', { name: 'Map columns' }).click();
  if (firstTime) {
    const dialog = page.getByRole('dialog', { name: 'New account' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Account name').fill('Rules account');
    await dialog.getByLabel('Broker').fill('Rules broker');
    await dialog.getByLabel('Starting balance').fill('50000');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog).toBeHidden();
  } else {
    await page
      .getByLabel('Account', { exact: true })
      .selectOption({ label: 'Rules account' });
  }
  await expect(
    page.getByText('Required fields are all matched.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Preview \d+ rows/ }).click();
  await page
    .getByRole('button', { name: /^Import \d+ trades into Rules account/ })
    .click();
  await expect(
    page.getByText(/^\d+ trades imported into Rules account\./),
  ).toBeVisible();
}

const targetsCard = (page: Page) =>
  page.getByRole('region', { name: 'Targets and stops' });
const feesCard = (page: Page) =>
  page.getByRole('region', { name: 'Commissions and fees' });

/** Picks one option of an Account or Instrument select in a rule dialog. */
async function pick(dialog: Locator, label: string, option: string) {
  await dialog.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await dialog
    .page()
    .getByRole('menuitemradio', { name: option, exact: true })
    .click();
}

/** A unit select: opens it and picks. */
async function unit(dialog: Locator, side: string, option: string) {
  await dialog
    .getByRole('button', { name: new RegExp(`^${side} unit,`) })
    .click();
  await dialog
    .page()
    .getByRole('menuitemradio', { name: option, exact: true })
    .click();
}

/** Opens a rule's menu and chooses an item. */
async function ruleMenu(card: Locator, item: string) {
  await card
    .getByRole('button', { name: /^Actions for Rules account/ })
    .click();
  await card.page().getByRole('menuitem', { name: item }).click();
}

const applyDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Apply this rule to existing trades?' });

test('default rules: create both kinds, import a file, see levels and fees on the new trades, then apply to existing without and with override', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'desktop',
    'the journey runs at desktop width',
  );
  await intoMyWorkspace(page);

  // Trades that exist before any rule: 5 ES, 2 NQ and 1 MES (ESZ5, NQZ5, MESZ5).
  await importFile(page, 'sample-fills.csv', true);
  const before = await mine(page);
  expect(before).toHaveLength(8);
  expect(before.every((t) => t.targets === undefined && t.fees === 0)).toBe(
    true,
  );
  const oldEs = before.filter((t) => t.instrument.root === 'ES');
  expect(oldEs).toHaveLength(5);

  // A target and stop rule for ES: 10 points of target and 5 of stop, the whole position each.
  await page.goto('/app/settings/trading');
  await expect(targetsCard(page)).toBeVisible({ timeout: 30_000 });
  await expect(targetsCard(page).getByText(/No rules yet/)).toBeVisible();
  await expect(feesCard(page).getByText(/No rules yet/)).toBeVisible();
  await targetsCard(page)
    .getByRole('button', { name: /^Add rule/ })
    .click();
  let dialog = page.getByRole('dialog', { name: 'New target and stop rule' });
  await expect(dialog).toBeVisible();
  // The defaults: nothing chosen, the units waiting, each level at 100%, Create waiting.
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
  await expect(
    dialog.getByRole('button', {
      name: 'Targets unit, pick an instrument first',
    }),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect(
    dialog.getByRole('textbox', { name: 'Target share 1' }),
  ).toHaveValue('100');
  await expect(
    dialog.getByRole('textbox', { name: 'Stop share 1' }),
  ).toHaveValue('100');
  await pick(dialog, 'Account', 'Rules account');
  await pick(dialog, 'Instrument', 'Future');
  await dialog.getByLabel('Symbols', { exact: true }).fill('es,');
  await unit(dialog, 'Targets', 'Points');
  await unit(dialog, 'Stops', 'Points');
  await dialog.getByRole('textbox', { name: 'Target level 1' }).fill('10');
  await dialog.getByRole('textbox', { name: 'Stop level 1' }).fill('5');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  const targetRow = targetsCard(page).getByRole('row', {
    name: /Rules account/,
  });
  await expect(targetRow).toContainText('Rules account');
  await expect(targetRow).toContainText('Future');
  await expect(targetRow).toContainText('ES');
  await expect(targetRow).toContainText('Target 10 points (100%)');
  await expect(targetRow).toContainText('Stop 5 points (100%)');

  // A commission and fee rule for every future in the account: per contract, on every execution.
  await feesCard(page)
    .getByRole('button', { name: /^Add rule/ })
    .click();
  dialog = page.getByRole('dialog', { name: 'New commission and fee rule' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('switch', { name: 'All symbols' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    dialog.getByRole('radio', { name: 'Per execution' }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('radio', { name: 'Every execution' }),
  ).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Commission' })).toHaveValue(
    '0.00',
  );
  await expect(dialog.getByRole('textbox', { name: 'Fee' })).toHaveValue(
    '0.00',
  );
  await pick(dialog, 'Account', 'Rules account');
  await pick(dialog, 'Instrument', 'Future');
  await dialog
    .getByRole('radiogroup', { name: 'Charge' })
    .getByText('Per contract')
    .click();
  await dialog.getByRole('textbox', { name: 'Commission' }).fill('1.25');
  await dialog.getByRole('textbox', { name: 'Fee' }).fill('0.50');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  const feeRow = feesCard(page).getByRole('row', { name: /Rules account/ });
  await expect(feeRow).toContainText('$1.25 commission, $0.50 fee');
  await expect(feeRow).toContainText('Per contract, on every execution');
  await expect(feeRow).toContainText('All symbols');

  // Both cards hold a rule: the page does not scroll sideways at any width from a phone to a wide screen.
  for (const width of [390, 640, 768, 1024, 1280, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(targetsCard(page)).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, `overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Import a second file: its trades are filled as they arrive, and the earlier ones are left alone.
  await importFile(page, 'fills.csv', false);
  const all = await mine(page);
  expect(all).toHaveLength(14);
  const fresh = all.slice(8);
  const newEs = fresh.filter((t) => t.instrument.root === 'ES');
  const newNq = fresh.filter((t) => t.instrument.root === 'NQ');
  expect(newEs).toHaveLength(4);
  expect(newNq).toHaveLength(2);
  for (const t of newEs) {
    expect(t.targets?.unit).toBe('points');
    expect(t.targets?.levels).toEqual([{ value: 10, qty: expect.any(Number) }]);
    expect(t.stops?.levels).toEqual([{ value: 5, qty: expect.any(Number) }]);
  }
  // The rule names ES only: NQ gets no levels, but every future gets the costs.
  for (const t of newNq) expect(t.targets).toBeUndefined();
  for (const t of fresh) {
    expect(t.executions.every((e) => e.commission === e.qty * 125)).toBe(true);
    expect(t.executions.every((e) => e.fees === e.qty * 50)).toBe(true);
  }
  for (const t of before) expect(t.fees).toBe(0);

  // The first new ES trade (2 contracts, in and out): its page shows the levels and the costs.
  const first = newEs[0]!;
  await page.goto(`/app/trades/${first.id}`);
  const targets = page.getByRole('group', { name: 'Targets' });
  await expect(targets).toBeVisible({ timeout: 30_000 });
  await expect(
    targets.getByRole('button', { name: 'Targets unit, Points' }),
  ).toBeVisible();
  await expect(
    targets.getByRole('textbox', { name: 'Target level 1' }),
  ).toHaveValue('10');
  await expect(
    page
      .getByRole('group', { name: 'Stops' })
      .getByRole('textbox', { name: 'Stop level 1' }),
  ).toHaveValue('5');
  // 2 contracts at $1.25 and $0.50, on each of 2 fills: $5.00 commission and $2.00 exchange.
  const fees = page.getByText('Fees', { exact: true }).locator('..');
  await expect(fees).toContainText('−$7.00');
  await expect(fees).toContainText('$5.00 commission, $2.00 exchange');

  // Apply to existing, a target rule, box unticked: only trades with no targets or stops. The rule has
  // changed since (12 points), and editing it left what it filled as it was.
  await page.goto('/app/settings/trading');
  await expect(targetsCard(page)).toBeVisible({ timeout: 30_000 });
  await ruleMenu(targetsCard(page), 'Edit');
  dialog = page.getByRole('dialog', { name: 'Edit target and stop rule' });
  await expect(
    dialog.getByRole('textbox', { name: 'Target level 1' }),
  ).toHaveValue('10');
  await dialog.getByRole('textbox', { name: 'Target level 1' }).fill('12');
  await dialog.getByRole('button', { name: 'Save rule' }).click();
  await expect(dialog).toBeHidden();
  await expect(targetsCard(page)).toContainText('Target 12 points (100%)');
  expect(
    (await mine(page)).filter(
      (t) => t.instrument.root === 'ES' && t.targets?.levels[0]?.value === 10,
    ),
  ).toHaveLength(4);

  await ruleMenu(targetsCard(page), 'Apply to existing trades');
  let apply = applyDialog(page);
  await expect(apply).toBeVisible();
  // 9 ES trades match; the 5 with nothing set are the ones that change.
  await expect(apply).toContainText(
    'It matches 9 trades in Rules account on ES, manual trades included.',
  );
  const box = apply.getByRole('checkbox', {
    name: /Replace targets and stops already set/,
  });
  await expect(box).not.toBeChecked();
  await expect(apply.getByText('5 trades', { exact: true })).toBeVisible();
  await apply.getByRole('button', { name: 'Apply to 5 trades' }).click();
  await expect(apply).toBeHidden();
  await expect(
    targetsCard(page).getByRole('status', { name: 'Result' }),
  ).toContainText('Changed 5 trades.');
  let es = (await mine(page)).filter((t) => t.instrument.root === 'ES');
  expect(es.filter((t) => t.targets?.levels[0]?.value === 12)).toHaveLength(5);
  // The four filled at import keep their 10.
  expect(es.filter((t) => t.targets?.levels[0]?.value === 10)).toHaveLength(4);
  expect(es.every((t) => t.stops?.levels[0]?.value === 5)).toBe(true);

  // Again, unticked: nothing is left to fill. Ticked: the four replace their 10 with 12.
  await ruleMenu(targetsCard(page), 'Apply to existing trades');
  apply = applyDialog(page);
  await expect(apply.getByText('No trade will change.')).toBeVisible();
  await expect(
    apply.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeDisabled();
  await apply
    .getByRole('checkbox', { name: /Replace targets and stops already set/ })
    .check({ force: true });
  await expect(apply.getByText('4 trades', { exact: true })).toBeVisible();
  await apply.getByRole('button', { name: 'Apply to 4 trades' }).click();
  await expect(apply).toBeHidden();
  await expect(
    targetsCard(page).getByRole('status', { name: 'Result' }),
  ).toContainText('Changed 4 trades.');
  es = (await mine(page)).filter((t) => t.instrument.root === 'ES');
  expect(es.every((t) => t.targets?.levels[0]?.value === 12)).toBe(true);

  // The fee rule goes to $2.00 a contract. Unticked, only the 8 trades with no costs get it.
  await ruleMenu(feesCard(page), 'Edit');
  dialog = page.getByRole('dialog', { name: 'Edit commission and fee rule' });
  await expect(dialog.getByRole('textbox', { name: 'Commission' })).toHaveValue(
    '1.25',
  );
  await dialog.getByRole('textbox', { name: 'Commission' }).fill('2');
  await dialog.getByRole('button', { name: 'Save rule' }).click();
  await expect(dialog).toBeHidden();
  await expect(feesCard(page)).toContainText('$2.00 commission, $0.50 fee');

  await ruleMenu(feesCard(page), 'Apply to existing trades');
  apply = applyDialog(page);
  await expect(apply).toContainText(
    'It matches 14 futures trades in Rules account',
  );
  await expect(apply.getByText('8 trades', { exact: true })).toBeVisible();
  await apply.getByRole('button', { name: 'Apply to 8 trades' }).click();
  await expect(apply).toBeHidden();
  await expect(
    feesCard(page).getByRole('status', { name: 'Result' }),
  ).toContainText('Changed 8 trades.');
  let now = await mine(page);
  for (const t of now.slice(0, 8))
    expect(t.executions.every((e) => e.commission === e.qty * 200)).toBe(true);
  // The six imported under the old rule keep their $1.25.
  for (const t of now.slice(8))
    expect(t.executions.every((e) => e.commission === e.qty * 125)).toBe(true);

  // Ticked, the six replace theirs.
  await ruleMenu(feesCard(page), 'Apply to existing trades');
  apply = applyDialog(page);
  await expect(apply.getByText('No trade will change.')).toBeVisible();
  await apply
    .getByRole('checkbox', { name: /Replace commissions and fees already set/ })
    .check({ force: true });
  await expect(apply.getByText('6 trades', { exact: true })).toBeVisible();
  await apply.getByRole('button', { name: 'Apply to 6 trades' }).click();
  await expect(apply).toBeHidden();
  await expect(
    feesCard(page).getByRole('status', { name: 'Result' }),
  ).toContainText('Changed 6 trades.');
  now = await mine(page);
  for (const t of now)
    expect(
      t.executions.every(
        (e) => e.commission === e.qty * 200 && e.fees === e.qty * 50,
      ),
    ).toBe(true);

  // Every change a rule made is in the history, with the source Rule.
  const history = await readStore<{
    source: string;
    type: string;
    field?: string;
  }>(page, 'history');
  const byRule = history.filter((r) => r.source === 'rule');
  expect(byRule.some((r) => r.field === 'targets')).toBe(true);
  expect(byRule.some((r) => r.field === 'fees')).toBe(true);

  // Deleting a rule leaves what it filled.
  await ruleMenu(targetsCard(page), 'Delete');
  const confirm = page.getByRole('dialog', { name: 'Delete this rule?' });
  await expect(confirm).toContainText(
    'keep the targets and stops it gave them',
  );
  await confirm.getByRole('button', { name: 'Delete rule' }).click();
  await expect(targetsCard(page).getByText(/No rules yet/)).toBeVisible();
  es = (await mine(page)).filter((t) => t.instrument.root === 'ES');
  expect(es.every((t) => t.targets?.levels[0]?.value === 12)).toBe(true);
});

test('on a phone the rule dialogs are full-height sheets with their footer in view, a rule is a two-line row, and nothing overflows', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'phone width only');
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
  await page.goto('/app/settings/trading');
  await expect(targetsCard(page)).toBeVisible({ timeout: 30_000 });
  await expect(targetsCard(page).getByText(/No rules yet/)).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await targetsCard(page)
    .getByRole('button', { name: /^Add rule/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New target and stop rule' });
  await expect(dialog).toBeVisible();
  // A sheet: the full width and nearly the full height, Create and Cancel pinned in view.
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(390);
  expect(box.height).toBeGreaterThan(800);
  const create = dialog.getByRole('button', { name: 'Create' });
  const footer = (await create.boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(844);
  await pick(dialog, 'Account', 'Futures live');
  await pick(dialog, 'Instrument', 'Future');
  await dialog.getByLabel('Symbols', { exact: true }).fill('es,mes,');
  await unit(dialog, 'Targets', 'Points');
  await dialog.getByRole('textbox', { name: 'Target level 1' }).fill('8');
  await dialog.getByRole('textbox', { name: 'Target share 1' }).fill('50');
  await dialog.getByRole('button', { name: /^Add level for targets/ }).click();
  await dialog.getByRole('textbox', { name: 'Target level 2' }).fill('16');
  await dialog.getByRole('textbox', { name: 'Target share 2' }).fill('50');
  // The footer stays in view however far the body has scrolled.
  const after = (await create.boundingBox())!;
  expect(after.y + after.height).toBeLessThanOrEqual(844);
  await create.click();
  await expect(dialog).toBeHidden();

  // The rule is a two-line row under its account, with a menu.
  const row = targetsCard(page).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row.locator('[data-line]')).toHaveCount(2);
  await expect(row).toContainText('Futures live');
  await expect(row).toContainText('Future, ES and MES');
  await expect(row).toContainText('Targets 8 and 16 points, 50% each');
  expect(await overflow()).toBeLessThanOrEqual(0);

  // Apply to existing opens its confirmation with the count and the box.
  await row.getByRole('button', { name: /^Actions for Futures live/ }).click();
  await page
    .getByRole('menuitem', { name: 'Apply to existing trades' })
    .click();
  const apply = applyDialog(page);
  await expect(apply).toBeVisible();
  await expect(apply).toContainText(
    /It matches \d+ trades in Futures live on ES and MES/,
  );
  await expect(
    apply.getByRole('checkbox', {
      name: /Replace targets and stops already set/,
    }),
  ).not.toBeChecked();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
