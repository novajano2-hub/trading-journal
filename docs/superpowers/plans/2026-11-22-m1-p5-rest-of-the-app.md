# Milestone 1 · Plan 5: The rest of the app, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every remaining milestone 1 module on local data: Trades, the trade page, manual entry, Import, Calendar, Reports, Strategies, Notebook, Settings and Prop firms. Bring each module to the feature set the user picked from TradeZella (the "P5" rows of the feature map).

**Architecture:**
- **Domain:** new pure functions go in `src/domain`. That covers realized P&L by exit, the new metrics, filters v2, the manual trade builder, report series and prop phases.
- **Storage:** one Dexie schema bump (version 2) adds the new tables and fields, and the repositories and TanStack Query hooks grow with it.
- **Screens:** each module is a set of client leaves under `src/components/app/<module>/`, mounted by server pages under `src/app/(app)/app/`. They read only hooks, as the dashboard does.
- **Shared parts:** the display formatter (units and privacy), the tag picker and the note editor are built once and reused.

**Tech Stack:**
- Next.js 16.4.6 App Router, React 19.3, TypeScript strict, Tailwind v4, motion/react, Radix UI, Phosphor icons.
- TanStack Query 5 over the repository and Dexie 4.
- New: TanStack Table, for the trade log and report tables, and Tiptap 3 open source, for notes.
- Vitest 5 + Testing Library + happy-dom + fake-indexeddb, and Playwright on system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md` (§6 routes, §7 domain model and the platform-alignment table, §8 data layer, §10-§11). The authorities, in order:
1. **The user's scope:** `docs/research/tradezella-feature-map.md`, the rows marked **P5**. Each task names the IDs it delivers.
2. **The approved comps:** `.impeccable/mocks/plan5/01-trades.html` … `12-prop-firms.html`, with `shell.css`, their PNGs and `brief.md`. They are the binding look.
3. **The spec.**
4. **`DESIGN.md`, `src/styles/theme.css` and `PRODUCT.md`.**
5. **Behaviour notes:** `docs/research/tradezella-plan5-features.md`. A screen-by-screen inventory sits in `.superpowers/research/tradezella/`, which git ignores. Read it for behaviour only.
6. **Plans 2 and 4,** for the contracts this plan extends: `docs/superpowers/plans/2026-11-20-m1-p2-data-layer.md` and `2026-11-20-m1-p4-app-shell-dashboard.md`.

**Execution:** one implementer at a time, never in parallel (the user's call), with a review after each module rather than each task. The modules are:

| Module | Tasks |
|---|---|
| A Foundations | 1-5 |
| B Trades | 6-10 |
| C Import | 11-12 |
| D Calendar | 13 |
| E Reports | 14-15 |
| F Strategies | 16 |
| G Notebook | 17 |
| H Settings | 18 |
| I Prop firms | 19 |
| J Finish | 20 |

## Global Constraints

- **Toolchain:** Node ≥ 22, npm, Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind 4, Vitest 5, Playwright with `channel: 'chrome'`.
- **Branch:** work on `m1-p5`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Next.js docs first.** Before any framework-level code, read these in `node_modules/next/dist/docs/01-app/`:
  - `03-api-reference/03-file-conventions/dynamic-routes.md` and `page.md` (`params` and `searchParams` are Promises in this version)
  - `03-api-reference/04-functions/use-search-params.md`, `use-router.md` and `use-pathname.md`
  - If `next dev` rewrites AGENTS.md, commit that change with the task.
- **Dependencies:** add exactly these, pinned to versions at least two weeks old:
  - `@tanstack/react-table`
  - Tiptap 3's open-source packages: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, plus the packages that provide task lists, tables, collapsible blocks (details), placeholder and suggestion
  - Before adding each Tiptap package, check its `license` field is MIT. Use no Pro or Cloud package. If collapsible blocks aren't MIT, build them as a small custom node.
  - Add no chart, date-picker or UI kit library.
- **Boundaries:**
  - Pages and components talk only to the hooks in `src/data/query/*`. Nothing under `src/components` or `src/app` imports `src/data/local/*`, Dexie or IndexedDB (tests excepted).
  - `src/domain/**` stays pure: no React, Next, browser globals or I/O.
- **Look:**
  - The comps are binding. Real data wins over comp numbers.
  - Where a module needs something the comps lack (empty, loading and error states, dialogs, forms, mobile), extend the comps' language: same tokens, radii, shadows, type ramp, 28px icon tiles and chips.
  - Use tokens through their Tailwind names only (`bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`, `warn*`, `info*`), with shadows as `shadow-[var(--shadow-card)]` and friends. No raw hex.
  - `IconTile` tones and `Chip` tones keep their APIs.
- **Charts:** hand-rolled SVG in the style of the dashboard's performance card. Every chart has a text alternative (`role="img"` with a label carrying the range and key values) and a hover/focus readout.
- **Numbers:** tabular figures for every number (`tnum` or `font-mono`). Every money figure goes through the display formatter (Task 5), so units and privacy apply everywhere. Green and red always travel with a sign or a word.
- **Copy:**
  - No em or en dashes (ranges use a hyphen), no eyebrows, no decorative dots, no emoji.
  - Sample data is always labelled.
  - Every metric label carries its definition through `MetricTip`, with the text only from `src/content/metric-definitions.ts`.
- **TradeZella:** take behaviour only. Never copy TradeZella's layout, wording, icons or data. Strategy templates and firm presets are not in this plan.
- **Motion:** only in `'use client'` leaves, using the `src/lib/motion.ts` tokens. Under reduced motion, nothing moves.
- **Accessibility:** WCAG 2.2 AA, a visible focus ring, 44px targets on coarse pointers, and a keyboard path for every action. Tables are real `<table>`s, with `aria-sort` on sortable headers.
- **Layout:** no horizontal page overflow from 390 to 1680px. The sidebar is a drawer below `lg`.
- **Performance:** on the sample workspace (about 1,230 trades), filtering plus any report recomputes in under 50 ms (as in Plan 4). The trade log pages 50 rows at a time.
- **Tests:**
  - Component tests start with `// @vitest-environment happy-dom` and `afterEach(cleanup)`.
  - Domain work is test-first.
  - `npm run e2e` builds first and serves on port 3100. Never run two `next build`s against the same `.next`.
  - Scratch scripts that import `@playwright/test` live at `scripts/.<name>.tmp.mjs` and are never committed.
- **Verification before each commit:** `npm test`, `npm run typecheck` and `npm run lint` all pass. `npm run build` passes before the last commit of each module.

## Review Focus

1. **A multi-day trade with partial exits.**
   - Expected: each exit's P&L lands on its own local date in the calendar, the dashboard's daily figures and the daily loss limit.
   - The trade's own net, and every trade-level metric, are unchanged. A trade that is still open books nothing.
   - Pinned in Task 3, and in Task 13's calendar test.
2. **Privacy mode.**
   - Expected: no money amount appears anywhere on screen. That includes text, `aria-label`, `title`, chart axes and readouts, and CSV previews.
   - Counts, %, R and ratios stay, and so does the sign. A CSV export still carries real values.
   - Pinned in Task 5, and asserted again in Tasks 6, 13 and 14.
3. **Filters that pull against each other:**
   - a symbol both included and excluded: the exclusion wins;
   - "No strategy" plus a strategy: either matches;
   - a time window across midnight (`22:00-02:00`) and open-ended windows;
   - a breakeven range that turns a small win into a breakeven;
   - every new param round-trips through the URL; unknown or malformed values are dropped, not thrown.
   - Pinned in Task 4.
4. **Removing something other records use:**
   - a strategy with trades: the trades keep their data and lose the strategy and its rule checks;
   - a folder with notes: the notes move to My notes;
   - the default template: the kind falls back to its built-in template;
   - an account with trades: it can't be deleted until it's cleared or archived;
   - an account linked to a challenge, when archived: the challenge shows that phase as archived.
   - Pinned in Tasks 2, 16, 17, 18 and 19.
5. **Manual entry of awkward instruments.**
   - A futures option with a multiplier, an option missing its strike or expiry, and an unknown futures root without a multiplier.
   - Fills that leave a position open (allowed: the trade is open) and fills that reverse it (refused).
   - Fill times in the account's time zone, not the browser's.
   - Pinned in Task 10.

## Rulings

| Question | Ruling | Basis |
|---|---|---|
| P&L by date (feature map CA4) | A closed trade books each exit fill's realized P&L on that fill's local date. Entry fees are shared among the exits by matched quantity, and the cents left over go to the last exit, so the parts sum to the trade's net exactly. An open trade books nothing until it closes. Day-level figures use this: the calendar, day stats, green days, the dashboard's daily chart, goals, Sharpe and Sortino. Trade-level metrics and the closed-trade equity curve keep using the trade's close time. | TradeZella books P&L on the close or partial-exit date. Keel's metrics are closed-trade based (spec §7). E13 re-checks this against TradeZella once the sample CSVs are imported. |
| % display | For a trade it shows Net ROI: net ÷ cost basis (`costBasis`). For an aggregate it shows net ÷ the summed balance of the selected accounts at the range start (starting balance plus cash flows before that date). | TradeZella's "Percentage" view; Keel's own base, stated in the MetricTip. |
| R display | For a trade it shows realized R. For an aggregate it shows the sum of realized R over trades that have risk, labelled "{n} trades without a stop left out" when any are left out. | Spec §7 alignment (Planned vs Realized R). |
| Privacy | Masks money amounts only, as `+$•••` / `−$•••`, with the accessible text "hidden amount". Counts, %, R, ratios and signs stay. CSV exports carry real values. | The user hides position size when sharing a screen. The direction of a result isn't sensitive. |
| Sharpe and Sortino | Daily returns = day net ÷ balance at that day's start (starting balance + flows + earlier net). Sharpe = mean ÷ sample standard deviation × √252. Sortino = mean ÷ √(Σ min(0, r)² ÷ n) × √252, with a risk-free rate of 0. Both are null with fewer than 2 days, and Sortino is null with no losing day. | Keel's own definitions. TradeZella shows both but documents neither. |
| Tag categories | Stay Keel's four fixed categories (setup, mistake, emotion, custom), coloured by token. Tags gain a description. User-made categories go to Plan 6 (new E62). | Spec §7 and the approved comps group by these four. Feature map SE3 is delivered except that part. |
| One strategy per trade | `Trade.strategyId` stays single. | Spec §7. TradeZella's many-to-many playbooks aren't adopted. |
| Rule groups | Stay entry, exit, risk and management. Each rule gains "show when" (always, winner, loser, breakeven). | Comp 09. Feature map ST2. |
| A rule that doesn't apply | A rule whose show-when doesn't match the trade's outcome is hidden on that trade, and adherence leaves that trade out for that rule. An open trade shows only "always" rules. | TradeZella's behaviour. |
| Sample workspace | Keeps its three accounts (spec §8). The forex evaluation becomes step 1 of a 2-step challenge. The comps' extra accounts were illustrative. Values the seed adds come from separate random streams, so existing trades and P&L don't move. | Spec §8. Plan 4's pinned numbers. |
| Tables | TanStack Table for the trade log and report tables, at 50 rows a page, with no virtualisation. | Spec §5 lists TanStack Table. Pages keep the DOM small. |
| Charts | Hand-rolled SVG, no visx or Lightweight Charts. | It matches the dashboard. There are no candles (market data is backlog #13). |
| Manual trades | Built only from their own fills: they never merge with imported positions. Fills that reverse the position are refused. They are marked `source: 'manual'`, are editable, and can always be deleted. | Keeps the import engine's invariants intact. |
| Future options | Stored as `assetClass: 'option'`, with `underlying` set to the futures root and `pointValue` = the multiplier. | `AssetClass` already covers it, so the domain type needs no new value. |
| Excel import | Moves to Plan 6 (E25). The upload step says "Excel files: save as CSV for now." | Keeps the dependency list as it is. |
| Import encoding | Decode UTF-8, and retry as windows-1252 if U+FFFD appears. `planImport` runs outside render with a pending state. The worker part of E44 moves to Plan 6. | E44. |
| Trade notes | One per trade, with kind `trade-note`, created on first edit. The title is "{instrument label}, {d MMM yyyy}" of the open date. The entry is stored in the Trade notes folder. | Feature map TD2. |
| Daily notes | Daily notes are `daily-review` entries keyed by date, opened at `/app/notebook/daily/[date]`. A new day starts from the default daily template. | Feature map NB4. |
| Folders | Built-in folders are virtual: Favourites, Daily journal, Trade notes, Recaps, Trash. "My notes" holds entries with no folder. User folders are a table. | Feature map NB2. |
| Trash | `deletedAt` marks a note as trashed. Listing purges entries trashed more than 30 days ago. Restore clears the mark. | Feature map NB3. |
| Templates | Templates belong to a workspace, with one default per kind. Built-in templates (daily review, pre-market plan, weekly recap) can be edited but not deleted. | Feature map NB4. |
| Settings pages | The sub-nav reads Profile, Trading, Accounts, Tags, Import history. Comp 11 shows three, and the two extra follow its pattern. | Feature map SE2, SE3. |
| Challenge status | Computed from the current phase's account through `evaluateProp`: Active, Near a limit, Breached, Passed. The breach reason is computed (which rule, on which date). The trader can close a challenge out as passed or failed. Fees are entered by hand. | Keel computes what TradeZella asks the trader to type. |
| Reports tabs | The comp's eight tabs, then a "More reports" menu holding Performance, Risk, Wins vs losses and Compare. | Comp 06 fits eight tabs. |
| Cross-analysis | A second dimension turns any breakdown's table into a matrix: rows by the first dimension, columns by the second, each cell one chosen metric. At most 12 columns, and the rest fold into "Other". | Feature map RE2. |
| Calendar cell stats | Up to 3 of: net, trades, win rate, R, fees. The default is net and trades. | Feature map CA2. |
| Display controls | One "Display" button in the top bar opens a popover with the $ / % / R switch and "Hide amounts". While privacy is on, the button shows the crossed-eye glyph. | The top bar's 1280px chip fit leaves room for one button, not two. |

## Backlog items owned by this plan

| Item | Where |
|---|---|
| E45 import plan contract | Task 1 |
| E5 R-distribution tails | Task 15: bins are clamped to −5R…+5R, and tails fold into "−5R or less" and "+5R or more" |
| E12 prop daily loss in % or $ | Task 19 |
| E20 RuleList landing hooks | Task 16 |
| E22 drawdown label from its type | Task 19 |
| E24 hover readouts on bars | Task 14 |
| E28 import e2e | Task 20 |
| E30 browser-default time zone | Task 18 |
| E32 direction flip notice | Task 12, as a `direction-flipped` flag |
| E33 deleting an open imported trade | Task 7 explains it and links to undo. The tombstone flow stays with E31 |
| E35, E36, E37 mapping UI | Task 11 |
| E43 re-import after undo | Task 12 copy |
| E44 encoding | Task 11. The worker part goes to Plan 6 |
| E46 tag from the drill-down | Task 7 |
| E47 links to trade pages | Task 9 |
| E48 search over trades and notes | Tasks 6 and 17 |
| E54 late `replaceState` | Task 4 |
| E57 archived-only workspace copy | Task 18 |
| E59 recent-trades header, mistake column, 0DTE label | Task 6 |
| #7 CSV export | Task 6 |

Moved to Plan 6, recorded in Task 20:
- E10 merge and split;
- E25 Excel;
- E44's worker part;
- E50 routine goals (the progress tracker);
- E52 and E55 top-bar polish;
- the new E62 user-made tag categories.

E34 and E39 stay with E31 (milestone 2).

## File map

```
src/domain/            (modified) types.ts  manual-trade.ts  filters.ts (moved logic, see Task 4)
src/domain/metrics/    realized.ts  risk.ts  series.ts  (modified) days.ts summary.ts breakdowns.ts rules.ts
src/domain/prop/       (modified) evaluate.ts   challenge.ts
src/domain/import/     (modified) plan.ts (direction-flipped flag)  guess-columns.ts mapping.ts (one synonym list)
src/data/              (modified) repository.ts filters.ts metrics.ts trade-patch.ts dashboard.ts  csv-export.ts
src/data/local/        (modified) db.ts schema.ts trades.ts accounts.ts journal.ts tags.ts strategies.ts prefs.ts context.ts
                       folders.ts templates.ts cashflows.ts challenges.ts
src/data/seed/         (modified) generate.ts journal.ts   templates.ts
src/data/query/        (modified) hooks.ts keys.ts derived.ts
src/lib/               display.ts note-text.ts decode.ts  (modified) format.ts time-format.ts
src/content/           (modified) metric-definitions.ts   note-templates.ts
src/components/app/    display-menu.tsx more-filters.tsx tag-picker.tsx confirm-dialog.tsx
                       (modified) top-bar.tsx account-switcher.tsx filter-model.ts filter-bar.tsx dashboard/*
src/components/app/trades/      trades-view.tsx columns.tsx summary-strip.tsx bulk-bar.tsx trade-view.tsx
                                fills-timeline.tsx rule-checklist.tsx manual-trade-form.tsx
src/components/app/notes/       note-editor.tsx slash-menu.tsx
src/components/app/import/      import-flow.tsx upload-step.tsx map-step.tsx preview-step.tsx confirm-step.tsx
src/components/app/calendar/    calendar-view.tsx month-grid.tsx year-grid.tsx day-panel.tsx
src/components/app/reports/     reports-shell.tsx report-chart.tsx summary-table.tsx cross-analysis.tsx
                                overview.tsx performance.tsx breakdown-report.tsx time-report.tsx
                                risk-report.tsx wins-losses.tsx compare.tsx
src/components/app/strategies/  strategies-view.tsx strategy-view.tsx strategy-form.tsx
src/components/app/notebook/    notebook-view.tsx folder-rail.tsx entry-list.tsx day-card.tsx templates-dialog.tsx
src/components/app/settings/    settings-nav.tsx profile.tsx trading.tsx accounts.tsx cash-flows.tsx tags.tsx import-history.tsx
src/components/app/prop/        prop-view.tsx challenge-card.tsx challenge-form.tsx
src/app/(app)/app/     trades/{page,[id]/page,[id]/edit/page,new/page}.tsx  import/page.tsx
                       calendar/page.tsx  reports/{page,[report]/page}.tsx  strategies/{page,[id]/page,new/page,[id]/edit/page}.tsx
                       notebook/{page,[entryId]/page,daily/[date]/page}.tsx
                       settings/{layout,page,profile/page,trading/page,accounts/page,tags/page,import-history/page}.tsx
                       prop-firms/page.tsx
e2e/                   trades.spec.ts import.spec.ts calendar.spec.ts reports.spec.ts notebook.spec.ts settings.spec.ts prop.spec.ts
                       (modified) pages.spec.ts app-shell.spec.ts
docs/                  (modified) BACKLOG.md  DESIGN.md  research/tradezella-feature-map.md
```

---

### Task 1: Fix the import plan contract (E45)

**Files:**
- Modify: `src/data/query/derived.ts`
- Test: `src/data/query/derived.test.ts` (new tests)

**Interfaces:**
- Consumes: `useImportPlan`, `ImportInput`, `Derived` (Plan 2)
- Produces: the same `useImportPlan(input: ImportInput | null): Derived<ImportPlan>`, now keeping the contract on every render pass

The recipe and probes are in the Plan 2 final re-review (E45 in `docs/BACKLOG.md`):
- Compare inputs by their four fields, not by object identity.
- Plan from the stored identity input.
- Report `'pending'` until the identity is current.

- [ ] **Step 1: Write the failing tests.**
  - `'success always carries data, on every pass'`: record every render's result while the input changes from A to B, across a commit and an undo. Assert `r.status !== 'success' || r.data !== undefined` for every recorded pass, and that the last success's `data.fileName` is B's.
  - `'an inline input object does not loop'`: render with `useImportPlan({ ...input })` built inline. Assert the render count stays under 10 after settling.
- [ ] **Step 2:** `npm test -- src/data/query/derived`. Expected: FAIL on both.
- [ ] **Step 3:** Implement the recipe.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `fix(data): useImportPlan keeps the Derived contract on every pass (E45)`.

---

### Task 2: Domain types, storage version 2 and hooks

Delivers the storage behind TR3, AC2-AC4, NB2-NB5, ST2, ST4, ST5, PF2-PF4, SE1-SE3 and X4-X5.

**Files:**
- Modify: `src/domain/types.ts`, `src/data/repository.ts`, `src/data/trade-patch.ts`, `src/data/local/{db,schema,trades,accounts,journal,tags,strategies,prefs,context}.ts`, `src/data/query/{hooks,keys}.ts`, `src/data/seed/{generate,journal}.ts`
- Create: `src/data/local/{folders,templates,cashflows,challenges}.ts`, `src/data/seed/templates.ts`, `src/content/note-templates.ts`
- Test: `src/data/local/store.test.ts`, `src/data/local/entities.test.ts`, `src/data/local/migration.test.ts` (new), `src/data/seed/generate.test.ts`, `src/data/query/keys.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  // Trade: add
  reviewed?: boolean; source?: 'import' | 'manual';
  // Account: add
  timeZone?: string; importMapping?: ImportMapping;
  // PropRuleSet: add (undefined = no period / floor at the starting balance)
  periodDays?: number; drawdownFloor?: Cents;
  // Tag: add
  description?: string;
  export type RuleShowWhen = 'always' | 'winner' | 'loser' | 'breakeven';
  // Rule: add
  showWhen?: RuleShowWhen;                       // undefined reads as 'always'
  export const STRATEGY_ICONS = ['target','lightning','trend-up','trend-down','crosshair','waves',
    'compass','flag','clock','stack','shield','rocket'] as const;
  export type StrategyIcon = (typeof STRATEGY_ICONS)[number];
  export type StrategyTone = 'accent' | 'info' | 'gain' | 'warn' | 'neutral';
  // Strategy: add
  icon?: StrategyIcon; tone?: StrategyTone;
  // JournalKind: add 'trade-note'
  // JournalEntry: replace `folder?: string` with
  folderId?: string; favorite?: boolean; deletedAt?: string; tags: string[];
  export interface NoteFolder { id: string; workspaceId: string; name: string; createdAt: string }
  export interface NoteTemplate { id: string; workspaceId: string; name: string; kind: JournalKind;
    body: unknown; isDefault: boolean; builtIn: boolean }
  export interface CashFlow { id: string; workspaceId: string; accountId: string;
    date: string /* YYYY-MM-DD */; amount: Cents /* + deposit, − withdrawal */; note?: string }
  export type ChallengeStep = 'step-1' | 'step-2' | 'funded';
  export interface Challenge { id: string; workspaceId: string; name: string; firm: string;
    steps: 1 | 2; phases: { step: ChallengeStep; accountId?: string; startDate?: string }[];
    evaluationFee?: Cents; activationFee?: Cents; closedOut?: 'passed' | 'failed' }
  export type DisplayUnit = 'money' | 'percent' | 'r';
  export type CalendarStat = 'net' | 'trades' | 'winRate' | 'r' | 'fees';
  // UserPrefs: add
  displayName?: string; displayUnit: DisplayUnit; privacy: boolean; tradeColumns?: string[];
  hideTradeSummary: boolean; calendarStats: CalendarStat[]; instrumentsTraded: AssetClass[];
  settleExpiredOptions: boolean;
  ```
- Produces, in `repository.ts`:
  ```ts
  export interface ManualTradeInput { accountId: string; instrument: Instrument;
    fills: { time: string /* UTC ISO */; side: Side; qty: number; price: number; commission: Cents; fees: Cents }[];
    plannedStop?: number; plannedTarget?: number }
  // TradesRepo: add
  createManual(ws: string, input: ManualTradeInput): Promise<Trade>;
  replaceManual(ws: string, id: string, input: ManualTradeInput): Promise<Trade>;
  updateMany(ws: string, ids: readonly string[], patch: TradePatch | ((t: Trade) => TradePatch)): Promise<Trade[]>;
  // AccountsRepo: add
  clearTrades(ws: string, id: string): Promise<number>;   // removes its trades and import jobs; returns the count
  // JournalRepo: add
  trash(ws: string, id: string): Promise<void>; restore(ws: string, id: string): Promise<void>;
  ensureTradeNote(ws: string, tradeId: string): Promise<JournalEntry>;   // creates it and sets trade.noteId in one transaction
  dailyNote(ws: string, date: string): Promise<JournalEntry>;            // opens the day's note or creates it from the default daily template
  export interface FoldersRepo { list(ws: string): Promise<NoteFolder[]>; create(ws: string, name: string): Promise<NoteFolder>;
    rename(ws: string, id: string, name: string): Promise<NoteFolder>; remove(ws: string, id: string): Promise<void> }
  export interface TemplatesRepo { list(ws: string): Promise<NoteTemplate[]>;
    save(ws: string, t: Omit<NoteTemplate, 'id' | 'workspaceId' | 'builtIn'> & { id?: string }): Promise<NoteTemplate>;
    remove(ws: string, id: string): Promise<void>; setDefault(ws: string, id: string): Promise<void> }
  export interface CashFlowsRepo { list(ws: string): Promise<CashFlow[]>;
    create(ws: string, input: Omit<CashFlow, 'id' | 'workspaceId'>): Promise<CashFlow>;
    update(ws: string, id: string, patch: Partial<Omit<CashFlow, 'id' | 'workspaceId'>>): Promise<CashFlow>;
    remove(ws: string, id: string): Promise<void> }
  export interface ChallengesRepo { list(ws: string): Promise<Challenge[]>;
    create(ws: string, input: Omit<Challenge, 'id' | 'workspaceId'>): Promise<Challenge>;
    update(ws: string, id: string, patch: Partial<Omit<Challenge, 'id' | 'workspaceId'>>): Promise<Challenge>;
    remove(ws: string, id: string): Promise<void> }
  // Repository: add folders, templates, cashFlows, challenges
  ```
  `TradePatch` adds `'reviewed'`. `createManual` and `replaceManual` are declared here and wired to the builder in Task 10. Until then they throw `new Error('manual trades land in Task 10')`.
- Produces, in `hooks.ts`:
  - **Queries:** `useFolders`, `useTemplates`, `useCashFlows`, `useChallenges`
  - **Mutations:** `useCreateFolder`, `useRenameFolder`, `useRemoveFolder`, `useSaveTemplate`, `useRemoveTemplate`, `useSetDefaultTemplate`, `useCreateCashFlow`, `useUpdateCashFlow`, `useRemoveCashFlow`, `useCreateChallenge`, `useUpdateChallenge`, `useRemoveChallenge`, `useCreateManualTrade`, `useReplaceManualTrade`, `useUpdateTrades`, `useClearAccountTrades`, `useTrashJournalEntry`, `useRestoreJournalEntry`, `useEnsureTradeNote`, `useDailyNote`
  - Each mutation invalidates the query keys it changes.

Behaviour:
- **Schema:**
  - Dexie `version(2)` adds `folders`, `templates` and `challenges` (`'[workspaceId+id], workspaceId'`), plus `cashflows` (`'[workspaceId+id], workspaceId, [workspaceId+accountId]'`).
  - The upgrade turns each distinct `journal.folder` name in a workspace into a `NoteFolder`, sets `folderId`, deletes `folder`, and sets `tags: []`.
  - `DATA_TABLES` lists the new tables, so reset and clear cover them.
- **Removal rules:**
  - `strategies.remove` clears `strategyId` and the rule checks of that strategy's rules on its trades.
  - `folders.remove` moves its notes to no folder.
  - `templates.remove` refuses a built-in template (`NotFoundError` is wrong here; throw `new Error('built-in template')`). Removing the default makes the kind's built-in template the default.
  - `accounts.remove` refuses an account that still has trades (`new Error('account has trades')`). If an existing test expects the old cascade, update it and name it in the commit body.
  - `journal.list` purges entries whose `deletedAt` is more than 30 days before now.
  - `setDefault` clears `isDefault` on the kind's other templates.
- **Built-in templates.** Every workspace has three, seeded on first open and after reset or clear: "Daily review", "Pre-market plan" and "Weekly recap", each the default for its kind. Their bodies are Tiptap JSON documents in `src/content/note-templates.ts`, in our own words.
  - Daily review: Preparation (watchlist, news and events, bias, levels, game plan), Session log, End of day (how the day went, what worked, what didn't, one thing to do better), each as a collapsible section.
  - Pre-market plan: bias, levels, setups to watch, risk for the day.
  - Weekly recap: the week in numbers, best and worst trade, rules broken, focus for next week.
- **Seed additions,** drawn from new random streams (`createRandom(seed + 101)` and up) so no existing value moves:
  - `reviewed: true` on about 70% of trades closed 7 or more days before the end date.
  - One "loser" rule per strategy ("Took the loss at the planned stop").
  - An icon and tone per strategy, and a one-line description per mistake tag.
  - Daily review notes for the last 20 trading days, from the built-in template with short filled-in text.
  - Challenge "Forex 100K evaluation", 2-step, step 1 linked to the forex evaluation account from its first trade date, evaluation fee $299.00, no activation fee.
  - No cash flows.
- **Prefs defaults:** `displayUnit: 'money'`, `privacy: false`, `hideTradeSummary: false`, `calendarStats: ['net', 'trades']`, `instrumentsTraded: []`, `settleExpiredOptions: true`.

- [ ] **Step 1: Write the failing tests.**
  - `migration.test.ts`: open a v1 database (built with Dexie `version(1)` and the old stores) holding two entries with `folder: 'Ideas'` and one without. Reopen through `KeelDb`, then expect:
    - one folder named "Ideas";
    - both entries carry its id and `tags: []`;
    - the third has no `folderId`.
  - `entities.test.ts`:
    - removing a strategy clears `strategyId` and its rule checks on 3 trades;
    - removing a folder leaves its notes with no `folderId`;
    - removing the default "Daily review" is refused;
    - after saving a second daily template and calling `setDefault` on it, exactly one daily default exists;
    - `trash` and then `restore` round-trip;
    - an entry with `deletedAt` 31 days ago is gone from `list` and one 29 days ago stays;
    - `ensureTradeNote` twice returns the same id, and the trade's `noteId` equals it;
    - `dailyNote('2026-11-19')` twice returns one entry of kind `daily-review`, with that date and the default template's body;
    - `accounts.remove` with trades rejects, while `clearTrades` returns the count and then `remove` succeeds;
    - `updateMany` with `{ reviewed: true }` updates exactly the given ids.
  - `generate.test.ts`:
    - the existing pinned trade totals are unchanged;
    - between 60% and 80% of trades closed 7 or more days before the end are reviewed, and none closed within 7 days are;
    - one challenge links the forex evaluation account;
    - 20 daily notes exist.
  - `store.test.ts`: reset and clear empty the four new tables, and reseed the three built-in templates.
- [ ] **Step 2:** `npm test -- src/data`. Expected: FAIL.
- [ ] **Step 3:** Implement the types, schema, repositories, hooks, keys and seed.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): storage v2 for notes, templates, cash flows, challenges and manual trades`.

