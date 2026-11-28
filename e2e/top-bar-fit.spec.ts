import { expect, test, type Page } from '@playwright/test';

// The top bar puts its filter chips beside the title or on a row of their
// own by measuring (`useChipsFit`). Under Reduce motion every style change
// eases over one frame, and in that frame a strategy's crumb title read
// squeezed, so the bar flipped between its two layouts every frame at widths
// where the chips just miss the title's row: the header ran 68, 140 and 60 px
// and nothing under it held still for a click (T24-1). Each width below is
// one where it flipped. No fixed clock: the frames are what is measured.
test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the bar measures its row from sm up; desktop widths',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

type Frame = [fit: string | null, height: number];

/** The bar's layout and height on every frame for `ms`. */
function frames(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    (ms) =>
      new Promise<Frame[]>((resolve) => {
        const bar = document.querySelector('header[data-pinned]')!;
        const out: Frame[] = [];
        const start = performance.now();
        const tick = () => {
          out.push([
            bar.getAttribute('data-chips'),
            bar.getBoundingClientRect().height,
          ]);
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** The one layout every frame showed, or null when it changed. */
const one = (fs: Frame[]): string | null => {
  const seen = new Set(fs.map(([fit, h]) => `${fit} ${h}`));
  return seen.size === 1 ? [...seen][0]! : null;
};

/** Resizes the window, waits for the bar to settle, then watches it hold for a second. */
async function settlesAt(page: Page, width: number): Promise<string> {
  await page.setViewportSize({ width, height: 900 });
  await expect
    .poll(async () => one(await frames(page, 300)), {
      message: `the bar settles at ${width}px`,
      timeout: 5_000,
    })
    .not.toBeNull();
  const held = one(await frames(page, 1_000));
  expect(held, `the bar holds still at ${width}px`).not.toBeNull();
  // One of the bar's two layouts, never a frame between them.
  expect(['inline 68', 'wrapped 132'], `${width}px`).toContain(held);
  return held!;
}

const STRATEGIES = [
  {
    path: '/app/strategies/sample-strategy-1',
    name: 'Opening range breakout',
    widths: [1216, 1280, 1360, 1440, 1464],
  },
  {
    path: '/app/strategies/sample-strategy-2',
    name: 'Trend pullback',
    widths: [1216, 1280, 1360],
  },
];

for (const { path, name, widths } of STRATEGIES)
  test(`under Reduce motion the bar on ${name}'s page settles on one layout at every width it used to flip at, and again after each resize`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.getByRole('banner').getByText(name)).toBeVisible({
      timeout: 30_000,
    });
    for (const width of widths) await settlesAt(page, width);
    // Away and back, both ways: each resize settles again.
    for (const width of [...widths].reverse()) {
      await settlesAt(page, width + 6);
      await settlesAt(page, width);
    }
    // Far from the edge the chips' place is plain: their own row on a narrow
    // window, beside the title on a wide one.
    expect(await settlesAt(page, 1100)).toBe('wrapped 132');
    expect(await settlesAt(page, 1680)).toBe('inline 68');
    // What used to be the symptom: a control under the bar holds still for a click.
    await settlesAt(page, widths.at(-1)!);
    await page
      .getByRole('button', { name: 'Add a missed trade' })
      .click({ trial: true, timeout: 5_000 });
  });
