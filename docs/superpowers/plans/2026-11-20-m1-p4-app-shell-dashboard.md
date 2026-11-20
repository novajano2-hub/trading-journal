# Milestone 1 · Plan 4: App shell and Dashboard, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the app chrome every `/app` route sits in (sidebar, account switcher, URL filter chips, search, Gross/Net, Import, theme) and the "Plan vs actual" Dashboard at `/app/dashboard`, working end to end on Plan 2's data.

**Architecture:**
- New pure metrics go in `src/domain/metrics` (rule scorecard, mistake costs, goals). `src/data/dashboard.ts` turns one currency partition into a view model.
- Components read only Plan 2's TanStack Query hooks. Pages under `src/app/(app)/app/` are server components that put client leaves inside `<Suspense>`.
- Four HorizonX components are adapted to Keel tokens: Signal Tooltip, Morph Dialog, Expanding Search and Task Checkbox. Radix supplies the accessible behaviour underneath.

**Tech Stack:** Next.js 16.4.6 App Router, React 19.3, TypeScript strict, Tailwind v4, motion/react 14, Radix UI (`radix-ui`), Phosphor icons (duotone), TanStack Query 5 via Plan 2, Vitest 5 + Testing Library + happy-dom + fake-indexeddb, Playwright on system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md` (§6 routes, chrome and URL filters; §7 domain model and the platform-alignment table; §10–§12). The authorities, in order:
1. The binding direction contract: `.impeccable/surfaces/src-app-app-app-dashboard-page-tsx.md`.
2. The approved composition: `.impeccable/mocks/decision-app/rules-scorecard.html`, rendered as `6-plan-vs-actual.png`.
3. The spec.
4. `DESIGN.md` with `src/styles/theme.css`, and `PRODUCT.md`.
5. Plan 2's hooks and contracts: `docs/superpowers/plans/2026-11-20-m1-p2-data-layer.md`, Tasks 7, 9, 10, 11, 13 and 14.

## Global Constraints

- Node ≥ 22, npm, Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind 4.3.3, Vitest 5, Playwright with `channel: 'chrome'`.
- Plan 2 must be merged on `m1-data` first. Import its names exactly:
  - `src/data/query/hooks.ts`: `useWorkspaces`, `useActiveWorkspace`, `useSetActiveWorkspace`, `usePrefs`, `useUpdatePrefs`, `useAccounts`, `useTrades`, `useStrategies`, `useTags`, `useUpdateTrade`
  - `src/data/query/derived.ts`: `useGlobalFilters`, `useTradeSet`, `useMetrics`, `Derived`, `TradeSet`
  - `src/data/query/provider.tsx`: `DataProvider`
  - `src/data/filters.ts`: `GlobalFilters`, `EMPTY_FILTERS`, `DATE_PRESETS`, `DatePreset`, `DateRange`, `resolveRange`, `serializeFilters`, `parseFilters`, `FILTER_PARAMS`
  - `src/data/metrics.ts`: `CurrencyMetrics`, `metricsByCurrency`, `metricContextOf`
  - `src/data/repository.ts`: `StorageUnavailableError`, `defaultPrefs`
  - `src/data/workspaces.ts`: `SAMPLE_WORKSPACE`, `USER_WORKSPACE`
  - `src/data/seed/generate.ts`: `generateSampleWorkspace`, `SAMPLE_SEED`, `SampleWorkspace`
  - `src/data/__fixtures__/sample.ts`: `fixtureSample`
  - `src/data/local/local-repository.ts`: `createLocalRepository`
  - `src/domain/import/numbers.ts`: `parseDecimal`
- "Pages talk only to TanStack Query hooks over the interfaces" (§8). No file under `src/components` or `src/app` imports `src/data/local/*`, Dexie or IndexedDB. Tests are the exception: they build a repository for `DataProvider`.
- `src/domain/**` stays pure: no `react`, `next`, browser globals or I/O.
- Before framework-level code, read in `node_modules/next/dist/docs/01-app/`:
  - `03-api-reference/04-functions/use-search-params.md` (a `useSearchParams` reader sits inside `<Suspense>`)
  - `03-api-reference/04-functions/use-pathname.md` and `use-router.md`
  - `03-api-reference/03-file-conventions/layout.md`
  - `02-guides/redirecting.md` (`redirects` in `next.config`)
  - `01-getting-started/04-linking-and-navigating.md` ("Native History API")
  - If `next dev` rewrites AGENTS.md, commit that change with the task.
- Dependencies: add exactly `radix-ui@^1.8.1`. `@phosphor-icons/react` and `motion` are already installed. Add nothing else.
- Icons:
  - Phosphor only. Import from `@phosphor-icons/react/dist/ssr`, so server and client components share them.
  - App icons use the **duotone** weight inside a 32px `IconTile` (Task 4). Inline 13–18px glyphs (carets, close, check) stay regular weight, or fill for CheckCircle and XCircle, as DESIGN.md says.
- Visual system:
  - Use the tokens from `theme.css` through their Tailwind names (`bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`) and no raw hex.
  - Radii: chips 6, controls and inner panels 10, cards 16. Tracks keep 7/5.
  - Geist Mono with `tabular-nums` for every number.
  - Green and red only for signed money and kept/broken. A sign or a word always travels with them.
  - Cobalt only for primary action, selection and focus.
- Type sizes come from DESIGN.md's ramp. Two additions come from the approved composition: the 40px Geist Mono 500 hero figure (−0.02em) and the 14px/600 card title. The documenter records both in Task 12.
- Copy:
  - No em or en dashes. Ranges use a hyphen: "1-20 Nov".
  - No eyebrows, no uppercase labels, no decorative dots.
  - Money goes through `formatPnl` / `formatMoney` (U+2212 minus).
  - Sample data is always labelled.
  - A module that isn't built says so, with no numbers.
- Motion lives only in `'use client'` leaves. Use the tokens from `src/lib/motion.ts` (`enter`, `exit`, `glide`, `press`). Under `useReducedMotion()`, nothing moves.
- HorizonX:
  - Fetch with the HorizonX MCP tool `export_component`, `framework: "react"`, passing only parameters that `get_component` lists.
  - Restyle to Keel tokens: drop their palette, gradients, blur and fonts.
  - The file opens with an attribution comment in the style of `src/components/ui/tabs.tsx`: `// Technique adapted from HorizonX <Title>, commercial licence: <what was kept>.`
- Every metric label carries its definition through `MetricTip` (Task 4). The text comes only from `src/content/metric-definitions.ts`.
- Global filters live in the URL (Plan 2 `useGlobalFilters`) and scope every number on the Dashboard.
- Accessibility: WCAG 2.2 AA, a visible focus ring, 44px targets on coarse pointers, and a keyboard path for every action.
- Layout:
  - No horizontal page overflow from 390 to 1680px.
  - The sidebar becomes a drawer below `lg` (1024px).
- Tests:
  - Component tests start with `// @vitest-environment happy-dom` and `afterEach(cleanup)`.
  - Under `noUncheckedIndexedAccess`, use `!` on indexed access. Snippets omit some for brevity.
- Stay on branch `m1-data`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Imported trades with no strategy and no rule checks.** Every real import starts this way.
   - "Your plan" shows its own empty state. Mistakes say none are tagged.
   - Performance and Recent trades still show real numbers, and nothing reads 0% or NaN.
   - Pinned in Tasks 9 and 10.
2. **A filter link that matches nothing vs a workspace with no trades.**
   - These are two different empty states, each with a way out: Clear filters, or Import / Open the sample workspace.
   - Pinned in Task 9 and in the e2e in Task 11.
3. **The Gross/Net switch.**
   - Rule costs, mistake costs, KPIs and the equity line follow it.
   - The goals and the daily loss limit stay net.
   - Pinned in Task 3.
4. **A trade that broke several rules or carries several mistake tags.**
   - The "Broken rules cost" headline counts it once. Each rule row counts it, so rows can add up to more than the headline, and the definitions say so.
   - Pinned in Task 1.
5. **Day and week boundaries in the trader's timezone.**
   - A trade that closes Sunday 21:00 in New York (Monday 02:00 UTC) belongs to the week that ends that Sunday.
   - The daily loss limit uses local days.
   - Pinned in Task 2.

## Rulings

| Question | Ruling | Basis |
|---|---|---|
| Where the account filter lives | Only in the sidebar account switcher (the trader badge). It writes the same `account` URL param as the chips do. The top bar carries date, symbol, side, strategy and tags. | The contract and the composition put the switcher in the sidebar and show no account chip. One control per param. This overrides the brief's chip list. |
| Switching workspace | Clears the `account`, `strategy` and `tag` params, and keeps date, symbol and side. | Ids never cross workspaces (Plan 2 Review Focus 5). |
| Per-rule adherence | `kept ÷ (kept + broken)` over the rule's checks on closed trades. `null` checks are left out. | Same basis as `summarize().ruleAdherence`. TradeZella documents a per-rule "Follow rate (%)" with no formula. |
| Cost when broken | The P&L, on the Gross/Net basis, of closed trades whose check for that rule is `false`. It is signed, so it can be positive. The drill-down also shows the P&L of trades that kept the rule. | TradeZella documents "Net profit/loss for trades following the rule". Keel reports the complement as well. |
| "Broken rules cost" headline | The P&L of closed trades that broke at least one rule, each trade counted once | PRODUCT principle 1 (exact numbers). The sketch's −$3,323 summed the rows, which double-counts. |
| Rule order and flag | By cost when broken, most negative first. Never-broken rules come last and read "none". "Costliest" marks the first row only when its cost is below zero. The five costliest rules show, then "Show all N rules". | Contract. The composition fits five rows. |
| Mistake cost | The basis P&L of closed trades carrying a `mistake`-category tag. A trade with two mistakes counts in both. Sorted most negative first. Equals the Reports tag breakdown for that tag. | TradeZella's tag report: "total realized P&L for each tag" |
| Goals storage | `UserPrefs.goals?: Record<workspaceId, Goals>`, through Plan 2's `PrefsRepo`. The sample workspace falls back to `SAMPLE_GOALS` until edited. My workspace starts with none. | The smallest honest store. Goals are user preferences, so `PrefsRepo` (user-level) holds them. Keying by workspace keeps the sample's demo goals out of the trader's own. |
| Weekly net goal | The net P&L of closed trades in the goal week: Monday to the anchor day, where the anchor is the earlier of the range end and today, clipped to the range start. Always net. | Keel's call. Plan 2 weeks start Monday. |
| Daily loss limit | A day breaks it when its net P&L is below −limit. A day exactly at −limit keeps it. Days are the local days with closed trades in the filters. Always net. | TradeZella "Net Max Loss /Day: … Exceeding this amount will uncheck the rule." |
| Currency | One partition at a time: the base currency if it has closed trades, else the first that has. A switch appears when two or more have trades. | E3; FX is backlog #8 |
| Recent trades | The 5 newest closed trades in the filters | Composition |
| Nav icon tiles | The active item's tile is `accent-soft` / `accent-ink`. Others are `sunken` / `muted`. "Not live yet" items are `sunken` / `faint`. | The contract's tiles under DESIGN.md's One Accent Rule |
| Search scope | Modules, symbols, strategies and tags. Text search over trades waits for the Trades page. | PRODUCT principle 5 (never fake capability) |
| Task Checkbox use | The per-trade "Kept" check in a rule's drill-down, which regrades that trade's rule check | The contract story has the trader acting inside the dialog, and TradeZella grades rules per trade |
| Placeholders | Every sidebar route Plan 5 builds gets a page that says the module isn't built yet, with one line on what it will do and no figures | §6, PRODUCT principle 5 |

## Backlog items owned by this plan

| Item | Where |
|---|---|
| E19 number ticker after hydration | App tickers mount only after data loads on the client, so the failure can't happen in the app. Task 4 makes value changes count from the previous value. The landing case is re-owned to "Release polish" (Task 12). |
| E23 "Get started" → /signup | Task 6 adds "Open the sample workspace" to /login and /signup (§6: "continue into the sample workspace"). The real sign-up flow stays with #2. |
| E24 hover readouts | Clickable rule and mistake rows get a hover fill (Tasks 9 and 10). Bar readouts and the product trade rows are re-owned to Plan 5 (Reports). |
| New E28–E33 | Recorded in Task 12 |

## File map

```
src/domain/            (modified) types.ts
src/domain/metrics/    rules.ts  mistakes.ts  goals.ts
src/data/              dashboard.ts  goals.ts   (modified) trade-patch.ts  local/prefs.ts
src/lib/               range-label.ts           (modified) time-format.ts
src/content/           metric-definitions.ts
src/styles/            (modified) theme.css      src/app/globals.css (modified)
src/components/ui/     icon-tile.tsx  metric-tip.tsx  morph-dialog.tsx  task-checkbox.tsx  expanding-search.tsx
                       (modified) button.tsx
src/components/product/ sparkline.tsx            (modified) number-ticker.tsx
src/components/site/   (modified) brand-mark.tsx  auth-form.tsx
src/components/app/    nav.ts  app-shell.tsx  sidebar.tsx  mobile-nav.tsx  top-bar.tsx  account-switcher.tsx
                       filter-model.ts  filter-bar.tsx  basis-switch.tsx  sample-label.tsx  search.ts  app-search.tsx
                       module-placeholder.tsx  __fixtures__/render-app.tsx  __fixtures__/dashboard-sample.ts
src/components/app/dashboard/  dashboard-view.tsx  states.tsx  plan-card.tsx  mistakes-card.tsx  drilldown.tsx
                       goals-card.tsx  performance-card.tsx  recent-trades.tsx
src/app/(app)/         (modified) layout.tsx
src/app/(app)/app/     dashboard/page.tsx  {trades,calendar,reports,strategies,notebook,prop-firms,
                       backtesting,replay,mentors,assistant,settings}/page.tsx   (modified) import/page.tsx
next.config.ts (modified)   scripts/capture.mjs (modified)   docs/BACKLOG.md (modified)
e2e/                   app-shell.spec.ts  dashboard.spec.ts   (modified) pages.spec.ts
```

---

### Task 1: Rule scorecard and mistake costs

**Files:**
- Create: `src/domain/metrics/rules.ts`, `src/domain/metrics/mistakes.ts`
- Test: `src/domain/metrics/rules.test.ts`, `src/domain/metrics/mistakes.test.ts`

**Interfaces:**
- Consumes: `MetricContext`, `pnlOf` (`metrics/context.ts`), `isClosed`, `closedInOrder` (`trade-status.ts`), `summarize`, `breakdown` (tests only), `makeTrade` (`__fixtures__/trades.ts`), `Trade`, `Strategy`, `Tag`, `RuleGroup`
- Produces:
  ```ts
  // rules.ts
  export interface RuleScore {
    ruleId: string; text: string; group: RuleGroup; strategyId: string; strategyName: string;
    kept: number; broken: number; adherence: number; // kept / (kept + broken); a row exists only with ≥ 1 decisive check
    brokenPnl: Cents; keptPnl: Cents;                 // basis P&L of closed trades that broke / kept it
    brokenTradeIds: string[];                         // newest close first
  }
  export function ruleScorecard(trades: readonly Trade[], strategies: readonly Strategy[], ctx: MetricContext): RuleScore[];
  export function brokenRulesCost(trades: readonly Trade[], ctx: MetricContext): { pnl: Cents; tradeCount: number };
  // mistakes.ts
  export interface MistakeCost { tagId: string; name: string; tradeCount: number; pnl: Cents; tradeIds: string[] /* newest close first */ }
  export function mistakeCosts(trades: readonly Trade[], tags: readonly Tag[], ctx: MetricContext): MistakeCost[];
  ```

Rules:
- Closed trades only.
- Only checks whose `ruleId` resolves to a rule of some strategy count. Unknown ids are skipped silently.
- If a trade carries two checks for the same rule, the first one wins.
- `ruleScorecard` order:
  - rules with `broken > 0`, by `brokenPnl` ascending
  - then never-broken rules, by adherence descending
  - then by text
- `mistakeCosts` returns only `category: 'mistake'` tags with at least one closed trade. Order: `pnl` ascending, then name.

- [ ] **Step 1: Write the failing tests.** `rules.test.ts`:

```ts
const ctx = defaultMetricContext('America/New_York');
const strat = (id: string, name: string, rules: Rule[]) => ({ id, name, rules, workspaceId: 'w', description: '', assetClasses: [], checklist: [], status: 'active' }) as Strategy;
const strategies = [strat('s1', 'Range break', [
  { id: 'r-stop', text: 'Stop stays where it was placed', group: 'risk' },
  { id: 'r-size', text: 'Risk no more than 1R per trade', group: 'risk' },
  { id: 'r-max', text: 'Max 6 trades a day', group: 'management' }])];