---

### Task 3: Realized P&L by exit, and the new metrics

Delivers CA4, X9 and TR5 (aggregate Net ROI).

**Files:**
- Create: `src/domain/metrics/realized.ts`, `src/domain/metrics/risk.ts`
- Modify: `src/domain/metrics/days.ts`, `src/domain/metrics/summary.ts`, `src/data/metrics.ts`, `src/data/dashboard.ts`, `src/content/metric-definitions.ts`
- Test: `realized.test.ts`, `risk.test.ts`, `days.test.ts`, `summary.test.ts`, `src/data/dashboard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // realized.ts
  export interface Realization { tradeId: string; time: string; gross: Cents; fees: Cents; net: Cents }
  export function realizations(trade: Trade): Realization[];   // [] for an open trade
  // days.ts: dailyPnl books realizations by local date (signature unchanged); add
  export function dayDurations(trades: readonly Trade[], ctx: MetricContext): { longest: number | null; average: number | null }; // minutes, first entry to last exit per local day
  export function avgDailyWinRate(trades: readonly Trade[], ctx: MetricContext): number | null;
  // risk.ts
  export function riskRatios(days: readonly DayStat[], startBalance: Cents): { sharpe: number | null; sortino: number | null };
  // summary.ts: Summary gains
  netRoi: number | null;   // Σ net ÷ Σ costBasis over closed trades; null when Σ costBasis is 0
  ```
