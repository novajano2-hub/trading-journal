# Milestone 1 · Plan 6A: Daily routine, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TradeZella's daily routine on local data:
- the progress tracker and its dashboard card (#35);
- the day page (#36);
- the trade log by day and by week (#37);
- getting started (#47).

**Architecture:**
- **Domain:** tracker scoring lives in `src/domain/tracker/`, pure and test-first. Day and week grouping lives in `src/data/day-log.ts`.
- **Storage:** Dexie version 3 adds the `trackers`, `days` and `dayShots` tables. New repositories `tracker`, `days`, `dayShots` and `onboarding` sit behind new TanStack Query hooks. The repositories enforce the day lock.
- **Screens:**
  - client leaves under `src/components/app/{progress,day,routine,trades/log,welcome,home}/`;
  - server pages under `src/app/(app)/app/`;
  - a new `src/app/(welcome)/` route group, which has no app shell.

**Tech Stack:** unchanged from Plan 5, with no new dependency:
- Next.js 16.4.6, React 19.3, TypeScript strict, Tailwind 4;
- TanStack Query 5 and Table 9, Dexie 4, Tiptap 3, Phosphor icons;
- Vitest 5 with happy-dom and fake-indexeddb;
- Playwright on system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-25-plan-6a-daily-routine-design.md`. It is approved, and K1 to K56 and U1 to U4 are its ids. The authorities, in order:
1. **The spec,** including its corrections (§7) and its Keel's calls (§6.1).
2. **The approved comps.** They are the binding look:
   - `.impeccable/mocks/plan6a/01-progress.html` to `14-home.html`, with `shell.css`;
   - the captures in `.impeccable/mocks/plan6a/captures/`;
   - the URL variants: `04-day-plan.html?state=trading`, `05-day-review.html?state=locked`, and `?theme=dark` on any comp.
3. **The behaviour spec and the builder resolutions,** for behaviour only: `.superpowers/research/tradezella/plan6a-behaviour.md` and `plan6a-builder-resolutions.md`. Both are git-ignored.
4. **`DESIGN.md`, `src/styles/theme.css` and `PRODUCT.md`.**
5. **Plan 5,** `docs/superpowers/plans/2026-11-22-m1-p5-rest-of-the-app.md`, and its rulings file.

**TradeZella's record wins over every other source on behaviour.** That covers comps, the spec's wording and this plan. A parity audit of this plan, the spec and the comps against the record (`.superpowers/research/tradezella/plan6a-parity-audit.md`, findings P6A-01 to P6A-30) found 30 differences. Each was checked against the record and corrected in all three on 2026-11-25. The comps now show the corrected behaviour. Every module review re-checks parity against the record (see Execution).

**Execution:** one implementer at a time, never in parallel (the user's call), with a review after each module.
- Each implementer brief says: the record wins over comps on behaviour, and every control, column, field, stat, step and state must trace to the record or to a marked Keel's call.
- Each module review has two parts: the code review, and a parity check of that module's tasks against `plan6a-behaviour.md`, section by section. The parity check reports anything the module adds, omits or changes, against both the record and this plan.

The modules:

| Module | Tasks |
|---|---|
| A Foundations | 1-6 |
| B Progress tracker (#35) | 7-10 |
| C Day page (#36) | 11-13 |
| D Day and Week views (#37) | 14-17 |
| E Getting started (#47) | 18-19 (Home, then the first run) |
| F Finish | 20 |

## Global Constraints

- **Toolchain:** Node ≥ 22, npm, Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind 4, Vitest 5, Playwright with `channel: 'chrome'`.
- **Branch and commits:** work on `m1-p6a`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Next.js docs first.** Before any route or layout code, read these in `node_modules/next/dist/docs/01-app/`:
  - `03-api-reference/03-file-conventions/dynamic-routes.md`, `page.md`, `layout.md` and `route-groups.md`;
  - `03-api-reference/04-functions/redirect.md`, `use-router.md` and `use-search-params.md`.
  - `params` and `searchParams` are Promises in this version. If `next dev` rewrites AGENTS.md, commit that change with the task.
- **Boundaries:**
  - Pages and components use only the hooks in `src/data/query/*`. Nothing under `src/components` or `src/app` imports `src/data/local/*`, Dexie or IndexedDB (tests excepted).
  - `src/domain/**` stays pure: no React, Next, browser globals or I/O.
- **Storage safety** (spec §3, §4.3):
  - no existing row is rewritten, except that the v3 upgrade adds the onboarding flag to the prefs record;
  - new tables start empty;
  - new fields are optional;
  - the sample reseeds by version, and My workspace never does.
- **The day lock lives in the write path.** For a finished date, the repositories refuse writes to:
  - the date's daily note;
  - its ticks, rating and mood;
  - its session;
  - its screenshots.

  Disabling controls in the UI is not enough.
- **Look:**
  - The comps are binding, and real data wins over comp numbers. Design G: graphite dark, and no icon tiles.
  - Use tokens only through their Tailwind names (`bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`, `warn*`, `info*`), with shadows as `shadow-[var(--shadow-card)]`. Cards use `CARD`, `CARD_PAD` and `CardHeader` from `src/components/app/dashboard/shared.tsx`.
  - Hue jobs:
    - accent for adherence and for what is chosen;
    - green and red for money, and for kept or broken;
    - green and red always travel with a sign or a word.
- **Copy:**
  - Every label is Keel's own, taken from the comps:
    - "Plan the day" (start my day), "Close the day" (finish my day), "Start session" and "End session" (the timer);
    - the stages Plan, Trade, Import and Review;
    - the moods Rough, Low, Steady, Good and Great.
  - Never use TradeZella's wording, layout, icons or emoji.
  - No em or en dashes. Numeric ranges read "a to b". "None" marks an empty value. No eyebrows and no decorative dots.
  - Every metric label carries a `MetricTip`, whose text lives only in `src/content/metric-definitions.ts`.
- **Numbers:** tabular figures throughout.
  - On the Trades Day and Week views, every money figure goes through `useDisplay()` (`display.figure`), so the units and Privacy apply to day cards, chart labels, hover readouts and `aria-label`s.
  - On the tracker page and the day page, TradeZella has no unit menu and no Filters [rec S08 3:31; rec S23] (P6A-03). There, the Display menu is hidden, and money shows in its currency, always net, through `display.cash` (Privacy still masks it). The tracker's phone header shows only the date range.
- **Charts:** hand-rolled SVG in the dashboard's style. Each has `role="img"` with a label carrying the range and key values, plus a hover and focus readout.
- **Phone:**
  - New modules go in More. The tab bar stays Dashboard, Trades, Calendar, Reports, More.
  - Below `sm`, tables become two-line rows, and dialogs become full-height sheets with a fixed footer.
- **Accessibility and layout:** WCAG 2.2 AA, a visible focus ring, 44px targets on coarse pointers, and a keyboard path for every action. No horizontal page overflow from 390 to 1680px.
- **Motion:** only in `'use client'` leaves, through the `src/lib/motion.ts` tokens. Under reduced motion, nothing moves.
- **Performance,** on the sample (~1,230 trades):
  - filtering plus scoring the whole tracker history, or plus grouping the Day and Week views, stays under 50 ms;
  - the Day view renders 20 cards at a time and the Week view 8 weeks;
  - tables page at 50 rows;
  - thumbnails load lazily, and their object URLs are revoked on unmount.
- **Tests:**
  - Component tests start with `// @vitest-environment happy-dom` and `afterEach(cleanup)`.
  - Domain and data work is test-first.
  - `npm run e2e` builds first and serves on port 3100. Never run two `next build`s against the same `.next`.
  - From Task 19, e2e specs start from an onboarded browser state (see Task 19).
- **Verification:**
  - Before each commit: `npm test`, `npm run typecheck` and `npm run lint` pass.
  - Before the last commit of each module: `npm run build`, and that module's e2e spec, pass.
- **Out of scope:** AI features (#22), mentors (#19, #20), the streak email, replay, the scale strip (#52), day insights (#40) and the week events list (#25).

## Review Focus

1. **A rule edit today never changes yesterday.**
   - Expected:
     - a save writes a version from today, and replaces only a version already dated today (K16);
     - every earlier date scores with the version in effect that day;
     - a finished day scores with the version frozen in its lock.
   - Pinned in Tasks 2, 4 and 9.
2. **A multi-day trade.** Expected:
   - each trade rule counts it on its open date (K4);
   - the daily cap counts each exit on that exit's date (K8);
   - the day card and the week tile count it on its close date, or its open date while it's open (K37).

   Pinned in Tasks 2 and 14.
3. **A finished day stays frozen after its trades change, and refuses every write.** Expected:
   - after a trade on the day is edited or deleted, the day's score is unchanged, under any account selection (K3);
   - every write is refused, from the day page, the note dialog, the trade page's Daily note and the Notebook: note, trash, ticks, mood, rating, session and shots.

   Pinned in Tasks 4, 5, 13 and 16.
4. **The first-run gate never traps a user who has data.** Expected:
   - every onboarded signal (K54) sets the flag on upgrade, and a sample-only v2 database does not;
   - a failed first-run save leaves the user in the preferences dialog with their answers, and makes no second "My account" on retry.

   Pinned in Tasks 1 and 19.
5. **Privacy hides money everywhere new.** Expected: no amount shows in:
   - tracker values and the rules table's averages;
   - review tiles, day cards, week tiles and bars;
   - the intraday chart's labels and readouts;
   - the mini-calendar hover and the `aria-label`s.

   Counts, shares and signs stay. Pinned in Tasks 7, 13, 15, 16 and 17.

## Calls this plan makes (builder level)

These settle what the spec left to the builder (§8). Reviewers should not "fix" them.

| Question | Call |
|---|---|
| The sample's "today" (K23) | The seed writes `Tracker.asOf = sampleEndDate`. Every routine surface reads today through `routineToday` (pure, Task 2) or `useRoutineToday`: `asOf` when set, else the local date in the profile zone |
| How screenshots are stored | As `bytes: ArrayBuffer` plus `type`, not `Blob`. This is structured-clone-safe in every browser and in fake-indexeddb, and the viewer builds the Blob. The behaviour is the spec's |
| One note per date (E109) | A trashed daily note is still the date's note. `dailyNote` returns it, and never makes a second. Editors show it read-only, with "This day's note is in Trash." and Restore. The 30-day purge frees the date |
| Rule status while the day runs (K19) | Strategy, stop and custom rules stay pending until the day ends, since they can still be met. A trade outside the hours, or over the per-trade cap, fails its rule at once. The daily cap shows failed while the day is past it, and met again if later exits bring it back within. Finishing turns every pending rule to failed |
| The Trade stage | On the routine's today, picking Trade starts the session and shows plan mode. On other dates it is disabled, with the reason |
| First-run save | One transaction (`onboarding.complete`) writes: the names, currency, zone and flag; "My account" in My workspace, when it has no account; and My workspace as active (comp 14 shows My workspace after the first run) |
| Day and week volume | Both sides: every fill's quantity [help 5829446]. Unlike the trade log's volume (Plan 5: each trade once), so don't unify them |
| Mood | Five words, Rough to Great, as the approved comps show. K44's "plain faces" is dropped, because the icon set has no plain face for the top end |
| Day and week columns | New column ids `ticker` (the root symbol, TradeZella's Ticker pill) and `day`. The existing `instrument` column is the contract, TradeZella's Instrument ("ES Dec 26", the option contract, or the pair) [rec S26 9:50] (P6A-07). Saved in their own prefs, `dayColumns` and `weekColumns` ("the user's visible columns for each table" [help 5829446]) |
| The week start | Follows the `weekStart` pref, Sunday by default, on the heat grid, the week tiles and the mini calendar. This is Plan 5 ruling 73, which the user accepted: TradeZella runs Sunday to Saturday, and Keel's setting lets a trader change it (P6A-22) |
| Edit rules validation (TradeZella unknown) | Times are HH:mm, and from is before to. Amounts are positive cents. A percent is over 0 and at most 100%. A custom name is 1 to 80 characters. No rule on the number of trading days: zero is allowed, and every day then reads "not a trading day" (P6A-21) |
| Old goal prefs (U4) | Ignored on read and left in storage, so no row is rewritten |
| The sample's rule values | The seed may size its caps to the sample's trades so every state shows (a streak, a perfect, partial, broken and finished day). My workspace keeps TradeZella's $100 defaults |
| Trading hours | Read in the profile zone (K35). The dialog labels the times with that zone's current GMT offset, as comp 02 does |
| Note-only day cards | Shown only while no trade-level filter is active, since a note can't match a symbol or a side |
| The welcome flow | Its own route group, `(welcome)`, with DataProvider and the centred auth look, and no app shell. The gate sits in `(app)/layout.tsx` |
| e2e | A Playwright setup project stores an onboarded state (IndexedDB) at the suite's frozen clock. First-run specs start from an empty state |

## File map

```
src/domain/            (modified) types.ts
src/domain/tracker/    defaults.ts inputs.ts score.ts summary.ts   (+ tests)
src/data/              routine.ts day-log.ts getting-started.ts onboarding.ts   (+ tests)
                       (modified) repository.ts trade-columns.ts dashboard.ts   (deleted) goals.ts goals.test.ts
src/data/local/        tracker.ts days.ts day-shots.ts onboarding.ts routine-today.ts   (+ routine.test.ts)
                       (modified) db.ts schema.ts journal.ts prefs.ts context.ts local-repository.ts migration.test.ts
                       (deleted) prefs-goals.test.ts
src/data/query/        (modified) keys.ts hooks.ts derived.ts
src/data/seed/         routine.ts   (modified) generate.ts version.ts templates.ts
src/content/           onboarding.ts   (modified) metric-definitions.ts note-templates.ts
src/lib/               day-routes.ts
src/components/app/routine/       plan-the-day.tsx month-picker.tsx mood-control.tsx rating-row.tsx
src/components/app/progress/      progress-view.tsx tiles.tsx heat-grid.tsx day-rules.tsx rules-table.tsx edit-rules.tsx rule-label.ts
src/components/app/day/           day-view.tsx day-header.tsx stage-bar.tsx session-button.tsx bad-date.tsx
                                  plan-mode.tsx note-card.tsx template-menu.tsx first-visit-tip.tsx
                                  screenshots-card.tsx shot-viewer.tsx review-mode.tsx review-tiles.tsx
                                  review-trades.tsx rating-card.tsx finish-day.tsx import-picker.tsx
src/components/app/trades/log/    trades-switch.tsx day-view.tsx day-card.tsx intraday-chart.tsx stat-grid.tsx
                                  log-table.tsx day-note-dialog.tsx mini-calendar.tsx
                                  week-view.tsx week-card.tsx week-tiles.tsx week-bars.tsx
src/components/app/welcome/       welcome-view.tsx survey-step.tsx preferences-dialog.tsx survey-model.ts
src/components/app/home/          home-view.tsx getting-started.tsx
src/components/app/               first-run-gate.tsx
                                  (modified) nav.ts tab-bar.tsx app-shell.tsx top-bar.tsx filter-bar.tsx
                                  dashboard/{dashboard-view,progress-card}.tsx  (deleted) dashboard/goals-card.tsx goals-form.tsx
                                  trades/{trades-view,trade-journal,trade-view,columns,cells}.tsx
                                  notebook/{notebook-view,entry-pane}.tsx notes/note-editor.tsx
                                  calendar/day-panel.tsx settings/profile.tsx
src/app/(app)/app/     page.tsx home/page.tsx progress/page.tsx
                       day/[date]/{page,plan/page,review/page}.tsx  trades/{day,week}/page.tsx
                       (modified) ../layout.tsx
src/app/(welcome)/     layout.tsx app/welcome/{page,[step]/page}.tsx
e2e/                   onboard.setup.ts onboarding.spec.ts progress.spec.ts day.spec.ts trades-log.spec.ts
                       (modified) app-shell.spec.ts dashboard.spec.ts   playwright.config.ts
next.config.ts .gitignore docs/BACKLOG.md docs/research/tradezella-feature-map.md DESIGN.md   (modified)
```

---

## Module A: Foundations

### Task 1: Types and storage version 3

Delivers the storage behind §4.3 and K54.

**Files:**
- Modify: `src/domain/types.ts`, `src/data/local/db.ts`, `src/data/local/schema.ts`, `src/data/local/prefs.ts`
- Test: `src/data/local/migration.test.ts`, and the prefs validation tests (`grep -ln "prefs.update" src/data/local/*.test.ts`)

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export type TrackerStage = 'prepare' | 'trade' | 'reflect';
  /** Sunday first, as Date#getDay. */
  export type Weekdays = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  export interface BuiltInRules {
    startBy: { on: boolean; time: string /* HH:mm */ };
    hours: { on: boolean; from: string; to: string /* HH:mm, profile zone */ };
    strategy: { on: boolean };
    stop: { on: boolean };
    lossPerTrade: { on: boolean; unit: 'amount' | 'percent'; value: number /* Cents, or a fraction: 0.01 = 1% */ };
    lossPerDay: { on: boolean; amount: Cents };
  }
  export interface CustomRule { id: string; name: string; stage: TrackerStage; days: Weekdays }
  export interface TrackerVersion { from: string /* YYYY-MM-DD */; tradingDays: Weekdays;
    builtIn: BuiltInRules; custom: CustomRule[] }
  export interface Tracker { id: 'tracker'; workspaceId: string; startedOn: string;
    versions: TrackerVersion[] /* oldest first */; asOf?: string /* the sample's fixed today */ }
  /** One account's inputs to a day's trade rules; summed across the selected accounts. */
  export interface AccountDayInputs {
    opened: number; withStrategy: number; withStop: number; inHours: number;
    moneyOpened: number;          // opened in the base currency: the per-trade cap's y (K5, K24)
    withinTradeLoss: number;      // of those, within the per-trade cap, winners included (K5, K7)
    largestLoss: Cents;           // the largest single-trade loss among them, positive; 0 if none (K6)
    dayNet: Cents;                // realized net booked on the date, base currency (K8, K24)
    booked: boolean;              // a trade opened or exited on the date (K8)
    otherCurrency: number;        // trades left out of the money rules (K24)
  }
  export interface FrozenDay { version: TrackerVersion; inputs: Record<string /* accountId */, AccountDayInputs>;
    ticks: Record<string, boolean>; noteStartedAt?: string }
  export interface DayRecord { id: string /* YYYY-MM-DD */; workspaceId: string;
    noteStartedAt?: string /* UTC ISO */; session?: { start: string; end?: string };
    ticks?: Record<string, boolean>; finishedAt?: string; locked?: FrozenDay;
    mood?: { value: 1 | 2 | 3 | 4 | 5; note?: string }; rating?: 1 | 2 | 3 | 4 | 5 }
  export interface DayShot { id: string; workspaceId: string; date: string; bytes: ArrayBuffer;
    type: 'image/png' | 'image/jpeg'; name: string; size: number; createdAt: string }
  export interface SurveyAnswers { experience: string; capital: string[]; broker: string;
    instruments: string[]; goals: string[]; heardFrom: string; heardFromOther?: string }
  export interface Onboarding { status: 'done'; at: string; survey?: SurveyAnswers; existing?: true }
  // JournalEntry: add
  templateId?: string;
  // UserPrefs: add
  onboarding?: Onboarding; firstName?: string; lastName?: string; username?: string;
  dayColumns?: string[]; weekColumns?: string[]; seenTips?: string[];
  ```
- Produces, in `db.ts`: `this.version(3).stores({ trackers: '[workspaceId+id], workspaceId', days: '[workspaceId+id], workspaceId', dayShots: '[workspaceId+id], workspaceId, [workspaceId+date]' }).upgrade(toVersion3)`, and typed tables `trackers`, `days` and `dayShots`.
- Produces, in `schema.ts`: `DATA_TABLES` gains `'trackers'`, `'days'` and `'dayShots'`.
- `toVersion3(tx)`: when any K54 signal holds, it merges `onboarding: { status: 'done', at: <now ISO>, existing: true }` into the `meta['prefs']` value, creating the record if it is absent. The K54 signals:
  - a `meta['prefs']` record;
  - any `accounts`, `trades` or `journal` row with `workspaceId === 'mine'`;
  - a `meta['active-workspace']` record.

  It writes nothing else.

- [ ] **Step 1: Write the failing tests** in `migration.test.ts`. Add an `openV2(indexedDB)` helper with a `V2_STORES` constant (the version 1 stores merged with version 2's).
  - `'v2 to v3 keeps every v2 row and adds empty tables'`: put a trade, account, journal entry and template in both workspaces, plus prefs and seed meta. After `new KeelDb(...).open()`, each row deep-equals its original, and `trackers`, `days` and `dayShots` count 0.
  - `it.each` over the five signals: `'v3 marks a v2 user onboarded: %s'`. Assert `prefs.onboarding` is `{ status: 'done', existing: true, at: expect.any(String) }`, and that the other prefs keys are unchanged.
  - `'a v2 database with only the sample is not onboarded'`, with sample rows and seed meta: `onboarding` is undefined.
  - `'a fresh database is not onboarded'`.
- [ ] **Step 2: Write the failing prefs tests.**
  - `update({ username: 'ab' })` and `update({ username: 'bad name' })` throw RangeError, and `'sam.k_1'` passes (K48: `/^[A-Za-z0-9._]{3,30}$/`).
  - `onboarding` must be `{ status: 'done', at: <ISO> }`, else RangeError.
  - `dayColumns`, `weekColumns` and `seenTips` must be string arrays.
- [ ] **Step 3:** `npm test -- src/data/local`. Expected: FAIL.
- [ ] **Step 4:** Implement the types, version 3, `toVersion3`, `DATA_TABLES` and the prefs validation.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(data): storage version 3 for the daily routine, with the onboarded flag (#35, #47)`.

---

### Task 2: Scoring one tracker day (test-first)

Delivers the scoring rules of spec §5.1 and K2 to K11, K15, K19, K20 and K24.

**Files:**
- Create: `src/domain/tracker/defaults.ts`, `inputs.ts`, `score.ts`, and a test for each

**Interfaces:**
- Consumes: `Trade`, `localDate`/`localParts` (`src/domain/time.ts`), `realizations` (`metrics/realized.ts`), and the Task 1 types
- Produces:
  ```ts
  // defaults.ts
  export const MON_TO_FRI: Weekdays;
  /** TradeZella's defaults: startBy on 09:30; hours off 09:00 to 12:00; strategy on; stop on;
   *  lossPerTrade on, amount 10_000; lossPerDay on, 10_000; no custom rules; Mo to Fr. */
  export function defaultVersion(from: string): TrackerVersion;
  /** The newest version with from <= date; undefined before startedOn. */
  export function versionOn(t: Pick<Tracker, 'startedOn' | 'versions'>, date: string): TrackerVersion | undefined;
  export function weekdayOf(date: string): number; // 0 = Sunday
  /** K23: the sample's asOf when set, else localDate(nowIso, timeZone). */
  export function routineToday(tracker: Pick<Tracker, 'asOf'>, nowIso: string, timeZone: string): string;
  // inputs.ts
  export interface InputsEnv { timeZone: string; baseCurrency: string; version: TrackerVersion;
    /** The account's balance at the start of `date` (`balanceAt` of the day before). */
    balanceAtDayStart(accountId: string): Cents }
  export function dayInputs(trades: readonly Trade[], date: string, env: InputsEnv): Record<string, AccountDayInputs>;
  /** Counts add, largestLoss takes the max, booked ORs. undefined ids: every account. */
  export function sumInputs(inputs: Readonly<Record<string, AccountDayInputs>>, accountIds?: readonly string[]): AccountDayInputs;
  /** HH:mm of the stamp when its local date is `date`, else undefined (K9). */
  export function stampTime(iso: string | undefined, date: string, timeZone: string): string | undefined;
  // score.ts
  export type RuleKey = 'startBy' | 'hours' | 'strategy' | 'stop' | 'lossPerTrade' | 'lossPerDay' | `custom:${string}`;
  export type RuleStatus = 'met' | 'failed' | 'pending';
  export type RuleValue =
    | { kind: 'time'; at?: string; limit: string }
    | { kind: 'share'; x: number; y: number }
    | { kind: 'money'; cents: Cents /* a loss, >= 0; 0 on a green day */; limit: Cents }
    | { kind: 'tick'; ticked: boolean };
  export interface RuleResult { key: RuleKey; stage: TrackerStage; status: RuleStatus; points: 0 | 1;
    /** For averages, as TradeZella's daily scores [connector day]:
     *  share rules: the share (0..1); tick rules: 1 or 0;
     *  startBy: minutes after midnight of the stamp, or null with none;
     *  lossPerTrade: largestLoss (positive cents); lossPerDay: max(0, −dayNet), so 0 on a green day (P6A-02). */
    score: number | null; value: RuleValue }
  export type Unscored = 'before-start' | 'not-trading-day' | 'future';
  export interface DayScore { date: string; unscored?: Unscored; rules: RuleResult[];
    met: number; active: number; perfect: boolean; finished: boolean }
  export interface ScoreArgs { date: string; today: string; nowTime: string /* HH:mm, profile zone */;
    startedOn: string; version: TrackerVersion | undefined;
    /** Summed over the selected accounts: every rule but the daily cap reads these. */
    inputs: AccountDayInputs;
    /** Summed over every account in the workspace: the daily cap reads these, whatever the selection,
     *  as it "caps the day's net loss across all accounts" [help 10371695] (P6A-01). */
    allInputs: AccountDayInputs;
    ticks: Readonly<Record<string, boolean>>; noteStartedAt?: string /* HH:mm via stampTime */; finished: boolean }
  export function scoreDay(a: ScoreArgs): DayScore;
  ```
- The rules for `scoreDay`:
  - **Ended.** A day has ended when `date < today` or `finished`.
  - **Unscored.** A date is unscored when it is before `startedOn`, after `today`, or not a trading day. It then has `rules: []` and `active: 0`.
  - **Active.** Built-ins are active when `on`. A custom rule is active on its `days` that are trading days (K11).
  - **Status** follows the K19 row of "Calls this plan makes".
  - **Order.** Rules run prepare, then trade, then reflect. Within each stage come the built-ins, then the custom rules in their order.

- [ ] **Step 1: Write the failing tests.**
  - `defaults.test.ts`:
    - `'versionOn picks the version in effect that date'`: with versions from `2026-11-02` and `2026-11-20`, `'2026-11-19'` gets the first, `'2026-11-20'` the second, and `'2026-11-01'` gets undefined.
    - `'defaults match TradeZella's'`: assert every field.
  - `inputs.test.ts`:
    - `'rules read trades opened on the date in the profile zone'` (K4): a trade opened `2026-11-20T03:30:00Z` counts on `2026-11-19` in `America/New_York`.
    - `'a multi-day trade counts toward trade rules on its open date and the daily cap on each exit date'` (Review Focus 2). It opens 11-18 and exits 11-18 and 11-19:
      - on 11-18, `opened 1`, and `dayNet` equals the first exit's net;
      - on 11-19, `opened 0`, `booked true`, and `dayNet` equals the second exit's net.
    - `'other currencies stay out of the money rules'` (K24): a EUR trade on a USD base gives `opened 1`, `moneyOpened 0` and `otherCurrency 1`, and is not in `dayNet`.
    - `'a percent per-trade cap reads the balance at the day's start'` (K15). With 1% of 50_000_00, a loss of 49_999 is within the cap, and one of 50_001 is not.
    - `'sumInputs adds counts, keeps the largest loss and ORs booked'`.
    - `stampTime`: `'09:12'` for a stamp on the date, and undefined for a stamp on the day before.
  - `score.test.ts`:
    - `'a trading day with no trades fails every trade rule once ended'` (spec §6.2): a past date with zero inputs gives strategy, stop, lossPerTrade and lossPerDay `'failed'`, `points 0`, and `perfect false`.
    - `'today with no trades leaves trade rules pending'`.
    - `'a loss at the limit passes both loss rules'` (K7):
      - net −10_000, and dayNet −10_000, are `'met'`;
      - −10_001 is `'failed'`.
    - `'the daily cap scores the day's loss, 0 on a green day'` (P6A-02): dayNet +26_690 gives `value.cents 0`, `score 0`, and `'met'`. dayNet −40_710 gives `cents 40_710` and `score 40_710`.
    - `'the daily cap counts every account whatever the selection'` (P6A-01): `inputs` for account A has dayNet +5_000, and `allInputs` has −20_000. The cap is `'failed'`, while the strategy rule reads A's counts only.
    - `'winners count toward the per-trade pair'` (K5): nets +5_000, −2_000 and −15_000 against a $100 cap give `{ x: 2, y: 3 }`, `'failed'`.
    - `'the time rule needs the first edit on its own date by the limit'` (K9):
      - `'09:30'` is met and `'09:31'` failed;
      - with no stamp at `nowTime '09:00'` today, pending;
      - with no stamp at `'09:31'`, failed.
    - `'trading hours count trades opened in the window'` (K10).
    - `'a custom rule on a non-trading weekday is never active'` (K11): a Saturday rule gives `unscored 'not-trading-day'` and `active 0`.
    - `'unscored dates'` (K20): before the start, the future, and a weekend.
    - `'finishing turns pending into failed'`.
    - `'strategy and stop stay pending today until every trade has one'` (K19).
- [ ] **Step 2:** `npm test -- src/domain/tracker`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): tracker day scoring (#35)`.

---

### Task 3: Streaks, period score, rule stats and grid steps (test-first)

Delivers K1, K2, K6, K12 and K14's figures.

**Files:**
- Create: `src/domain/tracker/summary.ts`, `summary.test.ts`

**Interfaces:**
- Consumes: `DayScore`, `RuleKey`, `TrackerStage` (Task 2)
- Produces:
  ```ts
  /** K1: the mean of met/active over scored days with active > 0 in [from, to]; null with none. */
  export function periodScore(days: readonly DayScore[], from?: string, to?: string): number | null;
  /** K2: current is the run of perfect days ending today if today is perfect, else yesterday. */
  export function streaks(days: readonly DayScore[], today: string): { current: number; best: number; perfect: number; scored: number };
  export interface RuleStat { key: RuleKey; stage: TrackerStage;
    /** Followed days running back from today: 0 when today has failed; from yesterday while today is pending [connector day] (P6A-05). */
    streak: number;
    /** The mean of the non-null daily scores; null with none. For startBy it is the mean start time in minutes,
     *  shown as HH:mm; with no logged start it is null, shown "None", as TradeZella's "--" [connector day] (P6A-06). */
    average: number | null;
    followRate: number | null; scoredDays: number }
  export function ruleStats(days: readonly DayScore[], today: string, from?: string, to?: string): RuleStat[];
  export type GridStep = 0 | 1 | 2 | 3 | 4;
  /** K12: none, under 1/3, under 2/3, short of all, all; null when unscored or nothing is active. */
  export function gridStep(d: DayScore): GridStep | null;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `'period score is the mean over scored days'`: days of 2/4, 4/4, unscored and 1/2 give `(0.5 + 1 + 0.5) / 3`.
  - `'period score is null with no scored day'`.
  - `'today never breaks the streak early'`: three perfect days, then today pending, give `current 3`. With today perfect, `current 4`.
  - `'a no-trade trading day breaks the streak'`.
  - `'best and perfect count over all scored days'`.
  - `'rule stats'`:
    - the streak counts today when it's met, is 0 when today has failed, and runs from yesterday while today is pending (P6A-05);
    - the follow rate is met days over the scored days the rule was active;
    - the average is the mean of the non-null scores. That gives a positive amount for lossPerTrade (K6). For the daily cap it gives the mean daily loss, so scores of 0 and 40_710 give 20_355, as TradeZella's arithmetic does (P6A-02).
  - `'the start rule's average is None with no logged start, else the mean start time'` (P6A-06).
  - `'grid steps'`: shares 0, 0.2, 0.5, 0.9 and 1 give steps 0, 1, 2, 3 and 4. Unscored gives null.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(domain): tracker streaks, period score, rule stats and grid steps (#35)`.

---

### Task 4: Tracker, day records and shots in storage; the lock, the note stamp and E109

Delivers §4.3's storage rules, K9, K16, K17, K20's finishing rule, and E109.

**Files:**
- Modify: `src/data/repository.ts`, `src/data/local/local-repository.ts`, `src/data/local/journal.ts`, `src/data/query/keys.ts`, `src/data/query/hooks.ts`, `src/components/app/trades/trade-journal.tsx` (`findDailyEntry`, the trashed state in `DayNote`), and `src/components/app/notebook/notebook-view.tsx` (`DailyPane`)
- Create: `src/data/local/tracker.ts`, `days.ts`, `day-shots.ts`, `routine-today.ts`
- Test: `src/data/local/routine.test.ts`, the journal store tests, `src/data/query/keys.test.ts`, `notebook-view.test.tsx` and `trade-view.test.tsx`

**Interfaces:**
- Consumes: `defaultVersion`, `versionOn`, `weekdayOf` and `routineToday` (Task 2)
- Produces, in `repository.ts`:
  ```ts
  export class LockedDayError extends Error {}          // message 'day is finished'
  export class ShotRejected extends Error { constructor(readonly reason: 'type' | 'size' | 'quota') }
  export const SHOT_MAX_BYTES = 10 * 1024 * 1024;
  export interface TrackerRepo {
    /** Created on first read, in one transaction, with startedOn = today and defaultVersion(today); two calls never make two rows. */
    get(ws: string): Promise<Tracker>;
    /** K16: a version from today, replacing one already dated today. */
    save(ws: string, rules: Omit<TrackerVersion, 'from'>): Promise<Tracker>;
    /** K17: defaultVersion(today), startedOn today, asOf kept; clears the ticks of unfinished days.
     *  Finished days stay locked: TradeZella shows no unlock (P6A-04), and days before the new start are unscored anyway. */
    reset(ws: string): Promise<Tracker>;
  }
  export interface DaysRepo {
    list(ws: string): Promise<DayRecord[]>;
    startSession(ws: string, date: string): Promise<DayRecord>;   // today only, once a day; RangeError otherwise
    endSession(ws: string, date: string): Promise<DayRecord>;
    setTick(ws: string, date: string, ruleId: string, ticked: boolean): Promise<DayRecord>;
    setRating(ws: string, date: string, rating: 1 | 2 | 3 | 4 | 5 | undefined): Promise<DayRecord>;
    setMood(ws: string, date: string, mood: DayRecord['mood']): Promise<DayRecord>;
    /** Refuses (RangeError) a date after today, before startedOn, or not a trading day; LockedDayError when finished. Ends a running session. */
    finish(ws: string, date: string, frozen: FrozenDay): Promise<DayRecord>;
  }
  export interface DayShotsRepo {
    list(ws: string, date: string): Promise<DayShot[]>;          // upload order
    add(ws: string, date: string, file: { bytes: ArrayBuffer; type: string; name: string }): Promise<DayShot>;
    remove(ws: string, id: string): Promise<void>;
  }
  // Repository: add tracker, days, dayShots
  ```
  - Every `DaysRepo` and `DayShotsRepo` write throws `LockedDayError` for a finished date.
  - `add` throws `ShotRejected('type' | 'size')`, and maps a quota error to `'quota'`.
- `routine-today.ts`:
  - `todayIn(db, ws, now): Promise<string>` reads the tracker row and prefs, then returns `routineToday(...)` (Task 2).
  - It runs inside the callers' transactions.
- `journal.ts` changes:
  - **`save`** runs in one rw transaction over `journal`, `days`, `meta` and `trackers`. For a `daily-review` entry with a date:
    - it throws `LockedDayError` when that date's day is locked, or when the stored entry's own date is;
    - when the date equals `todayIn(...)` and the day has no `noteStartedAt`, it writes the day record with `noteStartedAt = now` in the same transaction (K9).
  - **`trash`, `restore` and `remove`** refuse a locked date's daily note.
  - **`dailyNote(ws, date)`:**
    - it returns the date's daily note, trashed or not (E109);
    - it refuses to create one on a locked date.
- Keys and writes:
  - Keys:
    - `tracker: (ws) => [...W(ws), 'tracker']`;
    - `days: (ws) => [...W(ws), 'days']`;
    - `dayShotsAll: (ws) => [...W(ws), 'day-shots']`;
    - `dayShots: (ws, date) => [...W(ws), 'day-shots', date]`.
  - New write kinds `'tracker.save' | 'tracker.reset' | 'days.write' | 'days.finish' | 'dayShots.add' | 'dayShots.remove'`, which invalidate:
    - tracker writes: `[tracker, days]`;
    - day writes: `[days]`;
    - shot writes: `[dayShotsAll]`.
  - Every `journal.*` write also invalidates `keys.days(ws)`.
- Hooks:
  - reads: `useTracker()`, `useDays()` and `useDayShots(date)`;
  - writes: `useSaveTracker()`, `useResetTracker()`, `useStartSession()`, `useEndSession()`, `useSetTick()`, `useSetRating()`, `useSetMood()`, `useFinishDay()`, `useAddDayShot()` and `useRemoveDayShot()`.
  - Each write hook's variables are its repo method's arguments after `ws`, as an object, for example `{ date, ruleId, ticked }`.
- UI, for E109 (the trade page's Daily note, and the Notebook's daily pane):
  - a trashed daily note shows read-only, with "This day's note is in Trash." and a Restore button (`useRestoreJournalEntry`);
  - `findDailyEntry` includes trashed entries.

- [ ] **Step 1: Write the failing tests** in `routine.test.ts`, with a fixed `now` and `newId`.
  - `'two first reads make one tracker row'`: `Promise.all([get, get])` leaves one row, and both have the same `startedOn`.
  - `'a save today replaces today's version and keeps yesterday's'` (Review Focus 1): created on 11-18, then saved twice on 11-20, gives `versions.length === 2`. The second save's rules win, and `versionOn(t, '2026-11-19').from === '2026-11-18'`.
  - `'reset restores the defaults from today and keeps notes, sessions, moods, ratings and shots'`.
  - `'after a reset a closed day still refuses writes'` (P6A-04).
  - `'a finished day refuses every write'` (Review Focus 3): after `finish('2026-11-19')`, each of these rejects with `LockedDayError`:
    - `setTick`, `setRating`, `setMood`, `startSession`;
    - `dayShots.add` and `remove`;
    - `journal.save` of that day's note, and `journal.trash`;
    - `dailyNote` on a locked date that has no note.

    The same writes on 11-18 succeed.
  - `'finish refuses a future date, a date before the start and a non-trading day'` (K20).
  - `'the first edit on the note's own date stamps noteStartedAt'` (K9):
    - at 11-19 08:47 New York, saving the note dated 11-20 sets no stamp;
    - at 11-20 08:47, it stamps `2026-11-20T13:47:00.000Z`;
    - a later save keeps the first stamp.
  - `'a trashed daily note stays the date's note'` (E109): after trash then `dailyNote(date)`, there is exactly one `daily-review` entry for the date, and it is the trashed one.
  - `'shots: wrong type and over 10 MB are refused; list keeps upload order'`.
  - In `keys.test.ts`: the invalidations of the new write kinds, and `journal.save` now includes `keys.days`.
  - In the component tests: `'a trashed day note shows read-only with Restore'`, in both `trade-view.test.tsx` and `notebook-view.test.tsx`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the repos, the journal changes, keys, hooks and the E109 UI.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): tracker, day records and shots, with the day lock and the note stamp (#35, #36, E109)`.

---

### Task 5: The scores hook, and sample v5

Delivers K3, K23, and the seed requirements of spec §8.

**Files:**
- Create: `src/data/routine.ts`, `src/data/routine.test.ts`, `src/data/seed/routine.ts`
- Modify: `src/data/query/derived.ts`, `src/data/seed/generate.ts`, `src/data/seed/version.ts` (`SAMPLE_SEED_VERSION = 5`), `src/data/local/context.ts` (`writeSample` writes `trackers` and `days`), and `src/data/seed/generate.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4, `balanceAt` (`metrics/balance.ts`), `useGlobalFilters`, `useTrades`, `useAccounts`, `useCashFlows` and `usePrefs`
- Produces:
  ```ts
  // src/data/routine.ts
  export interface RoutineEnv { timeZone: string; baseCurrency: string; now: string; today: string;
    accountIds?: readonly string[] /* the global selection; undefined: all */ }
  export interface ScoreHistory { tracker: Tracker; today: string; days: DayScore[] /* startedOn to today, ascending */;
    byDate: ReadonlyMap<string, DayScore>; scoreOn(date: string): DayScore }
  export function scoreHistory(tracker: Tracker, records: readonly DayRecord[], trades: readonly Trade[],
    accounts: readonly Account[], flows: readonly CashFlow[], env: RoutineEnv): ScoreHistory;
  /** What finish stores (K3): the version in effect, every account's inputs, the ticks and the stamp. */
  export function freezeDay(date: string, tracker: Tracker, record: DayRecord | undefined, trades: readonly Trade[],
    accounts: readonly Account[], flows: readonly CashFlow[], env: Omit<RoutineEnv, 'accountIds'>): FrozenDay;
  /** Session length in ms: end − start; a running session on a past date ends at that date's local midnight (K30); null if never started. */
  export function sessionLength(s: DayRecord['session'], date: string, now: string, timeZone: string): number | null;
  // src/data/query/derived.ts
  export function useRoutineToday(): string | undefined;
  /** Follows only the global account selection (K14). */
  export function useDayScores(): Derived<ScoreHistory>;
  // src/data/seed/routine.ts
  export function writeRoutine(rng: Random, s: { trades: Trade[]; journal: JournalEntry[]; accounts: Account[];
    startedOn: string; endDate: string }): { tracker: Tracker; days: DayRecord[] };
  ```
  - `scoreHistory` scores a finished day from `locked`, and a live day from `dayInputs`. In both cases, `inputs` is summed over the selected accounts and `allInputs` over every account (P6A-01).
  - It groups the trades by date once.
- Seed v5 (K23):
  - **Its stream:** a new stream, `createRandom(opts.seed + 106)`.
  - **The tracker:**
    - `startedOn` is the sample's first trading day, and `asOf` is `endDate`;
    - one version, with one custom rule per stage, named as in comp 01.
  - **Day records:** on dates that have a seeded daily note:
    - `noteStartedAt`, about 80% before 09:30 New York and the rest later;
    - sessions from about 10 minutes before the first entry to about 5 minutes after the last exit;
    - custom ticks, mostly ticked;
    - moods on about half the traded days, and ratings on about a third.
  - **Finished days:** older finished days are written with `locked = freezeDay(...)`. The `endDate` day stays unfinished.
  - **Rule values:** pick values that make every state appear (see "Calls this plan makes").

- [ ] **Step 1: Pin the existing sample.** Before any seed edit, add `'v5 leaves every existing sample value unchanged'`. It compares a hash of the `JSON.stringify` of `accounts`, `strategies`, `tagCategories`, `tags`, `trades`, `journal` and `challenges`, at `SAMPLE_SEED` and endDate `'2026-11-19'`, with the hash computed now.
- [ ] **Step 2: Write the failing tests.**
  - `routine.test.ts`:
    - `'a finished day rebuilds the same score under any account selection'` (K3). With two accounts:
      - after finishing, `scoreHistory` with `accountIds: ['A']` equals A's live score at finish time;
      - after A's trade net changes, the finished day is unchanged.
    - `'unfinished past days score live with the version in effect that day'`.
    - `'a mixed-currency day keeps other currencies out of the money rules'`.
    - `sessionLength`: a running session is capped at local midnight on a past date, and returns null when never started.
    - `'scores the sample history in under 50 ms'`: generate the sample, warm up once, then time `scoreHistory`.
  - In `generate.test.ts`, `'the sample tracker shows every state'`, scored at `endDate`:
    - `current >= 2`;
    - at least one perfect, one partial, one finished and one broken day;
    - the `endDate` day unfinished.
- [ ] **Step 3:** Run. Expected: FAIL (the pin passes).
- [ ] **Step 4:** Implement `routine.ts`, the hooks, `writeRoutine`, and the `writeSample` change.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run lint`. Expected: PASS, the pin included.
- [ ] **Step 6:** Commit: `feat(data): routine scores hook and sample v5 with tracker history (#35)`.

---

### Task 6: The plan-the-day popover, and one zone for the day note

Delivers the shared start-my-day popover (K18, K25, K26), and the K35 correction.

**Files:**
- Create: `src/lib/day-routes.ts`, `src/components/app/routine/month-picker.tsx`, `src/components/app/routine/plan-the-day.tsx`, and tests
- Modify: `src/components/app/app-shell.tsx` / `top-bar.tsx` (the button on the Dashboard and Trades routes, before Import, as comps 03 and 06 show), and `src/components/app/trades/trade-view.tsx` (the Daily note's date)

**Interfaces:**
- Consumes: `useRoutineToday` (Task 5), `isRealDate` (`notebook/notebook-model.ts`), and `rotateFromWeekStart`
- Produces:
  ```ts
  // src/lib/day-routes.ts
  /** K26: today and future dates open plan; past dates open review. */
  export function dayHref(date: string, today: string): string;
  export function dayModeOf(date: string, today: string): 'plan' | 'review';
  // month-picker.tsx
  export function MonthPicker(p: { month: string /* YYYY-MM */; onMonth(m: string): void; today: string;
    selected?: string; weekStart: WeekStart; label: string; onPick(date: string): void;
    renderDay?(date: string): ReactNode }): JSX.Element;
  // plan-the-day.tsx
  export function PlanTheDay(p: { label?: string /* default 'Plan the day' */ }): JSX.Element;
  ```
- The `MonthPicker` grid:
  - a month dropdown, a year dropdown, and previous and next arrows [rec S22 8:44] (P6A-18);
  - today is ringed, and future dates are enabled;
  - it is a keyboard grid: arrows move, Enter picks, and Escape closes the popover.
- A pick routes to `dayHref`.

- [ ] **Step 1: Write the failing tests.**
  - `dayHref`: past dates give `/review`; today and future dates give `/plan`.
  - `'today is ringed and a future date can be picked'`;
  - `'the month and year dropdowns and the arrows change the month'`.
  - `'arrow keys move and Enter picks'`.
  - In `trade-view.test.tsx`, `'the Daily note dates by the trader's zone, not the account's'` (K35): a trade closed at `2026-11-20T03:30:00Z`, with account zone `Asia/Tokyo` and profile zone `America/New_York`, has its note on `2026-11-19`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. In `trade-view.tsx`, call `dayNoteDate(trade, prefs.timeZone)`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS. This is the end of Module A.
- [ ] **Step 5:** Commit: `feat(app): plan-the-day popover and one zone for the day note (#36, K35)`.

---

## Module B: Progress tracker (#35)

### Task 7: The heat grid, the day's rules list, and the tracker's definitions

**Files:**
- Create: `src/components/app/progress/heat-grid.tsx`, `day-rules.tsx`, `rule-label.ts`, and tests
- Modify: `src/content/metric-definitions.ts` and its test

**Interfaces:**
- Consumes: `DayScore`, `gridStep`, `RuleResult`, `TrackerVersion`, `useDisplay`, `TaskCheckbox` and `MetricTip`
- Produces:
  ```ts
  export function HeatGrid(p: { days: readonly DayScore[]; today: string; tracker: Tracker; weekStart?: WeekStart;
    markToday: boolean; paging: boolean; label: string }): JSX.Element;
  /** detail 'values': the tracker page's checklist, with each value right-aligned [rec S08 3:31].
   *  detail 'names': the day page's card, with the mark and the name only, plus the start rule's time [rec S23 9:04] (P6A-10). */
  export function DayRules(p: { score: DayScore; version: TrackerVersion; readOnly: boolean; detail: 'values' | 'names';
    onTick(ruleId: string, ticked: boolean): void; currency: string }): JSX.Element;
  // rule-label.ts: Keel's wording, as in comps 01 and 02
  export function ruleName(key: RuleKey, version: TrackerVersion, fmt: FormatMoney): string;
  export function ruleCondition(key: RuleKey, version: TrackerVersion, fmt: FormatMoney): string;
  ```
- New metric ids, with Keel's wording:
  - `'tracker-streak'`, `'tracker-score'`, `'tracker-today'`;
  - `'rule-streak'`, `'rule-average'`, `'rule-follow-rate'`;
  - `'tracker-history'`, the grid card's info tip, and `'tracker-card'`, the dashboard card's info tip. The card's tip says it shows how consistently the trader follows their own rules [rec S07 3:17] (P6A-17).
- The `HeatGrid`:
  - seven weekday rows in week order (Sunday first by default, as TradeZella's), with week columns and month labels [rec S08 3:31];
  - it starts at the tracker's first day, so the first column may be partial, and cells after today aren't drawn;
  - steps 0 to 4 as accent tints, and blank cells for unscored days (weekends and other non-trading days);
  - hover and focus read the date and "p of n rules met";
  - with `paging`, it fits as many weeks as it can (ResizeObserver), with back, forward and Today (K12);
  - it is a keyboard grid with a text alternative.
- `DayRules`:
  - groups the rules into Prepare, Trade and Reflect;
  - marks each rule per K19: met is a gain-coloured `CheckCircle`, failed a loss-coloured `XCircle`, and pending a faint `Clock`;
  - lets the user tick custom rules ("Tick it yourself"), unless `readOnly`;
  - with `detail: 'values'`, shows each value on the right, as TradeZella's checklist does ("None / 09:30", "0 / 0", "$0 / $100") [rec S08 3:31]. The daily cap shows the day's loss against the limit, $0.00 on a green day (P6A-02);
  - with `detail: 'names'`, shows no values and no "n of m met" count.

- [ ] **Step 1: Write the failing tests.**
  - heat grid:
    - `'unscored days are blank and scored days carry their step'`, as `data-step`;
    - `'hover and focus read the date and p of n rules met'`;
    - `'Today pages back to the latest weeks'`;
    - `'the text alternative names the range and the perfect days'`.
  - day rules:
    - `'marks follow the status'`;
    - `'custom rules tick unless read-only'`;
    - `'Privacy hides money values'` (Review Focus 5): no digit after a currency sign, and labels read "hidden amount".
  - In `metric-definitions.test.ts`: every new id has a definition.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, matching comp 01 at 1440 and 390, in light and dark.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): heat grid and day rules list (#35)`.

---

### Task 8: The progress tracker page

**Files:**
- Create: `src/app/(app)/app/progress/page.tsx`, `src/components/app/progress/progress-view.tsx`, `tiles.tsx`, `rules-table.tsx`, and tests
- Modify:
  - `src/components/app/nav.ts`: a `'progress'` module after `'reports'`, labelled "Progress tracker", with the `Gauge` icon and `href: '/app/progress'`;
  - `tab-bar.tsx`: add `'progress'` to `MORE_IDS`;
  - `filter-bar.tsx` and `nav.ts` `filtersApply`: on `/app/progress`, only the date-range chip shows. K14 and comp 01 settle this, and accounts come from the switcher.

**Interfaces:**
- Consumes: `useDayScores`, `useRoutineToday`, `useGlobalFilters` (range), `periodScore`, `streaks`, `ruleStats`, `HeatGrid`, `DayRules`, `PlanTheDay` and `useSetTick`
- Produces: `ProgressView(): JSX.Element`.
- The page, per spec §5.1 and comp 01:
  - **Tiles,** exactly TradeZella's three, with no extra lines [rec S08 3:31] (P6A-09):
    - the current streak, "N days";
    - the period score, as a half gauge with its %, or None with no data;
    - today's progress, met over active rules with a bar.
  - **Today card:** `DayRules`, and `PlanTheDay`.
  - **History card:** `HeatGrid` with paging, the legend, and the blank-days caption.
  - **Rules table:**
    - the columns Today, Rule (and its stage line), Condition, Streak, Average, and Follow rate (as a bar and a %);
    - an Edit rules button, which opens Task 9's dialog.
  - **States:**
    - loading: skeletons, with no figures;
    - a new or just-reset tracker;
    - a non-trading today: an empty checklist that links to Edit rules, and today reads 0 of 0.
  - **Phone:**
    - the tiles become one strip, and the gauge shrinks to its figure;
    - the rules table becomes two-line rows.

- [ ] **Step 1: Write the failing tests:**
  - `'tiles read the streak, the period score and today's progress, with no other lines'`;
  - `'the tracker has no Display menu, and its phone header shows only the date range'` (P6A-03);
  - `'the date range moves the score and the rules table, not the streak or the grid'` (K14);
  - `'a non-trading today shows the empty checklist, Edit rules and 0 of 0'`;
  - `'it follows the global account selection'`;
  - `'ticking a custom rule writes the tick'`;
  - `'Progress tracker sits after Reports in the sidebar and in More'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comp 01.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): progress tracker page (#35)`.

---

### Task 9: Edit rules, and reset

**Files:**
- Create: `src/components/app/progress/edit-rules.tsx`, `edit-rules.test.tsx`

**Interfaces:**
- Consumes: `useTracker`, `useSaveTracker`, `useResetTracker`, `MorphDialog`, `ConfirmDialog`, `Segmented`, and `versionOn(tracker, today)`
- Produces: `EditRules(p: { open: boolean; onOpenChange(o: boolean): void; origin: RefObject<HTMLElement | null> }): JSX.Element`.
- The dialog, per spec §5.1 and comp 02:
  - **The notice:** a line saying that changes count from today on.
  - **Trading days:** toggles Mo to Su.
  - **Three stages,** each holding:
    - its built-in rules:
      - the time for start-by;
      - from and to for hours, labelled with the profile zone's GMT offset;
      - on or off for strategy and stop;
      - for the per-trade cap, $ or % and a value;
      - for the daily cap, an amount;
    - its custom rules, each with a delete;
    - an "Add rule" link, which inserts an inline row: a name, weekdays defaulting to Mon to Fri, an Add button, and a discard icon [inv-3 104-106] (P6A-14).
  - **Reset all progress:** one confirmation prompt after the button, as TradeZella's [inv-3 103; help 12141413].
  - **The footer:** Cancel, and Save changes, disabled until something changes.
  - **No streak-email control.** There is no email, and an inert control is an anti-goal.
- Validation:
  - times are HH:mm, and from is before to;
  - amounts are positive cents;
  - a percent is over 0 and at most 100%;
  - a custom name is 1 to 80 characters;
  - at least one trading day is on.

  Invalid fields show a field error and keep Save disabled.

- [ ] **Step 1: Write the failing tests:**
  - `'Save stays disabled until something changes'`;
  - `'saving writes a version from today'`;
  - `'a new custom rule defaults to Monday to Friday'`;
  - `'reset asks once, then restarts the tracker today'`;
  - `'invalid times keep Save disabled with a field error'`;
  - `'trading hours show the zone's GMT offset'`;
  - `'on a phone it is a full-height sheet with a fixed footer'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comp 02.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): edit tracker rules and reset (#35)`.

---

### Task 10: The dashboard's tracker card, and Goals removed (U4)

**Files:**
- Create: `src/components/app/dashboard/progress-card.tsx`, `e2e/progress.spec.ts`
- Modify:
  - `dashboard-view.tsx`: `ProgressCard` takes GoalsCard's place, and the `goalDays` local is removed;
  - `src/data/dashboard.ts`: drop `goals` and `goalDays` from `DashboardEnv` and `DashboardModel`;
  - `src/domain/types.ts`: drop `Goals` and `UserPrefs.goals`;
  - `src/data/local/prefs.ts`: drop the goals merge and validation, and `readPrefs` leaves out a stored `goals` key without rewriting it;
  - `repository.ts`: the PrefsRepo doc;
  - `metric-definitions.ts` and its test: drop `'weekly-goal'` and `'daily-loss-limit'`;
  - the comment-only mentions listed by `grep -rn "goals\|Goals" src`;
  - `e2e/dashboard.spec.ts`: remove the goals test (lines 125 to 141);
  - `dashboard.test.ts` and `dashboard-cards.test.tsx`: remove the goals cases.
- Delete:
  - `src/data/goals.ts` and `goals.test.ts`;
  - `src/domain/metrics/goals.ts` and `goals.test.ts`;
  - `src/data/local/prefs-goals.test.ts`;
  - `dashboard/goals-card.tsx` and `goals-form.tsx`.
- Keep the prop-firm `dailyLossLimit` code (`src/domain/prop`, `src/data/seed/prop.ts`, `src/components/app/prop`, `src/lib/landing/sample-view.ts`).

**Interfaces:**
- Consumes: `useDayScores`, `HeatGrid` (with `paging={false}` and `markToday={false}`), and `dayHref`
- Produces: `ProgressCard(): JSX.Element`.
- The card, per comp 03 and K18, K21:
  - the grid;
  - today's score, as "x of y" with a bar;
  - a "Progress tracker" link to the page;
  - a checklist button, which opens today's day page in plan mode.

- [ ] **Step 1: Write the failing tests:**
  - `'the card shows today's score and links to the tracker'`;
  - `'its checklist button opens today's day page in plan mode'`;
  - `'the dashboard has no Goals region'`;
  - `'stored goal prefs are ignored and left in storage'`: the `meta['prefs']` value is unchanged after `get()`.
  - `e2e/progress.spec.ts`, on the sample:
    - the tiles show;
    - a grid hover reads "rules met";
    - Edit rules: switch a trading day, then save, and today reflects it;
    - the dashboard card's link opens the page.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and delete.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test e2e/progress.spec.ts e2e/dashboard.spec.ts`. Expected: PASS. This is the end of Module B.
- [ ] **Step 5:** Commit: `feat(app): tracker card on the dashboard; Goals removed (#35, U4, E50)`.

---

## Module C: Day page (#36)

### Task 11: Day routes, the header, the stages and the session timer

**Files:**
- Create:
  - the routes `src/app/(app)/app/day/[date]/page.tsx`, `plan/page.tsx` and `review/page.tsx`;
  - `src/components/app/day/day-view.tsx`, `day-header.tsx`, `stage-bar.tsx`, `session-button.tsx`, `bad-date.tsx`, `import-picker.tsx`;
  - tests.
- Modify:
  - `nav.ts`: `activeItem` maps `/app/day/*` to `'trades'` (comps 04 and 05), and `pageTitle` covers it;
  - `top-bar.tsx`: the session button on day pages (comp 04, `?state=trading`); no Display menu on day pages or `/app/progress`; Import opens `ImportPicker` on day pages;
  - `sidebar.tsx` / `app-shell.tsx`: the slim icon rail with the add-trade "+" on day pages (comp 04).

**Interfaces:**
- Consumes: `useRoutineToday`, `useDays`, `useStartSession`, `useEndSession`, `sessionLength`, `dayHref`, `dayModeOf`, `MonthPicker` and `isRealDate`
- Produces:
  - `DayView({ date, mode }: { date: string; mode: 'plan' | 'review' })`;
  - `StageBar({ date, mode, today, session })`;
  - `SessionButton({ date })`.
- Behaviour, per spec §5.2 and K25, K26, K30:
  - **`/app/day/[date]`** is a client redirect (`router.replace`) to `dayHref(date, today)`.
  - **A future date** opens plan only: `/review` redirects to `/plan`.
  - **A bad date** shows the plain-page state, with a link to today.
  - **The header** is pinned, and holds:
    - the date, as a plain label in plan, and as the `MonthPicker` popover in review (K25);
    - the stage bar Plan, Trade, Import, Review. The stages are links, and a switch pushes a history entry and keeps the date. Trade follows "Calls this plan makes";
    - no Display menu (P6A-03).
  - **Import** (the Import stage, and the top bar's Import on day pages) opens `ImportPicker`, a dialog of methods, as TradeZella's import modal [inv-2 062-063] (P6A-13):
    - "Upload a file" goes to `/app/import`;
    - "Enter a trade by hand" goes to `/app/trades/new`;
    - "Auto-sync" is marked "Not live yet" and disabled (#12).
  - **The slim rail** (P6A-13): on day pages, the desktop sidebar shrinks to its icon rail, with an add-trade "+" on top that goes to `/app/trades/new` [rec S23 8:46]. The workspace switcher stays reachable as an icon. Phone layouts keep the tab bar.
  - **The session** (K30):
    - today only, once a day;
    - while it runs, Trade shows the elapsed time, and the top bar shows "End session" with a clock;
    - a running session ends at finish, or at local midnight.
  - **Phone:** the date and the session control sit on top, with the stage bar full width below.

- [ ] **Step 1: Write the failing tests:**
  - `'the bare day URL routes today and future dates to plan, past dates to review'`;
  - `'a future date has no review'`;
  - `'a bad date shows the plain page with a link to today'`;
  - `'stage links push history and keep the date'`;
  - `'Trade starts the session today and is disabled on other dates'`;
  - `'the session runs once and End session stops it'`;
  - `'review's date control opens the month popover'`;
  - `'Import opens the method picker, and Auto-sync is not live'`;
  - `'day pages show the slim rail with add trade'`;
  - `'day pages have no Display menu'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comps 04 and 05.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): day page routes, stages and session timer (#36)`.

---

### Task 12: Plan mode: the note, templates, the rules card and screenshots

**Files:**
- Create: `src/components/app/day/plan-mode.tsx`, `note-card.tsx`, `template-menu.tsx`, `first-visit-tip.tsx`, `screenshots-card.tsx`, `shot-viewer.tsx`, and tests
- Modify:
  - `src/components/app/notes/note-editor.tsx`: `NoteEditorHandle` gains `insertContent(doc: unknown): void`;
  - `trade-journal.tsx`: export a `DayNoteBinding` for the day page's note, built from `DayNote`'s autosave;
  - `src/data/seed/templates.ts` and `src/content/note-templates.ts`: three Keel daily templates (K32), each `kind: 'daily-review'`, `builtIn: true` and `isDefault: false`, with ids `'template-daily-plan'`, `'template-daily-full'` and `'template-daily-checkin'`. They mirror the structure of TradeZella's three recommended templates (a pre-open game plan, an all-in-one day, an intraday check-in), in Keel's own words;
  - `notebook-view.tsx`: New no longer offers Pre-market plan (U3).

**Interfaces:**
- Consumes:
  - `useDayScores().scoreOn(date)` and `DayRules`;
  - `useTemplates`, `TemplatesDialog`, `useSaveJournalEntry` and `ConfirmDialog`;
  - `useDayShots`, `useAddDayShot`, `useRemoveDayShot` and `MorphDialog`;
  - `usePrefs`/`useUpdatePrefs` (`seenTips`).
- Produces: `PlanMode({ date }: { date: string })`, and `NoteCard({ date, readOnly }: { date: string; readOnly: boolean })`, which Task 13's review reuses.
- Behaviour, per spec §5.2 Plan mode and K27, K28, K32, comp 04:
  - **Note card:**
    - "Day note" with the save status, and "From the {template} template. Change template";
    - the Templates menu lists the user's daily templates, the three Keel ones, then Manage templates and Edit default. A pick inserts at the cursor;
    - Change template replaces the body, after a confirmation when the body has text, and records `templateId`;
    - it autosaves (the repo stamps `noteStartedAt`), and takes a `readOnly` prop.
  - **The tip:** on the first visit to plan mode, a one-time tip sits by the Templates control (`seenTips: 'day-plan-templates'`).
  - **Rules card:**
    - `DayRules` with `detail: 'names'` (P6A-10), and a "Progress tracker" link;
    - before the start: "Not tracked yet. The tracker started on {date}." On a non-trading day: "Not a trading day." A future date has no rules card (K20).
  - **Screenshots** (K27, plan mode only):
    - a drop zone, and Choose files, for PNG or JPEG up to 10 MB, checked before the write;
    - thumbnails in upload order, two to a row on a phone, loaded lazily. Their object URLs are made on mount and revoked on unmount;
    - a click opens the viewer (`MorphDialog size="full"`), with previous, next and a confirmed delete;
    - errors: a type or size message. A quota or lock refusal shows "Couldn't save".

- [ ] **Step 1: Write the failing tests:**
  - `'Templates inserts at the cursor and keeps the rest'`;
  - `'Change template asks first when the note has text, then replaces it and records the template'`;
  - in the templates seed test: `'three Keel daily templates are built in and none is the default'`. Opening an existing workspace adds them, and an edited built-in is kept;
  - `'the tip shows once'`;
  - `'a GIF and a file over 10 MB are refused with a message'`;
  - `'thumbnails revoke their object URLs on unmount'` (spy on `URL.revokeObjectURL`);
  - `'delete asks first'`;
  - `'the viewer pages previous and next'`;
  - `'the rules card says when the tracker started on a date before it'`;
  - in `notebook-view.test.tsx`: `'New no longer offers Pre-market plan, and an existing pre-market entry still opens'` (U3).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comp 04.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): day plan mode with templates, rules and screenshots (#36, U3)`.

---

### Task 13: Review mode, the day rating, Close the day, and the locked day everywhere

**Files:**
- Create:
  - `src/components/app/day/review-mode.tsx`, `review-tiles.tsx`, `review-trades.tsx`, `rating-card.tsx`, `finish-day.tsx`;
  - `src/components/app/routine/rating-row.tsx`, moved from `trade-journal.tsx` with the same props; the trade page imports it;
  - `e2e/day.spec.ts`, and tests.
- Modify, for the locked state:
  - `trade-journal.tsx`: `DayNote` is read-only, with the lock line, on a finished date;
  - `notebook-view.tsx` (`DailyPane`);
  - `notebook/entry-pane.tsx`: a `daily-review` entry of a finished date is read-only.

**Interfaces:**
- Consumes:
  - `dayOfTrade` and `groupDays` (Task 14 defines them; this task uses only `dayOfTrade`, so take it from `src/data/day-log.ts`, created here as just that function plus its test, which Task 14 extends);
  - `useTradeSet` (accounts only), `useSetRating`, `useFinishDay`, `freezeDay`, `sessionLength` and `ConfirmDialog`.
- Produces:
  - `ReviewMode({ date })`;
  - `RatingRow`, unchanged.
- Behaviour, per spec §5.2 Review mode and K29, K31, K34, comps 05 and 05-locked:
  - **Tiles,** exactly TradeZella's three, each a value only, with no sub-lines [rec S23 8:46] (P6A-11):
    - Net P&L;
    - Win rate;
    - Session, its length.

    Without trades: net $0.00, and win rate and session None.
  - **Trades card:**
    - every trade of the day, by `dayOfTrade`, in the global account selection;
    - exactly TradeZella's columns: Symbol, Outcome (`StatusChip`), Entry, Exit, Net P&L, Net ROI [rec S23 8:46], with no Time column (comp 05 added one);
    - a fixed height that scrolls inside the card on desktop. On a phone: two-line rows carrying only those fields, five, then "Show all {n} trades", with no inner scroll;
    - a row opens the trade;
    - with no trades, an empty line and an Import button that opens `ImportPicker`. There is no Import button while the day has trades [inv-2 054] (P6A-19).
  - **Day rating card** (K31):
    - the day rating, 1 to 5 stars, with Clear;
    - it works today and on past days, with or without trades;
    - no mood control: TradeZella's mood check-in lives on the Day view's cards (Task 15).
  - **Note card:** Task 12's `NoteCard`, under the trades card. Nothing sits below the note.
  - **Rules card:** `DayRules` with `detail: 'names'`, with Close the day at its foot and the comp's caption.
    - It is offered only on scored days, today or earlier (K20).
    - It asks first. On confirm, it writes `freezeDay(...)` through `useFinishDay`.
  - **Locked state** (comp 05-locked):
    - "Closed at {time}";
    - every stage is read-only (rules, note with a "Locked" chip, rating, screenshots, with no drop zone or delete), and the date's mood is locked on its Day view card;
    - the stages still navigate.

- [ ] **Step 1: Write the failing tests:**
  - `'review tiles read net, win rate and session; None without trades'`;
  - `'the trades card lists every trade of the day and opens a trade'`;
  - `'the trades card offers Import only when the day has no trades'`;
  - `'review tiles show only their values'`;
  - `'the day rating writes the day record and Clear removes it'`;
  - `'the day page has no mood control'`;
  - `'Close the day asks first, then locks the rules, note, rating and shots'`;
  - `'Close the day is not offered before the start, on a non-trading day or in the future'`;
  - `'a finished day is read-only in the trade page's Daily note and in the Notebook'` (Review Focus 3).
  - `e2e/day.spec.ts`, on the sample at the frozen clock:
    - **the daily loop:** Dashboard, Plan the day, today, type in the note, tick a custom rule, Review, rate, Close the day, confirm. The page shows the locked state, and the tracker's today row reads closed;
    - **refusals:** the same day refuses edits from the trade page's Daily note and from the Notebook.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comps 05 and 05-locked.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test e2e/day.spec.ts`. Expected: PASS. This is the end of Module C.
- [ ] **Step 5:** Commit: `feat(app): day review, the day rating, and closing the day (#36)`.

---

## Module D: Day and Week views (#37)

### Task 14: Day and week groups (test-first)

**Files:**
- Modify or create: `src/data/day-log.ts`, `src/data/day-log.test.ts`

**Interfaces:**
- Consumes: `classify` (`metrics/context.ts`), `localDate`, `weekFirstDay` and `rotateFromWeekStart` (`src/domain/week.ts`), and `netRoiOf`
- Produces:
  ```ts
  export interface DayStats { trades: number /* open included */; wins: number; losses: number;
    net: Cents | null /* closed only; null when none closed */; gross: Cents | null; commissions: Cents;
    winRate: number | null; profitFactor: number | null /* null without a loss (K39) */; volume: number /* both sides */ }
  export interface IntradayPoint { tradeId: string; time: string; net: Cents; cumulative: Cents }
  export interface DayGroup { date: string; trades: Trade[] /* newest open time first (K38) */; stats: DayStats;
    series: IntradayPoint[] /* closed trades by close time */; otherCurrency: Trade[] /* K24 */; hasNote: boolean }
  export interface WeekGroup { start: string; end: string; days: (DayGroup | null)[] /* seven, week order */;
    stats: DayStats; trades: Trade[]; dailyNet: (Cents | null)[] }
  export interface DayLogEnv { timeZone: string; baseCurrency: string; ctx: MetricContext; weekStart: WeekStart;
    /** Dates that have a daily note; pass an empty set while a trade-level filter is active. */
    noteDates: ReadonlySet<string> }
  /** K37: the close date if closed, else the open date, in the profile zone. */
  export function dayOfTrade(t: Trade, timeZone: string): string;
  /** Newest first; days with trades, plus note-only days. */
  export function groupDays(trades: readonly Trade[], env: DayLogEnv): DayGroup[];
  /** Weeks with trades only, latest first; gap weeks and an empty current week left out (K41). */
  export function groupWeeks(days: readonly DayGroup[], env: DayLogEnv): WeekGroup[];
  ```
- The figures, per spec §5.3:
  - **Sums:** net and gross sum the closed trades.
  - **Counts:** trades counts the open trades too. Wins and losses come from `classify` on the closed trades, with the breakeven band.
  - **Ratios:** win rate is wins over (wins + losses). Profit factor is the summed positive nets over the absolute summed negative nets.
  - **Commissions:** gross minus net, on the closed trades.
  - **Volume:** the sum of every execution's `qty`.
  - **Other currencies:** trades in other currencies are left out of the stats and series, and listed in `otherCurrency`.

- [ ] **Step 1: Write the failing tests.**
  - `'a trade belongs to its close date, or its open date while open'` (K37), including a multi-day trade (Review Focus 2).
  - `'rows run newest open time first'` (K38).
  - `'stats match the rules on a fixture'`. The fixture is three closed trades (net +100 and gross +110; net −50 and gross −45; net 0 and gross +5, breakeven) plus one open trade. Expected:
    - `trades 4`, `wins 1`, `losses 1`, `winRate 0.5`;
    - `net 50`, `gross 70`, `commissions 20`, `profitFactor 2`;
    - `volume` = the sum of the fixture's fill quantities.
  - `'a day without a loss has profit factor null'` (K39).
  - `'an open-only day has net null and an empty series'`.
  - `'a mixed-currency day keeps other currencies apart'`.
  - `'note-only days get a group with empty stats'`.
  - `'tiles follow the week start'`, both Sunday and Monday.
  - `'gap weeks and an empty current week are left out'`.
  - `'groups the sample in under 50 ms'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): day and week groups for the trade log (#37)`.

---

### Task 15: The Day view

**Files:**
- Create:
  - `src/app/(app)/app/trades/day/page.tsx`;
  - `src/components/app/trades/log/trades-switch.tsx`, `day-view.tsx`, `day-card.tsx`, `intraday-chart.tsx`, `stat-grid.tsx`, `log-table.tsx`;
  - tests.
- Modify:
  - `src/data/trade-columns.ts`: `ColumnId` adds `'ticker'` (the root symbol) and `'day'`, and the file exports `DAY_COLUMNS` and `WEEK_COLUMNS = ['day', ...DAY_COLUMNS]`;
  - `columns.tsx` and `cells.tsx`: those two cells;
  - `trades-view.tsx`: the switch above All, and Add trade in the header;
  - `nav.ts`: Trades' `href` becomes `'/app/trades/day'` (K36), `activeItem` covers `/app/trades/*`, and `filtersApply` covers Day and Week;
  - `e2e/app-shell.spec.ts`: Trades opens Day.

**Interfaces:**
- Consumes: `groupDays`, `useTradeSet`, `useGlobalFilters`, `advancedFilterCount`, `useJournal` (note dates), `useDays` (moods), `ColumnsMenu`, `buildColumns`, `TagPicker`, `useUpdateTrade`, `useSetMood`, `PlanTheDay` and `MorphDialog`
- Produces:
  - `TradesSwitch({ view: 'day' | 'week' | 'all' })`;
  - `TradesDayView()`;
  - `MoodControl({ value, note, readOnly, onChange(next: DayRecord['mood']): void })`, in `src/components/app/routine/mood-control.tsx`: a menu of the five mood words, with an optional note of up to 280 characters, read-only on a finished day;
  - `DayCard({ group, expanded, onToggle })`;
  - `IntradayChart({ series, label, large? })`;
  - `StatGrid({ stats })`;
  - `LogTable({ trades, columns, onColumns })`.
- `DAY_COLUMNS`: `['open', 'ticker', 'side', 'instrument', 'net', 'roi', 'realizedR', 'strategies', 'tags']`: Open time, Ticker, Side, Instrument (the contract), Net P&L, Net ROI, Realized R, Strategy, Tags, as TradeZella's [rec S26 9:50, 9:54] (P6A-07). There is no asset-class column.
- Behaviour, per spec §5.3 and K38 to K45, comp 06:
  - **The switch:** Day, Week and All are links that keep every filter param.
  - **The toolbar:** the switch, the toolbar and the mini calendar's slot are pinned.
  - **Cards:** newest first, collapsed. The header holds:
    - a chevron;
    - the date;
    - the net, always after costs;
    - Mood, a menu, shown only on days logged through Plan the day, TradeZella's rule [help 5829446] (P6A-12). In Keel this means the date has a day record: a note stamp, session, tick, rating or finish;
    - Review, which goes to the day page's review;
    - a slot for the note action (Task 16).
  - **The intraday chart:**
    - a step line of the cumulative net, tinted green above zero and red below, with $ labels on the y axis and none on the x axis [rec S24 9:27] (P6A-26);
    - hover reads "{time}, {symbol} {net}, running net {cum}";
    - a click enlarges it in a `MorphDialog`, whose chart has a $ y axis and three time labels: the start, middle and end of the day's trading [rec S26] (P6A-26).
  - **The stat grid:** Trades, Gross P&L, Won / lost, Commissions, Win rate, Volume, Profit factor, each with a `MetricTip` (add the ids). Day volume needs its own definition: "both sides".
  - **Expanded:** `LogTable`, with the `dayColumns` pref.
    - The tags cell's "+" opens `TagPicker`.
    - An open trade shows a muted "(open)" before its amount, and a bracketed ROI.
    - A row opens the trade.
  - **Paging** (K42): 20 cards, more on scroll, plus a Show more button.
  - **States:**
    - no trades or notes: the empty state, with Import only [inv-2 051] (P6A-19);
    - filters match nothing: "No trades match these filters." with Clear filters;
    - a note-only card shows Net P&L $0.00, View note, and a no-trades line [inv-2 052] (P6A-20);
    - open trades only;
    - a one-day filter shows one card;
    - a narrowing display unit behaves as in the trade log (`unitLeftOut` from `useTradeSet`);
    - other currencies are listed apart.
  - **Phone:**
    - the switch is full width, and the quick actions are 44px glyphs;
    - the chart is full width, and the stat grid two columns;
    - the table becomes two-line rows.

- [ ] **Step 1: Write the failing tests:**
  - `'cards run newest first, start collapsed and expand to the table'`;
  - `'the card header shows net after costs whatever the P&L basis'`;
  - `'the stat grid matches day-log'`;
  - `'chart hover reads the trade and the running net'`;
  - `'Privacy hides money on cards, chart labels and readouts'` (Review Focus 5);
  - `'mood shows only where the date has a day record'`;
  - `'note-only cards read $0.00'`;
  - `'the card chart has $ labels and no time labels; the enlarged chart has three times'`;
  - `'columns are TradeZella's: Ticker and Instrument, with no asset class'`;
  - `'20 cards, then more'`;
  - `'dayColumns saves apart from the trade log's columns'`;
  - `'Trades in the sidebar opens Day, and /app/trades stays All'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comp 06.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): trade log by day (#37)`.

---

### Task 16: The note dialog, the mini calendar, and the Calendar page's link

**Files:**
- Create: `src/components/app/trades/log/day-note-dialog.tsx`, `mini-calendar.tsx`, and tests
- Modify:
  - `day-card.tsx`: the note action, "Add note" or "View note";
  - `day-view.tsx`: the mini calendar;
  - `src/components/app/calendar/day-panel.tsx`: the trades link goes to `/app/trades/day` with `from` and `to` set to the date, plus the current filters.

**Interfaces:**
- Consumes: `DayNoteBinding` (Task 12), the template menu (Task 12), `useSaveJournalEntry` (favorite), `useTrashJournalEntry`, `MonthPicker`, `groupDays` and `useDisplay`
- Produces:
  - `DayNoteDialog({ date, open, onOpenChange, origin })`;
  - `MiniCalendar({ groups, today, selected, onPick, weekStart })`.
- The dialog, per spec §5.3 and K43, comp 07:
  - **Header:** Templates (insert), View in notebook, a star, a menu holding Move to Trash, and close.
  - **Summary row:** the date, the net, and "n trades, x% win rate". It expands to the trade table.
  - **Body:** the editor, which autosaves. Save flushes, then closes.
  - **A finished day:** read-only, with the lock line.
  - **A trashed note:** Restore (E109).
- The mini calendar, per comp 06:
  - arrows and a weekday header;
  - underlines by the sign of the net: gain, loss, or neutral for a flat day (K39);
  - today in bold, and the selected day outlined;
  - hover and focus show "{weekday d MMM}, {net}, {n} trades";
  - a click sets the range to that day, and the date chip gains its clear control;
  - on a phone, a Calendar button opens it as a sheet, and a pick closes the sheet.

- [ ] **Step 1: Write the failing tests:**
  - `'the dialog autosaves, and Save flushes and closes'`;
  - `'it is read-only with the lock line on a finished day'` (Review Focus 3);
  - `'Move to Trash sits in its menu'`;
  - `'underlines follow the net's sign, and flat days are neutral'`;
  - `'a pick filters to the day and the chip can clear it'`;
  - `'hover previews net and count, masked under Privacy'`;
  - `'the Calendar day panel opens the Day view on that date'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comps 06 and 07.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): day note dialog and mini calendar (#37)`.

---

### Task 17: The Week view

**Files:**
- Create:
  - `src/app/(app)/app/trades/week/page.tsx`;
  - `src/components/app/trades/log/week-view.tsx`, `week-card.tsx`, `week-tiles.tsx`, `week-bars.tsx`;
  - `e2e/trades-log.spec.ts`, and tests.

**Interfaces:**
- Consumes: `groupWeeks`, `DayCard`'s body, `StatGrid`, `LogTable` (with `weekColumns`), `MorphDialog`, and the `BreakdownChart` pattern
- Produces: `TradesWeekView()`, and `WeekCard({ week, expanded, onToggle })`.
- Behaviour, per spec §5.3 Week view and K41, K42, K46, comps 08 and 09:
  - **Cards:**
    - weeks with trades only, latest first, each showing its span and net;
    - the first card starts expanded, and the rest collapsed;
    - 8 weeks at a time.
  - **Seven tiles,** in week order. Each shows:
    - a trend glyph, the weekday and the date;
    - the net and the count;
    - a gain or loss tint.

    A tile without trades is blank and is not a button. A tile opens its day card's body in a `MorphDialog` (K46).
  - **Bars:** the daily net bars, with readouts.
  - **Stat grid.**
  - **Table:** with the Day column by default (the `weekColumns` pref).
  - **A one-day filter:**
    - the card is the week that holds the day;
    - only that day's tile is filled;
    - the stats cover the filtered trades;
    - the table lists the week's trades under every filter except the date range.
  - **Empty:** the Day view's empty state.
  - **Phone:** one row of seven narrow tiles, each with the weekday initial, the day number and a compact net. The count goes in the tile's label and its dialog.

- [ ] **Step 1: Write the failing tests:**
  - `'weeks with trades only, latest first, the first expanded'`;
  - `'tiles follow the week start'`;
  - `'a tile without trades is not a button'`;
  - `'a tile opens that day's card body'`;
  - `'a one-day filter fills one tile while the table keeps the week's other days'`;
  - `'weekColumns has Day by default'`.
  - `e2e/trades-log.spec.ts`:
    - Day and Week filters round-trip in the URL: set a symbol and a range on Day, switch to Week, the params are kept, then go back;
    - a mini-calendar pick filters to that day;
    - edit a note in the dialog;
    - a finished day's note dialog refuses edits.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comps 08 and 09.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test e2e/trades-log.spec.ts e2e/app-shell.spec.ts e2e/calendar.spec.ts`. Expected: PASS. This is the end of Module D.
- [ ] **Step 5:** Commit: `feat(app): trade log by week (#37)`.

---

## Module E: Getting started (#47)

### Task 18: Home, and the landing

Home comes first, because the first run's preferences dialog opens over it [inv-1 013-014].

**Files:**
- Create:
  - `src/app/(app)/app/home/page.tsx` and `src/app/(app)/app/page.tsx` (the landing);
  - `src/components/app/home/home-view.tsx`, `getting-started.tsx`;
  - `src/data/getting-started.ts`, and tests.
- Modify:
  - `next.config.ts`: remove the `/app` redirect;
  - `nav.ts`: a `'home'` module first, with the `House` icon;
  - `tab-bar.tsx`: `MORE_IDS` gains `'home'`;
  - `settings/profile.tsx`: first name, last name and username fields. An existing `displayName` reads as the first name when no first name is set.

**Interfaces:**
- Produces:
  ```ts
  export interface GettingStarted { steps: { id: 'prop' | 'challenge' | 'trade'; done: boolean }[]; done: number; total: 3 }
  /** K50: prop = a prop-evaluation or prop-funded account, or any challenge; challenge = a challenge; trade = any trade. */
  export function gettingStarted(accounts: readonly Account[], challenges: readonly Challenge[], trades: readonly Trade[]): GettingStarted;
  export function HomeView(p: { skeleton?: boolean }): JSX.Element;   // skeleton: the first run's backdrop (Task 19)
  ```
- Home, per spec §5.4 Home and K49 to K53, comp 14:
  - **The greeting:** "Good morning, {firstName}", by the time of day (morning, afternoon, evening), with the date line. Without a first name, no name.
  - **The Get started card:** "n of 3 complete", with a bar.
    - The next step's number is ringed.
    - A done step shows a tick, a struck-through title and a Done chip, with no button.
    - The step buttons (K49):
      - step 1 opens Settings > Accounts with a new prop account;
      - step 2 opens Prop firms with a new challenge;
      - step 3 opens `/app/trades/new`.
    - Step 1's text says that automatic sync isn't live yet.
    - At 3 of 3 the card stays (K51).
  - **Explore:** Prop firms, the Dashboard, and Backtesting with "Not live yet" (K53).
  - **Recommended focus:** TradeZella's four rows, in Keel's words [rec S01 0:11] (P6A-08), static:
    1. add your prop account, saying plainly that automatic sync isn't live yet. It goes to Settings > Accounts;
    2. set up rule monitoring with a challenge that watches the daily and max drawdown limits. It goes to a new challenge;
    3. add your first challenge trade. It goes to `/app/trades/new`;
    4. review your challenge dashboard. It goes to Prop firms.
  - **Resources:** the Changelog.
  - **Loading:** the greeting over skeletons.
  - **Phone:** the cards stack, and Home is in More.
- The landing at `/app` (K56) is a client page:
  - Home while the checklist is incomplete;
  - the Dashboard once it is complete.

- [ ] **Step 1: Write the failing tests:**
  - `gettingStarted`:
    - each step on its own;
    - a challenge alone completes steps 1 and 2.
  - `'the next step is ringed, and done steps show Done without a button'`;
  - `'the sample shows 3 of 3 and the card stays'`;
  - `'recommended focus lists the four rows and their links'`;
  - `'/app lands on Home until the checklist is complete, then on the Dashboard'`;
  - `'the greeting uses the first name and the time of day'`;
  - `'Profile edits the first name, last name and username'`;
  - e2e: `app-shell`'s `'/app goes to the Dashboard'` still passes on the sample.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comp 14.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): Home with getting started, and the /app landing (#47)`.

---

### Task 19: The first run: gate, welcome, survey, the preferences dialog and the zone notice

**Files:**
- Create:
  - `src/app/(welcome)/layout.tsx`: `data-surface="app"`, `DataProvider`, and the centred look of `(auth)`;
  - `src/app/(welcome)/app/welcome/page.tsx` and `[step]/page.tsx`;
  - `src/components/app/welcome/welcome-view.tsx`, `survey-step.tsx`, `survey-model.ts`, `preferences-dialog.tsx`;
  - `src/content/onboarding.ts`: the steps, the options, and the broker list from the brokers page content (K47);
  - `src/components/app/first-run-gate.tsx`;
  - `src/data/onboarding.ts`, `src/data/local/onboarding.ts`;
  - `e2e/onboard.setup.ts`, `e2e/onboarding.spec.ts`;
  - tests.
- Modify:
  - `src/app/(app)/layout.tsx`: `<DataProvider><FirstRunGate><AppShell>`;
  - `repository.ts`, `local-repository.ts`, `keys.ts` and `hooks.ts`;
  - `playwright.config.ts`: a `setup` project, and `dependencies` and `storageState` on desktop and mobile;
  - `.gitignore`: `e2e/.state/`;
  - any e2e spec that needs a fresh database (`grep -ln "first visit\|seeds the sample" e2e`): `test.use({ storageState: { cookies: [], origins: [] } })`.

**Interfaces:**
- Consumes: `HomeView` (Task 18), and `TimeZoneField`
- Produces:
  ```ts
  // src/data/onboarding.ts
  export const USERNAME = /^[A-Za-z0-9._]{3,30}$/;
  export function isOnboarded(prefs: Pick<UserPrefs, 'onboarding'>): boolean;
  // repository.ts
  export interface FirstRunInput { firstName: string; lastName: string; username: string;
    baseCurrency: string; timeZone: string; survey?: SurveyAnswers }
  export interface OnboardingRepo {
    /** One transaction: prefs (names, currency, zone, onboarding flag); "My account" in My workspace in that
     *  currency when it has none; My workspace active. RangeError for a bad username, zone or currency. */
    complete(input: FirstRunInput): Promise<void>;
  }
  // Repository: add onboarding.  WriteKind 'onboarding.complete' → [prefs, activeWorkspace, workspace('mine')]
  // hooks.ts
  export function useCompleteFirstRun(): UseMutationResult<void, Error, FirstRunInput>;
  ```
- TradeZella's first run, in Keel, per spec §5.4, U1, U2, K47, K48, K55 and K56, comps 10 to 13 [inv-1 001-016]:
  1. **Welcome** (comp 10).
  2. **The survey, six steps** (comps 11 and 12), with the progress bar over six [inv-1 002, 008] (P6A-16):
     1. experience, one of four bands;
     2. capital: personal, prop or not yet, several at once. Not yet clears the other two, and either of them clears not yet (K47);
     3. broker: a type-ahead with Other and None yet;
     4. markets: seven tiles, several at once;
     5. goals: several at once;
     6. how you heard: ten sources, with free text for Other.

     The chrome is "Step n of 6" and the bar, Back from step 2 on, and Continue, disabled until the step is answered and pinned above the safe area on a phone. There is no log-out and no social-proof strip.
  3. **Home, with a required preferences dialog** (comp 13) [inv-1 013-014] (P6A-16):
     - Home renders behind it as `HomeView skeleton`, since nothing is saved yet;
     - the fields are first name, last name and username (K48), the default account currency (a select with USD first, shown "USD (US dollar)"), and the time zone (a select showing the GMT offset and the zone name, opening on `America/New_York`);
     - one submit button, and no close. It can't be skipped.
  4. **After saving,** a toast in Keel's words says the time zone is being applied to the trades [inv-1 015] (P6A-15).
- **The gate:**
  - it renders nothing until the prefs load, so nothing flashes;
  - while `isOnboarded` is false:
    - with no finished survey this browser session, it does `router.replace('/app/welcome')`;
    - with a finished survey, it sends every `/app/*` route to `/app/home`, which shows the preferences dialog;
  - it covers every `/app/*` route, the sample link included (U1, K56).
- **Answers** live in `sessionStorage['keel:first-run']` until the dialog is submitted (K55). Nothing is written to the repo before then.
- **Save** runs `complete`, storing the survey answers only (U2). Then it closes the dialog, shows the toast, and Home renders for My workspace.
- e2e setup, in `onboard.setup.ts`:
  1. Freeze the clock at `2026-11-20T15:00:00Z`, and go to `/app/welcome`.
  2. Wait for the welcome heading, which means the DB is open and the sample is seeded.
  3. In `page.evaluate`, open `keel-data` and merge `{ onboarding: { status: 'done', at: '2026-11-20T15:00:00.000Z', existing: true } }` into `meta['prefs']`.
  4. Save `context.storageState({ path: 'e2e/.state/onboarded.json', indexedDB: true })`.

- [ ] **Step 1: Write the failing tests:**
  - in the repo test:
    - `'complete makes My account in the chosen currency, makes My workspace active and sets the flag'`;
    - `'no second account when My workspace has one'`;
    - `'a bad username writes nothing'`;
  - `'the gate sends a new browser to welcome from any app route, the sample link included'`;
  - `'after the survey every app route shows Home with the preferences dialog, which has no close'`;
  - `'an onboarded user passes the gate'`;
  - `'the survey has six steps, and Continue stays disabled until the step is answered'`;
  - `'Back appears from step 2'`;
  - `'not yet and the other capital choices clear each other'`;
  - `'a reload mid-survey resumes the answers'`;
  - `'the zone opens on US/Eastern'`;
  - `'saving shows the time-zone toast'`;
  - `'a failed save keeps the answers in the dialog'` (Review Focus 4).
  - `e2e/onboarding.spec.ts`, from an empty state: the whole first run, then the toast. Home shows 0 of 3, and the switcher shows My workspace and My account.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement against comps 10 to 13.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`. Expected: PASS, the whole suite, on the onboarded state. This is the end of Module E.
- [ ] **Step 5:** Commit: `feat(app): first run with welcome, survey and the preferences dialog (#47)`.

---

## Module F: Finish

### Task 20: Audit, records and final checks

**Files:**
- Modify:
  - `docs/BACKLOG.md`;
  - `docs/research/tradezella-feature-map.md`: the rows PT1, PT2, DA3, DV1, TR7 and ON1 to ON3;
  - `DESIGN.md`: the new components and the patterns of the heat grid, stage bar and mood control.

- [ ] **Step 1: Gap audit, row by row** (the parity rule). Check each against the build, and fix or report anything not built and not scheduled:
  - every bullet of spec §5.1 to §5.4, and K1 to K56;
  - each 6A row in `.superpowers/research/tradezella/recording/gaps.md`;
  - the behaviour spec's §1 to §4.
- [ ] **Step 2: Records,** in `docs/BACKLOG.md`.
  - Close #35, #36, #37, #47, E50 and E109, in the Done convention (`~~…~~. Done in Plan 6A Task N: …`).
  - Apply every correction in spec §7.
  - Add rows for the streak email (with #26), day-card insights (#40), the week events list (#25) and the replay quick action (#15).
- [ ] **Step 3: Performance.**
  - Do this in a scratch Playwright script at `scripts/.p6a-perf.tmp.mjs`, which is never committed.
  - On the sample, time a filter change on `/app/progress`, `/app/trades/day` and `/app/trades/week`, with `performance.mark`s around the recompute. Each must be under 50 ms.
- [ ] **Step 4: Design finish review.**
  - Run the impeccable finish reviewer against the comps at 390 and 1440, in light and dark, with no overflow from 390 to 1680.
  - Fix the material items.
- [ ] **Step 5: Verification:** `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`. Expected: PASS.
- [ ] **Step 6:** Commit: `docs: close Plan 6A records and corrections (#35, #36, #37, #47)`.
