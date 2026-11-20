# Milestone 1 · Plan 3: Marketing site, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Keel's public site in the approved Trading Floor world: the landing page, eight feature pages, pricing, brokers, changelog, login/signup (UI only) and legal pages. Its primary action is a real file drop that parses the visitor's own CSV in the browser and hands it to a placeholder `/app/import`. The site finishes with Impeccable's finish review and a written DESIGN.md.

**Architecture:**
- **Rendering:** marketing routes live under `src/app/(marketing)` as server components, rendered statically. The only client islands are the hero file drop and the header menus.
- **Sample data:** the landing's sample numbers are computed at build time by Plan 1's domain code from one authored set of sample fills, never hand-typed into the markup.
- **Import groundwork:** column guessing is pure and lives in `src/domain/import` so Plan 2 can extend it. File reading and the pending-import store live in `src/lib`.

**Tech Stack:**
- Next.js 16 App Router, React 19, TypeScript strict
- Tailwind CSS v4 with tokens as CSS variables; `next/font/google` (self-hosted at build)
- `lucide-react` icons; `papaparse` for CSV parsing; `idb-keyval` for the pending-import store
- Vitest; Playwright using the installed Google Chrome (no browser download)

**Spec:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md` (§6, §9, §10). Also read:
- the direction contract `.impeccable/surfaces/src-app-marketing-page-tsx.md`
- the approved composition `.impeccable/mocks/decision/model-pick.html` (build path code-led; this sketch is the first-viewport contract)
- `PRODUCT.md` (evidence rules)

## Global Constraints

- **Before any UI edit**, read the direction contract above and the craft floor: `/Users/mac/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/reference/craft-floor.md`. The craft floor's bans are binding:
  - no eyebrow or kicker text above headings
  - no gradient text
  - no same-size icon-card grids
  - no decorative glass
  - no hard offset shadows
  - no emoji or Unicode icons; use `lucide-react` at a single stroke width of 1.75
- **Tokens, exact:**

| Token | Value | Use |
|---|---|---|
| gold | `#F2B705` | marketing ground |
| navy | `#151A2D` | ink |
| stock | `#F4F6F8` | ticket card stock |
| buy | `#2350C8` | buys |
| sell | `#D2352A` | sells |
| stamp purple | `#6B3FA0` | timestamps only |

- **Fonts, via `next/font/google`:**
  - Big Shoulders Display 700/900 for display and uppercase headlines
  - Barlow 400/500/600/700 for text
  - DotGothic16 for timestamps only
  - Inter and the system font are not allowed as the display voice.
- **Buy and sell** always appear as a B or S letter inside a circle, as well as by colour. Every P&L value is formatted with `formatPnl` (from `src/lib/format.ts`), so it always carries a sign.
- **No invented claims** (PRODUCT.md): no user, trade or broker counts, no ratings, testimonials or prices. Sample material is visibly labelled "Sample".
- **Never fake capability:**
  - Modules not in milestone 1 (Backtesting, Replay, Mentor & Spaces, AI assistant) are labelled "In development".
  - Login and signup submit buttons are disabled, with a one-line reason.
  - The file drop does real parsing.
  - No broker is named as "supported".
- **Accessibility:** WCAG 2.2 AA.
  - Body text contrast ≥ 4.5:1.
  - Functional text ≥ 11px.
  - Visible focus ring in navy on gold, gold on navy.
  - Full keyboard support for menus and the drop zone.
  - `prefers-reduced-motion` disables the ticket-print animation.
- **Responsive:** every route has no horizontal scroll at 390px and 1440px.
- **Browser surfaces are themed from the tokens:** `::selection`, caret, focus ring, scrollbar and tabular numerals.
- **Commands:** use npm. Unit tests run with `npm test -- <path>`. End-to-end tests run with `npm run e2e` (build, then Playwright).

## Review Focus

1. **A dropped file that isn't a trade export** (an image, an empty CSV, or a CSV with unrecognised headers) shows a plain error or "—" in the unguessed fields. It never crashes or prints blank tickets. Pinned in Tasks 3 and 5.
2. **A very large CSV (50k rows)** must not freeze the page. Preview parsing stops after the first rows. Pinned in Task 3 (`preview` limit).
3. **Keyboard-only visitors** can open the Product menu, reach the drop zone, choose a file and continue. Pinned in Tasks 2 and 5.
4. **Phone width (390px)** fits the hero's 118px headline and fanned tickets without horizontal scroll. Pinned in Task 9's checks plus the Task 2 smoke check.
5. **Returning to `/app/import` after a reload** still shows the stored file, and "Remove file" really clears it. Pinned in Task 5.