- `MetricId` gains `'net-roi'`, `'sharpe'`, `'sortino'`, `'avg-daily-win-rate'`, `'longest-day'`, `'day-streaks'`. Each definition is one or two sentences giving the formula exactly as the Rulings state it.

- [ ] **Step 1: Write the failing tests.**
  - `realized.test.ts`:
    ```ts
    // ES long 2 @ 5000 Mon 2026-11-16 15:00Z (fees 300), sell 1 @ 5010 Mon 20:00Z (fees 150), sell 1 @ 5020 Tue 15:00Z (fees 150); pointValue 50
    expect(realizations(trade)).toEqual([
      { tradeId, time: '2026-11-16T20:00:00.000Z', gross: 50000, fees: 300, net: 49700 },
      { tradeId, time: '2026-11-17T15:00:00.000Z', gross: 100000, fees: 300, net: 99700 },
    ]);
    // entry fees 301 over three 1-lot exits → fees 250, 250, 251 when each exit fill pays 150 (remainder on the last)
    // an open trade with one partial exit → []
    // Σ net of realizations === trade.net for every closed trade in fixtureSample
    ```
  - `days.test.ts`:
    - with `timeZone: 'America/New_York'`, the ES trade gives Mon 16 Nov +49700 and Tue 17 Nov +99700;
    - an open trade with a partial exit adds no day;
    - `dayDurations` on a day with entries at 09:30 and 13:00 and exits at 10:00 and 15:30 gives a longest of 360;
    - `avgDailyWinRate` over a day at 2/3 and a day at 1/1 is 0.8333.
  - `risk.test.ts`:
    - nets +10000, −5000 and +20000 cents on a 1,000,000-cent start give `sharpe` close to 10.5528 and `sortino` close to 46.1915 (`toBeCloseTo(x, 3)`);
    - one day gives both null;
    - no losing day gives `sortino` null.
  - `summary.test.ts`: `netRoi` is Σ net ÷ Σ cost basis on a 2-trade fixture, and null for an empty set.
  - `dashboard.test.ts`: the existing pinned weekly-goal and daily-loss figures still pass. Where a pinned figure moves because a fixture trade spans days, update it and name it in the commit body.
