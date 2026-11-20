// Dev-only: full-page captures of every marketing route for design review.
// Usage: npm run build && npx next start -p 3200 & node scripts/capture.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://localhost:3200';
const modules = ['journal', 'analytics', 'strategies', 'notebook', 'prop-firms', 'backtesting', 'replay', 'mentors'];
const routes = ['/', ...modules.map((m) => `/features/${m}`), '/pricing', '/brokers', '/changelog', '/login', '/signup', '/terms', '/privacy', '/app/import'];
const sizes = [['desktop', 1440, 900], ['mobile', 390, 844]];

await mkdir('.impeccable/review/routes', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, width, height] of sizes) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const file = route === '/' ? `.impeccable/review/${name}.png` : `.impeccable/review/routes/${name}${route.replaceAll('/', '-')}.png`;
    await page.screenshot({ path: file, fullPage: true });
  }
  // Signature interaction: the visitor's own CSV printed as tickets (first viewport only).
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByLabel(/drop your broker csv/i).setInputFiles('e2e/fixtures/sample-fills.csv');
  await page.getByTestId('ticket-yours').first().waitFor();
  await page.screenshot({ path: `.impeccable/review/${name}-dropped.png` });
  await ctx.close();
}
await browser.close();
console.log('captured', routes.length * sizes.length + sizes.length, 'screens');