---

### Task 1: Tooling hygiene and Playwright (backlog E7, E8)

**Files:**
- Modify: `package.json`, `next.config.ts`, `src/app/layout.tsx`, `README.md`
- Create: `.prettierignore`, `playwright.config.ts`, `e2e/smoke.spec.ts`
- Delete: `src/app/page.tsx` (scaffold page; Task 2 replaces it)

**Interfaces:**
- Produces: the npm script `e2e` (`next build && playwright test`). Playwright starts `next start -p 3100` and uses `channel: 'chrome'`.

- [ ] **Step 1: Branch.** Run `git switch -c m1-marketing` from `main`.
- [ ] **Step 2: Tooling.**
  - Add `"engines": { "node": ">=22" }`.
  - Pin `vitest` and `vite` to the exact installed versions (no `^`).
  - Add `.prettierignore` (`package-lock.json`, `.next`, `docs`, `.superpowers`, `.impeccable`).
  - Run `npm run format` once and commit the result separately (`chore: format repo`).
- [ ] **Step 3: Next config.** Remove `partialPrefetching`. Keep `cacheComponents` only if `npm run build` still prerenders every marketing route as static (○ in build output) once later tasks land; otherwise remove it, and say which in the report.
- [ ] **Step 4: Playwright and README.**
  - Install `@playwright/test` (dev).
  - `playwright.config.ts`: `use.channel: 'chrome'`, `baseURL: 'http://localhost:3100'`, `webServer: { command: 'npm run start -- -p 3100', port: 3100, reuseExistingServer: false }`, `projects: desktop 1440×900 and mobile 390×844`.
  - Replace README.md with three lines: what Keel is, `npm run dev`, `npm test` / `npm run e2e`.
- [ ] **Step 5: Smoke test** in `e2e/smoke.spec.ts`: `GET /` returns 200 at both viewports. Until Task 2 lands it may just assert `response.ok()`. Create a temporary `src/app/page.tsx` that returns `<main />` so the build passes.
- [ ] **Step 6: Verify.** Run `npm run lint && npm run typecheck && npm test && npm run e2e`. All pass.
- [ ] **Step 7: Commit** with `chore: tooling hygiene, Playwright on system Chrome`.

---

### Task 2: Design tokens, fonts and the marketing frame

**Files:**
- Create: `src/styles/tokens.css`, `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx` (minimal h1 for now), `src/components/marketing/site-header.tsx`, `product-menu.tsx`, `mobile-menu.tsx`, `site-footer.tsx`, `badge-logo.tsx`, `src/content/modules.ts`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Delete: the temporary `src/app/page.tsx`
- Test: `e2e/frame.spec.ts`

**Interfaces:**
- Produces:
  - CSS variables `--gold --navy --stock --buy --sell --stamp`, plus derived roles `--ink --ground --surface --rule`.
  - Font variables `--font-display --font-text --font-stamp`, exposed as Tailwind theme colours and font families.
  - From `src/content/modules.ts`:
    ```ts
    export type ModuleSlug = 'journal' | 'analytics' | 'strategies' | 'notebook' | 'prop-firms' | 'backtesting' | 'replay' | 'mentors';
    export interface ModuleInfo { slug: ModuleSlug | 'assistant'; name: string; oneLine: string; status: 'milestone-1' | 'in-development'; hasPage: boolean }
    export const MODULES: readonly ModuleInfo[]; // 9 entries: the 8 slugs in order (names: Journal, Analytics, Strategies, Notebook, Prop firms, Backtesting, Replay, Mentor & Spaces) + 'assistant' (AI assistant, hasPage false)
    ```
    Status: backtesting, replay, mentors and assistant are 'in-development'; the rest are 'milestone-1'. The Product menu lists only the modules with `hasPage`.
  - Components `SiteHeader`, `SiteFooter`, `BadgeLogo` (the trader badge "KEL" with "KEEL" beneath, as in the approved sketch).