- [ ] **Step 2:** `npm test -- src/domain/metrics src/data/dashboard`. Expected: FAIL.
- [ ] **Step 3:** Implement. Reuse the FIFO lot matching in `trade-builder.ts` through a small exported helper rather than copying it.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(metrics): P&L booked by exit date, Net ROI, Sharpe and Sortino, day durations`.

---

### Task 4: Filters version 2, date presets and several accounts

Delivers X1-X3 and E54.

**Files:**
- Modify: `src/data/filters.ts`, `src/components/app/{filter-model.ts,filter-bar.tsx,account-switcher.tsx,top-bar.tsx}`, `src/data/query/derived.ts`
- Create: `src/components/app/more-filters.tsx`
- Test: `src/data/filters.test.ts`, `src/components/app/filter-bar.test.tsx`, `src/components/app/account-switcher.test.tsx`, `src/components/app/more-filters.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface TimeWindow { from?: string; to?: string }   // 'HH:MM', local time
  export interface NumRange { min?: number; max?: number }
  export type Outcome = 'win' | 'loss' | 'breakeven';
  export interface GlobalFilters {   // existing fields unchanged, plus:
    excludeSymbols: string[]; excludeStrategyIds: string[]; noStrategy: boolean;
    excludeTagIds: string[]; tagMatch: 'any' | 'all';
    outcomes: Outcome[]; status?: 'open' | 'closed'; holding?: 'intraday' | 'multiday';
    reviewed?: boolean; ratings: (1 | 2 | 3 | 4 | 5)[]; weekdays: number[] /* 1 Mon … 7 Sun */; months: number[] /* 1-12 */;
    entryWindows: TimeWindow[]; exitWindows: TimeWindow[];
    duration?: NumRange /* minutes */; entryPrice?: NumRange; exitPrice?: NumRange; size?: NumRange; r?: NumRange;
  }
  export function advancedFilterCount(f: GlobalFilters): number;
  ```
- **URL params,** added to `FILTER_PARAMS`. Lists are comma-separated, numeric ranges use `_` (so negatives work) and time windows use `-`:
  - `xsym`, `xstrat`, `nostrat=1`, `xtag`, `tagmatch=all`
  - `outcome=win,loss`, `status=open`, `hold=intraday`, `reviewed=1|0`, `rating=4,5`, `wd=1,2`, `mo=11`
  - `entry=09:30-11:00,13:00-`, `exit=…`
  - `dur=5_60`, `ep=100_200`, `xp=…`, `size=1_3`, `r=-1_2`
- `DATE_PRESETS` covers today, this week, this month, last 30 days, last month, this quarter and year to date. Existing keys keep their URL values; add `last-30-days`, `last-month` and `this-quarter` if they are missing.

Behaviour:
- **Semantics,** in `applyFilters`:
  - Exclusions win over inclusions.
  - `noStrategy` ORs with `strategyIds`.
  - `tagMatch: 'all'` needs every selected tag.
  - Outcome follows `outcomeOf` with the breakeven range, and only closed trades have one.
  - Intraday means opened and closed on the same local date. Open trades fail `holding`, `duration`, `exitPrice`, `exitWindows`, `r` and `outcomes` whenever those are set.
  - Windows test the local time. `from > to` wraps past midnight. A missing end is open.
  - `size` tests `maxPosition`. `r` tests realized R, and trades without risk fail it.
- **More filters panel:**
  - "More filters" opens a Radix popover at `md` and up, and a sheet below `md`.
  - Its sections are General (outcome, status, holding, reviewed, rating), Day and time (weekday, month, entry and exit windows, duration), Strategy (exclude, no strategy), Tags (exclude, match any or all) and Ranges (entry and exit price, size, R).
  - Edits are a draft until Apply. Reset clears the draft, and Cancel or Escape discards it.
  - The button shows the count from `advancedFilterCount` when it is above zero (`aria-label` "More filters, {n} active").
- **Accounts:** the account switcher becomes a multi-select with a search box over name and broker, plus "All accounts". It writes `account` as a list.
- **E54:** `useGlobalFilters` writes against `window.location.pathname` and skips the write while a navigation is pending.

- [ ] **Step 1: Write the failing tests.**
  - `filters.test.ts` covers one case per semantics bullet:
    - `symbols:['ES'], excludeSymbols:['ES']` keeps none;
    - the window `22:00-02:00` keeps a 23:30 and a 01:15 entry but not a 03:00 one;
    - `r: { min: -1, max: 2 }` drops a trade without risk;
    - `serializeFilters(parseFilters(p))` equals `p` for every new param;
    - `parseFilters('?dur=abc&wd=9&rating=7')` drops all three.
  - `more-filters.test.tsx`:
    - choosing "Losses" and Wednesday then Apply writes `outcome=loss&wd=3`;
    - Cancel writes nothing;
    - the badge reads 2.
  - `account-switcher.test.tsx`: typing "forex" leaves only the forex account, and selecting two writes `account=a,b`.
- [ ] **Step 2:** `npm test -- src/data/filters src/components/app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(filters): the full filter set, more date presets and several accounts at once`.

---

### Task 5: Display units and privacy

Delivers X4 and X5.

**Files:**
- Create: `src/lib/display.ts`, `src/components/app/display-menu.tsx`
- Modify: `src/lib/format.ts`, `src/components/app/top-bar.tsx`, `src/components/app/dashboard/*` (every money figure)
- Test: `src/lib/display.test.ts`, `src/components/app/display-menu.test.tsx`, `src/components/app/dashboard/dashboard-view.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Figure { money: Cents; pct?: number | null; r?: number | null; rLeftOut?: number }
  export interface DisplayOptions { unit: DisplayUnit; privacy: boolean; currency: string; signed: boolean }
  export function formatFigure(f: Figure, o: DisplayOptions): { text: string; label: string };
  export function useDisplay(): DisplayOptions & { figure(f: Figure, signed?: boolean): { text: string; label: string } }; // reads prefs
  export function DisplayMenu(): JSX.Element;
  ```
- **Text rules:**
  - Money uses `formatPnl` / `formatMoney`.
  - `percent` uses `formatPct` with 2 decimals and a sign, e.g. `+1.25%`.
  - `r` uses 2 decimals with a sign, e.g. `+3.40R`.
  - When the chosen unit's value is null or undefined, the money text shows instead.
  - Under privacy, money reads `+$•••` / `−$•••` / `$•••` (unsigned), with the currency symbol from `Intl`. Its `label` is "hidden amount".

- [ ] **Step 1: Write the failing tests.**
  - `display.test.ts`:
    - `formatFigure({ money: 12345 }, money/USD/signed)` gives `{ text: '+$123.45' }`;
    - with `pct: 0.0125` and unit percent, `+1.25%`;
    - with `r: 3.4` and unit r, `+3.40R`;
    - with unit r and `r: null`, it falls back to `+$123.45`;
    - privacy with money gives `+$•••` and the label "hidden amount";
    - privacy with unit percent still gives `+1.25%`.
  - `display-menu.test.tsx`: choosing R and switching on "Hide amounts" saves `displayUnit: 'r', privacy: true`, and the button's accessible name becomes "Display, amounts hidden".
  - `dashboard-view.test.tsx`: with `privacy: true` in prefs, no text node or `aria-label` in the dashboard matches `/\$\d/`.
- [ ] **Step 2:** `npm test -- src/lib/display src/components/app`. Expected: FAIL.
- [ ] **Step 3:** Implement. Route every dashboard money figure through `useDisplay`. Aggregate % uses the balance base from the Rulings (`balanceAt`, Task 18 extends it with cash flows). Until then, use the summed starting balances.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): $, % and R display, and privacy mode`.

**Module A review** after this task: the controller runs the review package over Tasks 1-5.

---

### Task 6: Trade log

Delivers TR1, TR2, TR3, TR5, TR6, E48 (trades) and E59. Comp `01-trades`.

**Files:**
- Create: `src/components/app/trades/{trades-view,columns,summary-strip}.tsx`, `src/data/csv-export.ts`
- Modify: `src/app/(app)/app/trades/page.tsx`, `src/components/app/dashboard/recent-trades.tsx`, `src/lib/format.ts`
- Test: `src/components/app/trades/trades-view.test.tsx`, `src/data/csv-export.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ColumnId = 'open' | 'close' | 'instrument' | 'account' | 'side' | 'qty' | 'entry' | 'exit' | 'gross' | 'fees'
    | 'net' | 'roi' | 'realizedR' | 'plannedR' | 'duration' | 'strategy' | 'setups' | 'mistakes' | 'emotions'
    | 'rules' | 'rating' | 'reviewed' | 'status';
  export const DEFAULT_COLUMNS: ColumnId[] = ['open','instrument','side','qty','entry','exit','net','realizedR',
    'duration','strategy','setups','mistakes','rules','rating','reviewed'];
  export function tradesCsv(trades: readonly Trade[], columns: readonly ColumnId[], env: CsvEnv): string; // real values, ISO times in the user's zone
  ```

Behaviour:
- **Header:** the title "Trades" with "Add trade" (to `/app/trades/new`) and "Export CSV".
- **Summary strip:** trades, net, win rate, profit factor and expectancy, each with `MetricTip`. "Hide summary" toggles `hideTradeSummary`.
- **Controls:**
  - A Closed / Open switch (`?status=`, shared with Task 4's param).
  - A search box that matches symbol, `#serial`, strategy name and tag names. Task 17 adds trade-note text.
  - A "Columns" menu with a checkbox per column and up/down reorder. It saves to `tradeColumns`, and "Reset to default" is there too.
- **Table:**
  - Sortable headers with `aria-sort`. The default sort is newest open first.
  - Each row's instrument cell links to `/app/trades/[id]`.
  - Reviewed shows a check glyph or nothing, with the accessible text "Reviewed" or "Not reviewed".
- **Pages:** 50 rows each, with the count "1-50 of 574" and previous/next.
- **Empty states:** "No trades match these filters." with Clear filters, or "No trades yet." with Import and "Add a trade".
- **E59:** the shared instrument label, used here and in the dashboard's recent trades:
  - the header reads "Instrument";
  - mistakes get their own "Mistake" column;
  - an option shows "TSLA 370 Put" with its expiry only when it differs from the open date.

- [ ] **Step 1: Write the failing tests.**
  - `csv-export.test.ts`: two trades and the columns `['open','instrument','net']` give a header `Open,Instrument,Net` and rows with `-123.45` (plain decimals, no currency sign), and the same output with privacy on.
  - `trades-view.test.tsx`, using `renderApp` and the sample fixture:
    - the strip shows the filtered count;
    - sorting by Net puts the largest first and sets `aria-sort="descending"`;
    - hiding Rating removes the column and saves the prefs;
    - the search "#12" leaves trade 12;
    - "Next page" shows rows 51-100;
    - the empty filter state shows Clear filters.
- [ ] **Step 2:** `npm test -- src/components/app/trades src/data/csv-export`. Expected: FAIL.
- [ ] **Step 3:** Implement with `@tanstack/react-table`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trades): the trade log with columns, summary, search and CSV export`.

---

### Task 7: Selection, bulk actions and the tag picker

Delivers TR4, E33 and E46.

**Files:**
- Create: `src/components/app/trades/bulk-bar.tsx`, `src/components/app/tag-picker.tsx`, `src/components/app/confirm-dialog.tsx`
- Modify: `trades-view.tsx`, `columns.tsx`, `src/components/app/dashboard/drilldown.tsx`
- Test: `bulk-bar.test.tsx`, `tag-picker.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function TagPicker(props: { selected: string[]; onChange(ids: string[]): void; categories?: TagCategory[]; allowCreate?: boolean; label: string }): JSX.Element;
  export function ConfirmDialog(props: { open: boolean; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean;
    requireText?: string; onConfirm(): Promise<void>; onClose(): void }): JSX.Element;
  ```

Behaviour:
- **Selection:**
  - A checkbox column. The header checkbox selects the page.
  - A banner offers "Select all {n} matching trades".
  - The bulk bar appears while anything is selected, reading "{n} selected" with these actions:
    - Tag: adds tags, never replaces;
    - Strategy: a strategy or "No strategy";
    - Mark reviewed and Mark not reviewed;
    - Export CSV;
    - Delete: confirm "Delete {n} trades? This can't be undone."
- **E33:** open imported trades are left out of a delete. The result reads "{k} open imported trades weren't deleted. Undo their import in Import history to remove them.", with a link to `/app/settings/import-history`.
- **TagPicker:**
  - Tags grouped by category, with search and keyboard navigation.
  - "Create '{text}'" appears when nothing matches and creation is allowed. It creates the tag in the first listed category, or "custom".
- **E46:** the dashboard drill-down's "tag what is missing" opens the TagPicker for that trade.

- [ ] **Step 1: Write the failing tests.**
  - `bulk-bar.test.tsx`:
    - select 3 rows, then Tag "fomo": the 3 trades gain the tag id and keep their old tags;
    - Mark reviewed sets `reviewed: true` on exactly those 3;
    - deleting 2 closed trades plus 1 open imported trade removes 2 and shows the E33 sentence.
  - `tag-picker.test.tsx`:
    - typing "rev" filters to "revenge";
    - Enter selects it;
    - typing "newtag" then "Create 'newtag'" creates it and selects it.
- [ ] **Step 2:** `npm test -- src/components/app/trades src/components/app/tag-picker`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trades): bulk tag, strategy, review, export and delete, with a shared tag picker`.

---

### Task 8: The note editor

Delivers the editor behind NB6, TD2 and NB4.

**Files:**
- Create: `src/components/app/notes/{note-editor,slash-menu}.tsx`, `src/lib/note-text.ts`
- Test: `note-editor.test.tsx`, `src/lib/note-text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function NoteEditor(props: { value: unknown; onChange(doc: unknown): void; label: string; placeholder?: string;
    readOnly?: boolean; autoFocus?: boolean }): JSX.Element;   // 'use client'
  export function docText(doc: unknown): string;    // plain text of a Tiptap JSON doc, blocks joined by '\n'
  export function docExcerpt(doc: unknown, max: number): string;
  ```

Behaviour:
- **Content:** headings 1-3, bullet, numbered and check lists, bold, italic, strike, inline code, link, quote, divider, table, collapsible section, undo and redo.
- **Toolbar:** bold, italic, link, H1-H3, lists, checklist and quote. Toggle buttons carry `aria-pressed`.
- **Slash menu:** "/" opens it with Heading 1, Heading 2, Heading 3, Bulleted list, Numbered list, Checklist, Quote, Collapsible section, Table and Divider. Arrow keys and Enter choose, and Escape closes.
- **Changes:** `onChange` fires with the JSON document, and the parent debounces saves at 600 ms.
- **Read-only:** `readOnly` renders the document with no toolbar.
- **Styling:** the type ramp and tokens. Collapsible sections use a caret button with `aria-expanded`.

- [ ] **Step 1: Write the failing tests.**
  - `note-text.test.ts`: a doc with a heading "Plan", a paragraph "Wait for the open" and a checklist item "Size down" gives `'Plan\nWait for the open\nSize down'`, and `docExcerpt(…, 10)` gives `'Plan Wait…'`.
  - `note-editor.test.tsx`:
    - renders a given doc's text;
    - running the slash command "Checklist" through the editor's commands calls `onChange` with a doc containing a `taskList`;
    - `readOnly` shows no toolbar.
    - If happy-dom can't drive ProseMirror typing, drive it through the editor's commands, and cover real typing in Task 20's e2e.
- [ ] **Step 2:** `npm test -- src/components/app/notes src/lib/note-text`. Expected: FAIL.
- [ ] **Step 3:** Add the Tiptap packages (Global Constraints) and implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS. The build checks that Tiptap bundles on the client only.
- [ ] **Step 5:** Commit: `feat(notes): rich-text note editor with a slash menu`.

---

### Task 9: The trade page

Delivers TD1, TD2, E47 and the trade-level parts of ST2. Comp `02-trade-detail`.

**Files:**
- Create: `src/app/(app)/app/trades/[id]/page.tsx`, `src/components/app/trades/{trade-view,fills-timeline,rule-checklist}.tsx`, `src/domain/rule-applies.ts`
- Modify: `src/components/app/dashboard/{drilldown,recent-trades}.tsx` (link rows)
- Test: `trade-view.test.tsx`, `src/domain/rule-applies.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function ruleApplies(rule: Rule, trade: Trade, ctx: MetricContext): boolean; // showWhen vs outcomeOf; open trades: only 'always'
  export function TradeView(props: { id: string }): JSX.Element;
  ```

Behaviour:
- **Header:**
  - Instrument label, side chip, status, net and realized R through `useDisplay`.
  - "Previous trade" / "Next trade", within the current filtered set sorted by open time, keeping the URL params.
  - "Back to trades".
- **Stats grid:** average entry and exit, quantity, gross, fees, Net ROI, duration, planned stop and target (inline inputs that save `plannedStop`/`plannedTarget`, with initial risk from `riskFromStop`), planned R, realized R, MAE and MFE ("Not recorded" when absent).
- **Fills:**
  - `FillsTimeline` draws an SVG of price against time from the fills only: buy and sell markers, plus average entry and exit lines. Its label reads "Fills from {first} to {last}, {n} fills".
  - The executions table shows time, side, quantity, price, commission and fees.
- **Journal:**
  - A strategy select.
  - The rule checklist shows only applying rules (`ruleApplies`), each tri-state: kept, broken or not graded (`TaskCheckbox`).
  - Tags grouped by category, each with a `TagPicker`.
  - Rating: a radio group of 5 stars ("Rating: 4 of 5").
  - A reviewed toggle.
  - The note: a `NoteEditor` bound to `ensureTradeNote` on the first change, with autosave.
- **Read-only:** on an archived account, "This account is archived. Its trades are read-only." and every control is disabled.
- **Not found:** "This trade isn't in this workspace." with a link to the trade log.
- **Manual trades:** they also show "Edit fills" (Task 10's route) and "Delete trade".

- [ ] **Step 1: Write the failing tests.**
  - `rule-applies.test.ts`:
    - 'loser' applies to a loss and not to a win;
    - 'breakeven' applies inside the breakeven range;
    - an open trade gets only 'always'.
  - `trade-view.test.tsx`:
    - the header shows the net;
    - "Next trade" goes to the next by open time within `?symbol=ES`;
    - setting the stop updates the realized R shown;
    - marking a rule broken saves `followed: false`;
    - typing in the note (via commands) creates one trade note and links it;
    - an archived account's trade has disabled controls;
    - an unknown id shows the not-found sentence.
- [ ] **Step 2:** `npm test -- src/components/app/trades src/domain/rule-applies`. Expected: FAIL.
- [ ] **Step 3:** Implement. Link the dashboard drill-down and recent-trade rows to the page (E47).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trades): the trade page with fills, rule checklist, tags, rating and note`.

---

### Task 10: Manual trade entry

Delivers MA1, MA2 and AC4 (the manual entry part).

**Files:**
- Create: `src/domain/manual-trade.ts`, `src/components/app/trades/manual-trade-form.tsx`, `src/app/(app)/app/trades/new/page.tsx`, `src/app/(app)/app/trades/[id]/edit/page.tsx`
- Modify: `src/data/local/trades.ts` (wire the builder into `createManual`/`replaceManual`)
- Test: `src/domain/manual-trade.test.ts`, `manual-trade-form.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ManualTradeError = 'no-fills' | 'reversal' | 'option-fields' | 'multiplier' | 'bad-fill';
  export function buildManualTrade(input: ManualTradeInput, ctx: { workspaceId: string; serial: number; accountCurrency: string; id?: string })
    : { ok: true; trade: Trade } | { ok: false; error: ManualTradeError; fillIndex?: number };
  export const ASSET_TYPES: { id: 'stock'|'option'|'future'|'future-option'|'forex'|'crypto'|'cfd'; label: string }[];
  // repository.ts
  export class ManualTradeRejected extends Error { constructor(readonly error: ManualTradeError, readonly fillIndex?: number) }
  ```
  `createManual` and `replaceManual` reject with `ManualTradeRejected` when the builder refuses.

Behaviour:
- **Form:**
  - Account, defaulting to the first active one. The account's time zone shows as "Times in {zone}".
  - Asset type: Stock, Option, Future, Future option, Forex, Crypto or CFD.
  - Symbol, with autocomplete from `resolveInstrument`'s registries: futures roots, forex pairs, crypto pairs.
  - By type:
    - Option: underlying, expiry, strike, call or put, multiplier (default 100).
    - Future option: futures root, expiry, strike, call or put, multiplier (default the root's point value, required for unknown roots).
    - Future: the symbol with its contract month (e.g. ESZ6), multiplier from the registry, editable, and required for unknown roots.
    - Forex: quantity in lots, multiplier 100,000.
    - CFD: multiplier, required.
    - Crypto: multiplier 1.
  - Fills grid: date and time, Buy/Sell, quantity, price, commission and fees, with "Add fill" and remove-row controls.
  - Planned stop and target, both optional.
- **Errors:** inline at the field or row, and saving writes nothing:
  - `no-fills`: "Add at least one fill."
  - `reversal`: "These fills reverse the position. Split them into two trades."
  - `option-fields`: "Enter the strike, expiry and call or put."
  - `multiplier`: "Enter the contract multiplier for {root}."
  - `bad-fill`: "Check fill {n}: quantity and price must be above zero."
- **Save:** creates the trade, then goes to its page. Edit (manual trades only) keeps the journal fields (strategy, tags, rule checks, rating, note, reviewed) and rebuilds the rest.
- **Time zone:** a fill time typed in the form is the account's local time (`timeZone ?? prefs.timeZone`), stored in UTC.

- [ ] **Step 1: Write the failing tests.**
  - `manual-trade.test.ts`:
    - ES long 2 @ 5000, sell 2 @ 5010, fees 0, gives a closed trade, gross +100000, `source: 'manual'`;
    - buy 2 then sell 1 gives an open trade;
    - buy 1 then sell 3 gives `reversal`;
    - an option without a strike gives `option-fields`;
    - root "ZZ" with no multiplier gives `multiplier`;
    - a CL future option (strike 70, call, multiplier 1000) builds with `assetClass: 'option'`, `underlying: 'CL'`, `pointValue: 1000`.
  - `manual-trade-form.test.tsx`:
    - with the account zone `America/New_York`, a fill typed as 2026-11-19 09:30 is stored as `2026-11-19T14:30:00.000Z`;
    - a reversal shows the reversal sentence and creates nothing;
    - saving goes to the trade page;
    - editing a manual trade keeps its tags.
- [ ] **Step 2:** `npm test -- src/domain/manual-trade src/components/app/trades`. Expected: FAIL.
- [ ] **Step 3:** Implement on `buildTrades`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trades): add and edit trades by hand, by asset type`.

**Module B review** after this task: Tasks 6-10.

---

### Task 11: Import steps 1 and 2: upload and map

Delivers IM1-IM3, E35, E36, E37 and E44 (encoding). Comp `03-import-map`.

**Files:**
- Create: `src/components/app/import/{import-flow,upload-step,map-step}.tsx`, `src/lib/decode.ts`
- Modify: `src/app/(app)/app/import/page.tsx`, `src/domain/import/{guess-columns,mapping}.ts`
- Test: `src/lib/decode.test.ts`, `src/domain/import/mapping.test.ts`, `map-step.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function decodeFile(bytes: ArrayBuffer): { text: string; encoding: 'utf-8' | 'windows-1252' };
  export function ImportFlow(): JSX.Element;   // stepper state in the URL: ?step=upload|map|preview|confirm
  ```

Behaviour:
- **Stepper:** Upload, Map columns, Preview, Confirm, with `aria-current="step"` on the current step.
- **Upload:**
  - A drop zone and file picker accepting `.csv` and `.txt`.
  - The file chip shows name, size and row count, and can be removed.
  - The line "Excel files: save as CSV for now."
  - A pending file from the landing page (`loadPendingImport`) opens straight into the flow.
- **Map, settings:**
  - Account select, with "New account" inline: name, broker, type, currency, starting balance, time zone.
  - Source time zone, defaulting to the account's zone, then the user's.
  - Date order MDY, DMY or YMD, and decimal mark "." or ",". Both are detected and can be changed (E35).
  - Rows are fills or closed trades. This is detected, can be changed, and the kind no longer flips on a header like "Exit Strategy" (E36).
- **Map, the table:**
  - One row per Keel field: required marker, the CSV column select, and up to 3 sample values.
  - A field matched automatically reads "Matched".
  - Unknown symbol roots ask for a point value and show the file's symbol beside the key (E37).
- **Saved mappings:**
  - "Save this mapping for {account}" is checked by default, and saves `Account.importMapping`.
  - When the account has a saved mapping and the file's headers contain its columns, the step opens with it and says "Using your saved mapping for {account}."
- **Continue:** disabled until every required field is mapped. The missing fields are listed: "Map these to continue: Time, Price."
- **E36:** the synonym list lives once, in `mapping.ts`, and `guess-columns.ts` imports it.

- [ ] **Step 1: Write the failing tests.**
  - `decode.test.ts`: UTF-8 bytes of "Prix €" decode as UTF-8, and windows-1252 bytes of "Prix €" decode as windows-1252 with the right text.
  - `mapping.test.ts`: a header "Exit Strategy" doesn't change the detected kind of a fills file.
  - `map-step.test.tsx`:
    - a file whose time column holds 19/11/2026 detects DMY;
    - mapping everything but Price lists "Price" and disables Continue;
    - an account with a saved mapping opens pre-filled with the saved-mapping sentence;
    - an unknown root shows the file symbol beside the point-value input.
- [ ] **Step 2:** `npm test -- src/lib/decode src/domain/import src/components/app/import`. Expected: FAIL.
- [ ] **Step 3:** Implement on Plan 2's import engine and `useImportPlan` (Task 1).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(import): upload and column mapping with saved mappings per account`.

---

### Task 12: Import steps 3 and 4, and the import history

Delivers IM1, IM4, E32 and E43. Comp `04-import-preview`.

**Files:**
- Create: `src/components/app/import/{preview-step,confirm-step}.tsx`, `src/components/app/settings/import-history.tsx`, `src/app/(app)/app/settings/import-history/page.tsx`
- Modify: `src/domain/import/plan.ts` (the `direction-flipped` flag), `import-flow.tsx`
- Test: `src/domain/import/plan.test.ts`, `preview-step.test.tsx`, `import-history.test.tsx`

**Interfaces:**
- Produces: `TradeFlag` gains `{ tradeId: string; code: 'direction-flipped'; was: Direction; now: Direction }`. It is raised when a trade in `trades` has the id of a `replacedTrades` entry with a different direction.

Behaviour:
- **Preview:**
  - Four tiles: rows read, trades built, duplicates skipped, rows with issues.
  - An issues list of row number and problem, collapsed after 20 with "Show all {n}".
  - A built-trades table: instrument, side, open, close, quantity, Keel net, file P&L.
  - Flags in words:
    - "File says {x}" for a P&L mismatch;
    - "Not converted from {ccy}";
    - "Expired worthless on {date}";
    - "Now {short}, was {long}: an earlier import overlaps this file".
  - A blocked plan shows its reason with the way out.
- **Confirm:**
  - "Import {n} trades into {account}". A `StalePlanError` reads "Your trades changed while you were mapping. Review the preview again." and returns to Preview.
  - On success: "{n} trades imported into {account}." with "View trades" (to `/app/trades?account={id}`) and "Import another file".
  - The undo line: "You can undo this import from Import history."
- **Import history:**
  - Columns: file, account, date, rows, trades, duplicates, skipped, status (Active or Undone).
  - "Undo" confirms with: "Undo this import? Its {n} trades are removed. Rows a later import skipped as duplicates stay out until you import that file again." (E43)

- [ ] **Step 1: Write the failing tests.**
  - `plan.test.ts`: an open long rebuilt short by an overlapping file yields one `direction-flipped` flag.
  - `preview-step.test.tsx`:
    - the tiles match the plan's counts;
    - a P&L mismatch row reads "File says +$10.00";
    - Confirm commits, and the success sentence shows.
  - `import-history.test.tsx`:
    - lists two jobs, newest first;
    - Undo shows the E43 sentence, then marks the job Undone and removes its trades.
- [ ] **Step 2:** `npm test -- src/domain/import src/components/app/import src/components/app/settings`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(import): preview, confirm and import history with undo`.

**Module C review** after this task: Tasks 11-12.

---

### Task 13: Calendar

Delivers CA1-CA3, with CA4 from Task 3. Comp `05-calendar`.

**Files:**
- Create: `src/components/app/calendar/{calendar-view,month-grid,year-grid,day-panel}.tsx`, `src/data/calendar.ts`
- Modify: `src/app/(app)/app/calendar/page.tsx`
- Test: `src/data/calendar.test.ts`, `calendar-view.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface CalendarDay { date: string; net: Cents; gross: Cents; fees: Cents; trades: number; wins: number; losses: number;
    r: number | null; tone: 'gain' | 'loss' | 'flat' | 'none'; hasNote: boolean }
  export function calendarMonth(trades: readonly Trade[], notes: readonly JournalEntry[], month: string /* YYYY-MM */, ctx: MetricContext)
    : { weeks: { days: (CalendarDay | null)[]; net: Cents; tradingDays: number }[]; summary: { net: Cents; greenDays: number; tradingDays: number; best: CalendarDay | null; worst: CalendarDay | null } };
  export function calendarYear(trades: readonly Trade[], year: number, ctx: MetricContext): { month: string; net: Cents; days: CalendarDay[] }[];
  ```
  `trades` counts the trades with an exit that day. `tone` is `flat` inside the breakeven range for days.

Behaviour:
- **Month view:** a grid Monday to Sunday.
  - Each cell shows the chosen stats (`calendarStats`, up to 3) in the display unit, coloured by tone, with a note glyph when the day has a daily note.
  - A weekly column shows the week's net and "{n} days".
  - The month summary reads net, "{g} of {d} green days", best day and worst day.
  - "Previous month", "Next month" and "This month" write `?month=YYYY-MM`.
  - "Stats shown" opens a popover of checkboxes, at most 3.
- **Selected day:** `?day=YYYY-MM-DD` opens the side panel with that day's stats, its trades (those with an exit that day, linking to their pages) and "Open daily note" (to `/app/notebook/daily/[date]`). Below `lg` the panel is a sheet.
- **Year view:** a Month / Year switch (`?view=year`) shows twelve small months with day tones and each month's net. Clicking a month opens it.
- **Filters:** the global filters and the Gross/Net switch apply.

- [ ] **Step 1: Write the failing tests.**
  - `calendar.test.ts`:
    - the Task 3 ES trade puts +$497.00 on 16 Nov and +$997.00 on 17 Nov;
    - a day inside a breakeven range of −$50/+$50 is `flat`;
    - the week totals equal the sum of their days;
    - `hasNote` is true on a date with a daily note.
  - `calendar-view.test.tsx`:
    - November 2026 renders 5 week rows;
    - selecting 19 Nov lists its trades;
    - choosing "Win rate" as a third stat shows it in the cells;
    - with privacy on, cells show `$•••`;
    - the year view shows 12 months.
- [ ] **Step 2:** `npm test -- src/data/calendar src/components/app/calendar`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(calendar): month and year views with day stats, notes and the day panel`.

