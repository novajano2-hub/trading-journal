// Dev-only: full-page captures of every marketing route for design review.
// Usage: npm run build && (npx next start -p 3200 &) && node scripts/capture.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://localhost:3200';
const modules = ['journal', 'analytics', 'strategies', 'notebook', 'prop-firms', 'backtesting', 'replay', 'mentors'];
const routes = ['/', ...modules.map((m) => `/features/${m}`), '/pricing', '/brokers', '/changelog', '/login', '/signup', '/terms', '/privacy', '/app/import'];
const sizes = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
];

const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};

await mkdir('.impeccable/review/routes', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

for (const [name, width, height] of sizes) {
  // Reduced motion settles every entrance so captures show final states.
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await settle(page);
    const file = route === '/' ? `.impeccable/review/${name}.png` : `.impeccable/review/routes/${name}${route.replaceAll('/', '-')}.png`;
    await page.screenshot({ path: file, fullPage: true });
  }
  // First viewport only, with motion allowed, after the entrance has played.
  const moving = await (await browser.newContext({ viewport: { width, height }, colorScheme: 'light' })).newPage();
  await moving.goto(base + '/', { waitUntil: 'networkidle' });
  await moving.waitForTimeout(2500);
  await moving.screenshot({ path: `.impeccable/review/${name}-first-viewport.png` });
  await ctx.close();
}

// Dark theme check of the landing page (explicit toggle, not OS preference).
const dark = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
await dark.addInitScript(() => {
  try { localStorage.setItem('keel-theme', 'dark'); } catch {}
});
await dark.goto(base + '/', { waitUntil: 'networkidle' });
await dark.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await settle(dark);
await dark.screenshot({ path: '.impeccable/review/desktop-dark.png', fullPage: true });

await browser.close();
console.log('captured', routes.length * sizes.length + sizes.length + 1, 'screens');