**Header contents:**
- the badge logo linking to `/`
- **Product**: a disclosure button opening a menu of the eight modules
- Pricing, Brokers, Changelog
- on the right: "Log in" (`/login`) and "Get started" (`/signup`)

Below 768px the nav collapses into a menu button that opens a full-height sheet.

**Menu behaviour:**
- `aria-expanded` reflects the state.
- Esc closes the menu and returns focus to its button.
- Arrow keys move between items.
- Clicking outside closes the menu.

**Footer:**
- the badge
- a module list
- Pricing, Brokers, Changelog, Terms, Privacy
- `© 2026 Keel`

- [ ] **Step 1: Write the failing e2e tests** in `e2e/frame.spec.ts`:

```ts
test('header links and product menu by keyboard', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Pricing', 'Brokers', 'Changelog', 'Log in', 'Get started'])
    await expect(page.getByRole('link', { name })).toBeVisible();      // desktop project; mobile opens the sheet first
  const product = page.getByRole('button', { name: 'Product' });
  await product.focus(); await page.keyboard.press('Enter');
  await expect(product).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'Prop firms' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(product).toHaveAttribute('aria-expanded', 'false');
  await expect(product).toBeFocused();
});
test('no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

  The mobile project runs the same flow through the menu sheet. Gate on the viewport with `test.info().project.name`.

- [ ] **Step 2: Run it.** `npm run e2e`. Expected: FAIL.
- [ ] **Step 3: Implement** the tokens, fonts, globals and the themed browser surfaces from Global Constraints, then the layout, header, menus, footer and `MODULES`.
- [ ] **Step 4: Run it again.** `npm run e2e`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(marketing): Trading Floor tokens, fonts, header and footer`.

---

### Task 3: Import preview core (pure, test-first)

**Files:**
- Create: `src/domain/import/guess-columns.ts`, `src/domain/import/preview.ts`, `src/lib/import/preview-file.ts`, `src/lib/pending-import.ts`
- Test: `src/domain/import/guess-columns.test.ts`, `src/domain/import/preview.test.ts`
- Modify: `package.json` (add `papaparse`, `@types/papaparse`, `idb-keyval`)

**Interfaces:**
- Produces:
  ```ts
  // src/domain/import/guess-columns.ts
  export type PreviewField = 'time' | 'symbol' | 'side' | 'qty' | 'price';
  export function guessColumns(headers: readonly string[]): Partial<Record<PreviewField, number>>;
  export function normalizeSide(value: string): 'buy' | 'sell' | null;
  // src/domain/import/preview.ts  (string in, no browser APIs)
  export interface PreviewTicket { time?: string; symbol?: string; side?: 'buy' | 'sell'; qty?: string; price?: string }
  export interface Preview { headers: string[]; guessed: Partial<Record<PreviewField, number>>; tickets: PreviewTicket[] }
  export function previewFromText(csv: string, limit?: number /* default 4 */): Preview; // throws PreviewError
  export class PreviewError extends Error { reason: 'empty' | 'unrecognised' }
  // src/lib/import/preview-file.ts
  export function previewFile(file: File, limit?: number): Promise<Preview>; // rejects PreviewError('unrecognised') for non-text MIME / non-.csv/.txt
  // src/lib/pending-import.ts  (idb-keyval, key 'keel:pending-import')
  export function savePendingImport(file: File): Promise<void>;
  export function loadPendingImport(): Promise<File | undefined>;
  export function clearPendingImport(): Promise<void>;
  ```

**Header matching.** Match case-insensitively after collapsing anything non-alphanumeric to one space. Try an exact synonym match first, then a "header contains synonym" match. The first column wins, and each column is used once.

| Field | Synonyms |
|---|---|
| time | time, date, datetime, date time, timestamp, fill time, filled time, execution time, exec time, trade time, open time |
| symbol | symbol, ticker, instrument, contract, market, product, security |
| side | side, action, buy sell, b s, direction (never bare "type") |
| qty | qty, quantity, size, volume, lots, filled qty, filled, shares, contracts |
| price | price, fill price, avg price, avg fill price, execution price, exec price, trade price |

**Side words.**
- Buy: buy, b, bot, bought, long, buy to open, buy to close.
- Sell: sell, s, sld, sold, short, sell short, sell to open, sell to close.