**Module D review** after this task.

---

### Task 14: Reports shell, overview and performance

Delivers RE1 (overview), RE2, RE6 and E24. Comp `06-reports`.

**Files:**
- Create: `src/domain/metrics/series.ts`, `src/components/app/reports/{reports-shell,report-chart,summary-table,cross-analysis,overview,performance}.tsx`, `src/app/(app)/app/reports/[report]/page.tsx`
- Modify: `src/app/(app)/app/reports/page.tsx`
- Test: `series.test.ts`, `report-chart.test.tsx`, `overview.test.tsx`, `performance.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type SeriesMetric = 'net' | 'cumulative-net' | 'win-rate' | 'profit-factor' | 'expectancy' | 'avg-win' | 'avg-loss' | 'trades' | 'fees';
  export type Bucket = 'day' | 'week' | 'month';
  export function timeSeries(trades: readonly Trade[], ctx: MetricContext, metric: SeriesMetric, bucket: Bucket): { key: string; value: number | null }[];
  export type ReportKey = 'time' | 'symbol' | 'strategy' | 'tags' | 'side' | 'duration' | 'r-distribution'
    | 'performance' | 'risk' | 'wins-losses' | 'compare';
  export function ReportChart(props: { series: { label: string; kind: 'bar' | 'line'; points: { key: string; value: number | null }[]; unit: 'money' | 'pct' | 'ratio' | 'count' }[];
    label: string }): JSX.Element;
  export function SummaryTable<Row>(props: { rows: Row[]; columns: ColumnDef<Row>[]; label: string; initialSort?: SortingState }): JSX.Element;
  ```