const chk = (ruleId: string, followed: boolean | null) => ({ ruleId, followed });
const trades = [
  makeTrade({ id: 'a', net: -40000, fees: 500, closedAt: '2026-11-18T15:00:00Z', ruleChecks: [chk('r-stop', false), chk('r-size', false), chk('r-max', true)] }),
  makeTrade({ id: 'b', net: -10000, closedAt: '2026-11-19T15:00:00Z', ruleChecks: [chk('r-stop', false), chk('r-max', true), chk('r-gone', false)] }),
  makeTrade({ id: 'c', net: 30000, closedAt: '2026-11-19T16:00:00Z', ruleChecks: [chk('r-stop', true), chk('r-size', null), chk('r-max', true)] }),
  makeTrade({ id: 'd', net: 5000, status: 'open', ruleChecks: [chk('r-stop', false)] }),
];
test('per rule: kept of checked, adherence, cost when broken, newest broken first', () => {
  const [stop, size, max] = ruleScorecard(trades, strategies, ctx);
  expect(stop).toMatchObject({ ruleId: 'r-stop', strategyName: 'Range break', kept: 1, broken: 2, brokenPnl: -50000, keptPnl: 30000, brokenTradeIds: ['b', 'a'] });
  expect(stop!.adherence).toBeCloseTo(1 / 3);
  expect(size).toMatchObject({ ruleId: 'r-size', kept: 0, broken: 1, brokenPnl: -40000 });
  expect(max).toMatchObject({ ruleId: 'r-max', kept: 3, broken: 0, brokenPnl: 0, adherence: 1 });
});
test('unknown rule ids and open trades are ignored', () => {
  expect(ruleScorecard(trades, strategies, ctx).map((r) => r.ruleId)).toEqual(['r-stop', 'r-size', 'r-max']);
});
test('costs follow the Gross/Net basis', () => {
  expect(ruleScorecard(trades, strategies, { ...ctx, pnlBasis: 'gross' })[0]!.brokenPnl).toBe(-49500);
});
test('the headline counts a trade that broke two rules once (Review Focus 4)', () => {
  expect(brokenRulesCost(trades, ctx)).toEqual({ pnl: -50000, tradeCount: 2 });
});
test('the scorecard agrees with summarize when every check resolves', () => {
  const known = trades.map((t) => ({ ...t, ruleChecks: t.ruleChecks.filter((c) => c.ruleId !== 'r-gone') }));
  const rows = ruleScorecard(known, strategies, ctx);
  const kept = rows.reduce((n, r) => n + r.kept, 0), all = rows.reduce((n, r) => n + r.kept + r.broken, 0);
  expect(kept / all).toBe(summarize(known, ctx).ruleAdherence);
});
test('two strategies with the same rule text stay separate rows', () => { /* add strat('s2','Pullback',[{ id: 'r2-stop', text: 'Stop stays where it was placed', group: 'risk' }]) and a trade checking r2-stop false; expect two rows with that text and different strategyName */ });
```

`mistakes.test.ts`:

```ts
const tags = [{ id: 'm1', name: 'Moved stop', category: 'mistake' }, { id: 'm2', name: 'Revenge trade', category: 'mistake' },
  { id: 'm3', name: 'Chased entry', category: 'mistake' }, { id: 'p1', name: 'Pullback', category: 'setup' }] as Tag[];