**Parsing.**
- `previewFromText` uses `Papa.parse(text, { preview: limit + 1, skipEmptyLines: true })`. That keeps large files cheap (Review Focus 2).
- **Empty:** no rows → `empty`.
- **Unrecognised:** no time, symbol, side, qty or price column guessed → `unrecognised`.

- [ ] **Step 1: Write the failing tests.**

```ts
test('guessColumns across broker header styles', () => {
  expect(guessColumns(['Date/Time', 'Symbol', 'Buy/Sell', 'Quantity', 'Price', 'Commission']))
    .toEqual({ time: 0, symbol: 1, side: 2, qty: 3, price: 4 });
  expect(guessColumns(['Fill Time', 'Contract', 'B/S', 'Filled Qty', 'Avg Fill Price']))
    .toEqual({ time: 0, symbol: 1, side: 2, qty: 3, price: 4 });
  expect(guessColumns(['Order Type', 'Ticker'])).toEqual({ symbol: 1 });
  expect(guessColumns([])).toEqual({});
});
test('normalizeSide', () => {
  expect(['BOT', 'Buy to Open', 'long'].map(normalizeSide)).toEqual(['buy', 'buy', 'buy']);
  expect(['SLD', 'sell short', 'S'].map(normalizeSide)).toEqual(['sell', 'sell', 'sell']);
  expect(normalizeSide('cancel')).toBeNull();
});
test('previewFromText prints the first rows as tickets and stops early', () => {
  const csv = ['Date/Time,Symbol,Buy/Sell,Quantity,Price', ...Array.from({ length: 50000 }, (_, i) =>
    `2026-11-16 09:${String(i % 60).padStart(2, '0')}:00,ESZ5,${i % 2 ? 'SLD' : 'BOT'},1,6010.25`)].join('\n');
  const p = previewFromText(csv);
  expect(p.tickets).toHaveLength(4);
  expect(p.tickets[0]).toEqual({ time: '2026-11-16 09:00:00', symbol: 'ESZ5', side: 'buy', qty: '1', price: '6010.25' });
  expect(p.tickets[1]!.side).toBe('sell');
});
test('previewFromText errors', () => {
  expect(() => previewFromText('')).toThrow(expect.objectContaining({ reason: 'empty' }));
  expect(() => previewFromText('foo,bar\n1,2')).toThrow(expect.objectContaining({ reason: 'unrecognised' }));
});
```

- [ ] **Step 2: Run the tests.** `npm test -- src/domain/import`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules. `src/domain/import/*` stays pure; Papa Parse is pure JS, so it's allowed in `src/domain`.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run the full gate.
- [ ] **Step 5: Commit** with `feat(import): header guessing, preview parsing, pending-import store`.

---

### Task 4: Landing sample, computed by the domain

**Files:**
- Create: `src/content/landing-sample.ts`, `src/lib/landing/sample-view.ts`
- Test: `src/lib/landing/sample-view.test.ts`

**Interfaces:**
- Consumes: Plan 1's `buildTrades`, `resolveInstrument`, `summarize`, `dailyPnl`, `maxDrawdown`, `equityCurve`, `evaluateProp`, `defaultMetricContext` and `formatPnl`.
- Produces:
  ```ts
  export const SAMPLE_EXECUTIONS: readonly Execution[];   // account 'sample', USD
  export const SAMPLE_START: Cents;                       // 5_000_000
  export interface SampleView {
    trades: Trade[]; summary: Summary; days: DayStat[]; drawdown: Drawdown; equity: EquityPoint[];
    prop: PropStatus;              // rules below, trailing, now = '2026-11-20T21:00:00Z'
    heroTickets: TicketModel[];    // 4 tickets for the hero stack, top = trade #8, one stamped 'RULE BROKEN' = trade #6
  }
  export interface TicketModel { serial: number; side: 'buy' | 'sell'; symbol: string; qty: number; price: string; time: string /* 'DD MMM HH:MM:SS' NY */; netPnl: string; r?: string; stamp?: 'RULE BROKEN' | 'A+ SETUP' }
  export function getSampleView(): SampleView; // pure, timeZone 'America/New_York'
  ```