Behaviour:
- **Shell:** the comp's tabs (Overview, Time, Symbol, Strategy, Tags and mistakes, Side, Duration, R distribution), then "More reports" (Performance, Risk, Wins vs losses, Compare). Unknown keys get `notFound()`. The global filters apply.
- **Overview:**
  - KPIs, each with `MetricTip`: net, win rate, profit factor, expectancy, average win and loss, largest win and loss, max drawdown, longest win and loss streak, green-day %, Sharpe and Sortino.
  - A cumulative P&L line and daily net bars, by realization date.
- **Performance:**
  - A metric picker, at most 3, each with Bar or Line, and a Day / Week / Month bucket. A fourth choice is disabled with "Three metrics at most".
  - The summary table by period lists every metric chosen, sortable.
- **ReportChart:**
  - Bars and lines share the x axis. Money axes go through the display formatter.
  - The hover and focus readout (E24) shows the period and each series' value.
  - The keyboard moves between points with the arrow keys.
  - `role="img"` with the label passed in, plus a visually hidden table of values.

- [ ] **Step 1: Write the failing tests.**
  - `series.test.ts`:
    - three trades over two days give `net` per day by realization;
    - `cumulative-net` runs through them;
    - `win-rate` on a day with no closed trades is null.
  - `report-chart.test.tsx`:
    - focusing the chart and pressing the right arrow shows the readout for the second period;
    - with privacy on, the readout shows `$•••`.
  - `overview.test.tsx`: the 14 KPIs render with their `data-metric-tip` ids.
  - `performance.test.tsx`: choosing net (bar), win rate (line) and trades (bar) disables the rest.