const trades = [
  makeTrade({ id: 'a', net: -40000, closedAt: '2026-11-18T15:00:00Z', tagIds: ['m1', 'm2'] }),
  makeTrade({ id: 'b', net: -10000, closedAt: '2026-11-19T15:00:00Z', tagIds: ['m1'] }),
  makeTrade({ id: 'c', net: 30000, closedAt: '2026-11-19T16:00:00Z', tagIds: ['p1'] }),
  makeTrade({ id: 'd', net: 5000, status: 'open', tagIds: ['m3'] }),
];
test('cost per mistake tag, a two-mistake trade counted in both, newest first', () => {
  expect(mistakeCosts(trades, tags, ctx)).toEqual([
    { tagId: 'm1', name: 'Moved stop', tradeCount: 2, pnl: -50000, tradeIds: ['b', 'a'] },
    { tagId: 'm2', name: 'Revenge trade', tradeCount: 1, pnl: -40000, tradeIds: ['a'] },
  ]);
});
test('matches the Reports tag breakdown', () => {
  const rows = breakdown(trades, 'tag', ctx);
  for (const m of mistakeCosts(trades, tags, ctx)) expect(m.pnl).toBe(rows.find((r) => r.key === m.tagId)!.summary.netPnl);
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/metrics/rules src/domain/metrics/mistakes`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** both modules. Reuse `pnlOf` and `isClosed`. Build a `Map<ruleId, { rule, strategy }>` once.
- [ ] **Step 4: Verify:** `npm test -- src/domain && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(domain): per-rule adherence and cost when broken, mistake costs`.

---

### Task 2: Goals: week, daily loss limit and their storage

**Files:**
- Create: `src/domain/metrics/goals.ts`, `src/data/goals.ts`
- Modify: `src/domain/types.ts`, `src/data/local/prefs.ts`
- Test: `src/domain/metrics/goals.test.ts`, `src/data/goals.test.ts`, `src/data/local/prefs-goals.test.ts`

**Interfaces:**
- Consumes: `DayStat`, `dailyPnl`, `defaultMetricContext` (`metrics/days.ts`, `context.ts`), `UserPrefs`, `Workspace`, `toCents`, `parseDecimal` (Plan 2), `createLocalRepository`, `fixtureSample`, `generateSampleWorkspace`, `SAMPLE_SEED` (tests)
- Produces:
  ```ts
  // types.ts (additive)
  /** One workspace's goals, in its base currency. A missing field means that goal isn't set. */
  export interface Goals { weeklyNet?: Cents; dailyLossLimit?: Cents }
  export interface UserPrefs { /* …existing… */ goals?: Record<string /* workspaceId */, Goals> }
  // domain/metrics/goals.ts — pass days built on the NET basis
  export interface DateWindow { from: string; to: string }
  export function goalWeek(range: { from?: string; to?: string }, today: string): DateWindow | null;
  export interface WeeklyGoalProgress { target: Cents; net: Cents; window: DateWindow; reached: boolean; fraction: number /* net / target, clamped 0..1 */ }
  export function weeklyGoalProgress(days: readonly DayStat[], target: Cents, window: DateWindow): WeeklyGoalProgress;
  export interface DailyLossProgress { limit: Cents; tradingDays: number; keptDays: number; brokenDays: DayStat[] /* ascending */ }
  export function dailyLossProgress(days: readonly DayStat[], limit: Cents): DailyLossProgress;
  // data/goals.ts
  export const SAMPLE_GOALS: Required<Goals>;
  export function goalsFor(prefs: UserPrefs, workspace: Workspace): Goals;
  export function withGoals(prefs: UserPrefs, workspaceId: string, goals: Goals): Pick<UserPrefs, 'goals'>; // the PrefsRepo.update patch
  export type GoalAmount = { ok: true; cents: Cents | undefined } | { ok: false; message: string };
  export function parseGoalAmount(raw: string): GoalAmount;
  ```

Rules:
- **`goalWeek`:**
  - anchor = `min(range.to ?? today, today)`
  - from = `max(Monday of anchor, range.from)`
  - to = anchor
  - Returns `null` when from > to.
  - Use date-fns on `YYYY-MM-DD` strings.
- **`goalsFor`:** `prefs.goals?.[ws.id]`, else `SAMPLE_GOALS` for `kind: 'sample'`, else `{}`.
- **`withGoals`:** returns `{ goals: { ...prefs.goals, [id]: goals } }` with undefined fields removed.
- **`parseGoalAmount`:**
  - Trim, then drop `$`, spaces and `,`.
  - Empty means `{ ok: true, cents: undefined }` (clears the goal).
  - Then `parseDecimal(s, '.')` and `toCents`.
  - `null` gives "Enter an amount, like 1,500."
  - ≤ 0 gives "Enter an amount above zero, or leave it empty."
- **`PrefsRepo.update`** throws `RangeError` when any `goals` value that is present isn't a positive safe integer.
- **`SAMPLE_GOALS`:** pick them in this task from the generated sample: a weekly net goal rounded to $500 and a daily loss limit rounded to $100, so that the realism test below passes. Don't widen its bounds.

- [ ] **Step 1: Write the failing tests.** `goals.test.ts` (domain):

```ts
test('the goal week runs Monday to the range end or today, clipped to the range', () => {
  expect(goalWeek({}, '2026-11-20')).toEqual({ from: '2026-11-16', to: '2026-11-20' });
  expect(goalWeek({}, '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  expect(goalWeek({}, '2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-23' });
  expect(goalWeek({ from: '2026-11-01', to: '2026-11-13' }, '2026-11-20')).toEqual({ from: '2026-11-09', to: '2026-11-13' });
  expect(goalWeek({ from: '2026-11-18', to: '2026-11-30' }, '2026-11-20')).toEqual({ from: '2026-11-18', to: '2026-11-20' });
  expect(goalWeek({ from: '2026-12-01' }, '2026-11-20')).toBeNull();
});
const day = (date: string, net: number) => ({ date, net, tradeCount: 1, wins: 0, losses: 0, costBasis: 0 });
test('weekly progress sums the window only', () => {
  const days = [day('2026-11-13', 99999), day('2026-11-16', 120000), day('2026-11-19', -20000), day('2026-11-20', 172750)];
  const w = { from: '2026-11-16', to: '2026-11-20' };
  expect(weeklyGoalProgress(days, 150000, w)).toEqual({ target: 150000, net: 272750, window: w, reached: true, fraction: 1 });
  expect(weeklyGoalProgress(days, 400000, w).fraction).toBeCloseTo(272750 / 400000);
  expect(weeklyGoalProgress([day('2026-11-16', -5000)], 150000, w)).toMatchObject({ reached: false, fraction: 0 });
});
test('a day exactly at the limit keeps it; beyond breaks it', () => {
  const p = dailyLossProgress([day('2026-11-09', -50000), day('2026-11-11', -50500), day('2026-11-12', 2000)], 50000);
  expect(p).toMatchObject({ limit: 50000, tradingDays: 3, keptDays: 2 });
  expect(p.brokenDays.map((d) => d.date)).toEqual(['2026-11-11']);
});
test('a Sunday-evening New York close counts in that week (Review Focus 5)', () => {
  const t = makeTrade({ net: 30000, closedAt: '2026-11-23T02:00:00Z' }); // Sun 22 Nov 21:00 in New York
  const days = dailyPnl([t], defaultMetricContext('America/New_York'));
  expect(weeklyGoalProgress(days, 10000, { from: '2026-11-16', to: '2026-11-22' }).net).toBe(30000);
  expect(dailyLossProgress(days, 10000).tradingDays).toBe(1);
});
```

`src/data/goals.test.ts`:

```ts
test('sample goals until edited; none for My workspace', () => {
  const prefs = defaultPrefs();
  expect(goalsFor(prefs, SAMPLE_WORKSPACE)).toEqual(SAMPLE_GOALS);
  expect(goalsFor(prefs, USER_WORKSPACE)).toEqual({});
  const edited = { ...prefs, ...withGoals(prefs, 'sample', { weeklyNet: 100000 }) };
  expect(goalsFor(edited, SAMPLE_WORKSPACE)).toEqual({ weeklyNet: 100000 });
  expect(goalsFor(edited, USER_WORKSPACE)).toEqual({});
});
test('goal amounts parse to cents', () => {
  expect(parseGoalAmount('')).toEqual({ ok: true, cents: undefined });
  expect(parseGoalAmount(' $1,500.50 ')).toEqual({ ok: true, cents: 150050 });
  expect(parseGoalAmount('500')).toEqual({ ok: true, cents: 50000 });
  expect(parseGoalAmount('-5')).toEqual({ ok: false, message: 'Enter an amount above zero, or leave it empty.' });
  expect(parseGoalAmount('abc')).toEqual({ ok: false, message: 'Enter an amount, like 1,500.' });
});
test('sample goals are kept on some days and weeks and missed on others', { timeout: 30_000 }, () => {
  const s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  const days = dailyPnl(s.trades, defaultMetricContext('America/New_York'));
  const loss = dailyLossProgress(days, SAMPLE_GOALS.dailyLossLimit);
  expect(loss.brokenDays.length).toBeGreaterThanOrEqual(1);
  expect(loss.brokenDays.length / loss.tradingDays).toBeLessThanOrEqual(0.25);
  /* weekly: for each Monday (date-fns startOfWeek, weekStartsOn 1) from the first trading day, weeklyGoalProgress over Mon..Sun;
     expect reached in ≥ 1 week and ≤ 75% of weeks */
});
```

`prefs-goals.test.ts` (fake-indexeddb, `sample: async () => fixtureSample()`):
- `update({ goals: { mine: { weeklyNet: 150000 } } })` persists across two repository instances on one `IDBFactory`.
- `get()` with nothing stored has no `goals` key, so Plan 2's `defaultPrefs()` equality still holds.
- `{ dailyLossLimit: 0 }`, `{ weeklyNet: -100 }` and `{ weeklyNet: 1.5 }` each reject with `RangeError`.

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/metrics/goals src/data/goals src/data/local/prefs-goals`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the types, the domain functions and `src/data/goals.ts`. Add the validation in `localPrefs` (`src/data/local/prefs.ts`) next to Plan 2's timezone and breakeven checks. Tune `SAMPLE_GOALS` against the generated sample.
- [ ] **Step 4: Verify:** `npm test -- src/domain src/data && npm run typecheck`. Expected: PASS, including every Plan 2 prefs test.
- [ ] **Step 5: Commit** with `feat(goals): weekly net goal and daily loss limit, stored per workspace in prefs`.

---

### Task 3: Dashboard view model and range labels

**Files:**
- Create: `src/data/dashboard.ts`, `src/lib/range-label.ts`
- Test: `src/data/dashboard.test.ts`, `src/lib/range-label.test.ts`

**Interfaces:**
- Consumes: `ruleScorecard`, `brokenRulesCost`, `RuleScore`, `mistakeCosts`, `MistakeCost` (Task 1); `goalWeek`, `weeklyGoalProgress`, `dailyLossProgress`, `WeeklyGoalProgress`, `DailyLossProgress`, `Goals` (Task 2); `CurrencyMetrics`, `metricsByCurrency`, `DateRange`, `DatePreset`, `generateSampleWorkspace` (Plan 2); `dailyPnl`, `MetricContext`, `PnlBasis`
- Produces:
  ```ts
  // dashboard.ts
  export const RULES_SHOWN = 5;
  export const RECENT_TRADE_COUNT = 5;
  export interface TradeRulesSummary { kind: 'kept' | 'broke' | 'ungraded'; kept: number; checked: number /* decisive */; broken: string[] /* rule texts */ }
  export function tradeRulesSummary(trade: Trade, ruleText: ReadonlyMap<string, string>): TradeRulesSummary;
  export interface RecentTrade { trade: Trade; strategyName: string | null; mistakes: string[]; rules: TradeRulesSummary }
  export interface DashboardEnv { strategies: readonly Strategy[]; tags: readonly Tag[]; goals: Goals; ctx: MetricContext;
    range: { from?: string; to?: string } /* resolved */; today: string }
  export interface DashboardModel {
    currency: string; basis: PnlBasis; closedCount: number;
    plan: { adherence: number | null; checks: number; cost: { pnl: Cents; tradeCount: number }; rules: RuleScore[] };
    mistakes: MistakeCost[];
    goals: { weekly: WeeklyGoalProgress | null; dailyLoss: DailyLossProgress | null };
    performance: { pnl: Cents /* on basis */; winRate: number | null; profitFactor: number | null; expectancy: Cents | null; equity: Cents[] /* starting balance first */ };
    recent: RecentTrade[];
    tradesById: ReadonlyMap<string, Trade>;
  }
  export function buildDashboard(m: CurrencyMetrics, env: DashboardEnv): DashboardModel;
  export function pickPartition(ms: readonly CurrencyMetrics[], chosen: string | undefined, base: string): CurrencyMetrics;
  // range-label.ts
  export const PRESET_LABELS: Record<DatePreset, string>; // Today, This week, Last week, This month, Last month, Last 30 days, Year to date
  export function rangeCaption(r: { from?: string; to?: string }, today: string): string;
  export function rangeChipLabel(range: DateRange, resolved: { from?: string; to?: string }): string;
  ```

Rules:
- **Plan and performance:**
  - `plan.adherence` is `m.summary.ruleAdherence`.
  - `plan.checks` counts the decisive checks on closed trades.
  - `performance.pnl` is `grossPnl` or `netPnl` by `m.summary.basis`.
- **Goals** are built from `dailyPnl(m.trades, { ...env.ctx, pnlBasis: 'net' })`, whatever the basis. `weekly` is `null` without `weeklyNet` or when `goalWeek` is `null`. `dailyLoss` is `null` without a limit.
- **`tradeRulesSummary`** is `ungraded` with no decisive checks, `broke` with any `false`, and `kept` otherwise.
- **`pickPartition`** is ruled above. "Has trades" means `summary.closedCount > 0`.
- **`rangeCaption`:**
  - `'all time'`, `'since 3 Mar'` or `'to 3 Mar'` when the range is open at one or both ends
  - `'20 Nov'` for a single day
  - `'1-20 Nov'` within one month
  - `'28 Oct-3 Nov'` within one year
  - `'30 Dec 2025-2 Jan 2026'` across years
  - The year is added when it isn't `today`'s year: `'1-20 Nov 2025'`.
- **`rangeChipLabel`:**
  - a preset gives its label
  - `{}` gives `'All time'`
  - a custom range gives the caption with the year always shown: `'1-20 Nov 2026'`

- [ ] **Step 1: Write the failing tests.** `dashboard.test.ts` (node), with one generation in `beforeAll`:

```ts
const NY = 'America/New_York';
let s: SampleWorkspace;
beforeAll(() => { s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' }); }, 30_000);
const usd = (ctx: MetricContext) => metricsByCurrency(s.trades, { accounts: s.accounts, ctx, baseCurrency: 'USD' })[0]!;
const env = (ctx: MetricContext): DashboardEnv => ({ strategies: s.strategies, tags: s.tags, goals: { weeklyNet: 150000, dailyLossLimit: 50000 }, ctx, range: {}, today: '2026-11-20' });

test('the dashboard is the engine, sorted by cost', () => {
  const ctx = defaultMetricContext(NY), m = usd(ctx), d = buildDashboard(m, env(ctx));
  expect(d.plan.adherence).toBe(m.summary.ruleAdherence);
  const broken = d.plan.rules.filter((r) => r.broken > 0);
  expect(broken.map((r) => r.brokenPnl)).toEqual(broken.map((r) => r.brokenPnl).sort((a, b) => a - b));
  expect(d.plan.rules.slice(broken.length).every((r) => r.broken === 0)).toBe(true);
  expect(d.recent).toHaveLength(RECENT_TRADE_COUNT);
  expect(d.recent.every((r) => r.trade.status === 'closed')).toBe(true);
  expect(d.recent[0]!.trade.closedAt! >= d.recent[1]!.trade.closedAt!).toBe(true);
  expect(d.performance.equity[0]).toBe(17_500_000);
  expect(d.performance.equity).toHaveLength(m.summary.closedCount + 1);
  expect(d.goals.weekly!.window).toEqual({ from: '2026-11-16', to: '2026-11-20' });
});
test('Gross/Net moves costs and performance, never goals (Review Focus 3)', () => {
  const net = defaultMetricContext(NY), gross = { ...net, pnlBasis: 'gross' as const };
  const a = buildDashboard(usd(net), env(net)), b = buildDashboard(usd(gross), env(gross));
  expect(b.performance.pnl).toBe(usd(gross).summary.grossPnl);
  expect(b.performance.pnl).toBeGreaterThan(a.performance.pnl);
  expect(b.plan.cost.pnl).toBeGreaterThan(a.plan.cost.pnl);
  expect(b.goals).toEqual(a.goals);
});
test('dashboard metrics for the sample compute in under 50 ms (spec §10)', () => {
  const ctx = defaultMetricContext(NY);
  const run = () => buildDashboard(usd(ctx), env(ctx));
  run();
  const ms = Array.from({ length: 5 }, () => { const t = performance.now(); run(); return performance.now() - t; }).sort((x, y) => x - y);
  expect(ms[2]!).toBeLessThan(50);
});
test('one currency at a time', () => {
  const part = (currency: string, n: number) => ({ currency, summary: { closedCount: n } }) as CurrencyMetrics;
  expect(pickPartition([part('USD', 0), part('GBP', 3)], undefined, 'USD').currency).toBe('GBP');
  expect(pickPartition([part('USD', 5), part('GBP', 3)], 'GBP', 'USD').currency).toBe('GBP');
  expect(pickPartition([part('USD', 5), part('GBP', 3)], 'JPY', 'USD').currency).toBe('USD');
  expect(pickPartition([part('USD', 0)], undefined, 'USD').currency).toBe('USD');
});
test('a trade’s rules column', () => {
  const text = new Map([['r1', 'Stop stays where it was placed'], ['r2', 'Max 6 trades a day']]);
  const t = (checks: RuleCheck[]) => makeTrade({ net: 0, ruleChecks: checks });
  expect(tradeRulesSummary(t([{ ruleId: 'r1', followed: true }, { ruleId: 'r2', followed: true }, { ruleId: 'r3', followed: null }]), text)).toEqual({ kind: 'kept', kept: 2, checked: 2, broken: [] });
  expect(tradeRulesSummary(t([{ ruleId: 'r1', followed: false }, { ruleId: 'r2', followed: true }]), text)).toEqual({ kind: 'broke', kept: 1, checked: 2, broken: ['Stop stays where it was placed'] });
  expect(tradeRulesSummary(t([]), text).kind).toBe('ungraded');
});
```

`range-label.test.ts`:

```ts
test.each([
  [{}, 'all time'], [{ from: '2026-03-03' }, 'since 3 Mar'], [{ to: '2026-03-03' }, 'to 3 Mar'],
  [{ from: '2026-11-20', to: '2026-11-20' }, '20 Nov'], [{ from: '2026-11-01', to: '2026-11-20' }, '1-20 Nov'],
  [{ from: '2026-10-28', to: '2026-11-03' }, '28 Oct-3 Nov'], [{ from: '2025-12-30', to: '2026-01-02' }, '30 Dec 2025-2 Jan 2026'],
  [{ from: '2025-11-01', to: '2025-11-20' }, '1-20 Nov 2025'],
])('caption %o', (r, out) => expect(rangeCaption(r, '2026-11-20')).toBe(out));
test('chip labels', () => {
  expect(rangeChipLabel({ preset: 'this-month' }, { from: '2026-11-01', to: '2026-11-20' })).toBe('This month');
  expect(rangeChipLabel({}, {})).toBe('All time');
  expect(rangeChipLabel({ from: '2026-11-01', to: '2026-11-20' }, { from: '2026-11-01', to: '2026-11-20' })).toBe('1-20 Nov 2026');
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/dashboard src/lib/range-label`. Expected: FAIL.
- [ ] **Step 3: Implement.** For recent trades, sort the closed trades by `closedAt` descending and take `RECENT_TRADE_COUNT`. `mistakes` holds the names of the trade's mistake-category tags.
- [ ] **Step 4: Verify:** `npm test -- src/data src/lib && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): dashboard view model and range labels`.

---

### Task 4: UI foundations: Radix, icon tile, metric tooltip, ticker, sparkline

**Files:**
- Create: `src/components/ui/icon-tile.tsx`, `src/components/ui/metric-tip.tsx`, `src/content/metric-definitions.ts`, `src/components/product/sparkline.tsx`
- Modify: `package.json`, `package-lock.json`, `src/styles/theme.css`, `src/app/globals.css`, `src/components/product/number-ticker.tsx`, `src/components/ui/button.tsx`
- Test: `src/content/metric-definitions.test.ts`, `src/components/ui/metric-tip.test.tsx`, `src/components/product/app-product.test.tsx`

**Interfaces:**
- Consumes: `PnlBasis`, `equityPath` (`src/lib/landing/equity-path.ts`), `formatPct`, `formatPnl`, `formatRatio`, motion tokens
- Produces:
  ```ts
  // icon-tile.tsx — 32px tile, 6px radius, 18px duotone glyph
  export type TileTone = 'accent' | 'neutral' | 'faint' | 'gain' | 'loss';
  export function IconTile(props: { icon: Icon; tone?: TileTone; className?: string }): JSX.Element;
  // metric-definitions.ts
  export const METRIC_IDS = ['rule-adherence', 'broken-rules-cost', 'rule-kept', 'rule-cost-broken', 'mistake-cost', 'weekly-goal',
    'daily-loss-limit', 'pnl', 'win-rate', 'profit-factor', 'expectancy', 'equity'] as const;
  export type MetricId = (typeof METRIC_IDS)[number];
  export function metricDefinition(id: MetricId, basis: PnlBasis): { label: string; definition: string };
  // metric-tip.tsx ('use client') — the label is the trigger
  export function MetricTip(props: { id: MetricId; basis: PnlBasis; children?: ReactNode /* visible label; default the definition's label */; className?: string }): JSX.Element;
  // number-ticker.tsx — new optional props, defaults unchanged
  export function formatTicker(kind: TickerKind, value: number, opts?: { digits?: number /* pct, default 1 */; currency?: string /* money, default 'USD' */ }): string;
  // NumberTicker gains digits?: number and currency?: string
  // sparkline.tsx
  export function Sparkline(props: { series: readonly number[]; label: string; className?: string }): JSX.Element | null;
  // button.tsx
  export function buttonClasses(variant?: ButtonVariant, size?: ButtonSize): string; // the Button look for links
  ```

Definitions. Exact copy, where `{basis}` is "net" or "gross":

| id | label | definition |
|---|---|---|
| rule-adherence | Adherence | Rule checks kept, divided by rule checks answered, on closed trades in your filters. Unanswered checks don't count. |
| broken-rules-cost | Broken rules cost | Total {basis} P&L of closed trades that broke at least one rule. A trade that broke several rules counts once. |
| rule-kept | Kept | Closed trades that kept this rule, of those checked against it. |
| rule-cost-broken | Cost when broken | Total {basis} P&L of closed trades that broke this rule. A trade that broke several rules counts in each, so rows can add up to more than the total. |
| mistake-cost | Cost | Total {basis} P&L of closed trades tagged with this mistake. A trade with two mistakes counts in both. |
| weekly-goal | Weekly net goal | Net P&L after fees of closed trades from Monday to today, or to the end of your date range, in your timezone. Always net. |
| daily-loss-limit | Daily loss limit | A day breaks the limit when its net P&L after fees falls below minus the limit. A day exactly at the limit keeps it. Always net. |
| pnl | Net P&L / Gross P&L | Sum of {basis} P&L of closed trades in your filters. Net is after fees and commissions. Gross is before them. |
| win-rate | Win rate | Wins divided by wins plus losses. Breakeven trades, inside your breakeven range, are left out. |
| profit-factor | Profit factor | Total won divided by total lost, on {basis} P&L. None yet when there are no losing trades. |
| expectancy | Expectancy | Win rate times average win, minus loss rate times average loss, per trade, on {basis} P&L. |
| equity | Equity | Starting balances of the selected accounts plus cumulative {basis} P&L, after each closed trade. |

- [ ] **Step 1: Install** with `npm install radix-ui@^1.8.1`.
- [ ] **Step 2: Fetch the HorizonX source.** Call `export_component` with `slug: 'signal-tooltip'`, `framework: 'react'` and params `{ tooltipRadius: 10, tooltipGap: 8, tooltipFontSize: 12, fontWeight: 500, duration: 250, revealDistance: 6, lift: 0 }`.
  - Keep its reveal technique and its accent signal mark.
  - Map the "info" tone to `--accent`, and drop the default and alert tones and the button cluster.
- [ ] **Step 3: Write the failing tests.** `metric-definitions.test.ts`:
  - Every id in `METRIC_IDS` has a non-empty label and definition.
  - No definition contains `—` or `–`.
  - `metricDefinition('pnl', 'gross').label === 'Gross P&L'`.
  - `metricDefinition('rule-cost-broken', 'gross').definition` contains `'gross P&L'`.

`metric-tip.test.tsx`, starting with `// @vitest-environment happy-dom`:

```tsx
test('the label is a button that shows its definition on focus and hides on Escape', async () => {
  render(<MetricTip id="win-rate" basis="net" />);
  const trigger = screen.getByRole('button', { name: 'Win rate' });
  expect(trigger.dataset.metricTip).toBe('win-rate');
  fireEvent.focus(trigger);
  expect((await screen.findByRole('tooltip')).textContent).toContain('Breakeven trades');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});
```

`app-product.test.tsx` (node, `renderToStaticMarkup`):
- `formatTicker('pct', 0.91, { digits: 0 })` gives `'91%'`.
- `formatTicker('money', 1250, { currency: 'EUR' })` gives `'+€12.50'`.
- The existing `product.test.tsx` ticker test still passes unchanged.
- `<Sparkline series={[1, 3, 2]} label="Equity" />` contains `role="img"`, `aria-label="Equity"` and a path starting `M0 `.
- `<Sparkline series={[]} … />` renders `''`.

- [ ] **Step 4: Run and confirm failure:** `npm test -- src/content src/components/ui/metric-tip src/components/product/app-product`. Expected: FAIL.
- [ ] **Step 5: Implement.**
  - **`MetricTip`:**
    - A controlled Radix `Tooltip` (`radix-ui`) inside its own `Tooltip.Provider` (`delayDuration={150}`), so it works anywhere without a shell provider. It opens on hover, focus and tap (an `onClick` toggle, for touch) and closes on Escape.
    - The trigger is a `<button type="button" data-metric-tip>` with a dotted underline in `line-2`.
    - Content: `surface-1` fill, 1px `line-2`, 10px radius, `--shadow-chip`, 12px muted text, max width 280px.
    - Reveal over `enter`. Under reduced motion, none.
  - **`--veil`:** add it to `theme.css` (`rgba(15,18,24,0.32)` light, `rgba(0,0,0,0.6)` dark) and as `--color-veil` in `globals.css`.
  - **NumberTicker:** after the first count, a new `value` animates from the value currently shown, not from zero.
  - **Sparkline:**
    - `viewBox 0 0 300 56`, `preserveAspectRatio="none"`, using `equityPath(series, { xMax: 300, top: 3, bottom: 53, floor: 56 })`.
    - Accent line, 1.5px, `vector-effect: non-scaling-stroke`, with an accent area at 7% opacity.
    - `motion-safe:animate-draw` on the line.
- [ ] **Step 6: Verify:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit** `package.json`, `package-lock.json` and the files with `feat(ui): metric tooltip, icon tile, sparkline, ticker digits and currency`.

---

### Task 5: Morph dialog and task checkbox

**Files:**
- Create: `src/components/ui/morph-dialog.tsx`, `src/components/ui/task-checkbox.tsx`
- Test: `src/components/ui/morph-dialog.test.tsx`, `src/components/ui/task-checkbox.test.tsx`

**Interfaces:**
- Consumes: `radix-ui` Dialog, motion tokens (`glide`, `exit`), `--veil` (Task 4)
- Produces:
  ```ts
  // morph-dialog.tsx ('use client')
  export function MorphDialog(props: {
    open: boolean; onOpenChange(open: boolean): void;
    origin: RefObject<HTMLElement | null>;      // the panel grows from this element's rect and returns to it
    returnFocus: RefObject<HTMLElement | null>; // focused after close
    title: string; description?: ReactNode; children: ReactNode;
  }): JSX.Element;
  // task-checkbox.tsx ('use client') — a native checkbox, visually the HorizonX box
  export function TaskCheckbox(props: { checked: boolean; onCheckedChange(next: boolean): void; children?: ReactNode;
    'aria-label'?: string; disabled?: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Fetch the HorizonX sources.**
  - Call `export_component` for `morph-dialog` (`framework: 'react'`, `{ radius: 16, cardRadius: 10, dim: 32, blur: 0, bounce: 0 }`). Keep the shared-element morph from a card into the dialog. Rebuild it as a FLIP from `origin`'s `getBoundingClientRect()`: open over `glide`, close back over `exit`, opacity only under reduced motion. Drop the looks, images, eyebrow and blur.
  - Call `export_component` for `task-checkbox` (`framework: 'react'`, `{ corner: 33, duration: 240, overshoot: 0.5, ripple: 0.6, strike: 'off' }`). Keep the check draw and the ripple. The checked fill is `--gain` with the mark in `--surface-1`. The unchecked box is a 1px `line-2` border on `surface-1`. The box is 18px inside a 44px hit area on coarse pointers.
- [ ] **Step 2: Write the failing tests:**

```tsx
function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (<>
    <button ref={ref} onClick={() => setOpen(true)}>Open rule</button>
    <MorphDialog open={open} onOpenChange={setOpen} origin={ref} returnFocus={ref} title="Stop stays where it was placed" description="Broken on 2 trades">
      <p>rows</p>
    </MorphDialog>
  </>);
}
test('named by its title; Escape closes and focus returns to the opener', async () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open rule' });
  opener.focus(); fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'Stop stays where it was placed' });
  expect(dialog.textContent).toContain('Broken on 2 trades');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
});
test('task checkbox is a real checkbox', () => {
  const onChange = vi.fn();
  render(<TaskCheckbox checked={false} onCheckedChange={onChange} aria-label="Kept the rule on ESZ5" />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kept the rule on ESZ5' }));
  expect(onChange).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 3: Run and confirm failure:** `npm test -- src/components/ui/morph-dialog src/components/ui/task-checkbox`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - **MorphDialog:**
    - Built on Radix `Dialog` (Portal, Overlay in `bg-veil`, Content). Use `forceMount` with `AnimatePresence` so the exit can play.
    - `onCloseAutoFocus` prevents the default and focuses `returnFocus.current`.
    - The panel: `surface-1`, 16px radius, 1px `line`, `--shadow`, `max-w-[720px]`, `max-h-[80dvh]`. The body scrolls.
    - The header holds the title (18px/600), the description (13px muted) and a 44px close button (Phosphor X, label "Close").
    - At 390 it sits 16px from each edge.
  - **TaskCheckbox:** a visually hidden `<input type="checkbox">` inside a `<label>`.
- [ ] **Step 5: Verify:** `npm test -- src/components/ui && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6: Commit** with `feat(ui): morph dialog and task checkbox from HorizonX`.

---

### Task 6: App shell, sidebar, mobile drawer and placeholder pages

**Files:**
- Create:
  - `src/components/app/nav.ts`, `sidebar.tsx`, `mobile-nav.tsx`, `top-bar.tsx`, `app-shell.tsx`, `module-placeholder.tsx`
  - `src/app/(app)/app/{trades,calendar,reports,strategies,notebook,prop-firms,backtesting,replay,mentors,assistant,settings}/page.tsx`
- Modify:
  - `src/app/(app)/layout.tsx`, `src/app/(app)/app/import/page.tsx`
  - `next.config.ts`
  - `src/components/site/brand-mark.tsx` (an `href` prop, default `'/'`)
  - `src/components/site/auth-form.tsx`
- Test: `src/components/app/nav.test.ts`, `src/components/app/sidebar.test.tsx`

**Interfaces:**
- Consumes: `DataProvider` (Plan 2), `serializeFilters`, `parseFilters` (Plan 2), `IconTile`, `buttonClasses` (Task 4), `ThemeToggle`, `BrandMark`, `MODULES` (`src/content/modules.ts`)
- Produces:
  ```ts
  // nav.ts
  export type AppModuleId = 'dashboard' | 'trades' | 'calendar' | 'reports' | 'strategies' | 'notebook' | 'import'
    | 'prop-firms' | 'backtesting' | 'replay' | 'mentors' | 'assistant' | 'settings';
  export interface NavItem { id: AppModuleId; label: string; href: `/app/${string}`; icon: Icon; group: 'modules' | 'not-live' | 'settings';
    filterScoped: boolean; built: boolean; summary: string; reason?: string /* not-live only */ }
  export const APP_NAV: readonly NavItem[];
  export function navHref(item: NavItem, params: URLSearchParams): string; // filter-scoped items carry serializeFilters(parseFilters(params))
  export function activeItem(pathname: string): NavItem | undefined;      // longest href prefix
  export function pageTitle(pathname: string): string;                    // activeItem label, else 'Keel'
  // sidebar.tsx ('use client')
  export function SidebarNav(props: { pathname: string; params: URLSearchParams; onNavigate?(): void }): JSX.Element;
  export function Sidebar(props: { switcher?: ReactNode }): JSX.Element; // desktop column, lg and up
  // mobile-nav.tsx, top-bar.tsx, app-shell.tsx ('use client')
  export function MobileNav(props: { switcher?: ReactNode }): JSX.Element;
  export function TopBar(props: { filters?: ReactNode; search?: ReactNode; basis?: ReactNode; label?: ReactNode }): JSX.Element;
  export function AppShell(props: { children: ReactNode }): JSX.Element;
  // module-placeholder.tsx (server-safe)
  export function ModulePlaceholder(props: { module: Exclude<AppModuleId, 'dashboard' | 'import'> }): JSX.Element;
  ```

`APP_NAV`, in order:

| id | label | group | filterScoped | built | icon (duotone) |
|---|---|---|---|---|---|
| dashboard | Dashboard | modules | yes | yes | SquaresFour |
| trades | Trades | modules | yes | no | ListBullets |
| calendar | Calendar | modules | yes | no | CalendarBlank |
| reports | Reports | modules | yes | no | ChartBar |
| strategies | Strategies | modules | no | no | Strategy |
| notebook | Notebook | modules | no | no | Notebook |
| import | Import | modules | no | yes | UploadSimple |
| prop-firms | Prop firms | modules | no | no | ShieldCheck |
| backtesting | Backtesting | not-live | no | no | ClockCounterClockwise |
| replay | Replay | not-live | no | no | PlayCircle |
| mentors | Mentors | not-live | no | no | UsersThree |
| assistant | Assistant | not-live | no | no | Sparkle |
| settings | Settings | settings | no | no | GearSix |

Placeholder copy. The heading line is `"{label} isn't built yet."`, or `"{label} isn't live yet."` for not-live items. Then the summary, then the reason if any. A link "Back to the Dashboard" closes it. The summaries are:
- **trades:** "Every trade in your filters, with its fills, tags, notes and rule checks."
- **calendar:** "Each day's P&L on a month grid, with the trades behind it."
- **reports:** "Your results by time of day, weekday, symbol, strategy, tag, side, duration and R."
- **strategies:** "Your strategies with their rules and checklists, and how each one performs."
- **notebook:** "Daily reviews, pre-market plans and weekly recaps, linked to your trades."
- **prop-firms:** "Your prop accounts against their profit target, loss limits, drawdown and trading days."
- **settings:** "Your timezone, breakeven range, accounts and import history."
- **Not-live items:** the summary is `MODULES`' `oneLine`. The reasons are "It needs market data, which Keel doesn't have yet." (backtesting, replay), "It needs accounts and sharing, which come with the backend." (mentors) and "It needs an AI provider, which comes with the backend." (assistant).

Layout:
- **Shell structure:** `AppShell` renders a skip link ("Skip to content" → `#content`), then the `Sidebar` (fixed 220px, `lg:flex`, `hidden` below), then a column with the `TopBar` (56px, sticky, `surface-1`, bottom `line`) above `<main id="content" tabIndex={-1}>`.
- **Sidebar:**
  - `BrandMark href="/app/dashboard"`, a switcher slot, then a `<nav aria-label="App">` holding the modules list.
  - "Not live yet" is a 12px faint heading labelling its own `<ul>`. Settings sits at the bottom.
  - Each row: a 40px link, 10px radius, 4px padding, an `IconTile`, a 13.5px label, and `aria-current="page"` when active (accent-soft row, `accent` tile).
- **Suspense:** the nav reads `useSearchParams` inside `<Suspense>`. The fallback is the same `SidebarNav` with empty params.
- **TopBar:**
  - The `<h1>` is `pageTitle(pathname)` (22px/600, −0.02em), followed by the slots.
  - The Import link uses `buttonClasses('primary', 'sm')` and goes to `/app/import`. Below `sm` it shows the UploadSimple icon only, with `aria-label="Import"`.
  - `ThemeToggle` comes last.
  - Below `lg`, a `MobileNav` trigger (a 44px List button, "Open navigation") leads the bar, and the filter slot drops to a second scrolling row.
- **`MobileNav`:** a Radix Dialog sheet from the left, 280px wide, holding the switcher and `SidebarNav`. It closes on navigate.
- **`(app)/layout.tsx`:** Plan 2's `DataProvider` now wraps `<AppShell>{children}</AppShell>`. It exports `metadata = { robots: { index: false } }`.
- **Placeholder pages** are server components exporting `metadata = { title: label }` that render `<ModulePlaceholder module=… />`. The placeholder is centred, max 520px: an `IconTile` (`faint` tone for not-live), a 16px text-colour heading line, 15px muted summary and reason, then the link.
- **Import page:** remove `BrandMark`, its `<h1>` and the outer `<main>` (now a `<div>`). The top bar carries the title. Behaviour is unchanged.
- **Redirect:** in `next.config.ts`, `redirects()` sends `{ source: '/app', destination: '/app/dashboard', permanent: false }`.
- **E23:** under the disabled button, `auth-form.tsx` adds a link "Open the sample workspace" → `/app/dashboard` (15px, `accent-ink`).

- [ ] **Step 1: Write the failing tests.** `nav.test.ts`:

```ts
test('order and groups', () => {
  expect(APP_NAV.map((i) => i.id)).toEqual(['dashboard', 'trades', 'calendar', 'reports', 'strategies', 'notebook', 'import',
    'prop-firms', 'backtesting', 'replay', 'mentors', 'assistant', 'settings']);
  expect(APP_NAV.filter((i) => i.group === 'not-live').map((i) => i.id)).toEqual(['backtesting', 'replay', 'mentors', 'assistant']);
});
test('filter-scoped links carry the canonical filters, others none', () => {
  const p = new URLSearchParams('by=hour&side=long&range=this-week');
  const item = (id: AppModuleId) => APP_NAV.find((i) => i.id === id)!;
  expect(navHref(item('dashboard'), p)).toBe('/app/dashboard?range=this-week&side=long');
  expect(navHref(item('strategies'), p)).toBe('/app/strategies');
  expect(navHref(item('trades'), new URLSearchParams())).toBe('/app/trades');
});
test('active item and title', () => {
  expect(activeItem('/app/trades/abc')?.id).toBe('trades');
  expect(pageTitle('/app/prop-firms')).toBe('Prop firms');
  expect(activeItem('/app/nope')).toBeUndefined();
});
```

`sidebar.test.tsx`:
- `render(<SidebarNav pathname="/app/dashboard" params={new URLSearchParams('side=short')} />)`.
- The Dashboard link has `aria-current="page"` and `href` `'/app/dashboard?side=short'`.
- The Trades link has no `aria-current`.
- `getByRole('list', { name: 'Not live yet' })` holds exactly 4 links.
- Rendering `<ModulePlaceholder module="trades" />` gives text containing "Trades isn't built yet." with no `$` and no digit.

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/components/app`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. Read `layout.md`, `use-pathname.md`, `use-search-params.md` and `redirecting.md` first.
- [ ] **Step 4: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected:
  - all pass
  - the build lists the 11 placeholder routes and `/app/import` as static (○); `/app/dashboard` arrives in Task 9, so its sidebar link 404s until then
  - no "Missing Suspense boundary" error
- [ ] **Step 5: Commit** with `feat(app): app shell, sidebar, mobile drawer and placeholder pages`.

---

### Task 7: Account switcher, filter chips, Gross/Net and the sample label

**Files:**
- Create: `src/components/app/filter-model.ts`, `account-switcher.tsx`, `filter-bar.tsx`, `basis-switch.tsx`, `sample-label.tsx`
- Modify: `src/components/app/app-shell.tsx` (fill the slots)
- Test: `src/components/app/filter-model.test.ts`, `src/components/app/filter-bar.test.tsx`

**Interfaces:**
- Consumes:
  - `useGlobalFilters`, `useTradeSet`, `useTrades`, `useAccounts`, `useStrategies`, `useTags`, `usePrefs`, `useUpdatePrefs`, `useWorkspaces`, `useActiveWorkspace`, `useSetActiveWorkspace` (Plan 2)
  - `GlobalFilters`, `EMPTY_FILTERS`, `DATE_PRESETS`, `resolveRange` (Plan 2)
  - `rangeChipLabel`, `PRESET_LABELS` (Task 3)
  - `Segmented`, `Chip`, `IconTile`, `MetricTip`
- Produces:
  ```ts
  // filter-model.ts
  export type ChipDimension = 'symbol' | 'side' | 'strategy' | 'tag';
  export function toggleId(list: readonly string[], id: string): string[]; // add or remove, sorted ascending
  export function chipLabel(dim: ChipDimension, f: GlobalFilters, names: { strategies: ReadonlyMap<string, string>; tags: ReadonlyMap<string, string> }): { text: string; active: boolean };
  export function hasActiveFilters(f: GlobalFilters): boolean;
  export function switchWorkspaceFilters(f: GlobalFilters): GlobalFilters; // clears accountIds, strategyIds, tagIds
  export function accountSummary(accounts: readonly Account[], f: GlobalFilters): string;
  export interface FilterOptions { symbols: string[]; strategies: Strategy[]; tags: Tag[] }
  // filter-bar.tsx ('use client')
  export function FilterBarView(props: { filters: GlobalFilters; options: FilterOptions; today: string; onChange(next: GlobalFilters): void;
    disabled?: boolean /* the Suspense fallback: same chips, inert */ }): JSX.Element;
  export function FilterBar(): JSX.Element;      // connected; render inside <Suspense>
  // account-switcher.tsx, basis-switch.tsx, sample-label.tsx ('use client')
  export function AccountSwitcher(): JSX.Element; export function BasisSwitch(): JSX.Element; export function SampleLabel(): JSX.Element | null;
  ```

Behaviour:
- **Chips.** Each is a 30px button with a 6px radius: 1px `line`, 12.5px muted. Active: `accent-soft` / `accent-ink`. Each opens a Radix `Popover`.
  - **Date:** a radio list of `DATE_PRESETS` plus "All time", then a "Custom" pair of native `<input type="date">` (From, To) and an "Apply" button. The label is `rangeChipLabel`.
  - **Symbol:** checkboxes for the workspace's symbol roots (sorted). A filter box appears when there are more than 8.
  - **Side:** radios for Both, Long and Short.
  - **Strategy:** checkboxes, archived strategies last with "(archived)".
  - **Tags:** checkboxes grouped by category, using the labels "Setups", "Mistakes", "Emotions" and "Custom".
  - Each popover has "Clear" at the bottom. "Clear filters" (a text button) shows when `hasActiveFilters`.
- **Sanitised values.** The chips show the filters from `useTradeSet(filters).data.filters`, so unknown ids never render. Writes go through `setFilters`.
- **AccountSwitcher:**
  - Trigger: a 48px button: an `IconTile` (Wallet), the workspace name on line 1 (13px/500) and `accountSummary` on line 2 (12px faint).
  - The Radix `DropdownMenu` holds a "Workspace" radio group (Sample workspace, My workspace). Choosing one calls `useSetActiveWorkspace` and then `setFilters(switchWorkspaceFilters(f))`.
  - Then "Accounts": "All accounts" clears `accountIds`. Each active account is a checkbox item that toggles it and keeps the menu open. Archived accounts follow under "Archived".
- **BasisSwitch:** `Segmented` with label "P&L basis" and options Gross and Net, writing `useUpdatePrefs({ pnlBasis })`. While pending it shows the pending value.
- **SampleLabel:** when the active workspace's `kind === 'sample'`, a neutral `Chip` reads "Sample data". Its accessible text is "Sample data. Not a real account."

- [ ] **Step 1: Write the failing tests.** `filter-model.test.ts`:

```ts
const names = { strategies: new Map([['s1', 'Range break'], ['s2', 'Pullback']]), tags: new Map([['t1', 'Moved stop']]) };
test('chip labels', () => {
  expect(chipLabel('symbol', EMPTY_FILTERS, names)).toEqual({ text: 'Symbol', active: false });
  expect(chipLabel('symbol', { ...EMPTY_FILTERS, symbols: ['ES', 'NQ'] }, names).text).toBe('ES, NQ');
  expect(chipLabel('symbol', { ...EMPTY_FILTERS, symbols: ['CL', 'ES', 'NQ'] }, names).text).toBe('3 symbols');
  expect(chipLabel('side', { ...EMPTY_FILTERS, side: 'short' }, names)).toEqual({ text: 'Short', active: true });
  expect(chipLabel('strategy', { ...EMPTY_FILTERS, strategyIds: ['s2'] }, names).text).toBe('Pullback');
  expect(chipLabel('tag', { ...EMPTY_FILTERS, tagIds: ['t1', 'x'] }, names).text).toBe('2 tags');
});
test('toggling, clearing and switching workspace', () => {
  expect(toggleId(['b'], 'a')).toEqual(['a', 'b']);
  expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  const f = { ...EMPTY_FILTERS, range: { preset: 'this-week' as const }, symbols: ['ES'], side: 'long' as const, accountIds: ['a'], strategyIds: ['s'], tagIds: ['t'] };
  expect(switchWorkspaceFilters(f)).toEqual({ ...f, accountIds: [], strategyIds: [], tagIds: [] });
  expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
});
test('account summary', () => {
  const accts = [{ id: 'a', name: 'Futures live' }, { id: 'b', name: 'Forex evaluation' }] as Account[];
  expect(accountSummary(accts, EMPTY_FILTERS)).toBe('All accounts');
  expect(accountSummary(accts, { ...EMPTY_FILTERS, accountIds: ['b'] })).toBe('Forex evaluation');
  expect(accountSummary(accts, { ...EMPTY_FILTERS, accountIds: ['a', 'b'] })).toBe('2 accounts');
});
```

`filter-bar.test.tsx` (happy-dom), structure only. Popover interaction is covered in Task 11:
- `FilterBarView` with `EMPTY_FILTERS` renders 5 buttons named "All time", "Symbol", "Side", "Strategy" and "Tags", each with `aria-haspopup="dialog"`.
- No "Clear filters" button shows.
- With `side: 'short'`, the Side button reads "Short" and "Clear filters" shows. Clicking it calls `onChange(EMPTY_FILTERS)`.

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/components/app/filter`. Expected: FAIL.
- [ ] **Step 3: Implement**, then fill the shell slots:
  - `Sidebar`/`MobileNav` get `switcher={<AccountSwitcher />}`.
  - The `TopBar` gets `filters={<Suspense fallback={<FilterBarView filters={EMPTY_FILTERS} options={{ symbols: [], strategies: [], tags: [] }} today="" onChange={() => {}} disabled />}><FilterBar /></Suspense>}`, `basis={<BasisSwitch />}` and `label={<SampleLabel />}`.
- [ ] **Step 4: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS, with routes still static.
- [ ] **Step 5: Commit** with `feat(app): account switcher, URL filter chips, Gross/Net and sample label`.

---

### Task 8: Expanding search with ⌘K

**Files:**
- Create: `src/components/ui/expanding-search.tsx`, `src/components/app/search.ts`, `src/components/app/app-search.tsx`
- Modify: `src/components/app/app-shell.tsx` (the `search` slot)
- Test: `src/components/app/search.test.ts`, `src/components/ui/expanding-search.test.tsx`

**Interfaces:**
- Consumes: `APP_NAV`, `navHref`, `activeItem` (Task 6); `useGlobalFilters`, `useTrades`, `useStrategies`, `useTags`, `serializeFilters` (Plan 2); `toggleId` (Task 7); `useRouter`, `usePathname` (`next/navigation`)
- Produces:
  ```ts
  // search.ts
  export type SearchResult =
    | { kind: 'module'; id: AppModuleId; label: string }
    | { kind: 'symbol'; value: string; label: string }
    | { kind: 'strategy'; id: string; label: string }
    | { kind: 'tag'; id: string; label: string; category: TagCategory };
  export const MAX_RESULTS = 8;
  export function searchApp(query: string, src: { symbols: readonly string[]; strategies: readonly Strategy[]; tags: readonly Tag[] }): SearchResult[];
  export function isSearchShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, platform: 'mac' | 'other'): boolean;
  // expanding-search.tsx ('use client') — the input and its listbox; ARIA combobox
  export function ExpandingSearch(props: { label: string; placeholder: string; shortcutHint: string | null; query: string;
    onQueryChange(q: string): void; results: readonly { id: string; label: string; detail?: string }[]; onSelect(id: string): void }): JSX.Element;
  // app-search.tsx ('use client')
  export function AppSearch(): JSX.Element;
  ```

Rules:
- **Matching** is case-insensitive on a trimmed query. An empty query gives `[]`.
  - Modules match on the start of any word of the label.
  - Symbols match by prefix.
  - Strategies and tags match by substring.
- **Order:** modules, symbols, strategies, tags, capped at `MAX_RESULTS`.
- **Selecting:**
  - A module navigates (`router.push(navHref(item, current params))`).
  - A symbol, strategy or tag adds that value to the filters. On a filter-scoped page this goes through `setFilters`. Elsewhere it does `router.push('/app/dashboard?' + serializeFilters(next))`.
- **Shortcut:** ⌘K on macOS and Ctrl+K elsewhere focus the input from anywhere. Detect the platform after hydration (`useHydrated`). `shortcutHint` is `'⌘K'`, `'Ctrl K'`, or `null` before hydration.
- **Keys:**
  - ArrowDown and ArrowUp move `aria-activedescendant`.
  - Enter selects.
  - Escape clears the query, then blurs.

- [ ] **Step 1: Fetch the HorizonX source.** Call `export_component` for `expanding-search` (`framework: 'react'`, `{ restWidth: 180, hoverWidth: 200, focusWidth: 280, height: 36, radius: 10, align: 'left', fontSize: 13, transition: 320, shadowStrength: 0 }`).
  - Keep the rest, hover and focus width steps.
  - Replace the gradient with `sunken` fill and a 1px `line` border, and focus with the global cobalt ring.
  - Widths animate over `glide`, and stay instant under reduced motion.
  - Below `lg`, it rests as a 44px icon button (MagnifyingGlass, "Search") and expands across the top bar row.
  - The listbox is a `surface-1` panel, 10px radius, `--shadow-chip`, with 36px options. The detail (Module, Symbol, Strategy, or the tag's category) is in faint text.
- [ ] **Step 2: Write the failing tests.** `search.test.ts`:

```ts
const src = { symbols: ['CL', 'ES', 'NQ'], strategies: [{ id: 's1', name: 'Range break' }] as Strategy[],
  tags: [{ id: 't1', name: 'Revenge trade', category: 'mistake' }] as Tag[] };
test('modules by word start, then symbols, strategies, tags', () => {
  expect(searchApp('re', src).map((r) => r.label)).toEqual(['Reports', 'Replay', 'Range break', 'Revenge trade']);
  expect(searchApp('e', src).map((r) => r.kind)).toEqual(['symbol', 'strategy', 'tag']);
  expect(searchApp('  ', src)).toEqual([]);
  expect(searchApp('firms', src)[0]).toEqual({ kind: 'module', id: 'prop-firms', label: 'Prop firms' });
});
test('the shortcut follows the platform', () => {
  const k = { key: 'k', altKey: false, shiftKey: false };
  expect(isSearchShortcut({ ...k, metaKey: true, ctrlKey: false }, 'mac')).toBe(true);
  expect(isSearchShortcut({ ...k, metaKey: false, ctrlKey: true }, 'mac')).toBe(false);
  expect(isSearchShortcut({ ...k, metaKey: false, ctrlKey: true }, 'other')).toBe(true);
});
```

`expanding-search.test.tsx` (happy-dom): with two results, focus the combobox and:
- ArrowDown sets `aria-activedescendant` to the first option.
- Enter calls `onSelect` with the first id.
- Escape calls `onQueryChange('')`.
- The input has `role="combobox"` and `aria-expanded="true"` while there are results.

- [ ] **Step 3: Run and confirm failure:** `npm test -- src/components/app/search src/components/ui/expanding-search`. Expected: FAIL.
- [ ] **Step 4: Implement**, and mount `<Suspense><AppSearch /></Suspense>` in the shell's `search` slot.
- [ ] **Step 5: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 6: Commit** with `feat(app): expanding search with ⌘K over modules, symbols, strategies and tags`.

---

### Task 9: Dashboard: states, Your plan, Mistakes and the drill-down

**Files:**
- Create:
  - `src/app/(app)/app/dashboard/page.tsx`
  - `src/components/app/dashboard/dashboard-view.tsx`, `states.tsx`, `plan-card.tsx`, `mistakes-card.tsx`, `drilldown.tsx`
  - `src/components/app/__fixtures__/render-app.tsx`, `src/components/app/__fixtures__/dashboard-sample.ts`
- Modify: `src/data/trade-patch.ts`
- Test: `src/components/app/dashboard/dashboard-view.test.tsx`, `src/data/trade-patch.test.ts` (one new test)

**Interfaces:**
- Consumes:
  - `buildDashboard`, `pickPartition`, `DashboardModel`, `RULES_SHOWN` (Task 3)
  - `goalsFor` (Task 2)
  - `rangeCaption` (Task 3)
  - `MetricTip`, `NumberTicker`, `IconTile` (Task 4)
  - `MorphDialog`, `TaskCheckbox` (Task 5)
  - `hasActiveFilters` (Task 7)
  - Plan 2: `useGlobalFilters`, `useTradeSet`, `useMetrics`, `usePrefs`, `useActiveWorkspace`, `useSetActiveWorkspace`, `useTrades`, `useStrategies`, `useTags`, `useUpdateTrade`, `metricContextOf`, `resolveRange`, `localDate`, `StorageUnavailableError`, `DataProvider`, `createLocalRepository`, `fixtureSample`
- Produces:
  ```ts
  // trade-patch.ts
  export function withRuleCheck(trade: Trade, ruleId: string, followed: boolean): TradePatch; // { ruleChecks } with that rule set, others untouched
  // dashboard-view.tsx ('use client') — inside <Suspense>; root carries data-testid="dashboard-ready" once the model renders
  export function DashboardView(): JSX.Element;
  export type DrillTarget = { kind: 'rule'; ruleId: string } | { kind: 'mistake'; tagId: string };
  // states.tsx
  export function DashboardSkeleton(): JSX.Element;  // role="status" aria-label="Loading your dashboard"
  export function DashboardEmpty(props: { variant: 'no-trades' | 'no-matches' | 'no-closed'; onClearFilters(): void; onOpenSample(): void }): JSX.Element;
  export function DashboardError(props: { error: Error; onRetry(): void }): JSX.Element; // role="alert"
  // __fixtures__/render-app.tsx — test helper
  export function renderApp(ui: ReactElement, opts?: { sample?: () => SampleWorkspace; url?: string; repository?: Repository }): RenderResult & { repo: Repository };
  // __fixtures__/dashboard-sample.ts
  export function dashboardFixture(opts?: { graded?: boolean /* default true */ }): SampleWorkspace;
  ```

Behaviour:
- **`page.tsx`:** a server component. `metadata = { title: 'Dashboard' }`. It renders `<Suspense fallback={<DashboardSkeleton />}><DashboardView /></Suspense>`.
- **`DashboardView`:**
  - Reads the URL filters, the trade set, the metrics, prefs, the workspace and the all-trades list.
  - `today = localDate(now, prefs.timeZone)` and `range = resolveRange(set.filters.range, today)`.
  - It picks the partition and builds the model with `useMemo`.
  - **States, in order:**
    1. pending gives the skeleton
    2. an error gives `DashboardError`
    3. no trades in the workspace gives `no-trades`
    4. no closed trades in the set gives `no-matches` if `hasActiveFilters`, otherwise `no-closed`
    5. otherwise the dashboard
  - Retry calls `queryClient.resetQueries({ queryKey: ['keel'] })`.
  - When two or more partitions have closed trades, a `Segmented` currency switch (local state) and the line "Each currency is shown on its own. Converting between them isn't built yet." sit above row 1.
- **Copy for the states:**
  - **no-trades:** "No trades in My workspace yet." / "Import a CSV from your broker, or open the sample workspace to look around." The actions are an Import link (primary) and "Open the sample workspace" (secondary).
  - **no-matches:** "No trades match these filters." with a "Clear filters" button.
  - **no-closed:** "No closed trades yet." / "Open positions count here once they close."
  - **Error:** with `StorageUnavailableError`, "Keel can't open storage in this browser, so your workspace can't load. Private windows and blocked site data often cause this." Otherwise "Your dashboard couldn't load." Both have a "Try again" button.
  - Each state carries an `IconTile`: Tray, FunnelSimple, ClockCounterClockwise or Warning (loss tone).
- **Row 1, `PlanCard`:** a `<section aria-labelledby>` card (16px radius, 16/20 padding).
  - **The hero** is 290px wide on the left from `lg`, stacked above the table below that.
    - h2 "Your plan, {rangeCaption}", 14px/600.
    - A `NumberTicker` adherence (`kind 'pct'`, `digits 0`) at 40px.
    - "of rule checks kept", as a `MetricTip id="rule-adherence"`.
    - A `loss-soft` panel: "Broken rules cost" (`MetricTip`) plus the signed amount in mono.
  - **The table** is a `<table aria-label="Rules">` with columns Rule, Kept, Adherence, % and Cost when broken. Kept, Adherence and Cost are `MetricTip` headers.
    - Each row's Rule cell holds a `<button>` with the rule text (and a "Costliest" loss chip on row 1 when its cost is below 0). Its `aria-label` is "{text}. Kept {kept} of {kept+broken}, {pct}. Cost when broken {amount}. Show the trades."
    - Clicking anywhere on the row clicks that button. Rows with `broken === 0` aren't buttons and read "none" in faint.
    - The track is 4px: a `sunken` bar with an `accent` fill.
    - Rows are 38px with a hover fill in `sunken` (E24).
    - Show `RULES_SHOWN` rows, then a text button "Show all {n} rules" / "Show fewer".
    - Below `sm`, Kept and the track hide (the `aria-label` keeps them) and the track moves under the rule text.
  - **Empty plan** (`plan.checks === 0`): the card shows "No graded trades in this range." / "Adherence shows once trades are checked against a strategy's rules."
- **Row 2, first card, `MistakesCard`:**
  - h2 "Mistakes, by cost", with `rangeCaption` at the right (12px faint).
  - Each row is a 40px button: a loss `Chip` with the tag name, "{n} trades" in mono muted, and the cost in signed mono. Its `aria-label` is "{name}. {n} trades, {amount}. Show the trades."
  - The first row's cost carries the `MetricTip id="mistake-cost"` header ("Cost").
  - Empty: "No mistakes tagged in this range."
- **Drill-down:**
  - Opening stores the target and snapshots its trade ids (`brokenTradeIds` / `tradeIds`) at that moment.
  - `MorphDialog`'s `origin` is the row and `returnFocus` is its button. If that button is gone when the dialog closes (a regrade left the rule never broken), focus goes to the Rules table instead (`tabIndex={-1}`).
  - **Title:** the rule text, or the mistake name.
  - **Description, for a rule:** "Broken on {n} trades, {rangeCaption}. Cost when broken {amount}. Trades that kept it: {keptPnl}."
  - **Description, for a mistake:** "{n} trades, {rangeCaption}, {amount} {basis}."
  - **The body** is a `<table aria-label="Trades">` with Time (`tradeTime`, Task 10), Symbol (mono), Side (`SideChip`), Strategy, P&L on the basis (signed mono) and Mistakes (loss chips).
  - **Rule targets** add a "Kept" column. Each row's `TaskCheckbox` (`aria-label` "Kept {rule} on {symbol} {time}") calls `useUpdateTrade().mutate({ id, patch: withRuleCheck(trade, ruleId, checked) })`. It flips at once and reverts with an inline error "Couldn't save. Try again." on failure.
  - Rows stay in the list while the dialog is open.
- **Layout at 1440:**
  - The body has 20px padding and 16px gaps.
  - Row 2 is three equal columns from `xl`, two then one between `md` and `xl`, and one column below `md`.

- [ ] **Step 1: Build the test helpers.**
  - **`renderApp`** wraps the UI in `DataProvider` with `createLocalRepository({ indexedDB: new IDBFactory(), IDBKeyRange, sample })` and a `QueryClient` with `{ retry: false, staleTime: Infinity }`.
    - It calls `window.history.replaceState(null, '', opts.url ?? '/app/dashboard')`.
    - The test file mocks `next/navigation`: `useSearchParams` reads `window.location.search`, `usePathname` returns `'/app/dashboard'`, and `useRouter` returns `{ push: vi.fn() }`.
  - **`dashboardFixture()`** is `fixtureSample()` with these patches, and with `ruleChecks: []` and no `strategyId` when `graded: false`:
    - `f-1`: net −40000, gross −39500, fees 500, `closedAt '2026-11-19T15:00:00.000Z'`, `strategyId 'str-1'`, checks `r-1 false` and `r-2 true`, `tagIds ['tag-fomo']`.
    - `f-2`: net 60000, gross 60500, fees 500, `closedAt '2026-11-18T15:00:00.000Z'`, `strategyId 'str-1'`, checks `r-1 true` and `r-2 true`, no tags.
- [ ] **Step 2: Write the failing tests** (`dashboard-view.test.tsx`, happy-dom; read rule texts and tag names from `fixtureSample()`):

```tsx
const fx = fixtureSample();
const r1 = fx.strategies[0]!.rules.find((r) => r.id === 'r-1')!.text, r2 = fx.strategies[0]!.rules.find((r) => r.id === 'r-2')!.text;
const fomo = fx.tags.find((t) => t.id === 'tag-fomo')!.name;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const opener = (text: string) => new RegExp(`^${esc(text)}\\.`); // rule and mistake buttons' aria-labels start "{text}."
test('loading first', () => {
  renderApp(<DashboardView />, { sample: dashboardFixture });
  expect(screen.getByRole('status', { name: 'Loading your dashboard' })).toBeTruthy();
});
test('your plan: adherence, cost once per trade, rules by cost with the costliest flagged', async () => {
  renderApp(<DashboardView />, { sample: dashboardFixture });
  const plan = await screen.findByRole('region', { name: 'Your plan, all time' });
  expect(plan.textContent).toContain('75%'); // the ticker renders its final string more than once (sr-only and final copy)
  expect(plan.textContent).toContain('−$400.00');
  const rows = within(within(plan).getByRole('table', { name: 'Rules' })).getAllByRole('row').slice(1);
  expect(rows[0]!.textContent).toContain(r1); expect(rows[0]!.textContent).toContain('Costliest');
  expect(rows[1]!.textContent).toContain(r2); expect(rows[1]!.textContent).toContain('none');
});
test('a rule opens its trades; Escape closes; focus returns (signature move)', async () => {
  renderApp(<DashboardView />, { sample: dashboardFixture });
  const open = await screen.findByRole('button', { name: opener(r1) });
  open.focus(); fireEvent.click(open);
  const dialog = await screen.findByRole('dialog', { name: r1 });
  expect(within(dialog).getAllByRole('row')).toHaveLength(2);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(open);
});
test('regrading in the drill-down saves the check, keeps the row, and updates the plan', async () => {
  const { repo } = renderApp(<DashboardView />, { sample: dashboardFixture });
  fireEvent.click(await screen.findByRole('button', { name: opener(r1) }));
  const dialog = await screen.findByRole('dialog', { name: r1 });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: new RegExp(`^Kept ${esc(r1)}`) }));
  await waitFor(async () => expect((await repo.trades.get('sample', 'f-1'))!.ruleChecks.find((c) => c.ruleId === 'r-1')!.followed).toBe(true));
  // the plan behind the dialog (aria-hidden while it is open) updates; the dialog keeps its row
  await waitFor(() => expect(screen.getByRole('region', { name: 'Your plan, all time', hidden: true }).textContent).toContain('100%'));
  expect(within(dialog).getAllByRole('row')).toHaveLength(2);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('table', { name: 'Rules' })); // the opener is gone (r-1 is never broken now)
});
test('a mistake opens its trades', async () => { /* click the button named opener(fomo) → dialog named fomo with one trade row */ });
test('a filter that matches nothing offers Clear filters (Review Focus 2)', async () => {
  renderApp(<DashboardView />, { sample: dashboardFixture, url: '/app/dashboard?symbol=ZZZ' });
  expect(await screen.findByText('No trades match these filters.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  expect(await screen.findByRole('region', { name: 'Your plan, all time' })).toBeTruthy();
});
test('an empty workspace offers Import and the sample (Review Focus 2)', async () => {
  const repository = createLocalRepository({ indexedDB: new IDBFactory(), IDBKeyRange, sample: async () => dashboardFixture() });
  await repository.workspaces.setActive('mine');
  renderApp(<DashboardView />, { repository });
  expect(await screen.findByText('No trades in My workspace yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('/app/import');
  expect(screen.getByRole('button', { name: 'Open the sample workspace' })).toBeTruthy();
});
test('ungraded trades show the plan's empty state, not 0% (Review Focus 1)', async () => {
  renderApp(<DashboardView />, { sample: () => dashboardFixture({ graded: false }) });
  expect(await screen.findByText('No graded trades in this range.')).toBeTruthy();
  expect(screen.queryByText('0%')).toBeNull();
});
test('storage failure is an alert with a retry', async () => { /* repository whose trades.list rejects new StorageUnavailableError() → role alert containing "can't open storage" and a 'Try again' button */ });
```

  The new test in `trade-patch.test.ts`: `withRuleCheck(t, 'r1', true)` sets that check and leaves the others. A rule with no existing check is appended.

- [ ] **Step 3: Run and confirm failure:** `npm test -- src/components/app/dashboard src/data/trade-patch`. Expected: FAIL.
- [ ] **Step 4: Implement.** Compare each card against `6-plan-vs-actual.png` and the mock's CSS (card padding 16/20, row heights 38/40/32, hero 290px with a `line` divider).
- [ ] **Step 5: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS, with `/app/dashboard` static.
- [ ] **Step 6: Commit** with `feat(dashboard): your plan, mistakes by cost and the trade drill-down`.

---

### Task 10: Dashboard: Goals, Performance and Recent trades

**Files:**
- Create: `src/components/app/dashboard/goals-card.tsx`, `performance-card.tsx`, `recent-trades.tsx`
- Modify: `src/components/app/dashboard/dashboard-view.tsx`, `src/lib/time-format.ts`
- Test: `src/components/app/dashboard/dashboard-cards.test.tsx`, `src/lib/time-format.test.ts` (one new test)

**Interfaces:**
- Consumes: `DashboardModel` (Task 3), `goalsFor`, `withGoals`, `parseGoalAmount` (Task 2), `usePrefs`, `useUpdatePrefs`, `useActiveWorkspace` (Plan 2), `MetricTip`, `NumberTicker`, `Sparkline`, `Chip`, `SideChip`, `formatPnl`, `formatMoney`, `onTradingDate`, `weekdayOf`
- Produces:
  ```ts
  // time-format.ts
  export function tradeTime(iso: string, timeZone: string): string; // 'dd MMM HH:mm', e.g. '19 Nov 10:00'
  // goals-card.tsx, performance-card.tsx, recent-trades.tsx ('use client')
  export function GoalsCard(props: { goals: DashboardModel['goals']; set: Goals; currency: string; rangeLabel: string; onSave(next: Goals): Promise<void> }): JSX.Element;
  export function PerformanceCard(props: { performance: DashboardModel['performance']; basis: PnlBasis; currency: string }): JSX.Element;
  export function RecentTrades(props: { recent: DashboardModel['recent']; basis: PnlBasis; timeZone: string; caption: string }): JSX.Element;
  ```

Behaviour:
- **Goals:** h2 "Goals" with an "Edit goals" text button. It reads "Set goals" when neither goal is set.
  - **The weekly row:**
    - The label "Weekly net goal" (`MetricTip`) with the target in mono.
    - At the right, a "Reached" gain chip with a check glyph, or "{floor(fraction×100)}% of goal" in faint mono.
    - A 6px track: `gain` when reached, otherwise `accent`.
    - Then the signed net and "this week, {caption of the window}".
  - **The daily row:**
    - "Daily loss limit" (`MetricTip`) with the limit in mono, and "{kept} of {days} days" in faint mono at the right.
    - A 6px `accent` track.
    - Then "Kept every day." or "Kept {kept} of {days} days. Broken {Wed 11 Nov} at {−$505.00}." For several, it ends "…, latest {Wed 11 Nov} at {amount}, {n} days in all."
  - An unset goal's row reads "No weekly net goal set." / "No daily loss limit set."
  - **Editing happens in place:** the card body becomes a form with two labelled inputs ("Weekly net goal", "Daily loss limit"), each with `inputMode="decimal"`, then Save and Cancel.
    - `parseGoalAmount` errors show under the input (`aria-describedby`), and nothing is written.
    - Save calls `useUpdatePrefs().mutateAsync(withGoals(prefs, ws.id, next))`.
- **Performance:** h2 "Performance".
  - A 2×2 grid of `sunken` tiles (10px radius, 8/12 padding): a 12px label (`MetricTip`) over a 22px mono `NumberTicker`. The tiles are P&L (labelled "Net P&L" or "Gross P&L" by basis), Win rate (pct, 1 digit), Profit factor (ratio) and Expectancy (money).
  - A `null` figure reads "None yet" in faint mono.
  - Then the 56px `Sparkline` with the label "Equity, from {start} to {end}". Its `MetricTip id="equity"` caption sits under it.
  - The P&L tile has `data-testid="kpi-pnl"`.
- **Recent trades:** h2 "Recent trades" with the caption at the right.
  - A `<table aria-label="Recent trades">` with Time, Symbol, Side, Strategy, P&L ("Net P&L" / "Gross P&L") and Rules.
  - Strategy shows the strategy name, or "No strategy" in faint, then mistake chips: the first one plus "+{n}".
  - **Rules column:**
    - `kept` reads "{kept} of {checked} kept" in faint.
    - `broke` reads an XCircle (fill, loss, `aria-hidden`) plus "Broke: {first text}" in loss, truncated, with the full list in `title` and the accessible text. With more, " and {n} more".
    - `ungraded` reads "Not graded" in faint.
  - Below `sm`, Side and Strategy hide.

- [ ] **Step 1: Write the failing tests.** In `time-format.test.ts`: `tradeTime('2026-11-19T15:00:00.000Z', 'America/New_York')` is `'19 Nov 10:00'`.

`dashboard-cards.test.tsx` (happy-dom, `renderApp` + `dashboardFixture`, `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))`). Before render, `repo.prefs.update({ timeZone: 'America/New_York', goals: { sample: { weeklyNet: 10000, dailyLossLimit: 30000 } } })`:

```tsx
test('goals: reached this week; one day broke the loss limit', async () => {
  const goals = await screen.findByRole('region', { name: 'Goals' });
  expect(goals.textContent).toContain('Weekly net goal'); expect(goals.textContent).toContain('$100.00');
  expect(within(goals).getByText('Reached')).toBeTruthy();
  expect(goals.textContent).toContain('+$200.00 this week, 16-20 Nov');
  expect(goals.textContent).toContain('Kept 1 of 2 days. Broken Thu 19 Nov at −$400.00.');
});
test('editing goals saves per workspace; bad input writes nothing', async () => {
  /* click 'Edit goals'; type '-5' in 'Weekly net goal' → Save → text 'Enter an amount above zero, or leave it empty.' and prefs unchanged;
     type '1,500' and clear 'Daily loss limit' → Save → (await repo.prefs.get()).goals!.sample toEqual { weeklyNet: 150000 };
     card shows 'No daily loss limit set.' */
});
test('performance follows the basis', async () => {
  /* net: tile labels 'Net P&L' +$200.00, 'Win rate' 50.0%, 'Profit factor' 1.50, 'Expectancy' +$100.00;
     with prefs pnlBasis 'gross' set before render: 'Gross P&L' +$210.00 */
});
test('recent trades: newest first, with the rules column', async () => {
  const rows = within(await screen.findByRole('table', { name: 'Recent trades' })).getAllByRole('row').slice(1);
  expect(rows[0]!.textContent).toContain('19 Nov 10:00'); expect(rows[0]!.textContent).toContain(`Broke: ${r1}`);
  expect(rows[1]!.textContent).toContain('2 of 2 kept');
});
test('ungraded imports still show performance and trades (Review Focus 1)', async () => {
  /* dashboardFixture({ graded: false }) → kpi-pnl shows '+$200.00'; recent rows read 'Not graded' */
});
test('every metric carries its definition', async () => {
  const ids = [...(await screen.findByTestId('dashboard-ready')).querySelectorAll('[data-metric-tip]')].map((e) => (e as HTMLElement).dataset.metricTip);
  expect(new Set(ids)).toEqual(new Set(METRIC_IDS));
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/components/app/dashboard/dashboard-cards src/lib/time-format`. Expected: FAIL.
- [ ] **Step 3: Implement**, and wire the three cards into `DashboardView`: Goals and Performance join row 2, and Recent trades is row 3.
- [ ] **Step 4: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(dashboard): goals with in-place editing, performance and recent trades`.

---

### Task 11: End-to-end coverage

**Files:**
- Create: `e2e/app-shell.spec.ts`, `e2e/dashboard.spec.ts`
- Modify: `e2e/pages.spec.ts` (overflow routes)

**Interfaces:**
- Consumes: the built app. No new exports.

Every test in these specs does three things first:
- `page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'))`
- `page.emulateMedia({ reducedMotion: 'reduce' })`
- On the dashboard, `await expect(page.getByTestId('dashboard-ready')).toBeVisible({ timeout: 20_000 })`, because the first visit seeds the sample.

- [ ] **Step 1: Write `app-shell.spec.ts`:**

```ts
const ROUTES = [['/app/dashboard', 'Dashboard'], ['/app/trades', 'Trades'], ['/app/calendar', 'Calendar'], ['/app/reports', 'Reports'],
  ['/app/strategies', 'Strategies'], ['/app/notebook', 'Notebook'], ['/app/import', 'Import'], ['/app/prop-firms', 'Prop firms'],
  ['/app/backtesting', 'Backtesting'], ['/app/replay', 'Replay'], ['/app/mentors', 'Mentors'], ['/app/assistant', 'Assistant'], ['/app/settings', 'Settings']] as const;
test('every app route renders its title without overflow; placeholders state it plainly', async ({ page }) => {
  for (const [path, title] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    if (!['/app/dashboard', '/app/import'].includes(path)) {
      await expect(page.locator('main')).toContainText(/isn't (built|live) yet\./);
      await expect(page.locator('main')).not.toContainText('$');
    }
  }
});
test('/app goes to the Dashboard', async ({ page }) => { await page.goto('/app'); await expect(page).toHaveURL(/\/app\/dashboard$/); });
test('sidebar by keyboard keeps the filters (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/app/dashboard?range=last-week');
  await page.getByRole('link', { name: 'Dashboard' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Trades' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/trades\?range=last-week$/);
  await expect(page.getByRole('link', { name: 'Trades' })).toHaveAttribute('aria-current', 'page');
});
test('mobile drawer opens, closes on Escape, and returns focus (mobile)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/app/trades');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Calendar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
test('⌘K focuses search (desktop)', async ({ page }, info) => { /* skip unless desktop; goto /app/trades; press 'ControlOrMeta+k'; expect combobox 'Search' focused */ });
```

- [ ] **Step 2: Write `dashboard.spec.ts`:**

```ts
test('filters change the numbers and the URL', async ({ page }) => {
  await page.goto('/app/dashboard'); /* wait for ready */
  const pnl = page.getByTestId('kpi-pnl');
  const all = await pnl.innerText();
  await page.getByRole('button', { name: 'Side' }).click();
  await page.getByRole('radio', { name: 'Short' }).check();
  await expect(page).toHaveURL(/[?&]side=short(&|$)/);
  await expect(pnl).not.toHaveText(all);
  const short = await pnl.innerText();
  await page.reload(); /* wait for ready */
  await expect(pnl).toHaveText(short);
  await page.getByRole('button', { name: 'All time' }).click();
  await page.getByRole('radio', { name: 'Last week' }).check();
  await expect(page).toHaveURL(/range=last-week/);
  await expect(page.getByRole('heading', { name: 'Your plan, 9-15 Nov' })).toBeVisible();
});
test('the account switcher writes the account filter (desktop)', async ({ page }, info) => {
  /* skip unless desktop; open the switcher; check menuitemcheckbox 'Futures live' → URL has account=sample-futures; summary reads 'Futures live' */
});
test('a rule opens its trades on Enter and closes on Escape with focus restored', async ({ page }) => {
  await page.goto('/app/dashboard'); /* wait for ready */
  const first = page.getByRole('table', { name: 'Rules' }).getByRole('button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Trades' }).getByRole('row')).not.toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
});
test('Gross/Net relabels P&L', async ({ page }) => { /* radio 'Gross' in group 'P&L basis' → kpi-pnl label 'Gross P&L'; back to Net */ });
test('no overflow at any width once loaded', async ({ page }) => {
  /* desktop project only; for 390, 768, 1024, 1280, 1440, 1680: setViewportSize, wait for ready, scrollWidth - innerWidth ≤ 0 */
});
```

- [ ] **Step 3: Extend** the routes list in the `no route overflows` test in `e2e/pages.spec.ts` with `'/app/trades'` and `'/app/backtesting'`.
- [ ] **Step 4: Run:** `npm run e2e`. Expected: PASS on the desktop and mobile projects, including every earlier spec (Plan 2's `data-layer.spec.ts` and `/app/import is restyled`).
- [ ] **Step 5: Commit** with `test(e2e): app shell routes, sidebar keys, dashboard filters and drill-down`.

---

### Task 12: Finish: captures, detector and finish review, then DESIGN.md and the backlog

**Files:**
- Modify: `scripts/capture.mjs`, `docs/BACKLOG.md`, then `DESIGN.md` and `.impeccable/design.json` (by the documenter)

- [ ] **Step 1: Captures.** Extend `scripts/capture.mjs` with an app section. Use `reducedMotion: 'reduce'`, and wait for `[data-testid="dashboard-ready"]` and `document.fonts.ready`.
  - `/app/dashboard` at 1440×900 and 390×844, each in light and dark. Dark is set as the script already does: `localStorage` `keel-theme` plus `data-theme`.
  - Write them to `.impeccable/review/app/{desktop,mobile}-{light,dark}-dashboard.png`, as full-page captures plus a first-viewport capture each.
  - At 1440 light, also capture the first rule's drill-down open (`desktop-light-drilldown.png`) and My workspace's empty state, switched through the account switcher (`desktop-light-empty.png`).
  - Run `npm run build && (npx next start -p 3200 &) && node scripts/capture.mjs`, then open the files to confirm they show the loaded dashboard, not the skeleton.
- [ ] **Step 2: Detector.**
  - The controller runs `impeccable detect --json "src/app/(app)" src/components/app src/components/ui src/components/product/sparkline.tsx`.
  - One implementer fixes the mechanical findings in one batch.
  - The gate is green: `npm run lint && npm run typecheck && npm test`.
  - Commit with `fix(app): detector findings`.
- [ ] **Step 3: Finish review.** Hand off to `impeccable:impeccable-finish-reviewer` (opus) with:
  - the contract `.impeccable/surfaces/src-app-app-app-dashboard-page-tsx.md`
  - the approved sketch `.impeccable/mocks/decision-app/rules-scorecard.html` / `6-plan-vs-actual.png`
  - the captures from Step 1
  - this plan's Rulings, so deliberate departures from the sketch are judged against their reasons: the headline counts each trade once, there is no account chip, icon tiles, the "Strategy" column header, and a cobalt sparkline
  
  Act on its ordered fixes (two rounds max). Recapture after each round, and commit each round with `fix(app): finish review round N`.
- [ ] **Step 4: Documenter, after the review passes.** Run `impeccable:impeccable-documenter` to **merge** an app section into `DESIGN.md` and `.impeccable/design.json`. Keep the marketing system as it is. Cover:
  - the shell (220px sidebar, 56px top bar, drawer below `lg`)
  - duotone icon tiles and their tones
  - filter chips and popovers
  - the account switcher
  - `MetricTip`, `MorphDialog`, `ExpandingSearch` and `TaskCheckbox`, with their HorizonX attribution
  - the rules table and adherence track
  - goal tracks, KPI tiles and the sparkline
  - the `--veil` token
  - the two new ramp sizes (40px mono hero figure, 14px/600 card title)
  - The Icons section changes to "duotone in tiles in the app".

  Commit with `docs(design): app shell and dashboard components`.
- [ ] **Step 5: Backlog.** Update `docs/BACKLOG.md`.
  - Change these existing rows:
    - **E19:** "App tickers mount after data, so the failure can't occur there. Landing case remains", owner "Release polish".
    - **E23:** "/login and /signup now open the sample workspace. Point 'Get started' at real sign-up when auth lands", owner "#2".
    - **E24:** "Dashboard rule and mistake rows have hover fills. Bar readouts and product trade rows remain", owner "Plan 5 (Reports)".
  - Add these rows:

  | # | Item | Owner plan |
  |---|---|---|
  | E28 | Tag a trade from the drill-down ("tag what is missing" in the dashboard contract story). It needs the tag picker the Trades page builds | Plan 5 (Trades) |
  | E29 | Drill-down and recent-trade rows link to `/app/trades/[id]` once trade detail exists | Plan 5 (Trades) |
  | E30 | Search over trade text (notes, ids) and journal entries. Today's search covers modules, symbols, strategies and tags | Plan 5 (Trades, Notebook) |
  | E31 | Dashboard shows one currency at a time with a switch. A combined view waits on FX | #8 |
  | E32 | More goal types: monthly, trade count, TradeZella-style routine rules (trading hours, stop on every trade, start-my-day) | Plan 5 decision |
  | E33 | Customisable dashboard widgets (TradeZella has them). The contract fixes one layout for milestone 1 | Milestone 2 decision |

  Commit with `docs(backlog): Plan 4 deferred items`.
- [ ] **Step 6: Final gate:** `npm run lint && npm run typecheck && npm test && npm run e2e`. Expected: every command exits 0.

## Done when

- Every `/app` route renders inside the shell. Placeholders say plainly that the module isn't built, and show no numbers.
- `/app/dashboard` matches the approved composition on the sample workspace, follows the URL filters and the Gross/Net switch, and every metric carries its definition.
- Rule rows and mistakes open their exact trades. The keyboard path works, and focus returns.
- The full gate is green, the finish reviewer returns ship, DESIGN.md documents the app components, and the backlog lists everything deferred.

---

## Self-review

1. **Spec coverage:**
   - §6 app routes: Tasks 6 and 9. §6 chrome: Tasks 6–8. §6 filters in the URL: Task 7, on Plan 2.
   - §7 metrics and alignment: Tasks 1–3, with Rulings for what TradeZella doesn't document.
   - §10: TDD in Tasks 1–3. Component tests in Tasks 4–10. Playwright in Task 11. The 50 ms budget in Task 3. 390px usability in Tasks 6, 9 and 11. Detector and finish review in Task 12.
   - §11 "all routes in section 6 exist and render": Task 11's route test. The settings sub-routes `/app/settings/{profile,accounts,import-history}`, `/app/trades/[id]`, `/app/reports/[report]`, `/app/strategies/[id]` and `/app/notebook/[entryId]` are Plan 5's.
   - §12 design sign-off: the contract is honoured, and Task 12 runs the review and records the result.
   - Every contract item maps to a task: first viewport (Tasks 6–10), signature move (Task 9), icons and HorizonX (Tasks 4, 5 and 8), FINISH (Task 12).
2. **Step scan:**
   - Every code step names its file, signature and pinned values. Every test step carries assertions.
   - Bodies appear only for exact copy (definitions, placeholders, states) and the ordering rules.
   - The one tuned value, `SAMPLE_GOALS`, is pinned by a realism test, not by "pick sensible values".
3. **Type consistency:**
   - `RuleScore`, `MistakeCost`, `WeeklyGoalProgress`, `DailyLossProgress`, `Goals`, `DashboardModel`, `MetricId`, `AppModuleId`, `SearchResult` and `DrillTarget` are each defined once and used by those names later.
   - Plan 2 names match its Interfaces blocks: `useGlobalFilters`, `useTradeSet`, `useMetrics`, `useUpdateTrade`, `useUpdatePrefs`, `metricsByCurrency`, `resolveRange`, `EMPTY_FILTERS`, `StorageUnavailableError`, `fixtureSample`, `createLocalRepository`.
4. **Review Focus:** each of the five lines has its test in the owning task: 1 in Tasks 9 and 10, 2 in Tasks 9 and 11, 3 in Task 3, 4 in Task 1, 5 in Task 2.
5. **Proportion:**
   - Code blocks are tests and signatures.
   - Component bodies are left to the implementer against the composition, with the measurements the sketch fixes.
   - At about 100 KB for twelve tasks, the plan is the same size as Plan 2. Most of it is test code and exact copy, with no transcribed component bodies.
