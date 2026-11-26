# Milestone 1 · Plan 6C: Reports, dashboard and polish, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TradeZella's dashboard templates and widgets with its composite score, its prop module (finances, insights and the accounts tab), the cost method per account, the calendar image, the collapsible sidebar and Settings menu, Export PDF on Performance, and import parsing in a worker, on local data:
- dashboard templates and widgets (#46), the score (#23);
- prop finances, pass rate, breach insights and the accounts tab (#45, D3);
- cost method and calendar image (#49);
- shell polish (#50), report PDF (#51), import worker (#48).

**Architecture:**
- **Domain**, pure and test-first: the score (`src/domain/metrics/score.ts`), the cost methods (`matchLots`), the prop finance aggregates (`src/domain/prop/finance.ts`), the template operations (`src/domain/dashboard/templates.ts`) and the scatter series (`src/domain/metrics/scatter.ts`).
- **Storage:** Dexie version 4 adds `propTxns`. New optional fields on `Trade`, `Account`, `Challenge` and `UserPrefs`. A `propTxns` repository and its hooks; templates live in prefs.
- **Screens:** the dashboard becomes a widget registry rendering the template in use (`src/components/app/dashboard/widgets/`); the prop page gets three routes and a details route; the shell gets the collapse toggle; Performance gets a print layout; import planning moves to a module worker.

**Tech Stack:** unchanged from Plan 6A, with no new dependency:
- Next.js 16.4.6, React 19.3, TypeScript strict, Tailwind 4;
- TanStack Query 5, Dexie 4, Phosphor icons;
- Vitest 5 with happy-dom and fake-indexeddb;
- Playwright on system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-25-plan-6c-reports-dashboard-design.md`. It is approved; C1 to C76 and D1 to D3 are its ids. The authorities, in order:
1. **The spec,** including its corrections (§7) and its Keel's calls (§6.1).
2. **The comps,** the binding look: `.impeccable/mocks/plan6c/01-dashboard.html` to `13-prop-first-run.html` with `shell.css`, their captures in `.impeccable/mocks/plan6c/captures/`, the `?state=` variants listed in `index.html`, and `?theme=dark` on any comp.
3. **The behaviour record and the parity audit,** for behaviour only: `.superpowers/research/tradezella/plan6c-behaviour.md` and `plan6c-parity-audit.md` (git-ignored, in this worktree). The audit's 26 findings (P6C-01 to P6C-26) are fixed in the spec, the comps and this plan; module reviews check against both.
4. **`DESIGN.md`, `src/styles/theme.css` and `PRODUCT.md`.**
5. **Plan 6A** (its spec and plan) and **Plan 5,** with its rulings.

**TradeZella's record wins over every other source on behaviour,** comps and this plan included. Every control, column, field, stat, step and state must trace to the record or to a marked Keel's call.

**TradeZella's behaviour, never its UI** (the owner, 2026-11-25). "TradeZella's template" or "default" means its default set of widgets and what each one does. The layout, arrangement, look, wording and icons are Keel's own (design G and the comps). No task copies TradeZella's screen.

**Before starting:** don't build until the coordinating session says Plan 6A has landed on `m1-p6a`. Then merge `m1-p6a` into this branch (`claude/m1-p6c-6dcad9`) and build here. If 6B has landed first, Task 1 takes the next Dexie version after 6B's and its migration test opens 6B's version (C61); every "version 4" and "v3" below shifts with it.

**Execution:** one implementer at a time, never in parallel (the user's call in 6A), with a review after each module.
- Each implementer brief says: the record wins over comps on behaviour, and every control, column, field, stat, step and state must trace to the record or to a marked Keel's call.
- Each module review has two parts: the code review, and a **parity check** of that module's tasks against `plan6c-behaviour.md`, section by section (the module's "Parity check" list names the sections). It reports anything the module adds, omits or changes, against both the record and this plan.

| Module | Tasks | Record sections |
|---|---|---|
| A Foundations | 1-6 | §1.6, §2.3-2.4, §3.2-3.4, §3.6, §4 |
| B Dashboard (#46, #23) | 7-10 | §1, §2 |
| C Prop (#45, D3) | 11-14 | §3 |
| D Cost method and calendar image (#49) | 15-16 | §4, §5 |
| E Shell (#50) | 17 | §6 |
| F Report PDF (#51) | 18 | §7 |
| G Import worker (#48) | 19 | §8 |
| H Finish | 20 | all |

## Global Constraints

- **Toolchain:** Node ≥ 22, npm, Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind 4, Vitest 5, Playwright with `channel: 'chrome'`.
- **Branch and commits:** work on `claude/m1-p6c-6dcad9`, after merging `m1-p6a` into it. New BACKLOG E-ids start at E300 (6A uses E150 to E181), so the merges don't collide. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Next.js docs first.** Before route, layout or worker code, read in `node_modules/next/dist/docs/01-app/`: `03-api-reference/03-file-conventions/dynamic-routes.md`, `page.md`, `layout.md`; `03-api-reference/04-functions/use-search-params.md`; and search the docs for "Web Worker" and `new URL(` before Task 19. `params` and `searchParams` are Promises. If `next dev` rewrites AGENTS.md, commit that change with the task.
- **Boundaries:** components use only the hooks in `src/data/query/*`; nothing under `src/components` or `src/app` imports `src/data/local/*` or Dexie (tests excepted). `src/domain/**` stays pure.
- **Storage safety** (spec §3, §4.3): no existing row is rewritten on upgrade; `propTxns` starts empty; every new field is optional and defaults when unset; the sample reseeds by version, and My workspace never does. The one user-started rewrite is a cost-method change (C40).
- **Look:** the comps are binding, and real data wins over comp numbers. Design G, graphite dark, no icon tiles. Tokens through their Tailwind names; cards with `CARD`, `CARD_PAD` and `CardHeader` from `dashboard/shared.tsx`. Hue jobs: accent for what is chosen and for adherence-like measures (the score's radar, pass rate and rule tracks); green and red for signed money and kept or broken, always with a sign or a word.
- **Copy:** every label is Keel's own, as the comps write it: "Edge score" and its bands Weak (0 to 40), Building (40 to 70) and Strong (70 to 100); "Calendar image"; "Export PDF"; "Mark as breached"; "Move to funded"; "Log a payout". Never TradeZella's wording, layout, icons or emoji, nor its score's name. No em or en dashes; numeric ranges "a to b"; "None" for an empty value. Every metric carries a `MetricTip`, its text only in `src/content/metric-definitions.ts`.
- **Numbers:** tabular figures; money through `useDisplay()` so the unit and Privacy apply to widgets, chart labels, readouts, `aria-label`s, the calendar image and the print layout. The prop module reads money in its currency through `display.cash` (Privacy still masks it), as the tracker does.
- **Charts:** hand-rolled SVG in the house style, each with `role="img"`, a label carrying the range and key values, a text alternative (a visually hidden table where the chart carries several values: the radar, the breakdowns), and a hover and focus readout.
- **Phone:** the tab bar stays Dashboard, Trades, Calendar, Reports, More. Below `sm`, tables become two-line rows and dialogs full-height sheets with a fixed footer.
- **Accessibility and layout:** WCAG 2.2 AA, a visible focus ring, 44px targets on coarse pointers, a keyboard path for every action (moving a widget included). No horizontal page overflow from 390 to 1680px.
- **Motion:** only in `'use client'` leaves, through `src/lib/motion.ts`; nothing moves under reduced motion.
- **Performance,** on the sample (~1,230 trades): the default template's widgets compute together in under 100 ms after a filter change; the score under 20 ms; the prop dashboard under 50 ms with 200 challenges and 2,000 transactions; a cost-method rebuild of one account under 50 ms; no main-thread task over 50 ms while planning a 20 MB import.
- **Tests:** component tests start with `// @vitest-environment happy-dom` and `afterEach(cleanup)`; domain and data work is test-first; e2e specs start from 6A's onboarded browser state. **Playwright runs on port 3140** through a temporary config (`playwright.p6c.config.ts`, not committed: the repo's config with `webServer.port` and `use.baseURL` on 3140), so it never collides with the other plans' runs. **Never stop or restart the owner's dev server on port 3000.** Never run two `next build`s against one `.next`.
- **Verification:** before each commit, `npm test`, `npm run typecheck` and `npm run lint`; before the last commit of each module, `npm run build` and that module's e2e spec.
- **Out of scope** (spec §2): the bank link and resync (#10), economic events (#25), the Notifications, Subscription, AI settings and Connections pages, the snapshot's style image (C43), note export to PDF (#43), AI (#22).

## Review Focus

1. **The score at its edges.** A range with one trade, no losses, no drawdown, or a net loss gives a finite score from 0 to 100 and an axis readout saying why (C23). Pinned in Task 3.
2. **A cost-method change on an account with an open trade and a multi-day partial exit.** Expected: trade ids, journal fields and tags unchanged; the day each partial books moves; closed totals hold, except a pair converted at each exit's rate. Pinned in Tasks 2 and 15.
3. **Prop money counted once.** A challenge with a fee field and a linked fee transaction of the same category counts the transaction only (C28); an ignored row never counts; the sign decides spent or earned (C60). Pinned in Task 4.
4. **A template saved in one tab while another tab edits.** Expected: the later save wins whole, and the other tab's menu shows it after refetch; a template whose widget key is unknown (a later version's) skips that widget instead of crashing. Pinned in Tasks 5 and 10.
5. **Privacy everywhere new.** No amount shows in the widgets, the radar's readout, the prop dashboard, the calendar image or the print layout; counts, rates and the score stay. Pinned in Tasks 8, 9, 14, 16 and 18.

## Calls this plan makes (builder level)

These settle what the spec left to the builder (§8). Reviewers should not "fix" them.

| Question | Call |
|---|---|
| Where the cost method reaches `realizations` | `Trade.costMethod?: CostMethod`, stamped by the builder from the account (unset reads FIFO). `realizations(trade)` and `sizedRealizations(trade)` read it, so their signatures don't change |
| The rebuild | `accounts.setCostMethod(ws, accountId, method)`: one Dexie transaction that writes the account, then re-finalizes each of its trades from its stored executions with the new method, keeping every other field. Imports and manual trades read the account's method at build time; an undo restores the stored rows, then re-finalizes them the same way |
| The score's fixture | `src/domain/metrics/__fixtures__/forex-2026-11-02.csv`: the nine 2 Nov fills of the forex sample file, read in America/New_York with the execution mapping. Pinned to the method's own 76.44 ±0.01 and within ±0.2 of TZ's 76.3 (C59). If it misses, stop and report the parts; don't tune a curve to fit |
| Standard deviation in consistency | Population (divide by n): it reproduces the 2 Nov reading of 67 (sample deviation gives 62) |
| The lower grid | CSS grid, 3 columns from `xl` (2 from `md`, 1 below), `grid-auto-flow: dense`; a `wide` widget (the advanced and yearly calendars) spans 2 columns and 2 rows, so the next two widgets stack beside it, as comp 01 shows |
| Widget data | One hook, `useWidgetData(keys)`, computes only the series the template's widgets need from one filtered trade set, so a template without scatters never builds them |
| Template ids | `crypto.randomUUID()`; the default template's id is `main` and is rebuilt from code while the pref is unset |
| A template with an unknown key | Skipped on render and kept on save, so a newer build's widget survives an older one |
| Mark as breached, existing breached challenges | They read as reason "other" with their free text, and their status can't change back (C33, §6.3) |
| Pass rate's "passed" | `status === 'passed'` or `phase === 'funded'` with no breach (C32) |
| Straight to funded | `challengeType(c)`: `'s2f'` when no evaluation phase has an account or a start date and the phase is funded; else `'1-step'` or `'2-step'` from `steps` (C30). Nothing new is stored |
| The radar with no drawdown | The score counts recovery 0; the radar plots it at 100 (`plotted`), as TZ's 2 Nov figure shows (INFERRED) |
| Breach date when Keel's check found none | The day it is marked, in the profile zone (C34) |
| Account size | The first phase account's `startingBalance`; buckets by exact amount, labelled compactly ("$50,000") |
| Prop filters | Page-local, in the URL (`firm`, `phase`, `status`, `size`, `type`, `strategy`), with a popover like More filters; the global date chip applies (C37) |
| Calendar image canvas | `OffscreenCanvas` where present, else a `<canvas>`; 2x scale; fonts awaited through `document.fonts.ready` before drawing |
| Clipboard support | `'ClipboardItem' in window && navigator.clipboard?.write`; otherwise the Copy button is replaced by the line, never shown disabled (C46) |
| Sidebar state on first load | Read from prefs; until prefs load, expanded (no flash on the common case) |
| Print | `window.print()`; the print layout is the Performance page under `@media print` plus a header block that only prints (`print:block hidden`). The print rules live in one stylesheet shared with 6B's note PDF (C52): if 6B has landed, extend its file; else create it where 6B's plan names it |
| Worker build | `new Worker(new URL('../../lib/import/plan.worker.ts', import.meta.url), { type: 'module' })`, as the Next docs describe; the fallback when `typeof Worker === 'undefined'` |

## File map

```
src/domain/            (modified) types.ts trade-builder.ts
src/domain/metrics/    score.ts scatter.ts   (+ tests, __fixtures__/forex-2026-11-02.csv)   (modified) realized.ts streaks.ts
src/domain/prop/       finance.ts   (+ test)   (modified) challenge.ts
src/domain/dashboard/  templates.ts widgets.ts   (+ tests)
src/data/local/        prop-txns.ts   (modified) db.ts schema.ts prefs.ts accounts.ts challenges.ts imports.ts local-repository.ts migration.test.ts
src/data/              widget-data.ts prop-finance.ts   (modified) repository.ts dashboard.ts
src/data/query/        (modified) keys.ts hooks.ts derived.ts
src/data/seed/         prop.ts   (modified) generate.ts version.ts
src/content/           (modified) metric-definitions.ts
src/lib/               calendar-image.ts   import/plan.worker.ts import/plan-client.ts   (modified) decode.ts
src/components/app/dashboard/      dashboard-view.tsx (rewritten) template-menu.tsx edit-mode.tsx widget-picker.tsx
                                   widgets/{registry.ts,frame.tsx,upper.tsx,score.tsx,charts.tsx,calendars.tsx,lists.tsx}
                                   (deleted) plan-card.tsx mistakes-card.tsx performance-card.tsx drilldown.tsx (D2; keep what other pages import)
src/components/charts/             scatter-chart.tsx radar-chart.tsx split-bar.tsx
src/components/app/prop/           prop-tabs.tsx prop-dashboard.tsx accounts-tab.tsx challenge-details.tsx transactions.tsx
                                   log-payout.tsx mark-breached.tsx prop-filters.tsx prop-first-run.tsx   (modified) prop-view.tsx challenge-card.tsx challenge-form.tsx
src/components/app/calendar/       snapshot-panel.tsx   (modified) calendar-view.tsx
src/components/app/settings/       (modified) accounts.tsx account-dialog.tsx settings-nav.tsx
src/components/app/                (modified) sidebar.tsx app-shell.tsx top-bar.tsx
src/components/app/reports/        (modified) performance.tsx   print-header.tsx
src/components/app/import/         (modified) import-flow.tsx
src/app/(app)/app/     prop-firms/{page,accounts/page,accounts/[id]/page,transactions/page}.tsx   (modified) settings/layout.tsx
src/app/               (modified) globals.css (print rules)
e2e/                   dashboard-templates.spec.ts prop.spec.ts cost-method.spec.ts shell.spec.ts   (modified) dashboard.spec.ts import.spec.ts
docs/BACKLOG.md docs/research/tradezella-feature-map.md DESIGN.md PRODUCT.md .impeccable/surfaces/src-app-app-app-dashboard-page-tsx.md   (modified)
```

---

## Module A: Foundations

### Task 1: Types and storage version 4

Delivers spec §4.3.

**Files:**
- Modify: `src/domain/types.ts`, `src/data/local/db.ts`, `src/data/local/schema.ts`, `src/data/local/prefs.ts`
- Test: `src/data/local/migration.test.ts`, the prefs validation tests

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export type CostMethod = 'fifo' | 'lifo' | 'average';
  // Account: add   costMethod?: CostMethod;
  // Trade:   add   costMethod?: CostMethod;   // stamped at build; unset reads FIFO
  export type BreachReason = 'max-drawdown' | 'overtrading' | 'time-pressure' | 'risk-management' | 'other';
  // Challenge: add (steps stay 1 | 2; straight to funded is derived, C30)
  //   strategyIds?: string[]; breachReason?: BreachReason; breachedOn?: string /* YYYY-MM-DD */;
  export type PropTxnCategory = 'payout' | 'evaluation-fee' | 'activation-fee' | 'reset-fee' | 'affiliate-income' | 'uncategorized';
  export type PropTxnStatus = 'not-reviewed' | 'reviewed' | 'ignored';
  export interface PropTxn { id: string; workspaceId: string; date: string; description?: string; firm: string;
    challengeId?: string; category: PropTxnCategory; amount: Cents /* − cost, + income; base currency, C58 */; status: PropTxnStatus }
  export type WidgetKey =
    | 'net-pnl' | 'balance-pnl' | 'trade-win' | 'profit-factor' | 'day-win' | 'win-loss-ratio' | 'expectancy'
    | 'day-streak' | 'trade-streak' | 'streaks' | 'max-drawdown' | 'avg-drawdown'
    | 'score' | 'cum-pnl' | 'win-avg' | 'trade-time' | 'trade-duration' | 'daily-pnl' | 'daily-cum' | 'recent'
    | 'calendar' | 'balance' | 'drawdown' | 'challenge' | 'calendar-mini' | 'calendar-adv' | 'progress' | 'report' | 'year';
  export interface WidgetSettings { time?: 'entry' | 'exit'; metrics?: string[] /* ≤ 3 Performance series ids */; challengeId?: string }
  export interface WidgetRef { key: WidgetKey | string; settings?: WidgetSettings }
  export interface DashTemplate { id: string; name: string; upper: WidgetRef[]; lower: WidgetRef[] }
  // UserPrefs: add
  //   dashboards?: { inUse: string; templates: DashTemplate[] };
  //   sidebar?: 'expanded' | 'collapsed';  propLayout?: 'grid' | 'list';
  //   propStart?: Record<string /* workspaceId */, { answer?: 'own' | 'prop' | 'both'; done: true }>;  // the prop first run (C71)
  ```
- Produces, in `db.ts`: `this.version(4).stores({ propTxns: '[workspaceId+id], workspaceId, [workspaceId+date]' })`, with no upgrade function, and a typed `propTxns` table. `schema.ts`: `DATA_TABLES` gains `'propTxns'`.
- Prefs validation: `dashboards.templates` non-empty, each `name` 1 to 40 characters, `upper.length <= 5`, `inUse` names one of them; `sidebar` and `propLayout` one of their values; else RangeError.

- [ ] **Step 1: Write the failing tests** in `migration.test.ts`: `'v3 to v4 keeps every v3 row and adds an empty propTxns'` (open a v3 database with rows in both workspaces in every v3 table, upgrade, deep-equal each row, `propTxns` count 0). Prefs: `update({ dashboards: { inUse: 'x', templates: [] } })` throws; six upper widgets throw; a 41-character name throws; `sidebar: 'wide'` throws.
- [ ] **Step 2:** `npm test -- src/data/local`. Expected: FAIL.
- [ ] **Step 3:** Implement the types, version 4, `DATA_TABLES` and the validation.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): storage version 4, prop transactions and the 6C fields (#45, #46, #49, #50)`.

### Task 2: Cost methods in the builder and the realizations (test-first)

Delivers spec §5.4, C39 to C42 and the builder call above.

**Files:**
- Modify: `src/domain/trade-builder.ts`, `src/domain/metrics/realized.ts`
- Test: `src/domain/trade-builder.test.ts`, `src/domain/metrics/realized.test.ts`

**Interfaces:**
- Produces: `matchLots(lots, closeQty, exitPrice, pointValue, sign, method: CostMethod = 'fifo')`, same return. FIFO consumes from the front, LIFO from the back; `average` first collapses the open lots into one lot at their quantity-weighted average price (fees and `origQty` shared pro rata), then consumes it.
- Produces: `BuildOptions.costMethodOf?: (accountId: string) => CostMethod`; `buildTrades` stamps `trade.costMethod` (omitted for FIFO) and matches with it. `finalizeTrade(trade: Trade, method: CostMethod): Trade` exported for the rebuild (re-runs `finalize` on the stored executions; keeps every non-derived field).
- `realizations(trade)` and `sizedRealizations(trade)` read `trade.costMethod ?? 'fifo'`.

- [ ] **Step 1: Write the failing tests.**
  - `'the help example: 100 at $10, 100 at $15, sell 100 at $20'`: realized gross $1,000 under FIFO, $500 under LIFO, $750 under average (help 6826141's $12.50 cost).
  - `'a flat-to-flat trade has the same total under every method'` for a stock with three entries and two exits.
  - `'a reversal closes and opens a new trade under every method'` (C41).
  - `'USDJPY with two entries and two exits: the closed total depends on the method'` (each exit converted at its own price): FIFO and LIFO totals differ, and the trade's `gross` and the sum of `realizations` agree under each.
  - `'average: an exit does not change the average'` (C42): buy 10 at 100, buy 10 at 110, sell 5, buy 5 at 120; the second exit's cost is (15×105 + 5×120)/20.
  - `'buildTrades stamps costMethod from costMethodOf and omits FIFO'`.
- [ ] **Step 2:** `npm test -- src/domain`. Expected: FAIL.
- [ ] **Step 3:** Implement. The existing FIFO tests must pass unchanged.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): FIFO, LIFO and average cost per account (#49)`.

### Task 3: The score (test-first)

Delivers spec §5.2, C21 to C26 and C59.

**Files:**
- Create: `src/domain/metrics/score.ts`, `src/domain/metrics/score.test.ts`, `src/domain/metrics/__fixtures__/forex-2026-11-02.csv`

**Interfaces:**
- Produces:
  ```ts
  export type ScorePart = 'winRate' | 'profitFactor' | 'winLoss' | 'recovery' | 'drawdown' | 'consistency';
  export const SCORE_WEIGHTS: Record<ScorePart, number> = { profitFactor: .25, winLoss: .2, drawdown: .2, winRate: .15, recovery: .1, consistency: .1 };
  export interface ScoreResult { total: number /* 0..100, 2 dp */; parts: Record<ScorePart, { raw: number | null; score: number; plotted: number /* what the radar draws */; why?: 'no-losses' | 'no-drawdown' | 'net-loss' }> }
  export function ratioScore(r: number): number;      // under 1.8: max(20, r × 100/3); from 1.8: the help's bands
  export function recoveryScore(r: number | null): number;
  export function winRateScore(pct: number): number;  // min(100, pct / 60 × 100)
  export function scoreOf(trades: readonly Trade[], ctx: MetricContext): ScoreResult | null; // null: no closed trade
  ```
- Bands (C21), linear inside each: `ratioScore`: ≥ 2.6 → 100; [2.4, 2.6) → 90 to 99; [2.2, 2.4) → 80 to 89; [2.0, 2.2) → 70 to 79; [1.9, 2.0) → 60 to 69; [1.8, 1.9) → 50 to 59; under 1.8, `max(20, r × 100 / 3)` (TZ's readings, rec §2.4). The step down at 1.8 is kept. `recoveryScore`: null (no drawdown) → 0; ≥ 3.5 → 100; [3.0, 3.5) → 70 to 89; [2.5, 3.0) → 60 to 69; [2.0, 2.5) → 50 to 59; [1.5, 2.0) → 30 to 49; [1.0, 1.5) → 1 to 29; < 1.0 → 0.
- Raw values: profit factor and win/loss on the trader's basis (`pnlBasis`) over closed trades; no losses → score 100, `why: 'no-losses'`. Max drawdown on the daily net curve (as `maxDrawdown`, E70): the largest peak-to-trough drop over the highest cumulative P&L before it, as a %; score `clamp(100 − %, 0, 100)`; no drop → 100; a drop from a peak ≤ 0 → 0. Recovery = net over the max drawdown in money; with no drawdown it scores 0 and `plotted` is 100 (INFERRED, rec §2.4); every other part's `plotted` equals its `score`. Consistency: net < 0 → 0 (`why: 'net-loss'`); else `clamp(100 − 100 × popStdev(trade nets) / net, 0, 100)`. The score ignores `ctx.unit` (it reads money, rec §2.2).

- [ ] **Step 1: Write the failing tests.**
  - `ratioScore`: 1.20 → 40; 1.21 → 40.33 (±0.01); 1.45 → 48.33; 0.5 → 20; 1.79 → 59.67; 1.8 → 50 (the help's step, kept); 1.85 → 55; 2.3 → 85; 2.6 → 100; 4.36 → 100.
  - `winRateScore`: 25 → 41.67; 49.79 → 82.98; 42.47 → 70.78; 75 → 100.
  - `recoveryScore`: null → 0; 0.9 → 0; 1.0 → 1; 3.49 → 89 (±0.1); 3.5 → 100; 4.04 → 100.
  - `'the 2 Nov forex trades score 76.44, within 0.2 of TradeZella's 76.3'`: build the fixture (import it with the generic execution mapping, zone America/New_York); total 76.44 ±0.01 and |total − 76.3| ≤ 0.2; parts: winRate 100, profitFactor 100, winLoss 48.48 (±0.05), drawdown 100, recovery score 0 with `why: 'no-drawdown'` and `plotted` 100, consistency 67.48 (±0.05).
  - `'a net loss scores consistency 0'`; `'no losses: profit factor 100, why no-losses'`; `'the unit does not change the score'` (same result with `unit: 'pips'`); `'no closed trade: null'`; `'every total is within 0 to 100'` over random trade sets.
  - `'the sample scores in under 20 ms'` (1,230 trades, after one warm-up run).
- [ ] **Step 2:** `npm test -- score`. Expected: FAIL.
- [ ] **Step 3:** Implement. If the fixture misses, stop and report the parts; don't change a curve to fit.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): the composite score, TradeZella's method in Keel's terms (#23)`.

### Task 4: Prop finance aggregates (test-first)

Delivers spec §5.3's figures, C27, C28, C30 to C34, C36, C37 and C60.

**Files:**
- Create: `src/domain/prop/finance.ts`, `src/domain/prop/finance.test.ts`

**Interfaces:**
- Consumes: `PropTxn`, `Challenge`, `Account`, `checkChallenge`'s balances.
- Produces:
  ```ts
  export type ChallengeType = '1-step' | '2-step' | 's2f';
  export function challengeType(c: Challenge): ChallengeType; // C30
  export interface PropFilters { firm?: string[]; phase?: 'evaluation' | 'funded'; status?: 'active' | 'breached';
    size?: number[] /* cents */; type?: ChallengeType[]; strategy?: string[]; range?: { from?: string; to?: string } }
  export interface Money { spent: Cents /* ≥ 0 */; earned: Cents; net: Cents }
  export function spendItems(challenges: readonly Challenge[], txns: readonly PropTxn[]): PropTxn[]; // txns not ignored, plus synthetic fee items for challenge fee fields with no linked txn of that category (C28), dated the first phase start
  export function totals(items: readonly PropTxn[]): Money & { roi: number | null /* net / spent */; payouts: number };
  export function roiSeries(items: readonly PropTxn[], window: '1w' | '1m' | '1y', end: string): { date: string; income: Cents; costs: Cents; net: Cents }[];
  export function breakdown(items: readonly PropTxn[], challenges: readonly Challenge[], accounts: readonly Account[],
    by: 'firm' | 'type' | 'size' | 'fee'): { key: string; label: string; spent: Cents; earned: Cents; net: Cents; count: number }[];
  export function passRates(challenges: readonly Challenge[], accounts: readonly Account[],
    by: 'firm' | 'type' | 'size' | 'strategy'): { overall: { passed: number; attempted: number }; rows: { key: string; label: string; passed: number; attempted: number }[] };
  export function breachInsights(challenges: readonly Challenge[], accounts: readonly Account[], trades: readonly Trade[], ctx: MetricContext,
    which: 'evaluation' | 'funded'): { reasons: { reason: BreachReason; count: number; share: number }[]; avgDays: number | null;
    avgPnl: Cents | null; commonSize: number | null; commonFirm: string | null };
  export function filterChallenges(cs: readonly Challenge[], accounts: readonly Account[], f: PropFilters): Challenge[];
  export function accountSize(c: Challenge, accounts: readonly Account[]): Cents | null; // first phase account's startingBalance (C31)
  ```
- Rules: the sign decides (C60); ignored rows never count; transactions are in the base currency, and balances of accounts in other currencies are left out and counted (C58); `type` labels "1-step", "2-step" and "Straight to funded"; `fee` breakdown groups negative amounts by category; pass rate counts evaluations with an outcome, passed = `status 'passed'` or phase funded and not breached (C32); a breach's days = `breachedOn` − its phase's `startDate`, P&L = that phase account's net from start to `breachedOn` (C34); ties in reasons, size and firm go to the most recent `breachedOn`; the range filters txns by `date` and challenges by their first start (C37).

- [ ] **Step 1: Write the failing tests** with the comps' sample (`04-prop-dashboard.html`): five challenges and the transactions of comp 07.
  - `totals`: spent 185200, earned 450000, net 264800, roi 1.43 (±0.001), payouts 2.
  - `'an ignored row never counts'` (the +$165.00 refund marked ignored); `'a positive fee row is earned'`; `'an uncategorized cost is spent'`.
  - `'a fee field counts once'`: a challenge with `evaluationFee` 16500 and no linked evaluation-fee txn adds 16500; adding a linked txn of −16500 leaves spent unchanged.
  - `breakdown('firm')`: A net +356200, B −88500, C −2900; `breakdown('fee')`: evaluation 154000, activation 8500, reset 19800, uncategorized 2900.
  - `passRates('firm')`: overall 1 of 3; A 1 of 2; B 0 of 1; an active challenge is not counted.
  - `breachInsights('evaluation')`: two reasons at 0.5 each, avgDays 13, avgPnl −224625, commonSize 5000000, commonFirm 'Sample firm B' (tie, latest breach); `'funded'` returns empty reasons and nulls.
  - `roiSeries('1y', '2026-11-25')`: last point income 450000, costs 185200, net 264800; points are cumulative.
  - `'200 challenges and 2,000 transactions in under 50 ms'`.
- [ ] **Step 2:** `npm test -- finance`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): prop finances, pass rate and breach insights (#45)`.

### Task 5: Templates, the widget catalogue and the scatter series (test-first)

Delivers spec §5.1's data, C1 to C8, C10, C14 to C19.

**Files:**
- Create: `src/domain/dashboard/templates.ts`, `src/domain/dashboard/widgets.ts`, `src/domain/metrics/scatter.ts` (+ tests)
- Modify: `src/domain/metrics/streaks.ts`

**Interfaces:**
- Produces, `widgets.ts`: `WIDGETS: Record<WidgetKey, { section: 'upper' | 'lower'; size: 'third' | 'wide'; metric: MetricId }>` (the 12 upper and 17 lower keys of Task 1; `calendar-adv` and `year` wide); `isWidgetKey(k: string): k is WidgetKey`.
- Produces, `templates.ts`:
  ```ts
  export const DEFAULT_TEMPLATE: DashTemplate; // id 'main', name 'Main'. TradeZella's default set of widgets in comp 01's (Keel's) order:
  // upper: net-pnl, trade-win, profit-factor, day-win, win-loss-ratio;
  // lower: score, progress, cum-pnl, daily-pnl, recent, balance, calendar-adv, drawdown, trade-time, trade-duration (C5)
  export function templatesOf(prefs: UserPrefs): { inUse: DashTemplate; all: DashTemplate[] };
  export function addWidget(t: DashTemplate, section: 'upper' | 'lower', ref: WidgetRef): DashTemplate; // throws when upper has 5 or the key is already on t (C6)
  export function removeWidget(t: DashTemplate, section: 'upper' | 'lower', index: number): DashTemplate;
  export function moveWidget(t: DashTemplate, section: 'upper' | 'lower', from: number, to: number): DashTemplate;
  export function newTemplate(from: DashTemplate, name: string, id: string): DashTemplate; // a copy of the template in use (C2)
  export function deleteTemplate(all: DashTemplate[], id: string): DashTemplate[]; // throws on the last one
  export function missingFrom(t: DashTemplate, section: 'upper' | 'lower'): WidgetKey[]; // the picker's list, in catalogue order
  ```
- Produces, `scatter.ts`: `scatterPoints(trades, ctx, axis: 'entry' | 'exit' | 'duration'): { tradeId: string; x: number /* minutes of day, or log10 minutes */; pnl: Cents }[]` over closed trades in the profile zone; `DURATION_TICKS = ['4m','8m','15m','30m','1h','2h','4h','7h','14h','1d','2d','4d']`.
- Produces, `streaks.ts`: `winStreak(items: readonly { pnl: Cents }[]): number` (C16: the number of wins in a row ending at the last item; 0 when the last is not a win; a breakeven ends a run).

- [ ] **Step 1: Write the failing tests:** the default template's two lists exactly as C5; `addWidget` throwing at six upper and on a duplicate; `moveWidget` round trips; `deleteTemplate` refusing the last; `newTemplate` copying widgets and settings with a new id; `templatesOf` falling back to `DEFAULT_TEMPLATE` with no pref and skipping nothing (unknown keys stay); `missingFrom` order; `scatterPoints` entry and exit minutes in New York for a trade opened 09:31 and closed 10:05 ET; durations as log10 minutes; `winStreak`: 3 for win, win, win; 0 when the last is a loss or breakeven; 1 for loss, win.
- [ ] **Step 2:** `npm test -- dashboard scatter streaks`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): dashboard templates, the widget catalogue and scatter series (#46)`.

### Task 6: Repositories, hooks and seed v6

Delivers the storage paths of spec §4.3, C40, C57.

**Files:**
- Create: `src/data/local/prop-txns.ts`, `src/data/seed/prop.ts`, `src/data/widget-data.ts`, `src/data/prop-finance.ts`
- Modify: `src/data/repository.ts`, `src/data/local/{accounts,challenges,imports,local-repository}.ts`, `src/data/query/{keys,hooks,derived}.ts`, `src/data/seed/{generate,version}.ts`, `src/data/local/context.ts`
- Test: the matching `*.test.ts`

**Interfaces:**
- Produces repository methods: `propTxns.{list(ws), add(ws, input), update(ws, id, patch), remove(ws, id)}`; `accounts.setCostMethod(ws, id, method)` (the one-transaction rebuild); `challenges.markBreached(ws, id, { reason, note?, on })` (refuses a breached challenge, writes `status`, `breachReason`, `failureReason` for other, `breachedOn`); `challenges.update` refuses any status change on a breached challenge.
- Produces hooks: `usePropTxns()`, `useAddPropTxn()`, `useUpdatePropTxn()`, `useRemovePropTxn()`, `useLogPayout()` (adds a payout txn linked to the funded challenge, C29), `useMarkBreached()`, `useSetCostMethod()`, `usePropFinance(filters, view)` (Task 4's functions over the workspace's data), `useWidgetData(keys: WidgetKey[])`.
- Invalidation: a trade, account, cash flow, challenge or prop transaction write invalidates the widget and prop keys that read it.
- Imports read the account's method (`costMethodOf` from the accounts); an undo re-finalizes restored trades with the current method.
- Seed v6 (C57): `SAMPLE_SEED_VERSION = 6`; `seed/prop.ts` writes the five challenges' extra fields and the transactions of comp 07 on new random streams, so every existing sample value is unchanged.

- [ ] **Step 1: Write the failing tests:** `'a cost-method rebuild of the sample's largest account takes under 50 ms'`; `setCostMethod` keeps ids, tags, notes, strategy ids, ratings and `importId` of every trade and changes only `costMethod`, `gross`, `net` and derived fields; it refuses an archived account; `markBreached` refuses a second breach and `update` refuses unbreaching; `useLogPayout` writes `{ category: 'payout', amount: +, challengeId }`; the seed v6 test asserts every v5 sample value is unchanged and the prop txns exist; an undo restoring trades with a LIFO account re-finalizes them under LIFO.
- [ ] **Step 2:** `npm test -- src/data`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): prop transactions, the cost-method rebuild, breach writes and seed v6 (#45, #49)`.

**Parity check, Module A** (record §1.6, §2.3 to 2.4, §3.2 to 3.4, §3.6, §4): the score's weights, threshold and bands; the transaction fields, categories and statuses; ignored rows; the breach reasons and their permanence; the three cost methods and their definitions; nothing stored that the record or a C call doesn't name.

---

## Module B: Dashboard (#46, #23)

### Task 7: The widget frame, the registry and the template in use

Delivers spec §5.1 (page) and D2.

**Files:**
- Create: `src/components/app/dashboard/widgets/{registry.ts,frame.tsx}`
- Modify: `src/components/app/dashboard/dashboard-view.tsx` (rewritten), `src/components/app/top-bar.tsx`
- Delete: `plan-card.tsx`, `mistakes-card.tsx`, `performance-card.tsx`, `drilldown.tsx` and their tests, unless another page imports them (`grep -rn` first; keep a shared piece where it is imported, moved to its user)
- Test: `dashboard-view.test.tsx` (rewritten), `e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `templatesOf`, `WIDGETS`, `useWidgetData`, 6A's `ProgressCard`.
- Produces: `WidgetFrame({ widgetKey, title, caption?, tip, end?, children })` (the card with its header, MetricTip, loading skeleton and empty state); `WIDGET_RENDER: Record<WidgetKey, (props: { settings?: WidgetSettings }) => JSX.Element>` filled by Tasks 8 and 9 (a placeholder frame until then).
- The page: the last-import line (Plan 5's `LastImport`, kept; no resync), the upper strip (5 columns from `lg`, 3 from `md`, 2 below), then the lower grid (the builder call's dense grid). The top bar gains the template button (an icon button, "Dashboard template: {name}", beside Plan the day, comp 01). The currency switch stays (C58) and feeds every widget.

- [ ] **Step 1: Write the failing tests:** with no pref, the page renders the default template's 15 widgets in order (by `data-widget` attributes); a pref template renders its own; an unknown key is skipped; "Your plan", "Mistakes" and "Performance" are gone; the template button names the template in use; `'the default template's data computes in under 100 ms on the sample'` (`useWidgetData`'s pure core, after a warm-up).
- [ ] **Step 2:** `npm test -- dashboard`. Expected: FAIL.
- [ ] **Step 3:** Implement; move 6A's progress card into `WIDGET_RENDER.progress`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): the dashboard renders its template; Keel's own cards retire (#46, D2)`.

### Task 8: The upper widgets

Delivers the twelve upper widgets (spec §5.1 mapping, C16 to C18, C67).

**Files:**
- Create: `src/components/app/dashboard/widgets/upper.tsx`, `src/components/charts/split-bar.tsx`
- Modify: `src/content/metric-definitions.ts`
- Test: `widgets/upper.test.tsx`

**Interfaces:** each upper key renders a figure and its MetricTip label, as comps 01 and 03, with only what TradeZella's widget shows: net P&L with the trade count; balance and P&L (C17); trade win rate with a split bar and won, breakeven and lost; profit factor with a split bar of gross profit against loss, no amounts; day win rate with green, flat and red days; average win to loss with both amounts; expectancy; day streak, trade streak, and both, counting winning runs only (C16); max drawdown in $ and % with its date; average drawdown, or today's drawdown with no range (C18).

- [ ] **Step 1: Write the failing tests:** each widget's figure on a fixed trade set (the sample's 1,226 closed trades: +$17,010.80 net, 597 won, 0 breakeven, 629 lost, 48.7%; 74 green, 0 flat, 53 red days); the streaks read 0 after a losing last day; no fees line and no profit-factor amounts; a narrowing unit narrows them and the balance widgets show their unit empty state; Privacy masks every amount and the profit factor and ratio; no trades shows "None".
- [ ] **Step 2:** `npm test -- upper`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): the dashboard's upper widgets (#46)`.

### Task 9: The lower widgets, the score widget among them

Delivers the seventeen lower widgets (spec §5.1 mapping, §5.2 widget, C10 to C15, C19, C20, C22).

**Files:**
- Create: `src/components/app/dashboard/widgets/{score.tsx,charts.tsx,calendars.tsx,lists.tsx}`, `src/components/charts/{scatter-chart.tsx,radar-chart.tsx}`
- Test: `widgets/lower.test.tsx`

**Interfaces:**
- `score`: the radar (six axes clockwise from the top: win rate, profit factor, win to loss, recovery, drawdown, consistency; five rings; each axis at its `plotted` value; no visible axis values), the total with up to two decimals, its band word, a neutral 0 to 100 track with a marker, and a hidden table of the parts; the hover and focus readout gives each part's score and `why`.
- `cum-pnl`, `daily-pnl`, `daily-cum` (bars and a line, the whole range), `win-avg` (C14: x is the time of day; the running win rate, average win and average loss after each closed trade in order of exit time), `balance` (balance on the left scale and net deposits and withdrawals on the right, C75; with no starting balance, a prompt linking to Settings > Accounts), `drawdown` (the chart only): `ReportChart` or `DrawdownCard` bodies.
- `trade-time` (an Entry or Exit switch stored in `settings.time`), `trade-duration`: `ScatterChart`, both axes rescaled to the range's trades, filled dots above zero and hollow below, a readout naming the trade, a click opening it.
- `recent`: `RecentTrades`, with its tabs and rows and no header link. `challenge`: `ChallengeCard` compact, `settings.challengeId` or the most urgent active. `report`: the Performance slot body with `settings.metrics`. `calendar` (net only), `calendar-mini` (6A's `MiniCalendar`, a day opens the Day view), `calendar-adv` (`MonthGrid` with Stats shown and the Snapshot button of Task 16), `year` (`YearGrid`, a month opens `/app/calendar`). `progress`: Task 7.
- The calendars ignore the date range (rec §1.4); the score ignores the unit.

- [ ] **Step 1: Write the failing tests:** the score widget shows 63.73-style decimals (drop trailing zeros), the band word, no visible axis values, and the hidden table; with no drawdown the recovery axis plots at 100 while the total counts 0; with no trades its empty state; the balance widget's no-starting-balance prompt; the win-avg widget's x axis is time of day; the scatter switch writes `settings.time`; the calendars keep the month under a one-day range; the report widget refuses a fourth metric; every chart has `role="img"` and a label.
- [ ] **Step 2:** `npm test -- lower`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): the dashboard's lower widgets and the Edge score (#46, #23)`.

### Task 10: The template menu and edit mode

Delivers spec §5.1 controls, C2, C3, C6, C8 (comps 01 `?state=menu`, 02, 02 `?state=picker`).

**Files:**
- Create: `src/components/app/dashboard/{template-menu.tsx,edit-mode.tsx,widget-picker.tsx}`
- Test: `edit-mode.test.tsx`, `e2e/dashboard-templates.spec.ts`

**Interfaces:**
- The menu: the templates with the one in use checked, an Edit control each, New template (asks a name, copies the template in use).
- Edit mode replaces the top bar with the name field, the move hint, Delete template (confirmed; absent on the last template), Cancel and Save template. No reset control (TradeZella has none). Each widget shows its bar (grip, Move earlier, Move later, Remove) over a dimmed body; empty upper places and the lower section's end show Add a widget, which opens the picker (only the section's widgets not on the template, each with Add). Drag with a pointer; the arrows for the keyboard; leaving with changes asks (C8).
- Phone: the menu is a sheet; edit mode is a full-height sheet of two lists with move up and down.

- [ ] **Step 1: Write the failing tests:** add, remove, move by keyboard, rename, save and switch; Delete is refused on the last template; the picker never lists a widget already on the template; the picker greys the upper section at five; Cancel drops the draft; the e2e spec edits, saves, reloads and finds the layout, then switches templates.
- [ ] **Step 2:** `npm test -- edit-mode`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test -c playwright.p6c.config.ts e2e/dashboard-templates.spec.ts e2e/dashboard.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): dashboard templates: the menu, edit mode and the widget picker (#46)`.

**Parity check, Module B** (record §1, §2): the 12 and 17 widgets and what each shows (nothing more), the upper limit of five, the default set of widgets (its arrangement is Keel's), the menu and edit mode's controls, the widgets' unit and range behaviour, the score's six axes, decimals, unit independence and empty state. Report any widget, control or state with no source.

---

## Module C: Prop (#45, D3)

### Task 11: Routes, tabs and the accounts tab

Delivers spec §5.3 Accounts, C30, C33, C35, C62 to C64 (comps 05, `?state=grid`, `?state=menu`, `?state=breach`).

**Files:**
- Create: `src/app/(app)/app/prop-firms/{accounts/page,transactions/page}.tsx`, `src/components/app/prop/{prop-tabs.tsx,accounts-tab.tsx,mark-breached.tsx}`
- Modify: `src/app/(app)/app/prop-firms/page.tsx` (Dashboard), `prop-view.tsx` (becomes the grid), `challenge-card.tsx`, `challenge-form.tsx`
- Test: `accounts-tab.test.tsx`, `mark-breached.test.tsx`, `challenge-form.test.tsx`

**Interfaces:**
- Tabs Dashboard, Accounts, Transactions (no counts, C73); Log payout and New challenge beside them. The display menu is hidden on prop pages (C72).
- Accounts: sub-tabs Evaluations, Funded, Breached with counts (C62); List or Grid (`propLayout`), both showing balance, start date and the linked trading account (C63); a row menu: View details, Move to funded (Plan 5's pass action, after a confirmation), Mark as breached, Edit, Delete (confirmed).
- Mark as breached: the five reasons with none chosen, other with a text field, the note that a breach is final; the button stays disabled until a reason is chosen; writes through `useMarkBreached`.
- The form: Strategies (several), Broker (fills created accounts), Quantity 1 to 20 (only with new accounts, C64); steps stay 1 or 2 and the phase evaluation or funded; the status control is gone once a challenge is breached.

- [ ] **Step 1: Write the failing tests:** the sub-tab counts on the sample (2, 1, 2); the list's columns including the trading account; the row menu's five actions; Move to funded asks first; Mark as breached starts with no reason chosen, writes the reason and date, and the challenge moves to Breached with no way back; Quantity 3 creates three challenges and their accounts; a challenge created in the funded phase reads as straight to funded; the display menu is absent.
- [ ] **Step 2:** `npm test -- prop`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): the prop accounts tab, mark as breached and the form's new fields (#45, D3)`.

### Task 12: Challenge details

Delivers spec §5.3 Details, C65, C66 (comp 06).

**Files:**
- Create: `src/app/(app)/app/prop-firms/accounts/[id]/page.tsx`, `src/components/app/prop/challenge-details.tsx`
- Test: `challenge-details.test.tsx`

**Interfaces:** a tab per phase with its state; Move to funded and Mark as breached on the current phase (as the row menu, rec §3.4); Balance by Day, Hour or Trade (C65); the phase's rules from `checkChallenge`; win rate, average win, average loss, best day, worst day; the phase's trades (5, then a link to Trades filtered to the account) with Import into this account; Strategies with Attach and detach, no counts (C66, C73). A bad id shows the plain-page state with a link to Accounts.

- [ ] **Step 1: Write the failing tests:** the Futures 50K sample's phase tabs (Step 1 passed, Funded active), the three balance modes' point counts, the five stats, the trades link's filter, attaching a strategy writes `strategyIds`.
- [ ] **Step 2:** `npm test -- challenge-details`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): prop challenge details (#45, D3)`.

### Task 13: Transactions and Log a payout

Delivers spec §5.3 Transactions, C27, C29, C60 (comp 07, `?state=payout`).

**Files:**
- Create: `src/components/app/prop/{transactions.tsx,log-payout.tsx}`
- Test: `transactions.test.tsx`, `log-payout.test.tsx`

**Interfaces:** the columns and order of C68; the filter All, Income, Costs, To review (by sign and status), no counts (C73); Add transaction opens the inline row (date, description, firm, challenge, category, signed amount, status; saved with the tick); an edit control beside each category; each row's menu: set status, link a challenge, delete (confirmed, permanent); ignored rows shown faint; Log a payout: the funded challenge, amount, date received.

- [ ] **Step 1: Write the failing tests:** the filter on the sample keeps 13, 3, 10 and 3 rows; the category edit control changes a row's category; a new row defaults to today, uncategorized and not reviewed; the sign rule's hint; setting a row to ignored removes it from the dashboard totals; Log a payout adds a positive payout linked to the challenge.
- [ ] **Step 2:** `npm test -- transactions log-payout`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): prop transactions and log a payout (#45)`.

### Task 14: The prop dashboard

Delivers spec §5.3 Dashboard, C32, C36 to C38 (comp 04).

**Files:**
- Create: `src/components/app/prop/{prop-dashboard.tsx,prop-filters.tsx,prop-first-run.tsx}`
- Test: `prop-dashboard.test.tsx`, `e2e/prop.spec.ts`

**Interfaces:** five cards (Funded, Evaluation, Total spent, Total earned, Net with its return on spend); Return over time with 1W, 1M, 1Y; Where the money went by Firm, Type, Size, Fee; Pass rate by Firm, Type, Size, Strategy; Why accounts broke with Evaluation or Funded and the four facts; the filters popover (firm, phase, status, size, type, strategy) in the URL; the global date chip; the empty state with Add transaction and New challenge (C69). The first run (comp 13, C71) shows instead on the first visit to a workspace with no challenge and no transaction: how you trade (stored only, `propStart`), the transaction form adding rows to a list, the three totals, and Add active accounts (to New challenge) or Go to the dashboard; Skip at any step; no bank-link choice (C38).

- [ ] **Step 1: Write the failing tests:** the sample's figures as Task 4's; each switch's rows; a filter narrowing to Sample firm B; Privacy masking every amount; the empty state; the first run shows once in an empty My workspace, stores its answer and nothing else, its rows land in Transactions, and Skip ends it. The e2e spec: add a transaction, log a payout, mark a challenge breached, read the dashboard.
- [ ] **Step 2:** `npm test -- prop-dashboard`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test -c playwright.p6c.config.ts e2e/prop.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): the prop dashboard (#45)`.

**Parity check, Module C** (record §3): the three tabs; the first run's steps (bank link out); the transaction fields, categories, statuses, filter and row actions; Log a payout's fields; the five cards, ROI chart periods, the four breakdowns, pass rate's four views, the breach facts and switch, the six filters and the range; the accounts tab's sub-tabs, layout switch, row menu, details and create fields; the five breach reasons and permanence.

---

## Module D: Cost method and calendar image (#49)

### Task 15: Cost method in Settings > Accounts

Delivers spec §5.4, C39, C40 (comp 08, `?state=dialog`, `?state=confirm`).

**Files:**
- Modify: `src/components/app/settings/{account-dialog.tsx,accounts.tsx}`
- Test: `account-dialog.test.tsx`, `accounts.test.tsx`, `e2e/cost-method.spec.ts`

**Interfaces:** the Edit dialog's Cost method (FIFO first, LIFO, Weighted average, each with its one line), absent from New account (C74); a change asks the confirmation of comp 08 before `useSetCostMethod`; the accounts table's Cost method column and the phone rows' second line.

- [ ] **Step 1: Write the failing tests:** unset reads FIFO; New account has no cost method field; choosing LIFO in Edit asks, then saves; Cancel keeps FIFO; archived accounts show the method read-only; the e2e spec switches the sample's Futures live to LIFO and sees a multi-day trade's partial exit move days in the Calendar.
- [ ] **Step 2:** `npm test -- account`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): cost method per account (#49)`.

### Task 16: The calendar image

Delivers spec §5.5, C44 to C46 (comp 09).

**Files:**
- Create: `src/lib/calendar-image.ts`, `src/components/app/calendar/snapshot-panel.tsx`
- Modify: `src/components/app/calendar/calendar-view.tsx`, the `calendar-adv` widget
- Test: `calendar-image.test.ts`, `snapshot-panel.test.tsx`, and a download check in `e2e/shell.spec.ts`

**Interfaces:**
- `calendarSvg(month: ReturnType<typeof calendarMonth> /* src/data/calendar.ts */, opts: { stats: CalendarStat[]; fig: (c: Cents) => string; theme: 'light' | 'dark'; title: string; subtitle: string }): string` (pure: the header, the grid with the chosen stats, the weekly column, the wordmark); `calendarPng(svg: string, scale = 2): Promise<Blob>`.
- The panel: the preview, Download image (`keel-calendar-YYYY-MM.png`), Copy image or the line (C46), close; on a phone a bottom sheet.

- [ ] **Step 1: Write the failing tests:** `calendarSvg` contains each traded day's figure through `fig` (so Privacy masks), the week totals and the wordmark; the file name; Copy hidden without `ClipboardItem`; a failed render shows "Couldn't make the image" with Try again.
- [ ] **Step 2:** `npm test -- calendar-image snapshot`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): save the calendar as an image (#49)`.

**Parity check, Module D** (record §4, §5): the three methods and where they are set and shown; the snapshot's place, preview, download and copy; nothing for the style action.

---

## Module E: Shell (#50)

### Task 17: The collapsible sidebar and the Settings menu

Delivers spec §5.6, C47 to C49, E52, E55 (comps 10, 11).

**Files:**
- Modify: `src/components/app/{sidebar.tsx,app-shell.tsx,top-bar.tsx}`, `src/components/app/settings/settings-nav.tsx`, `src/app/(app)/app/settings/layout.tsx`, `src/app/globals.css`
- Test: `sidebar.test.tsx`, `top-bar.test.tsx`, `e2e/shell.spec.ts`

**Interfaces:** a collapse button in the sidebar's head (Collapse the sidebar, Expand the sidebar, `aria-expanded`); collapsed, every desktop page shows 6A's rail (add trade "+", icons, group divider, "Not live yet" faint) with a tooltip naming each item; the state in `UserPrefs.sidebar`; day pages keep the rail. Settings menu groups: Profile; Accounts, Trading, Tags, Logs, or with 6B landed Profile; Accounts, Trading, Tags, Notebook, Logs (C48); collapsed with the sidebar to an icon column from `lg`; below `lg` the labelled pill row stays. E52: `scroll-padding-top` equal to the sticky bar's height; E55: the wrapped-chips row, the phone bar below 375px, the Tab-walk e2e from 640 to 1023.

- [ ] **Step 1: Write the failing tests:** toggling writes the pref and the rail renders with names in tooltips and accessible names; Settings' groups and divider; collapsed Settings shows icons with names; the e2e spec collapses, reloads and finds it collapsed, and tabs backwards without a focused control under the bar.
- [ ] **Step 2:** `npm test -- sidebar settings-nav`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test -c playwright.p6c.config.ts e2e/shell.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): collapse the sidebar and the Settings menu to icons (#50, E52, E55)`.

- [ ] **Step 6 (6A's gap audit, E154): Home.** TradeZella's Home has its own wide sidebar shell with the same collapse button; collapsed, the rail is hidden entirely and the content centres [rec S01 0:20; rec S63]. Make Home (`/app/home`, 6A) honour the toggle the same way: collapsed, no rail on Home and the content centred. Test first: `'Home collapses its sidebar and centres its content'`.

**Parity check, Module E** (record §6): the toggle, the rail's parts, the tooltips, persistence, Settings' groups and collapse, and Home's collapsed shell.

---

## Module F: Report PDF (#51)

### Task 18: Export PDF on Performance

Delivers spec §5.7, C50 to C52 (comp 12, `?state=print`).

**Files:**
- Create: `src/components/app/reports/print-header.tsx`
- Modify: `src/components/app/reports/performance.tsx`, `src/app/globals.css`
- Test: `performance.test.tsx`

**Interfaces:** Export PDF beside the Net or Gross control on Performance only; it calls `window.print()`. The print rules go in the stylesheet shared with 6B's note PDF (the builder call above). The print layout: the header (report name, workspace and accounts, range, filters in words, unit and basis, the time made), both chart slots as drawn and the summary table, light whatever the appearance, no app chrome, Privacy as on screen.

- [ ] **Step 1: Write the failing tests:** the button exists on Performance and on no other report tab; clicking it calls a stubbed `window.print`; the print header names the filters and the range; under Privacy the header's figures are masked.
- [ ] **Step 2:** `npm test -- performance`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): export Performance as a PDF through a print layout (#51)`.

- [ ] **Step 6 (only if 6B's per-trade `swap` has landed): Total swap (spec §5.8, C76).** In `src/components/app/reports/overview-costs.tsx`, add a "Swap" figure beside commissions and fees, summing `trade.swap` over the filtered trades (signed as stored; "None" when no trade carries one), with its MetricTip in `metric-definitions.ts` and its key in the Choose figures list (`overview-choice.tsx`, whose test holds the list to the page). Test first: `'the Overview sums swap'` and `'no swap reads None'`. Commit: `feat(app): Total swap on the Overview (P6B-10, #55)`. If 6B hasn't landed, leave a backlog line on #55 instead.

**Parity check, Module F** (record §7; spec §5.8): Performance only; nothing claimed about TZ's file contents; the Overview's Swap figure if built.

---

## Module G: Import worker (#48)

### Task 19: Planning in a worker, and the live size limit

Delivers spec §5.9, C53 to C56, E44, E45, E95.

**Files:**
- Create: `src/lib/import/plan.worker.ts`, `src/lib/import/plan-client.ts`
- Modify: `src/data/query/derived.ts` (`useImportPlan`), `src/lib/decode.ts`, `src/components/app/import/import-flow.tsx`
- Test: `plan-client.test.ts`, `derived.test.ts`, `decode.test.ts`, `e2e/import.spec.ts`

**Interfaces:**
- `planInWorker(input: { parsed; mapping; ctx; meta }): Promise<ImportPlan>` (posts to the worker; the latest request wins, earlier ones resolve as stale and are dropped); `planImport` on the main thread when `typeof Worker === 'undefined'` or after one worker error.
- `useImportPlan` keeps its `Derived<ImportPlan>` contract (E45): `pending` until the plan for the current input and revision arrives; point-value edits re-plan after 150 ms.
- `readImportFile` refuses a file over `MAX_IMPORT_BYTES` (20 MB) with the existing sentence.

- [ ] **Step 1: Write the failing tests:** worker and fallback give deep-equal plans on the e2e fixtures; a stale response is dropped; `readImportFile` on a 21 MB file throws `ImportFileError`; the hook reports pending then success with the new plan; the e2e spec imports a large generated file and asserts no long task over 50 ms (`PerformanceObserver('longtask')`).
- [ ] **Step 2:** `npm test -- plan-client derived decode`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test -c playwright.p6c.config.ts e2e/import.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(import): plan imports in a worker; enforce the 20 MB limit (#48, E44, E95)`.

**Parity check, Module G** (record §8): no TZ-facing behaviour changes; the import flow matches Plan 5.

---

## Module H: Finish

### Task 20: Audit, records and final checks

**Files:** `docs/BACKLOG.md`, `docs/research/tradezella-feature-map.md`, `DESIGN.md`, `PRODUCT.md`, `.impeccable/surfaces/src-app-app-app-dashboard-page-tsx.md`

- [ ] **Step 1:** Copy `plan6c-behaviour.md` and `plan6c-parity-audit.md` to the main checkout's `.superpowers/research/tradezella/` (git-ignored; the worktree's copies go with the worktree). A fresh reviewer runs the whole-branch parity check against both; fix every verified finding.
- [ ] **Step 2:** Records (spec §7): close #45, #46, #23, #48, #49, #50, #51, E44, E51, E52, E55 and E95; correct #23, #45, #46, #49 and #51's wording and DA4; add the backlog rows for the snapshot's style image (with #49) and note export to PDF (with #43); DESIGN.md: the widget dashboard, the Edge score, the prop module's parts, the rail and the print layout, and the "Plan vs actual" direction retired (D2); PRODUCT.md principle 3 reworded (D2); the dashboard surface brief rewritten for the widget dashboard.
- [ ] **Step 3:** Captures at 1440 light and dark and 390 of every new screen, compared with the comps; `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test -c playwright.p6c.config.ts`. Expected: PASS.
- [ ] **Step 4:** Commit: `docs: close Plan 6C's rows and record its design (#45, #46, #23, #48, #49, #50, #51)`.