- [ ] **Step 2:** `npm test -- src/domain/metrics/series src/components/app/reports`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(reports): report shell, overview and performance with chart readouts`.

---

### Task 15: Breakdown reports, risk, wins vs losses and compare

Delivers RE1 (the breakdowns), RE2 (cross-analysis), RE3, RE4, RE5 and E5. Comp `07-report-time` for Time.

**Files:**
- Create: `src/components/app/reports/{breakdown-report,time-report,risk-report,wins-losses,compare}.tsx`
- Modify: `src/domain/metrics/breakdowns.ts`
- Test: `breakdowns.test.ts`, `time-report.test.tsx`, `compare.test.tsx`, `wins-losses.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function breakdown2D(trades: readonly Trade[], ctx: MetricContext, rows: BreakdownKey, cols: BreakdownKey,
    metric: 'net' | 'trades' | 'win-rate' | 'profit-factor', opts?: BreakdownOptions)
    : { rows: string[]; cols: string[]; cells: (number | null)[][] };   // at most 12 cols; the rest fold into 'Other'
  export function winsVsLosses(trades: readonly Trade[], ctx: MetricContext)
    : Record<'wins' | 'losses', { count: number; net: Cents; avgNet: Cents | null; avgDurationMin: number | null; avgR: number | null;
      avgSize: number | null; avgMae: Cents | null; avgMfe: Cents | null; longShare: number | null }>;
  // rDistribution: bins clamp to −5R…+5R with tails '−5R or less' and '+5R or more' (E5)
  // BreakdownKey gains 'size' (maxPosition buckets) and 'r' (1R buckets)
  ```

Behaviour:
- **Every breakdown report:** a chart of net by bucket, a sortable table (trades, win rate, net, profit factor, average), and "Cross-analyse by" (none, or another dimension) that swaps the table for the matrix.
- **Time:**
  - A 5 / 15 / 30 / 60-minute bucket switch, an Entry / Exit time switch, net by time of day as bars, and a weekday breakdown.
  - The URL holds `?bucket=15&basis=exit`.
- **Symbol, Strategy, Tags and mistakes, Side, Duration and R distribution** follow the same pattern.
- **Risk:** position size buckets, R buckets, and the drawdown curve.
- **Wins vs losses:** two columns of the stats above, side by side.
- **Compare:**
  - Group A and Group B, each with its own symbol, tags, side, outcome, date range, strategy and account. Group A starts from the global filters, and Group B starts empty.
  - "Compare" shows both summaries side by side with the differences, and both cumulative lines on one chart.

- [ ] **Step 1: Write the failing tests.**
  - `breakdowns.test.ts`:
    - `breakdown2D` of symbol × side on a 4-trade fixture gives a 2×2 matrix with the expected nets;
    - 14 symbols fold into 12 columns with "Other";
    - an 8R trade lands in "+5R or more".
  - `time-report.test.tsx`: `bucket=15` shows 15-minute labels, and switching to Exit changes a trade's bucket.
  - `wins-losses.test.tsx`: counts and average nets match the fixture.
  - `compare.test.tsx`: Group A "ES" against Group B "NQ" shows both nets and the difference.
- [ ] **Step 2:** `npm test -- src/domain/metrics/breakdowns src/components/app/reports`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(reports): breakdowns with cross-analysis, risk, wins vs losses and compare`.

**Module E review** after this task: Tasks 14-15.

---

### Task 16: Strategies

Delivers ST1-ST5 and E20. Comps `08-strategies` and `09-strategy-detail`.

**Files:**
- Create: `src/components/app/strategies/{strategies-view,strategy-view,strategy-form}.tsx`, `src/app/(app)/app/strategies/{[id]/page,new/page,[id]/edit/page}.tsx`
- Modify: `src/app/(app)/app/strategies/page.tsx`, `src/domain/metrics/rules.ts`, `src/components/product/rule-list.tsx` (E20: the landing tick hooks move to a landing-only wrapper)
- Test: `rules.test.ts`, `strategies-view.test.tsx`, `strategy-form.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface RuleStat { ruleId: string; applies: number; kept: number; broken: number; followRate: number | null;
    followedNet: Cents; followedWinRate: number | null; followedProfitFactor: number | null; brokenNet: Cents }
  export function ruleStats(trades: readonly Trade[], strategy: Strategy, ctx: MetricContext): RuleStat[]; // only trades where ruleApplies
  ```

Behaviour:
- **List:**
  - Per strategy: icon tile (icon and tone), name, asset classes, rule count, trades, net, win rate, adherence and status.
  - An Active / Archived switch and "New strategy".
  - Empty: "No strategies yet." with "New strategy".
- **Detail:**
  - The header: tile, name, description, Edit, and Archive or Unarchive.
  - Rules grouped entry, exit, risk and management, each with follow rate, P&L when followed and cost when broken. A rule whose show-when isn't "always" shows a chip: "On winners", "On losers" or "On breakevens".
  - The checklist, the strategy's stats and its equity line.
  - "View {n} trades" goes to `/app/trades?strategy={id}`.
- **Form:**
  - Name (required, "Give the strategy a name."), description, a 12-icon picker, a 5-tone picker and asset classes.
  - Rules by group: text, show-when select, Move up / Move down, Remove. Then checklist items.
  - Delete confirms: "Delete {name}? Its {n} trades keep their data and lose this strategy."

- [ ] **Step 1: Write the failing tests.**
  - `rules.test.ts`: a 'loser' rule kept on 2 losses and broken on 1 loss, with 3 wins present, gives `applies: 3`, `followRate: 0.667` and `followedNet` = the 2 losses' net.
  - `strategy-form.test.tsx`:
    - creating with an empty name shows the sentence;
    - adding an exit rule "Scale out at 2R" with show-when "Winner" saves it;
    - Move up reorders.
  - `strategies-view.test.tsx`:
    - the Archived switch lists only archived strategies;
    - deleting shows the confirm sentence with the trade count.
- [ ] **Step 2:** `npm test -- src/domain/metrics/rules src/components/app/strategies`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(strategies): list, detail and editor with per-rule stats and show-when`.

**Module F review** after this task.

---

### Task 17: Notebook

Delivers NB1-NB6 and E48 (notes). Comp `10-notebook`.

**Files:**
- Create: `src/components/app/notebook/{notebook-view,folder-rail,entry-list,day-card,templates-dialog}.tsx`, `src/app/(app)/app/notebook/{[entryId]/page,daily/[date]/page}.tsx`
- Modify: `src/app/(app)/app/notebook/page.tsx`
- Test: `notebook-view.test.tsx`, `templates-dialog.test.tsx`

Behaviour:
- **Folder rail:**
  - Favourites, Daily journal, Trade notes, Recaps, My notes, then user folders (with "New folder", plus rename and delete in a row menu), then Trash.
  - Each entry shows its count. Built-in folders have no row menu.
- **Entry list:**
  - Title, date, excerpt (`docExcerpt`, 120 characters) and tags.
  - Search over title, text and tags (E48). The trade log's search (Task 6) also gains trade-note text, through `docText`.
  - Newest first, and the selected entry is highlighted.
- **Editor pane:**
  - Title, `NoteEditor` (autosave 600 ms), tags input (lowercase, Enter adds, Backspace removes), favourite toggle (star, `aria-pressed`), and "Move to folder".
  - Delete moves the note to Trash: "Moved to Trash. Notes in Trash are deleted after 30 days." with Undo.
  - A trade note shows the trade's stats card and "Open trade".
- **New:** "Daily note" (today), "Pre-market plan", "Weekly recap" and "Note", each from its kind's default template.
- **Daily note** (`/app/notebook/daily/[date]`): opens or creates the day's note. The day card shows net, trades and win rate by realization, or "No trades this day." Below it sit chips linking to the day's trades.
- **Trash:** restore, or "Delete forever" (confirm).
- **Templates:**
  - The templates dialog lists templates by kind: edit (name, body in `NoteEditor`), "Set as default", Delete.
  - Delete is hidden for built-in templates. A deleted default falls back to the built-in one.

- [ ] **Step 1: Write the failing tests.**
  - `notebook-view.test.tsx`:
    - Daily journal lists the seed's 20 notes;
    - searching "breakout" finds a note whose body contains it;
    - starring adds the note to Favourites;
    - Delete moves it to Trash and Undo restores it;
    - deleting a user folder moves its notes to My notes;
    - `/app/notebook/daily/2026-11-19` shows the day card with that day's net.
  - `templates-dialog.test.tsx`:
    - "Set as default" on a new daily template makes the next daily note start from it;
    - built-in templates have no Delete.
- [ ] **Step 2:** `npm test -- src/components/app/notebook`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notebook): folders, daily notes, templates, favourites, tags and trash`.

**Module G review** after this task.

---

### Task 18: Settings: profile, trading, accounts, tags

Delivers SE1-SE3, AC1-AC4, E30 and E57. Comp `11-settings-accounts`.

**Files:**
- Create: `src/components/app/settings/{settings-nav,profile,trading,accounts,cash-flows,tags}.tsx`, `src/app/(app)/app/settings/{layout,profile/page,trading/page,accounts/page,tags/page}.tsx`, `src/domain/metrics/balance.ts`
- Modify: `src/app/(app)/app/settings/page.tsx` (redirects to profile), `src/lib/display.ts` (the % base uses `balanceAt`), `src/components/app/dashboard/states.tsx` (E57)
- Test: `balance.test.ts`, `accounts.test.tsx`, `profile.test.tsx`, `tags.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function balanceAt(accounts: readonly Account[], flows: readonly CashFlow[], trades: readonly Trade[], date: string, ctx: MetricContext): Cents;
  // starting balances + flows dated on or before `date` + net realized through `date`
  ```