**Sample fills.** Eight round trips, one buy and one sell fill each. Times are ET (EST = UTC−5) on 2026-11-16 to 2026-11-20. Commission is 250 cents per fill for ES and NQ, and 75 per fill for MES.

| # | Day | Fills | Expected net (cents) |
|---|---|---|---|
| 1 | Mon | buy 2 ESZ5 @6010.00 09:41, sell 2 @6014.50 10:02 | 44500 |
| 2 | Mon | sell 1 NQZ5 @21050.00 10:30, buy 1 @21062.25 10:48 | −25000 |
| 3 | Tue | buy 1 ESZ5 @6020.25 09:35, sell 1 @6026.75 09:58 | 32000 |
| 4 | Tue | buy 3 MESZ5 @6030.00 11:10, sell 3 @6027.50 11:25 | −3900 |
| 5 | Wed | sell 2 ESZ5 @6005.00 09:45, buy 2 @5998.25 10:20 | 67000 |
| 6 | Thu | buy 1 NQZ5 @21100.00 09:50, sell 1 @21086.50 10:05 | −27500 |
| 7 | Thu | buy 2 ESZ5 @6040.00 13:00, sell 2 @6040.00 13:30 | −500 |
| 8 | Fri | buy 1 ESZ5 @6050.50 10:15, sell 1 @6058.00 10:40 | 37000 |

**Rule checks.** Trade 6 carries a `ruleChecks` entry `{ ruleId: 'r-stop', followed: false }` (that's where its stamp comes from). Trade 5 is stamped 'A+ SETUP'.

**Prop rules:** firm 'Sample', evaluation, profitTarget 300000, dailyLossLimit 100000, maxDrawdown 200000, trailing, minTradingDays 5, consistencyPct 0.5.

- [ ] **Step 1: Write the failing test.**

```ts
test('sample numbers come from the domain', () => {
  const v = getSampleView();
  expect(v.trades.map(t => t.net)).toEqual([44500, -25000, 32000, -3900, 67000, -27500, -500, 37000]);
  expect(v.summary).toMatchObject({ netPnl: 123600, grossPnl: 127250, fees: 3650, wins: 4, losses: 4, winRate: 0.5, expectancy: 15450 });
  expect(v.summary.profitFactor).toBeCloseTo(3.1722, 4);
  expect(v.days.map(d => d.net)).toEqual([19500, 28100, 67000, -28000, 37000]);
  expect(v.drawdown.amount).toBe(28000);
  expect(v.prop).toMatchObject({ overall: 'in-progress', drawdown: { floor: 4923600, remaining: 200000, state: 'clear' },
    tradingDays: { count: 5, met: true }, consistency: { met: false } });
  expect(v.prop.consistency!.bestDayShare).toBeCloseTo(0.5421, 4);
  expect(v.heroTickets[0]).toMatchObject({ serial: 8, side: 'buy', symbol: 'ESZ5', netPnl: '+$370.00' });
  expect(v.heroTickets.find(t => t.serial === 6)!.stamp).toBe('RULE BROKEN');
});
```

- [ ] **Step 2: Run it.** `npm test -- src/lib/landing`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. No number is typed by hand outside `SAMPLE_EXECUTIONS`.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(marketing): domain-computed landing sample`.

---

### Task 5: Landing first viewport and the file-drop signature interaction

**Files:**
- Create in `src/components/marketing/`: `order-ticket.tsx`, `side-mark.tsx`, `rubber-stamp.tsx`, `ticket-stack.tsx`, `ticket-slot-drop.tsx` (client)
- Create: `src/app/(app)/app/import/page.tsx` (client placeholder), `e2e/fixtures/sample-fills.csv`, `e2e/fixtures/not-trades.csv`, `e2e/hero.spec.ts`
- Modify: `src/app/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `getSampleView().heroTickets` (Task 4), `previewFile` and `savePendingImport` / `loadPendingImport` / `clearPendingImport` (Task 3).
- Produces:
  - `<OrderTicket model={TicketModel | PreviewTicket} variant="sample" | "yours" />`. A "yours" ticket never shows a stamp or P&L.
  - `<TicketStack>`.

**First viewport.** It matches `model-pick.html` and the contract's FIRST VIEWPORT block:
- gold ground; the h1 is exactly "FILE EVERY TRADE. FIND THE PATTERN."
- the lede: "Keel turns your broker's fills into trade tickets, stamped with your setup, your mistakes and whether you kept your rules."
- the navy ticket-slot drop, with "Build my journal"
- the fanned stack of four sample tickets, captioned "SAMPLE TICKETS"
- beneath the drop: "Any CSV with time, symbol, side, quantity and price works. How to export →", linking to `/brokers#export`

This replaces the spec's broker selector, because broker presets are deferred (backlog #11).

**Drop flow.**
1. The visitor drops a file or chooses one through the slot. The slot is a `<label>` wrapping an `<input type="file" accept=".csv,text/csv,text/plain">` and is fully keyboard-reachable.
2. `previewFile` runs.
3. The sample stack is replaced by "yours" tickets, printed one at a time: 120ms stagger, translateY and opacity, exponential ease-out. With reduced motion they appear instantly.
4. Fields that weren't guessed show "—".
5. The button becomes "Map columns and continue". It calls `savePendingImport(file)` and then routes to `/app/import`.
6. If the file can't be read, an inline alert reads "We couldn't read that file. Export your trades as CSV and try again." and the sample stack stays.

**`/app/import` placeholder:**
- It shows "Received <filename> (<KB> KB), stored only in this browser."
- Next line: "Column mapping opens with the import release."
- A "Remove file" button clears the file and shows "No file waiting."

- [ ] **Step 1: Write the failing e2e tests** in `e2e/hero.spec.ts`. `sample-fills.csv` holds Task 4's 16 fills, with headers `Date/Time,Symbol,Buy/Sell,Quantity,Price`.

```ts
test('hero shows the contract copy and labelled sample tickets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/FILE EVERY TRADE\.\s*FIND THE PATTERN\./);
  await expect(page.getByText('SAMPLE TICKETS')).toBeVisible();
  await expect(page.getByText('RULE BROKEN')).toBeVisible();
});
test('dropping a CSV prints the visitor\'s own tickets, then hands off', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/drop your broker csv/i).setInputFiles('e2e/fixtures/sample-fills.csv');
  await expect(page.getByTestId('ticket-yours')).toHaveCount(4);
  await expect(page.getByTestId('ticket-yours').first()).toContainText('ESZ5');
  await expect(page.getByText('RULE BROKEN')).toHaveCount(0);
  await page.getByRole('button', { name: 'Map columns and continue' }).click();
  await expect(page).toHaveURL(/\/app\/import$/);
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Received sample-fills\.csv/)).toBeVisible();      // Review Focus 5
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText('No file waiting.')).toBeVisible();
});
test('unreadable file shows an error and keeps the sample', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/drop your broker csv/i).setInputFiles('e2e/fixtures/not-trades.csv');
  await expect(page.getByRole('alert')).toHaveText(/couldn't read that file/);
  await expect(page.getByText('SAMPLE TICKETS')).toBeVisible();
});
```

- [ ] **Step 2: Run it.** `npm run e2e`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, page and placeholder. Hero copy and composition follow the sketch. Fonts, tokens and the craft floor apply.
- [ ] **Step 4: Run it again.** `npm run e2e`. Expected: PASS at both viewports.
- [ ] **Step 5: Commit** with `feat(marketing): landing first viewport with real CSV drop`.

---

### Task 6: Landing below the first viewport

**Files:**
- Create: `src/components/marketing/landing/*.tsx` (one file per section), `e2e/landing.spec.ts`
- Modify: `src/app/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `getSampleView()` (Task 4), `MODULES` (Task 2), `OrderTicket` and `RubberStamp` (Task 5), `formatPnl`.

Sections in order, one spacing rhythm, alternating dense and quiet:
1. **The loop.** One sample ticket (trade #6) moving through Trade → Journal → Review → Test → Trade again. Each step adds its stamp or note. Those steps carry information, so step labels are allowed here.
2. **What's inside.** The `MODULES` list as a ticket-rack composition with varied sizes, not a same-size card grid. Milestone-1 modules link to `/features/<slug>`. In-development modules (Backtesting, Replay, Mentor & Spaces, AI assistant) show an "In development" stamp.
3. **Sample week.** It shows these numbers, all from `getSampleView()`, all labelled "Sample week":
   - net P&L "+$1,236.00", with gross, fees and net shown
   - win rate "50.0%"
   - profit factor "3.17"
   - expectancy "+$154.50"
   - max drawdown "$280.00"
   - a five-day P&L strip (Mon to Fri, each day signed)
   - an equity-curve SVG drawn from `equity`

   This section has no hero-metric template: present it as a filed daily recap sheet in the world's vocabulary.
4. **Prop rules.** The sample evaluation account:
   - progress to target (41%)
   - trailing floor "$49,236.00" with "$2,000.00" remaining
   - trading days 5 of 5
   - consistency: best day 54% of profit, against a 50% limit, marked "Not met", plus a one-line explanation of what that means
5. **Questions.** Four honest answers:
   - Which brokers? Any CSV with the five columns; direct sync is on the roadmap.
   - Where does my data go? It stays in your browser in this release.
   - What does it cost? To be announced.
   - Which markets? Stocks, options, futures, forex, crypto.
6. **Closing.** A final call to action that scrolls back to the drop, with "Build my journal".

- [ ] **Step 1: Write the failing e2e test.**

```ts
test('sample week and prop numbers come from the engine', async ({ page }) => {
  await page.goto('/');
  const week = page.getByRole('region', { name: /sample week/i });
  for (const s of ['+$1,236.00', '50.0%', '3.17', '+$154.50', '$280.00']) await expect(week).toContainText(s);
  const prop = page.getByRole('region', { name: /prop rules/i });
  for (const s of ['$49,236.00', '$2,000.00', '54%', 'Not met']) await expect(prop).toContainText(s);
  await expect(page.getByText('In development')).toHaveCount(4);
});
```

- [ ] **Step 2: Run it.** `npm run e2e`. Expected: FAIL.
- [ ] **Step 3: Implement the sections.** Sections are server components. Each one is a `<section aria-labelledby>`, so the `region` role queries above work.
- [ ] **Step 4: Run it again.** `npm run e2e`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(marketing): landing story sections with live sample`.

---

### Task 7: Feature pages

**Files:**
- Create: `src/content/features.ts`, `src/app/(marketing)/features/[module]/page.tsx`, `e2e/features.spec.ts`

**Interfaces:**
- Consumes: `MODULES` (Task 2), `getSampleView()` (Task 4), `OrderTicket` (Task 5).
- Produces:
  ```ts
  export interface FeatureContent { slug: ModuleSlug; headline: string; lede: string; points: { title: string; body: string }[]; demo: 'tickets' | 'week' | 'prop' | 'none' }
  export const FEATURES: Record<ModuleSlug, FeatureContent>;
  ```
- Pages render through `generateStaticParams` over the eight slugs. An unknown slug calls `notFound()`.

**Content.** Points state only capabilities from spec §6 and §7, including the TradeZella-aligned definitions:
- the breakeven range in $ or %
- the gross/net switch
- planned and realized R
- time-of-day in 5/15/30/60-minute buckets by entry or exit
- Static, EOD and Trailing drawdown

In-development pages show the "In development" stamp and describe only the planned shape.

- [ ] **Step 1: Write the failing e2e test.**

```ts
for (const slug of ['journal', 'analytics', 'strategies', 'notebook', 'prop-firms', 'backtesting', 'replay', 'mentors'])
  test(`feature page ${slug}`, async ({ page }) => {
    const res = await page.goto(`/features/${slug}`);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (['backtesting', 'replay', 'mentors'].includes(slug)) await expect(page.getByText('In development')).toBeVisible();
  });
test('unknown feature 404s', async ({ page }) => {
  expect((await page.goto('/features/nope'))!.status()).toBe(404);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the feature content and template.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(marketing): feature pages`.

---

### Task 8: Pricing, brokers, changelog, login, signup, legal

**Files:**
- Create under `src/app/(marketing)/`: `pricing/page.tsx`, `brokers/page.tsx`, `changelog/page.tsx`, `login/page.tsx`, `signup/page.tsx`, `terms/page.tsx`, `privacy/page.tsx`
- Create: `src/content/changelog.ts`, `e2e/pages.spec.ts`

**Interfaces:**
- Consumes: `resolveInstrument`'s documented formats (for the brokers page), `MODULES`.

Page content:
- **Pricing:** "Pricing to be announced" and what's included (every milestone-1 module). No tiers or prices are invented. CTA: "Build my journal" (`/#drop`).
- **Brokers** (`#export` anchor):
  - The required columns (time, symbol, side, quantity, price) and optional ones (fees, commission, account).
  - The recognised symbol formats, taken from the registry: the futures roots list, OCC options, forex pairs, crypto pairs, stocks.
  - Generic how-to-export steps.
  - The plain line: "Direct broker sync is on the roadmap."
- **Changelog:** entries from `src/content/changelog.ts`, all true as of 2026-11-20:
  - the trading engine (trade building, metrics, prop rules)
  - metric definitions aligned with industry-standard journal definitions (don't name competitors)
  - this public site
- **Login and signup:** email and password fields, with a disabled submit button and the note "Accounts open with the app release. Until then, everything runs in your browser."
- **Terms and privacy:** draft pages. Privacy states the truth for this release: dropped files are read in the browser and stored in IndexedDB, and nothing is uploaded.

- [ ] **Step 1: Write the failing e2e test.**

```ts
for (const path of ['/pricing', '/brokers', '/changelog', '/login', '/signup', '/terms', '/privacy'])
  test(`page ${path}`, async ({ page }) => {
    expect((await page.goto(path))!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
test('auth forms are honest', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /log in/i })).toBeDisabled();
  await expect(page.getByText(/Accounts open with the app release/)).toBeVisible();
});
test('pricing invents no price', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText(/to be announced/i)).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/\$\d/);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the seven pages.
- [ ] **Step 4: Run it again.** Expected: PASS. Then confirm `npm run build` shows every marketing route as static.
- [ ] **Step 5: Commit** with `feat(marketing): pricing, brokers, changelog, auth and legal pages`.

---

### Task 9: Visual QA, Impeccable finish review, DESIGN.md (controller-led)

**Files:**
- Create: `scripts/capture.mjs` (Playwright screenshots), `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`, plus per-route captures in `.impeccable/review/routes/`
- Create (by the documenter): `DESIGN.md`, `.impeccable/design.json`

- [ ] **Step 1: Capture.** An implementer writes `scripts/capture.mjs` (system Chrome). It captures full-page `/` at 1440 and 390 into `.impeccable/review/desktop.png` and `mobile.png` with motion settled, and every other route at both widths into `.impeccable/review/routes/`. Validate that each file shows its route, then commit with `chore: capture script`.
- [ ] **Step 2: Detector.** The controller runs `impeccable detect --json "src/app/(marketing)" src/components/marketing`. One implementer fixes the mechanical findings in one batch and commits.
- [ ] **Step 3: Finish review.** The controller spawns `impeccable:impeccable-finish-reviewer` fresh, with:
  - the original request
  - the direction contract path
  - the screenshot paths, with every captured viewport marked as required
  - `model-pick.html` as the critique reference (code-led, so there is no approved comp)
  - the craft-floor path and the detector output
- [ ] **Step 4: Act on the disposition.**
  - **fix:** apply the material fixes in one batch, recapture, then send the recaptures back to the same reviewer for a verdict pass.
  - **rebuild:** redo the named regions and send them for a fresh full review.
  - **recapture:** recapture and review again.
  - **ship:** done.
  - The budget is two rounds; report anything still open.
- [ ] **Step 5: Document.** Spawn `impeccable:impeccable-documenter` with the project root, the artifact paths, the direction contract, PRODUCT.md, and the choice "new file" (no DESIGN.md exists yet). Verify that `DESIGN.md` and `.impeccable/design.json` both exist with tokens. Commit with `docs: DESIGN.md for the Trading Floor world`.
- [ ] **Step 6: Final gate.** Run `npm run lint && npm run typecheck && npm test && npm run e2e`. All green. Then hand over for the merge decision.

## Done when

- Every route in spec §6's marketing list renders statically at 390 and 1440 with no horizontal scroll, and passes its e2e test.
- A visitor's own CSV prints as tickets and survives the hand-off to `/app/import` across a reload.
- Every landing number is engine-computed and pinned by a unit test.
- The Impeccable finish reviewer returned **ship** (or the user accepted its open table), and `DESIGN.md` plus `.impeccable/design.json` exist.
- Backlog E7 and E8 are closed.