Behaviour:
- **Sub-nav:** Profile, Trading, Accounts, Tags, Import history (`aria-current`).
- **Profile:**
  - Name.
  - Time zone, a searchable list of IANA zones. Until one is picked it reads "Browser default ({zone})" (E30).
  - Base currency.
- **Trading:**
  - Instruments you trade (asset-class chips).
  - Breakeven range, $ or %, with From and To.
  - "Settle expired options at zero" toggle.
  - Default P&L basis.
- **Accounts:**
  - The comp's table: name, broker, type, currency, starting balance, balance today, time zone, status, prop rules set or not, and actions.
  - "New account" and Edit open a dialog with the same fields.
  - "Deposits and withdrawals" lists dated flows (date, amount signed, note) with add, edit and remove. Empty: "No deposits or withdrawals."
  - Archive / Unarchive.
  - "Clear trades" confirms by typing the account name: "Delete all {n} trades and imports in {account}? This can't be undone."
  - Delete is only offered when the account has no trades.
- **Tags:** the four categories, each listing its tags with name, description and trade count. Add, rename, describe and delete. Delete confirms: "Delete {tag}? It's removed from {n} trades."
- **E57:** a workspace whose accounts are all archived reads "Your trades are in archived accounts." with a link to Accounts.

- [ ] **Step 1: Write the failing tests.**
  - `balance.test.ts`: starting $10,000, a +$1,000 deposit on 5 Nov, a −$500 withdrawal on 12 Nov and +$300 net realized by 15 Nov give $10,800.00 on 15 Nov.
  - `accounts.test.tsx`:
    - adding a −$500 withdrawal updates "balance today";
    - Clear trades requires the typed name;
    - Delete is absent while the account has trades;
    - archiving shows Archived.
  - `profile.test.tsx`: with no zone saved, it reads "Browser default (…)", and picking Europe/London saves it.
  - `tags.test.tsx`: deleting a tag used on 3 trades shows "It's removed from 3 trades."
- [ ] **Step 2:** `npm test -- src/domain/metrics/balance src/components/app/settings`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(settings): profile, trading preferences, accounts with cash flows, and tags`.

**Module H review** after this task.

---

### Task 19: Prop firms: challenges and phases

Delivers PF1-PF4, E12 and E22. Comp `12-prop-firms`.

**Files:**
- Create: `src/domain/prop/challenge.ts`, `src/components/app/prop/{prop-view,challenge-card,challenge-form}.tsx`
- Modify: `src/domain/prop/evaluate.ts`, `src/app/(app)/app/prop-firms/page.tsx`
- Test: `evaluate.test.ts`, `challenge.test.ts`, `prop-view.test.tsx`, `challenge-form.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // evaluate.ts: evaluateProp honours periodDays (breach reason 'period-ended' when the target isn't met by the period's last local day)
  // and drawdownFloor (the drawdown limit never sits below the floor balance)
  export type BreachReason = { rule: 'daily-loss' | 'max-drawdown' | 'period-ended' | 'consistency'; date: string; value: Cents; limit: Cents };
  export interface ChallengeState { currentStep: ChallengeStep | null; status: 'active' | 'near' | 'breached' | 'passed' | 'closed-passed' | 'closed-failed';
    breach?: BreachReason; daysLeft: number | null; phases: { step: ChallengeStep; accountId?: string; archived: boolean; state?: PropStatus }[] }
  export function challengeState(c: Challenge, accounts: readonly Account[], trades: readonly Trade[], ctx: MetricContext, today: string): ChallengeState;
  export function drawdownLabel(t: DrawdownType): string;   // 'Static drawdown' | 'End-of-day drawdown' | 'Trailing drawdown' (E22)
  ```
  The current step is the first phase with an account that isn't passed.

Behaviour:
- **Cards:** one per challenge.
  - Name, firm, current phase ("Step 1 of 2", "Funded") and a status chip: Active, Near a limit, Breached or Passed.
  - Tracks: profit target progress, drawdown left with its label, today's daily loss, minimum trading days, consistency, and "{n} days left" when a period is set.
  - The fees line: "Fees {evaluation} + {activation}".
  - A breach sentence: "Breached on {date}: daily loss reached {value} of {limit}."
  - Actions: "Close out as passed", "Close out as failed", Edit.
- **Form:**
  - Name, firm, steps (1 or 2), evaluation fee, activation fee.
  - Per phase:
    - link an existing account (same workspace, a prop type) or create one, plus a start date;
    - rules: profit target in $ or %, daily loss in $ or % (E12; % converts against the starting balance), max drawdown in $ or %;
    - drawdown type static, end of day or trailing; floor at the starting balance or a fixed level;
    - minimum trading days; period in days or none; best-day consistency %.
  - Step 2 offers "Same rules as step 1".
  - The funded phase has no target or period.
- **Empty:** "No challenges yet." with "New challenge".
- **Archived:** a phase whose account is archived reads "Account archived".

- [ ] **Step 1: Write the failing tests.**
  - `evaluate.test.ts`:
    - `periodDays: 30` with the target unmet on day 31 gives the breach reason `period-ended`;
    - a trailing drawdown with `drawdownFloor` 100,000 cents above the start never moves the limit below that floor.
  - `challenge.test.ts`:
    - a 2-step challenge whose step 1 met its target and minimum days, with step 2 linked, has `currentStep: 'step-2'`;
    - a breached step 1 gives `status: 'breached'` with the reason;
    - `closedOut: 'failed'` gives `closed-failed`.
  - `prop-view.test.tsx`: the seed's challenge card shows "Step 1 of 2" and the drawdown label from its type.
  - `challenge-form.test.tsx`:
    - a daily loss of 5% on a $100,000 start saves `dailyLossLimit: 500000`;
    - "Same rules as step 1" copies the rules;
    - the funded phase shows no target field.
- [ ] **Step 2:** `npm test -- src/domain/prop src/components/app/prop`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(prop): challenges with phases, per-phase rules, fees and computed status`.

**Module I review** after this task.

---

### Task 20: End-to-end coverage, finish review and records

Delivers E28, and closes the plan.

**Files:**
- Create: `e2e/{trades,import,calendar,reports,notebook,settings,prop}.spec.ts`, `e2e/fixtures/fills.csv` (12 fills: ES and NQ, two days)
- Modify: `e2e/pages.spec.ts` (new routes render without overflow at 390 and 1440), `e2e/app-shell.spec.ts`, `docs/BACKLOG.md`, `docs/research/tradezella-feature-map.md`, `DESIGN.md` (via the documenter)

Behaviour, one journey per spec on the sample workspace unless stated:
- **trades:** filter to ES, sort by net, open the top trade, tag it "fomo", type a note, then return and see the tag in the log. Bulk-mark 3 trades reviewed. Add a manual NQ trade and see it on its page.
- **import (E28):** in My workspace, upload `fills.csv` through the UI, create an account inline, map the columns, preview, confirm, see the trades in the log and the calendar, then undo it from Import history.
- **calendar:** open 19 Nov, see the day's trades, open the daily note, type and reload, and the text persists.
- **reports:** switch to Time, 15 minutes, by exit. Cross-analyse by side. Compare ES against NQ.
- **notebook:** create a folder, a note in it, favourite it, trash and restore it.
- **settings:** add a withdrawal, archive an account, and see a trade page read-only.
- **prop:** create a 1-step challenge on a new prop account, and see its card.
- **pages:** every new route renders at 390 and 1440 with no horizontal overflow. Privacy on hides `$` digits on Trades, Calendar and Reports.

- [ ] **Step 1:** Write the specs above.
- [ ] **Step 2:** `npm run e2e`. Expected: all pass. Fix failures in the owning module's code, never by weakening a spec.
- [ ] **Step 3: Finish review.**
  - Capture every new route at 1440 light, 1440 dark and 390 (`scripts/capture.mjs`).
  - Run the Impeccable detector, and dispatch `impeccable:impeccable-finish-reviewer` against the comps. Fix its material findings.
  - Then dispatch `impeccable:impeccable-documenter` to record the new components in DESIGN.md.
- [ ] **Step 4: Records.**
  - In `BACKLOG.md`, close the items this plan owns, re-own E10, E25, E44's worker part, E50, E52 and E55 to Plan 6, and add E62 (user-made tag categories, Plan 6).
  - In the feature map, mark delivered P5 rows Done.
- [ ] **Step 5: Full gate:** `npm test && npm run typecheck && npm run lint && npx prettier --check . && npm run e2e`. Expected: all green.
- [ ] **Step 6:** Commit: `test(e2e): journeys for every Plan 5 module; docs: backlog, feature map and DESIGN.md`.

---

## Done when

- Every P5 row of the feature map works on the sample workspace and on an imported file, and is marked Done.
- Every §6 route renders at 390-1680px without overflow, and the global filters, the display unit and privacy apply consistently.
- A user CSV imports through the full mapping flow and shows correctly in Trades, Dashboard, Calendar and Reports, and it can be undone.
- The full gate is green, the finish reviewer returns ship, DESIGN.md records the new components, and BACKLOG.md lists everything deferred.

## Self-review

1. **Feature map coverage,** every P5 ID against its task:
   - X1-X3 → 4; X4-X5 → 5; X9 → 3
   - TR1-TR3, TR5, TR6 → 6; TR4 → 7
   - MA1-MA2 → 10; TD1-TD2 → 9
   - IM1-IM3 → 11; IM1, IM4 → 12
   - CA1-CA3 → 13; CA4 → 3
   - RE1, RE2, RE6 → 14; RE1, RE2, RE3-RE5 → 15
   - ST1-ST5 → 16 (storage in 2)
   - NB1-NB6 → 8 and 17
   - AC1-AC4 → 18 (AC4 also in 10 and 11)
   - PF1-PF4 → 19
   - SE1-SE3 → 18, with SE3's user-made categories ruled to Plan 6
2. **Spec coverage:**
   - §6 routes: trades and `[id]` (6, 9), calendar (13), reports and `[report]` (14, 15), strategies and `[id]` (16), notebook and `[entryId]` (17), import (11, 12), the settings sub-routes (12, 18), prop firms (19).
   - §7: the metrics in Tasks 3, 14 and 15. The import rules in Tasks 11 and 12, with the P&L mismatch flag. The alignment table holds, with the date-booking ruling added.
   - §8: workspaces carry through every repository call (Task 2).
   - §11: every done-when line maps to Task 20.
3. **Type consistency:**
   - These are defined once and used under the same names later: `ManualTradeInput`, `ManualTradeError`, `Realization`, `GlobalFilters`, `Figure`, `ColumnId`, `CalendarDay`, `SeriesMetric`, `ReportKey`, `RuleStat`, `ChallengeState`, `BreachReason`, `balanceAt`, `ruleApplies`, `docText`.
   - Hook names in Task 2 match their uses in Tasks 7, 9, 10, 12 and 16-19.
4. **Review Focus:** each line has its pinning test in the owning task (1 → 3 and 13; 2 → 5, 6, 13, 14 and 20; 3 → 4; 4 → 2, 16, 17, 18 and 19; 5 → 10).
5. **Proportion:** the plan pins names, signatures, exact copy, URL params and test values. Component bodies are left to the implementers against the comps.
