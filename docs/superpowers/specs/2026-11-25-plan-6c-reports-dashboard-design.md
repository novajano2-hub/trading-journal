# Plan 6C: Reports, dashboard and polish, design

**Date:** 2026-11-25. **Branch:** `m1-p6c`, cut from `main` once Plan 6A has merged. **Backlog:** #45, #46, #23, #48, #49, #50, #51, with E44, E51, E52, E55 and E95. **Feature map:** PF5, PF6, DA1, DA2, DA4, AC5, CA5, X10, RE9.

**Authorities, in order:**

1. The owner's parity rule: Keel copies TradeZella's (TZ) behaviour and adds no feature of its own. Where TZ's behaviour is confirmed, Keel follows it. Keel decides only where TZ is unknown, and marks each such decision.
2. The behaviour record, `.superpowers/research/tradezella/plan6c-behaviour.md` (git-ignored; in this worktree), cited as "rec §n". Its source tags are kept:
   - `[rec Sxx]` is the recording, `[inv-n NNN]` the screenshot inventories, `[help NNNN]` a help article and `[connector]` TZ's read-only connector;
   - **help only** marks behaviour in TZ's help that the user's account did not show (in scope, as TZ's current product);
   - INFERRED marks a reading drawn from the evidence.
3. `DESIGN.md` and `PRODUCT.md`.
4. The Plan 5 rulings, and Plan 6A's spec (`2026-11-25-plan-6a-daily-routine-design.md`), whose Keel's calls K1 to K56 and decisions U1 to U4 stand.

Where TZ is unknown this doc decides, as a **Keel's call (TradeZella unknown)** with an id (C1 to C81, all listed in §6.1).

**TradeZella's behaviour, never its UI** (the owner, 2026-11-25). Wherever this doc says "TZ's template", "TZ's default", "TZ's widgets" or "TZ's way", it means TZ's features and behaviour: which widgets exist, which are in the default set, and what each one does and computes. The layout, look, arrangement, wording and icons are Keel's own: design G and the comps. Nothing here asks for TZ's screen. The owner's decisions are D1 to D3 (§6.2).

## 1. Intent and why

Plan 6C finishes Plan 6 with the parts of TZ that sit around the daily loop:

- TZ's dashboard features: saved templates of widgets, with an upper section of at most five figures and a lower section (#46), laid out in Keel's own design, including TZ's composite score (#23) and 6A's progress tracker card as a removable widget;
- prop finances: what a prop trader spent, earned and netted, which challenges pass, and why they break (#45);
- two account and calendar features: a cost method per account, and the calendar saved as an image (#49);
- shell polish: the sidebar and the Settings menu collapse to icons (#50);
- a report exported as a PDF (#51);
- import parsing off the main thread (#48).

All of it runs on local data. Together with 6A and 6B it closes the Plan 6 rows the owner picked from the feature map.

## 2. Goals, non-goals, anti-goals

**Goals**

- TZ parity for the seven rows, including the help-only behaviour: the twelve upper and seventeen lower widgets [help 7118437], the prop dashboard's figures, insights and filters [help 13463814], and the transactions with their review status [help 14588595, 14502964].
- One composite score with TZ's method, matching TZ's 76.3 on the forex file's 2 Nov trades within the readings' error (the inferred method gives 76.44), and TZ's component readings at the other two recorded scopes (rec §2.4), shown in Keel's own look and words (D1).
- The prop module as TZ's: Dashboard, Accounts and Transactions (#45 with D3).
- A safe upgrade for every existing Dexie database; a sample workspace that shows every new state.

**Non-goals** (each stays in, or joins, the backlog):

- **Server and third parties:** the bank link that detects prop fees and payouts (rec §3.1; with #10), the dashboard's resync (#10), the firm catalogue's presets (#24).
- **Market data:** the calendar's economic-event dots and their settings (#25).
- **AI:** the score is computed, not generated, and stays in; nothing else here is AI.
- **Settings pages TZ has and Keel can't run:** Notifications (email, #26), Subscription (#3), AI settings (#22), Connections (#10). Rules and fees (#39) is 6B; Notebook settings (#43) is with notes.
- **The calendar snapshot's style-image action:** its behaviour is unknown (rec §5). It waits in the backlog until it can be seen (C43).
- **Export of a note as PDF** [help 6384117]: found outside 6C's rows; a new backlog row with #43 (§7).

**Anti-goals**

- No TZ wording, layout, icons or emoji; no TZ name for the score.
- No control that does nothing. What Keel can't run is left out, or says plainly that it isn't live.
- No widget, figure or control that does not trace to the record or to a marked Keel's call.
- No rewrite of an existing row on upgrade; no silent change to a figure the trader already sees (the cost method changes figures only when the trader changes it).

## 3. Constraints

- **Local-first.** Everything lives in Dexie or prefs: no server, accounts, email or uploads.
- **Design system.** The rules that bite here:
  - design G, graphite dark, no icon tiles;
  - hue jobs: accent for what is chosen and for adherence, green and red for money and kept or broken; the score's bar may not borrow the money hues for a non-money figure without a sign or label (§5.2);
  - "None" for empty values;
  - no em or en dashes; numeric ranges "a to b";
  - two-line rows instead of tables below `sm`;
  - a MetricTip on every metric, its text in `src/content/metric-definitions.ts`;
  - Privacy hides every money figure, chart labels and exported images included.
- **TZ parity.** Keel's calls only where TZ is unknown (§6).
- **Comps first.** Impeccable comps for each module, light and dark, at 390 and 1440, before it is built.
- **Migration safety** (§4.3): no existing row is rewritten; new tables start empty; new fields are optional and default when unset; the sample reseeds by version, and My workspace never does.
- **Plan 5 and 6A's global constraints carry over:** the toolchain; Next.js docs first; components read hooks only and `src/domain` stays pure; hand-rolled SVG charts with text alternatives; WCAG 2.2 AA and 44px coarse targets; no overflow from 390 to 1680; test-first domain work; test, typecheck and lint per commit, a build per module.
- **Performance,** on the ~1,230-trade sample:
  - the default dashboard's widgets compute together in under 100 ms after a filter change;
  - the score under 20 ms;
  - the prop dashboard under 50 ms with 200 challenges and 2,000 transactions;
  - a cost-method change recomputes one account's figures in under 50 ms;
  - import planning of a 20 MB file never blocks the main thread for more than 50 ms at a time.

## 4. Approach

### 4.1 Order, and the seams with 6A and 6B

6C is built after 6A merges. It meets 6A and 6B at these seams:

| Row | The seam |
| --- | --- |
| 6A #35 | 6A's `ProgressCard` becomes the progress tracker widget (6A spec §4.1, K21) |
| 6A K33 | 6A's slim rail on day pages becomes the collapsed sidebar everywhere (#50) |
| 6A #37 | 6A's `MiniCalendar` is the calendar mini widget |
| 6B #39 | TZ's Rules and fees settings page is 6B's; 6C's Settings menu leaves its slot to 6B |
| 6B #52 | The scale strip stays 6B's |
| 6B order | Unknown. If 6B lands first, 6C's storage version and builder changes follow 6B's (C61) |

### 4.2 Order inside 6C

| Step | Work | Why here |
| --- | --- | --- |
| 1. Foundations | Types, Dexie v4, prefs; in `src/domain` (test-first): the score, the cost methods in `matchLots`, the prop finance aggregates, the scatter and streak series; hooks; seed v6 | Every module reads these |
| 2. Dashboard (#46, #23) | The widget registry, templates and the edit mode, the 29 widgets, the score widget | The largest module, and the calendar widget carries #49's snapshot |
| 3. Prop (#45, D3) | Tabs; transactions and log payout; the accounts tab (sub-tabs, list or grid, move to funding, mark breached, details); the form's new fields; the prop dashboard | Independent of step 2 except the challenge widget |
| 4. Cost method and calendar image (#49) | The account field and its column; the snapshot panel on the calendar widget and `/app/calendar` | The snapshot needs step 2's calendar widget |
| 5. Shell (#50) | Collapse toggle, the collapsed rail everywhere, the Settings menu, E52 and E55 | Touches every page; best after the pages settle |
| 6. Report PDF (#51) | The Performance tab's export and print layout | Independent |
| 7. Import worker (#48) | `planImport` in a worker, the live 20 MB limit, E95 | Independent; last because it is engineering only |

### 4.3 Storage at a glance

Dexie version 4 adds one workspace table, which joins `DATA_TABLES` (a workspace clear and a sample reseed cover it):

| Table | Key | Holds |
| --- | --- | --- |
| `propTxns` | `[workspaceId+id]`, index `[workspaceId+date]` | `date`, `description?`, `firm`, `challengeId?`, `category`, `amount` (signed `Cents`, in the base currency, C58), `status` |

**New optional fields** (no migration):

- `Account.costMethod?: 'fifo' | 'lifo' | 'average'`; unset reads FIFO.
- `Trade.costMethod?`, the method the trade was built with, stamped by the builder so `realizations(trade)` reads it; unset reads FIFO.
- No new value for `Challenge.steps` (1 or 2, as TZ's form): a challenge created in the funded phase reads as straight to funded (C30).
- `Challenge.strategyIds?`, `Challenge.breachReason?` (C33), `Challenge.breachedOn?` (`YYYY-MM-DD`).
- On `UserPrefs`: `dashboards?` (templates and the one in use, C1), `sidebar?: 'expanded' | 'collapsed'` (C47), `propLayout?: 'grid' | 'list'` (C63).

**The upgrade writes nothing.** A dashboard with no `dashboards` pref shows the default template (C5); a challenge without `breachReason` reads its free-text reason as "other" (C33).

**A migration test:** opens a v3 database with data in both workspaces, upgrades it, asserts every v3 row unchanged and `propTxns` empty.

**Other storage rules:**

- `SAMPLE_SEED_VERSION` goes to 6.
- The cost method lives on the account, so the sample and My workspace each keep their own.
- Templates live in prefs: one set per browser, shared by both workspaces, as the trade log's columns are (C1).

### 4.4 Approaches considered

**Dashboard (#46).**
1. **A widget registry and slot templates in prefs** (chosen). Each of TZ's 29 widgets is a registry entry (key, section, size, label, render, settings). A template is two ordered lists, upper and lower. The page renders the template in use; edit mode edits a draft. Reuses Keel's existing cards and charts as widget bodies.
2. A free grid with drag-and-resize (a grid library). More than TZ offers (TZ is slot-based [inv-1 050]) and a new dependency. Rejected: it adds behaviour TZ doesn't have.
3. Keep the fixed dashboard and add show or hide toggles. Doesn't give TZ's templates, the upper strip's limit of five, or the 29-widget catalogue. Rejected: not parity.

**The calendar image (#49).**
1. **Keel draws the image itself** (chosen): an SVG of the month built from the same data as the grid, drawn to a canvas, saved as PNG. No dependency, deterministic, testable, Privacy-safe by construction.
2. A DOM-to-image library. Captures any widget but depends on CSS and fonts loading, varies by browser, and adds a dependency. Rejected.

**The report PDF (#51).**
1. **A print layout and the browser's print dialog** (chosen), whose Save as PDF writes the file. Vector charts, selectable text, no dependency.
2. A PDF library building the file. Charts become images, a large dependency, and a second layout to keep in step. Rejected.

**The import worker (#48).**
1. **A module worker that runs `planImport`**, with the main thread as a fallback where workers are unavailable (chosen).
2. Chunking `planImport` on the main thread with idle callbacks. Keeps one code path but still blocks per chunk and complicates the pure planner. Rejected.

**The score (#23).** The owner chose TZ's behaviour in Keel's look (D1), over a Keel-designed composite or leaving it out.

## 5. Modules

### 5.1 Dashboard: templates and widgets (#46)

**TZ's behaviour** (rec §1)

**Page**

- Two sections: an upper strip of small figure widgets, at most five; a lower section of larger widgets [help 7118437, 9718410].
- A template button beside start my day opens the template menu [rec S02; inv-1 049].
- Every widget has an info tip, its own loading state and its own no-data state [rec S03, S04, S07, S21].
- The last import's time stays under the title, as Keel shows it today [rec S02; gaps row 15]; only the resync is out.
- Widgets follow the unit, the filters, the date range and the accounts. The calendars ignore the date range; the score ignores the unit [rec S04, S20, S22].

**Template menu** [inv-1 049; help 9718410]

- The user's templates, with an edit control each; create a new template. Several templates; no stated limit.

**Edit mode** [inv-1 050; help 9718410]

- A remove control on each widget; dashed add-a-widget slots; the upper strip's five slots.
- Add, remove and rearrange.
- Cancel, and save the template.

**The default set of widgets** [rec S02; inv-1 035-037] (rec §1.1). The set and each widget's behaviour are TZ's; the order and arrangement below are Keel's (comp 01), which keeps TZ's order where it reads well.

- Upper: Net P&L, Trade win %, Profit factor, Day win %, Avg win/loss trade.
- Lower, in order: the score, the progress tracker, daily net cumulative P&L; net daily P&L, recent trades and open positions, account balance; the advanced calendar (two thirds wide), drawdown, trade time performance; trade duration performance.

**The catalogue** (rec §1.2): twelve upper and seventeen lower widgets.

**Mapping onto Keel**

| TZ widget | Section | Keel body | Basis |
| --- | --- | --- | --- |
| Net P&L, with the trade count | Upper | The summary strip's P&L figure (`summary-strip.tsx`) with a count | [rec S02] |
| Account balance and P&L | Upper | `balanceAt` at the range's end, and the closed net P&L in range (C17) | help only |
| Trade win %, with won, breakeven and lost | Upper | `summarize` win rate, with a split bar (C67) | [rec S02] |
| Profit factor, gross profit against gross loss | Upper | `profitFactorOf`, with a split bar and no amounts (C67) | [rec S02] |
| Day win %, with green, flat and red days | Upper | `daySummary`, with a split bar (C67) | [rec S02] |
| Avg win/loss trade, with a split bar and both amounts | Upper | `RatioText` and a split bar | [rec S02] |
| Trade expectancy | Upper | `expectancyOf` | help only |
| Current day streak, current trade streak, current streak | Upper | `dayStreaks`, `tradeStreaks` (C16) | help only |
| Max drawdown, $ and %, with its date | Upper | `maxDrawdown` on the daily curve (E70) | help only |
| Average drawdown | Upper | `avgDrawdown`; the current drawdown when no range is set (C18) | help only |
| The score | Lower | §5.2 | [rec S02] |
| Daily net cumulative P&L | Lower | `ReportChart` line, as Overview's | [rec S02] |
| Win %, avg win and avg loss | Lower | `ReportChart`, three running series (C14) | help only |
| Trade time performance (entry or exit) | Lower | A new `ScatterChart`, x = time of day | [rec S16, S21] |
| Trade duration performance | Lower | `ScatterChart`, x = hold time on a log scale | [rec S16, S21] |
| Net daily P&L | Lower | `ReportChart` bars | [rec S02] |
| Daily and cumulative net P&L | Lower | `ReportChart`, bars and a line (C15) | help only |
| Recent trades and open positions | Lower | `RecentTrades` | [rec S02] |
| Calendar | Lower | `MonthGrid`, net only, tinted win, loss, breakeven (C12) | help only |
| Account balance, with deposits and withdrawals | Lower | `balanceAt` series and `CashFlow` rows | [rec S02] |
| Drawdown | Lower | Risk's `DrawdownCard` body | [rec S02] |
| Challenge | Lower | `ChallengeCard`, compact (C11) | help only |
| Calendar mini | Lower | 6A's `MiniCalendar` (C12) | help only |
| Advanced calendar | Lower | `MonthGrid` with the stats menu and the snapshot (§5.5) | [rec S02, S17] |
| Progress tracker | Lower | 6A's `ProgressCard` | [rec S02] |
| Report, up to three metrics | Lower | The Performance chart slot (C10) | help only |
| Yearly calendar | Lower | `YearGrid` (C13) | help only |

| Part | Reuses | New |
| --- | --- | --- |
| Registry | The card shell, `states.tsx`, `MetricTip` | `src/components/app/dashboard/widgets/` (one file per widget body or group), `registry.ts` |
| Templates | `usePrefs`, `useUpdatePrefs` | `src/domain/dashboard/templates.ts` (pure: validate, add, remove, move, default) |
| Menu and edit mode | `Segmented`, `ConfirmDialog`, `MorphDialog` | `TemplateMenu`, `EditBar`, `WidgetPicker` |
| Charts | `ReportChart`, `Sparkline` | `ScatterChart`, `SplitBar`, `RadarChart` |
| Series | `timeSeries`, `drawdownSeries`, `equityCurve`, `runningByExit` | `scatterPoints(trades, axis)` in `src/domain/metrics/` |

**Keel's own cards.** "Your plan", "Mistakes" and "Performance" have no TZ widget, and leave the dashboard (D2).

**Data**

- `UserPrefs.dashboards`: `{ inUse: id, templates: [{ id, name, upper: WidgetRef[], lower: WidgetRef[] }] }`.
- `WidgetRef`: `{ key, settings? }`. Settings hold the scatter's entry or exit time, the report's metrics, the challenge shown.
- The calendar widgets' cell stats stay in `UserPrefs.calendarStats`, shared with `/app/calendar` (C7).

**States**

- **No `dashboards` pref:** the default template, named by Keel (C5).
- **Loading:** each widget its own skeleton.
- **No trades:** each widget its own empty state; the score says it needs a trade.
- **A narrowing unit:** widgets recompute on eligible trades; the balance widgets show their unit empty state; the score stays.
- **Edit mode:** a draft; leaving with unsaved changes asks first.
- **Upper strip full:** the add slot is gone (C70).
- **No starting balance:** both balance widgets ask for one and link to Settings > Accounts [inv-1 036].

**Phone**

- The upper strip is a two-column grid (the fifth widget full width).
- Lower widgets stack full width.
- The template menu is a sheet. Edit mode is a full-height sheet: two lists, each row with remove and move up or down, and an add row that opens the picker.

### 5.2 The composite score (#23)

**TZ's behaviour** (rec §2)

- A widget: a radar of six axes (win %, profit factor, avg win/loss, recovery factor, max drawdown, consistency) and the score from 0 to 100, with up to two decimals, on a graded bar with a marker [rec S02; zooms].
- It follows the filters, the date range and the accounts, not the unit [rec S02, S04, S06, S22].
- It needs at least one trade [inv-1 035].
- **The method** [help 10305642], as TZ's own figures show it (rec §2.4):

| Component | Weight | Raw value | Sub-score |
| --- | --- | --- | --- |
| Profit factor | 25% | Gross profit over gross loss | Under 1.8: the ratio × 33.3, never under 20 (INFERRED from TZ's readings, rec §2.4). From 1.8: the help's bands, 50 at 1.8 rising to 100 at 2.6, linear inside each band (C21). This keeps the help's step down at 1.8 |
| Avg win/loss | 20% | Average win over average loss | As profit factor |
| Max drawdown | 20% | Largest peak-to-trough drop over the highest cumulative P&L before it, % | 100 − that %, clamped to 0 to 100 |
| Win % | 15% | Winners over trades | win % / 60 × 100, capped at 100 |
| Recovery factor | 10% | Net P&L over the max drawdown | The help's bands (3.5 or more = 100; under 1.0 = 0; linear inside each band); 0 when there is no drawdown (INFERRED) |
| Consistency | 10% | Standard deviation of profits over total net P&L. Per trade (INFERRED from the 2 Nov reading, which a daily basis can't give; the help's "daily" is counter-evidence, rec §2.3, §2.4); population deviation (C24) | 0 when the net is negative; else 100 − 100 × that ratio, clamped (INFERRED) |

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Inputs | `summarize`, `profitFactorOf`, `maxDrawdown` (daily curve), the net basis (`pnlBasis`) | `src/domain/metrics/score.ts`: `scoreOf(trades, ctx)` returning six sub-scores, the raw values and the total; pure, test-first |
| Fixtures | The 2 Nov 2026 trades of `keel-sample-forex-prop.csv` (in the main checkout's git-ignored research `import/` folder; copied into `src/domain/metrics/__fixtures__/` as a small CSV of those nine fills) | The whole score pinned at the method's own 76.44 ±0.01 on those four trades, and within ±0.2 of TZ's 76.3 (the documented gap). Component tests at the other two scopes on the inputs the screen shows: win % 49.79 gives 82.98; profit factor 1.20 and avg win/loss 1.21 give 40 ±3; win % 42.47 gives 70.8 (C59) |
| Widget | The card shell | `RadarChart` (SVG, six axes, five rings, a text table alternative) and the score bar |

**Look.** Keel's own name and copy (C20). The radar polygon uses the accent (adherence-like: a measure against a standard). The bar is a neutral track with the marker, labelled in words by band (C22), so no money hue carries a non-money figure.

**States**

- **No trades:** the widget's empty state, "needs at least one closed trade".
- **A component that can't be computed** (no losses for profit factor, no drawdown for recovery): it scores as the method says (100 for profit factor with no losses is C23). With no drawdown, the radar draws recovery full while the total counts it 0, as TZ's 2 Nov figure shows (INFERRED, rec §2.4). The radar shows no axis values, as TZ's doesn't; the hover and focus readout and the hidden table carry them (Keel's accessibility rule).
- **A narrowing unit:** unchanged; the score always reads money (TZ's behaviour).

### 5.3 Prop finances, pass rate and breach insights (#45)

**TZ's behaviour** (rec §3)

**The module's tabs** [help 14499729]: Dashboard, Accounts, Transactions.

**Transactions** [help 14588595, 14502964, 13463717; inv-1 025-027; connector]

- Fields: date, description, challenge, firm, category, signed amount (negative a cost, positive income), status.
- Categories: payout, evaluation fee, activation fee, reset fee, affiliate income, uncategorized.
- Status: not reviewed (the default), reviewed, ignored. Ignored rows never count.
- Row actions: set the status, edit the category, link a challenge, delete (permanent).
- A filter: income, expenses, needs review.
- **Log payout:** the funded account, the amount, the date received; it counts in total earned at once.

**Dashboard** [help 13463814]

- **Top cards:** funded (the balance of active funded accounts, and their count); evaluation (the balance of active evaluation accounts); total spent (evaluation, activation and reset fees); total earned (payouts and refunds); net total, with ROI.
- **ROI progression:** cumulative income, cumulative expenses and the running net, over one week, one month or one year.
- **Finance breakdown:** net, spent and earned by firm, by account type (1-step, 2-step, straight to funded), by account size; expenses by fee type.
- **Passing insights:** pass rate = passed over attempted; by firm, account type, account size, strategy.
- **Breach insights:** reasons ranked with their share; average days and average P&L before a breach; the most common size and firm; a switch between evaluation and funded breaches.
- **Filters:** firm, phase, status, account size, account type, strategy. A date range over everything.
- **No unit or basis control** on the module [help 13463814]: prop figures are money, net, in the base currency, whatever Keel's display menu says, and the menu is hidden on prop pages (C72).

**First run** [inv-1 018-029] (rec §3.1)

- With no data, the module offers a first run instead of its dashboard: how the trader trades (own capital, prop firms, or both); then how to bring finances in (the bank link, out, or by hand); then a transaction form adding rows to a list (firm, signed amount, date, category, status, description); then three totals (invested, income, net); then an offer to add active accounts (to New challenge) or go to the dashboard.

**Accounts** [help 14502950, 13463750, 13463732; inv-1 030-034] (folded in by D3)

- Sub-tabs: evaluations, funded, breached; a list or grid switch. Each account shows its balance, start date and linked trading account [help 14499729].
- A row menu: view details; move to funding; mark as breached; edit; delete (permanent).
- **Mark as breached** asks for a reason from a fixed list (max drawdown broken; overtrading or forcing trades; time pressure; lack of risk management; other, with the trader's words). A breach is permanent: the challenge moves to the breached tab, stays in the history and the insights, and never returns.
- **Move to funding** passes the evaluation; its results stay viewable. Both it and Mark as breached also sit on the details view's Funding tab [help 14502950].
- **Details:** a tab per phase (step 1, step 2, funding); a balance chart by day, hour or trade; a path-to-funding panel (profit against target, days against the minimum, daily loss used, drawdown used, best-day consistency); stats (win rate, average win, average loss, best day, worst day); the phase's trades, with an upload; an attach-strategy link.
- **Create** adds strategies, a broker and a quantity (several of the same challenge [help 13463750]) to the fields Keel's form has. Steps stay 1 or 2, and the phase evaluation or funded.

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Page | `/app/prop-firms`, `PropView`, the card list | Three tabs (Dashboard, Accounts, Transactions), each a route: `/app/prop-firms` (Dashboard), `/app/prop-firms/accounts`, `/app/prop-firms/transactions` (C35) |
| Transactions | The trade log's table look, `PhoneRows`, `ConfirmDialog`, the money input from the challenge form | `propTxns` repo and hooks; `TransactionsView`; the add row; the filter |
| Log payout | `MorphDialog` | `LogPayoutDialog`: the funded challenge, amount, date |
| Aggregates | `balanceAt`, `checkChallenge` | `src/domain/prop/finance.ts`: totals, ROI, ROI series, breakdowns, pass rates, breach facts; pure, test-first |
| Dashboard | `ReportChart` (lines), the breakdown bar list look, `Segmented` | `PropDashboard`, its filter popover |
| Breach | `ChallengeCard`'s breach suggestion, `challenge-form.tsx` | `MarkBreachedDialog` with the five reasons and nothing chosen; the form stops offering a status change once breached |
| Challenge form | `challenge-form.tsx` | Strategies (several), a broker, and a quantity (C64) |
| First run | The challenge form, the transaction add row | `PropFirstRun`: the four steps (C71) |
| Accounts tab | `PropView`'s card list (the grid), `Segmented`, `PhoneRows` | Sub-tabs Evaluations, Funded, Breached (C62); a List or Grid switch (C63); a row menu: View details, Move to funding (Plan 5's pass action, PF4), Mark as breached, Edit, Delete (confirmed) |
| Details | `checkChallenge` (path to funding), `balanceAt`, `daySummary`, the trade log's rows, the Import page | `/app/prop-firms/accounts/[id]`: a tab per phase; a balance chart (Day, Hour, Trade, C65); the path-to-funding panel; five stats; the phase's trades with Import (the account chosen); strategies shown and attached (C66); Move to funded and Mark as breached on the current phase |

**Data**

- `PropTxn`: `{ id, workspaceId, date, description?, firm, challengeId?, category, amount, status }`; `category`: `payout | evaluation-fee | activation-fee | reset-fee | affiliate-income | uncategorized`; `status`: `not-reviewed | reviewed | ignored`.
- `Challenge`: `strategyIds?`, `breachReason?` (`max-drawdown | overtrading | time-pressure | risk-management | other`), `breachedOn?`.
- `UserPrefs.propStart?`: the first run's answer (`'own' | 'prop' | 'both'`), stored only (C71).

**States**

- **No challenges and no transactions:** the first run (C71); afterwards, the dashboard's empty state with Add transaction and New challenge (C69).
- **Transactions only:** the money cards, ROI and breakdowns fill; pass and breach insights say no challenge has an outcome yet (C69).
- **Challenges without fees or transactions:** spend reads $0.00 and ROI None (C69).
- **A filter that matches nothing:** "No challenges match these filters." with Clear (C69).
- **Other currencies:** money figures read the base currency only; others are left out and named (as 6A's K24).
- **Privacy:** every amount masked, ROI and pass rates shown.

**Phone**

- The tabs are a full-width segmented control.
- Dashboard: cards in a two-column grid, then each insight full width; breakdown views as a select.
- Transactions: two-line rows (date and amount; firm, category and status); add and log payout open full-height sheets.
- Accounts: the sub-tabs as a segmented control; the list as two-line rows (name and balance; firm, type, size and status); the grid as one card per row. Details: the phase tabs scroll sideways if they must; the chart, panel, stats and trades stack.

### 5.4 Cost method per account (#49)

**TZ's behaviour** (rec §4)

- Each account has a profit calculation method: FIFO, LIFO or weighted average, set in the account's edit dialog after creation [help 6826141].
- FIFO is recommended, and every account seen reads FIFO [rec S58; inv-3 112].
- The accounts table shows it [rec S58].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Matching | `matchLots` (`trade-builder.ts`), `realizations` | A method argument: FIFO closes the oldest lot, LIFO the newest, average closes at the running average cost; test-first, with the help's 100 at $10 and 100 at $15 example |
| Reading | `MetricContext` | The account's method passed to every `realizations` reader (days, balance, series, units, prop, dashboard, routine, tracker) |
| Settings | `account-dialog.tsx`, the accounts table | A cost method select in the Edit dialog only (FIFO first, the default; C74), and a column |

**Behaviour Keel decides** (C39 to C42): a change applies to the account's past and future trades at once, after a confirmation that says which figures move. Trade boundaries never move (a trade runs flat to flat under every method). What moves: the per-exit split (which day books what), an open trade's realized part, and, for a pair converted at each exit's own rate (USDJPY on a USD account), a closed trade's total.

**How it is stored** (C40): the trades table holds each trade's `gross` and `net`, built at import. A change rebuilds that account's trades from their stored executions in one transaction, keeping every id, tag, note, strategy, rating and review field. Imports and manual trades build with the account's method from then on. An undo that restores trades rebuilds them with the account's current method.

**States**: unset reads FIFO; archived accounts keep their method and can't change it (archived is read-only, AC3).

**Phone**: the select in the account sheet; the accounts list's phone rows show the method on line two.

### 5.5 Calendar image (#49)

**TZ's behaviour** (rec §5)

- A snapshot button in the calendar's header opens a panel: a preview of the month as shown (header and month stats, the grid, the weekly column) on a frame with the product's mark; close; style the image; download the image; copy the image [rec S17].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Where | The advanced calendar widget; `/app/calendar`'s month header (Keel's month view, Plan 5) | A Snapshot button in both headers (C41) |
| Panel | `MorphDialog` (anchored, small) | `SnapshotPanel`: preview, Download, Copy, close |
| Image | `MonthGrid`'s data (`useCalendar`), `linesOf`, the display formatter | `src/lib/calendar-image.ts`: builds an SVG of the month, draws it to a canvas, returns a PNG `Blob` |

**Behaviour Keel decides** (C43 to C46): the image is the month as shown (the chosen cell stats, the unit, Privacy, the appearance), with Keel's wordmark at the foot; the file is `keel-calendar-YYYY-MM.png`; Copy writes `image/png` to the clipboard and, where the browser can't, is replaced by a line saying to use Download; the style action is left out.

**States**: rendering shows the panel's skeleton; a failure says "Couldn't make the image" with Try again.

**Phone**: the panel is a bottom sheet; Copy is hidden where the clipboard can't take images (most phone browsers), and Download saves or shares the file.

### 5.6 Shell: the collapsible sidebar and the Settings menu (#50)

**TZ's behaviour** (rec §6)

- A menu button toggles the sidebar between the full menu and an icon rail; the rail keeps add trade as a "+", the icons, badges and dividers; the content widens; hovering an icon names it [rec S01, S23, S43, S61].
- Settings has its own menu in three groups, collapsed to icons by the same button [rec S56, S61; inv-3 108].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Toggle | The sidebar's head (`sidebar.tsx`) | A collapse button; the state in `UserPrefs.sidebar` (C47) |
| Rail | 6A's slim rail (K33): icons, the add-trade "+", group dividers | Used on every desktop page when collapsed; tooltips name each item (INFERRED in TZ; kept by Keel's accessibility rule); the "Not live yet" group keeps its mark |
| Settings | `settings/layout.tsx`, `SETTINGS_NAV` | Groups TZ's way, with Keel's pages only: Profile; then Accounts, Trading, Tags, Logs (C48). Collapses to an icon column with the sidebar |
| E52 | The sticky top bar | `scroll-padding-top` so a focused control is never under the bar (WCAG 2.4.11) |
| E55 | `top-bar.tsx` | The wrapped-chips row, the phone bar below 375px, the Tab walk e2e from 640 to 1023 |

**States**: collapsed or expanded, remembered; day pages keep the slim rail whatever the choice (6A K33, C49).

**Phone**: unchanged: the tab bar and More; the Settings pill row below `lg`.

### 5.7 Export a report as a PDF (#51)

**TZ's behaviour** (rec §7)

- An export-PDF button on the Performance tab, beside the net or gross switch [rec S32, S48]. No other report tab shows one [rec zooms]. Its output is unknown.

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Button | The Performance header (`performance.tsx`) | Export PDF, beside the basis control (C50) |
| Layout | The Performance slots and summary table, rendered as shown | A `@media print` layout: a header with the report's name, the filters, range, accounts, unit and basis in words, and the print date; the charts and tables; no app chrome (C51) |
| Action | `window.print()` | The print dialog, whose Save as PDF writes the file (C52) |

**States**: Privacy prints masked; the print layout is always light; an empty report prints its empty state.

**Phone**: the button opens the same print dialog; the layout is A4 or Letter whatever the screen.

### 5.8 Reports: the month's statistics and Total swap (found by 6B's audit)

**TZ's behaviour:** Reports > Calendar shows, for the month picked in its year grid, the month grid, its running P&L, a win and loss split, and a statistics card with the Overview's full stat set, Total commissions, Total fees and Total swap among them [rec S50; help 7189346].

**Keel already has it, laid out its own way:** Plan 5 kept the month view on `/app/calendar` (the user's choice, 2026-11-24, gaps row 109) and gave its month panel the winners and losers, the trade win rate and a link to Reports > Overview set to that month, where the running P&L and every stat live (C3). The owner's rule (TZ's behaviour, never its UI) leaves that layout as it is.

**What is missing:** Total swap. Keel stores no swap until 6B adds a per-trade `swap`. 6C adds a "Swap" figure to the Overview's costs group, beside commissions and fees, summing that field, and to the Choose figures list (C76).

### 5.9 Import parsing in a worker (#48)

**TZ's behaviour**: none applies; TZ parses on its server (rec §8).

**Keel's engineering** (C53 to C56):

| Part | Reuses | New |
| --- | --- | --- |
| Worker | `planImport` (`domain/import/plan.ts`), pure | `src/lib/import/plan.worker.ts`, a module worker; `usePlanImport` posts the input and reads the plan; the latest request wins |
| Fallback | `planImport` on the main thread | Used where `Worker` is missing (tests, old browsers); a test proves both paths give the same plan on the fixtures |
| Limit | `MAX_IMPORT_BYTES` (`lib/import/read-file.ts`) | Enforced in the live flow (`lib/decode.ts`), which today has no size check |
| E95 | The point-value prompt | Re-planning debounced (150 ms) in the worker |
| E45 | The `Derived` contract | Pending until the plan for the current input arrives |

**States**: "Reading the file" while the worker plans; a worker error falls back once to the main thread, then shows the import's error.

## 6. Open questions

### 6.1 Keel's calls (TradeZella unknown)

Every row below is Keel's call (TradeZella unknown).

**Dashboard**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C1 | Where templates live | In prefs, one set per browser, shared by both workspaces, as the trade log's columns are | Keel is local-first; TZ is per account (INFERRED) |
| C2 | Choosing, naming, renaming, deleting | The menu lists the templates with the one in use marked; picking one switches. New template asks for a name and starts as a copy of the template in use. Edit mode has the name field and Delete (confirmed); the last template can't be deleted. No limit on the number | TZ shows a list, edit pencils and create [inv-1 049]; no limit stated [help 9718410] |
| C3 | Rearranging | Drag on a pointer; Move earlier and Move later buttons for the keyboard and on phones | "Rearrange" [help 9718410]; WCAG |
| C4 | Sizes in the lower section | Each widget has a fixed width: the advanced calendar and the yearly calendar two thirds, the rest one third, at `xl`; halves at `md`; full width on a phone | Keel's layout (comp 01); TZ's layout is not copied |
| C5 | The default template | TZ's default set of widgets (§5.1), arranged as comp 01, named "Main" in Keel's words. No reset control: TZ shows none (P6C-19) | The set [rec S02; inv-1 035]; the arrangement is Keel's |
| C6 | The add-widget picker | A list of the section's widgets not yet on the template, each with its info line; a widget appears once per template | INFERRED; duplicates would show the same figure twice |
| C7 | Widget settings | Stored on the template's widget: the scatter's entry or exit time, the report's metrics, the challenge shown. The calendars' cell stats stay one pref, shared with `/app/calendar` | The calendar menu is already a pref (Plan 5) |
| C8 | Leaving edit mode | Cancel drops the draft; navigating away with changes asks first | Keel's forms |
| C9 | Keel's own cards | Retired (D2) | The owner, 2026-11-25 |
| C10 | The report widget | One chart of up to three metrics from the Performance catalogue, with each metric's bar or line and per-period or running mode, grouped by day; chosen in the widget's settings | "Up to 3 metrics" [help 7118437]; Keel's Performance slot |
| C11 | The challenge widget | One challenge's compact card; its settings pick which; the default is the most urgent active challenge, as the prop page sorts | help only |
| C12 | The plain and mini calendars | Calendar: the month with net only, tinted win, loss or breakeven, no stats menu or snapshot. Calendar mini: 6A's mini calendar; a day opens the Day view on that date | [help 7118437] |
| C13 | The yearly calendar | Keel's year grid; a month opens `/app/calendar` on that month | Plan 5's year view |
| C14 | Win %, avg win and avg loss | Following the help's "evolve throughout the day" [help 7118437]: x is the time of day; the range's closed trades in order of exit time of day, with the running win %, average win and average loss after each, win % on the left axis and money on the right | [help 7118437], read as time of day (rec §1.2) |
| C15 | Daily and cumulative | Daily bars and the running line on one chart, two axes | [help 7118437] |
| C16 | The streak widgets | Day: the number of winning days in a row ending on the range's last trading day, 0 when that day was not a win; trade: the same for trades; current streak: both, side by side. A breakeven day or trade ends a run (Keel's call; TZ unknown) | "Winning trading days in a row", "winning trades in a row" [help 7118437] |
| C17 | Account balance and P&L | The selected accounts' balance at the range's end, with the closed net P&L in the range under it; base currency only | help only |
| C18 | Average drawdown | The mean of the daily drawdown in the range; with no range set, today's drawdown from the all-time peak, as the help says | [help 7118437] |
| C19 | Scatters | One dot per closed trade, net P&L on y with sign colour and shape (filled above zero, hollow below, for colour-blind traders); time of day in the profile zone; hold time on a log axis; both axes rescale to the range's trades (TZ's behaviour); a hover or focus readout names the trade and opens it on click | [rec S16, S21]; PRODUCT.md accessibility |

**Score**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C20 | Name and copy | Keel's own name and words, set in the comps ("Edge score", bands Weak, Building, Strong); never TZ's name | Anti-goal |
| C21 | The ratio curve (profit factor, avg win/loss, recovery) | Linear inside each of the help's bands. Profit factor and avg win/loss: under 1.8, the ratio × 33.3, never under 20 (TZ's readings contradict the help's flat 20 there, rec §2.4); from 1.8, the help's bands, keeping its step down at 1.8 (about 60 just under, 50 at 1.8), since no reading contradicts them | [help 10305642]; rec §2.4 |
| C22 | The bar | A neutral 0 to 100 track with a marker and Keel's band words (for example 0 to 40, 40 to 70, 70 to 100), not a red-to-green gradient | DESIGN.md hue jobs; TZ's gradient is look, not behaviour |
| C23 | Edge values | No losses: profit factor and avg win/loss score 100. No drawdown: max drawdown 100, recovery 0 (rec §2.4). Net loss: consistency 0 | rec §2.4 |
| C24 | Bases | Net or gross by the trader's basis; drawdown on the daily P&L curve (E70); consistency on each closed trade's net, with the population standard deviation (INFERRED; the help says "daily") | rec §2.3, §2.4; Plan 5 |
| C25 | The threshold | Fixed at 60; not a setting | Nothing shows a setting |
| C26 | Decimals | Up to two, trailing zeros dropped, as TZ | [rec S02, S06, S22] |

**Prop**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C27 | Categories | Payout, evaluation fee, activation fee, reset fee, affiliate income, uncategorized: the union of the sources | [connector; inv-1 026; help 14588595] |
| C28 | Fees on the challenge | A challenge's evaluation and activation fees count as spend on its first start date, unless a transaction of that category is linked to it, which then replaces the field | TZ has both [inv-1 030; connector] |
| C60 | What counts where | The sign decides, as TZ's help says: every negative amount not ignored is spent, every positive one is earned, whatever its category. So an uncategorized cost counts in spent, affiliate income in earned, and a positive amount on a fee category (a refund) in earned. "Expenses by fee type" groups the negative amounts by category, uncategorized included | [help 14588595, 13463814]; INFERRED |
| C29 | Payouts and balances | Log payout writes a payout transaction linked to the funded challenge; it does not write a withdrawal. The card's "paid out" reads payout transactions, and falls back to the funded account's withdrawals for a challenge with none (Plan 5's reading) | UNKNOWN [rec §3.2]; no data loss |
| C30 | Account type | 1-step and 2-step from `steps`; straight to funded is a challenge created in the funded phase (its phases hold no evaluation step with an account or a start date). Derived, not stored; the form keeps TZ's steps (1 or 2) and phase toggle | The type [connector; help 13463814]; the derivation INFERRED |
| C31 | Account size | The first phase account's starting balance; None when no account is linked | The rules' balance [inv-1 032] |
| C32 | ROI and pass rate | ROI = net over spent, None with no spend. Pass rate = passed over (passed + breached) evaluations; active ones aren't counted; passed means passed or moved to funded | INFERRED [rec §3.3] |
| C33 | Breach reasons | The five reasons, in Keel's words; "other" keeps the trader's text in `failureReason`. A challenge breached before 6C reads as other with its text | [help 14502950] |
| C34 | Breach facts | `breachedOn` is the date of the breach Keel's rule check found, else the day it is marked. Days before = `breachedOn` minus the phase's start. P&L before = the phase account's net P&L from start to breach. Ties in a ranking go by the most recent | INFERRED [rec §3.3] |
| C35 | Routes | Three routes under `/app/prop-firms`; the sidebar entry opens the Dashboard | TZ's three tabs [help 14499729] |
| C36 | The ROI chart's periods | 1W, 1M and 1Y set the window, ending at the range's end or today | [help 13463814] |
| C37 | The date range | Keel's global date range chip: transactions by date, challenges by their first start date | INFERRED |
| C38 | No bank link | Left out everywhere it appears: the first run's finance step and the dashboard | PRODUCT.md "never fake capability" |
| C62 | The sub-tabs | Evaluations: active challenges in an evaluation phase. Funded: passed or funded, not breached (Keel's "passed" waits there until its funded account is linked, PF4). Breached: breached. Each with its count | [help 14502950]; Keel's statuses |
| C63 | List or grid | Both show the balance, start date and linked trading account (TZ's). Grid is today's cards; List is a table: name, firm, linked account, type, size, phase, status, balance, start (the other columns Keel's). The choice is remembered in prefs (`propLayout`) | [help 14499729]; other columns UNKNOWN |
| C64 | Broker and quantity | The broker fills the broker of each account the form creates. Quantity n (1 to 20) makes n challenges with the same rules and fees, named "name", "name 2" and so on, each with its own new accounts; quantity is only offered with new accounts, not when linking existing ones | [inv-1 031]; quantity's meaning [help 13463750]; the rest Keel's |
| C65 | The balance chart | Day: the balance at each day's close; Hour: at each hour with an exit; Trade: after each trade. Over the shown phase's account, from its start | [help 14502950] |
| C66 | Attach strategy | The details view lists the challenge's strategies with an Attach control (the same multi-select as the form); it feeds the dashboard's strategy filter and pass rate by strategy | [help 14502950] |

**Cost method**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C39 | Default | Unset reads FIFO; FIFO is first in the select | [help 6826141; rec S58] |
| C40 | A change | Applies to every trade of the account at once, after a confirmation that names what moves (per-exit days, open trades, and totals of pairs converted at the exit's rate). The account's trades are rebuilt from their executions in one transaction, ids and journal fields kept; later imports, manual trades and undo restores build with the current method (§5.4) | Figures derive from fills (INFERRED); Keel stores built totals |
| C41 | Reversals | A fill that crosses flat closes the position and opens a new trade, under every method | Keel's builder |
| C42 | Average cost | The running average of the open lots' prices, recomputed on each add; an exit doesn't change it | [help 6826141] |

**Calendar image**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C43 | Style image | Left out (behaviour unknown); a backlog row | rec §5 |
| C44 | Where | The advanced calendar widget and `/app/calendar` | TZ's widget; Keel's month view is Plan 5's |
| C45 | The image | As shown: stats, unit, Privacy, appearance; Keel's wordmark at the foot; 2x scale; `keel-calendar-YYYY-MM.png` | Picture of the widget (INFERRED) |
| C46 | No image clipboard | Copy is replaced by a line pointing to Download | No control that does nothing |

**Shell**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C47 | Persistence | Remembered in prefs | INFERRED [inv-2] |
| C48 | Settings groups | Profile; then Accounts, Trading, Tags, Logs (TZ's order, Keel's pages). With 6B: Profile; Accounts, Trading (with 6B's two rule cards), Tags, Notebook, Logs, as 6B's coordination note sets it, whichever plan lands first | [inv-3 108]; 6B's coordination note |
| C49 | Day pages | Keep the slim rail whatever the choice | 6A K33 |

**Report PDF**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C50 | Which reports | Performance only | [rec S32, S48; zooms] |
| C51 | Contents | What the tab shows: both chart slots as drawn and the summary table, with a header naming the filters, range, accounts, unit and basis, and the date printed | UNKNOWN [rec §7] |
| C52 | File | The browser's print dialog; no library. One print stylesheet, shared with 6B's note PDF export, built by whichever plan lands first | §4.4; 6B's coordination note |

**Import worker**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C53 | Worker or not | A module worker with a main-thread fallback | §4.4 |
| C54 | The limit | 20 MB enforced in the live flow | A defect (rec, found outside) |
| C55 | Re-planning | Debounced 150 ms; the latest input wins | E95 |
| C56 | Progress | "Reading the file" with no percentage | `planImport` reports none |

**Other**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C57 | Seed v6 | Prop transactions for the sample's challenges (fees, two resets, payouts on the funded challenge, one ignored row, one uncategorized cost), one breached challenge with a reason and date. No seeded template: templates are prefs, which a reseed never touches | The sample shows every state |
| C58 | Currencies | The dashboard keeps Plan 5's currency switch (shown when more than one currency has closed trades); every money widget and the score read the currency it picks. Prop transactions are in the base currency (no currency field, as TZ's have none); balances of accounts in other currencies are left out and named | Plan 5 (E49); 6A K24 |
| C59 | The score's tests | The whole score is pinned only where TZ's trade set is rebuildable (2 Nov): to the method's own 76.44, with its documented gap of 0.14 to TZ's 76.3; elsewhere each component's curve is pinned on the inputs the screen shows, within the readings' ±3 | rec §2.4 |
| C68 | The transactions table | Columns: date, description, firm, challenge, category (with its edit control), amount, status, actions; newest first | Fields [help 14588595]; columns and order UNKNOWN (rec §3.2) |
| C69 | Prop states TZ doesn't show | The empty, transactions-only, no-fee and no-match states as §5.3 States writes them | rec §3.5 UNKNOWN |
| C70 | Dashboard states TZ doesn't show | A full upper section hides its add place; a template saved elsewhere replaces the one shown on refetch | UNKNOWN |
| C71 | The prop first run | Shown on the first visit to the prop module while it has no challenge and no transaction, once per workspace, with a Skip. The bank-link choice is left out (C38), so the finance step goes straight to the transaction form. The "how do you trade" answer is stored only (`propStart`) and changes nothing, as 6A's survey (U2). The last step's Add active accounts opens New challenge | [inv-1 019-029]; storage UNKNOWN |
| C72 | Prop figures and the display menu | Money, net, in the base currency; the display menu is hidden on prop pages, as on the tracker (6A) | [help 13463814]: no such control |
| C73 | Counts on tabs and links | Only the accounts sub-tabs carry counts (C62); the module tabs, the transaction filter and the strategy rows don't | rec §3 shows none |
| C74 | Cost method at creation | Offered only in the Edit dialog, the one path TZ's help describes; a new account starts FIFO | [help 6826141]; creation UNKNOWN |
| C75 | The balance widget's second line | Deposits and withdrawals, net, as a second line in the same chart on its own right-hand scale (their size is far below the balance's) | [rec S02]; the scale is Keel's |
| C67 | The figure widgets' marks | TZ's half gauges and ring are look; Keel shows the same split (won, breakeven, lost; green, flat, red days; gross profit against loss; average win against loss) as a thin split bar with the counts in words, as its summary strip does | DESIGN.md; comps 01 and 03 |
| C76 | Total swap | The Overview's costs group gains "Swap", the sum of 6B's per-trade `swap` over the trades in the filters, signed as stored; "None" when no trade carries one. Built only once 6B's field has landed; until then the row waits in the backlog with #55 | [rec S50; help 7189346]; 6B's P6B-10 |
| C77 | A set with no winning trade | Profit factor and average win to loss score 0 (nothing won, so no edge is shown), `why: 'no-profit'`; "no losses scores 100" (C23) applies only when there is a profit. An all-breakeven range scores low, not 65 | TZ unknown (rec §2.3 UNKNOWN: zero denominators) |
| C78 | Passed status | Keel's existing "passed" status (Plan 5, PF4) is kept; it is set by Move to funded, not offered when creating a challenge | Plan 5; TZ's create form offers active or breached |
| C79 | The row menu by state | The five actions on evaluation rows; Move to funded is absent on funded rows; Move to funded and Mark as breached are absent on breached rows (a breach is permanent) | TZ's menu is the five actions [help 14502950]; the omissions follow its permanence |
| C80 | Move to funded from step 1 of 2 | Passes the evaluation as a whole and starts the funded phase (TZ unknown whether step 2 is skipped); recorded as `movedToFundedOn` | UNKNOWN [help 14502950] |
| C81 | Transactions and the date chips | The Transactions tab ignores the global date range and Filters chips (the record shows only its income/costs/review filter); comp 07 draws the chips and is superseded here | [help 14499729]; comp 07 |
| C61 | 6B's order | 6C plans against `main` after 6A. If 6B lands first, Task 1 takes the next Dexie version after 6B's, the migration test opens 6B's version, and the cost method joins 6B's builder changes | No 6B spec yet |

**Calls made while building** (TradeZella unknown or not shown; each is marked where it is built)

*Dashboard*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C82 | Editing a template that is not in use | Edit opens edit mode on that template, and Save puts it in use, so the page shows what was edited | Task 10 (`withSavedTemplate` in `templates.ts`; `template-menu.tsx`) |
| C83 | New template | The copy of the template in use is stored at once under the name asked, put in use, and edit mode opens on it to arrange | Task 10 (`template-menu.tsx`) |
| C84 | The picker after Add | It stays open so several widgets can go in; the added widget leaves the list; when the upper section reaches five the rest are greyed under "The upper section is full." | Task 10 (`widget-picker.tsx`) |
| C85 | The template menu on a phone | A full-width panel under the button, rows 44px, as comp 01 draws it, not a bottom sheet (§5.1's "the template menu is a sheet" is superseded) | Task 10 (`template-menu.tsx`) |
| C86 | Edit mode from 640 to 1023px | The edit bar takes the top bar's place, so the menu button is not shown while editing; below 640px edit mode is the full-height sheet of two lists | Task 10 (`edit-mode.tsx`) |
| C87 | What the leave guard covers | A link asks first ("Leave without saving?"), and so does closing or reloading the tab, through the browser's own confirm; browser Back and the search's navigation drop the draft without asking, as any route change does. Adds to C8 | Task 10 and fix round (`edit-session.tsx`) |
| C88 | An empty workspace | A workspace with no trade, or all accounts archived with none picked, keeps Plan 5's full-page state (a ghost of the dashboard, Import and "Open the sample workspace", or Open Accounts) in place of the widgets. Every other nothing (filters that match nothing, an open-only set, a unit that keeps no trade) leaves the widgets, each saying so. Supersedes §5.1's "No trades: each widget its own empty state" for these two cases | Task 7 (`dashboard-view.tsx`, `states.tsx`) |

*Prop*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C89 | The accounts sub-tab, Started and Grid | The sub-tab is in the address (`?tab=funded` or `breached`; Evaluations is the default and writes none). Started reads the earliest phase start date, else the day the challenge's first account first traded, else None. Grid is the compact card of comp 05, not Plan 5's full card (supersedes C63's "today's cards") | Task 11 (`accounts-tab.tsx`, `accounts-list.tsx`) |
| C90 | The prop pages' address | The six filters are `pfirm`, `pphase`, `pstatus`, `psize`, `ptype` and `pstrategy`: firms and strategies repeat, sizes are in cents, and the `p` keeps them clear of the trade filters' `status`, `size` and `strategy`, which the shell's cleaner would strip. `?add=1` on Transactions opens the add row once and leaves the address | Task 14A (`prop-filter-params.ts`, `transactions.tsx`) |
| C91 | The first run's controls | Continue waits for an answer on step 1; Skip sits beside Back on steps 2 and 3 as well; Firm is required in this form only; a row typed and not added is added when Continue is pressed | Task 14B (`prop-first-run.tsx`) |
| C92 | The first run's entry | `?new=challenge` skips it; `/app/prop-firms` shows a skeleton before the tabs, because the gate needs the data first; clearing My workspace keeps `propStart.done` (prefs are per browser), so the run does not return after a clear | Task 14B (`prop-first-run.tsx`, `prop-home.tsx`) |

*Shell*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C93 | Before the prefs load, and short screens | A collapsed sidebar shows expanded for a few frames, as there is no pre-paint copy of the choice (C47 reads expanded until the prefs load). At 1024 by 768 the collapsed rail is about 811px tall, so Settings scrolls inside it | Task 17A (`use-sidebar-state.ts`, `sidebar.tsx`) |
| C94 | Home collapsed | Home has no rail; its way back is a bordered toggle at the start of the top bar from `lg` (no comp); its content is a column of 1200px at most, centred | Task 17A (`sidebar-toggle.tsx`, `home-view.tsx`) |
| C95 | Rail names and focus | Radix tooltips name the rail's links on hover and keyboard focus, replacing the native title (the compact workspace switcher keeps its native title); the sidebar and the rail are an `aside` named "Sidebar"; after a keyboard or assistive-technology press, focus moves to the toggle that replaces the one pressed, and after a pointer press it does not | Task 17A (`rail-tip.tsx`, `sidebar-toggle.tsx`) |
| C96 | The wrapped top bar | When the chips do not fit beside the title the bar takes three rows: the title, the chips on a full row, then the controls, 132px against 102px, in the 640 to 1279 band and with busy filters at any width. The trade Day and Week views, with their pinned switch row, stand about 184px at 1024; a DOM reorder was rejected because it would blur a focused search or chip when the fit flips | Task 17B (`top-bar.tsx`, `globals.css`) |
| C97 | Focus under the bar (E52) | `scroll-padding-top` is the pinned bar's measured height (plus the switch row) at every width, and is dropped while focus is inside a pinned row (`:has([data-pinned]:focus-within)`), verified in Chrome only | Task 17B (`globals.css`) |
| C98 | The open phone search | It measures its room when it takes focus (the Dashboard's left edge cut it off before); rotating while it is open updates on the next focus | Task 17B (`top-bar.tsx`) |

*Report PDF*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C99 | The print header | It carries no amount, so Privacy has nothing to hide in it, and under Privacy it names the unit "with amounts hidden"; the time on it is the print's own (`beforeprint`) | Task 18 (`print-header.tsx`) |
| C100 | What prints of the page | The table prints the page it shows (50 rows); Export PDF and the Gross or Net control, the same saved choice as the top bar's menu, live in the ready body only, so an empty Performance prints without a header | Task 18 (`performance-actions.tsx`, `summary-table.tsx`) |
| C101 | The one print sheet | The graphite tokens are declared for screens only, so paper is always light; the app's chrome is off the paper on every `/app` page (`data-pinned` and `data-print="hide"`), a sheet shared with 6B's note PDF; Firefox and Safari draw no "Page X of Y" margin boxes, and the browser's own footer, if kept on, stands there | Task 18 (`print.css`, `theme.css`) |

*Import worker*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C102 | Long plan lists | The worker sends a plan's lists over 2,000 items in slices (opening a 34 MB plan whole took about 120 ms on the main thread, over the 50 ms budget); a smaller plan travels whole | Task 19 (`plan-client.ts`) |
| C103 | A superseded request | It rejects with `StalePlanError`, and the worker is ended so the newest request is not queued behind it; the hook re-asks once per effect run when it is superseded while live | Task 19 and polish (`plan-client.ts`, `derived.ts`) |
| C104 | What the main thread still does | A request still copies the parsed file to the worker on the main thread: within the 50 ms budget at 100,000 rows and at a 19 MiB file of 150,000 rows by 16 columns, over it for a 20 MB file of about 450,000 narrow rows (BACKLOG E304, E305) | Task 19 (`plan-client.ts`) |

*Calendar image*

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| C105 | Copy and Download | Copy image shows wherever the browser can write an image to the clipboard, on a phone too; elsewhere the line "This browser can't copy images. Download saves or shares the file." takes its place (supersedes C46). On a touch device whose browser can share files, Download opens the device's share sheet with the PNG, and otherwise saves it as a link would | Task 16 and polish (`snapshot-panel.tsx`) |
| C106 | The image's font | The picture and its preview are set in the device's system sans: an SVG drawn as an image cannot use the page's web fonts (BACKLOG E306) | Task 16 (`calendar-image.ts`) |
| C107 | The button's name | It reads "Snapshot" with a camera (the camera alone below `sm`), where TradeZella shows a camera with a "snapshot" tooltip | Task 16 (`snapshot-panel.tsx`; comp 09) |

### 6.2 Decided by the owner (2026-11-25)

- **D1. The score (#23): the same behaviour.** Keel's score has TZ's six components, weights and curves, as TZ's own figures show them (rec §2.4), and reproduces 76.3 on the 2 Nov forex trades. Its name, words and look are Keel's (C20, C22). Supersedes the backlog's "our own, not a copy" (§7).
- **D2. Keel's own dashboard cards are retired,** as U4 retired Goals. "Your plan", "Mistakes" and "Performance" leave the dashboard, and the default dashboard holds TZ's default set of widgets, in Keel's layout and look. Rule adherence stays on the Progress tracker and Strategies pages, mistakes in Reports > Tags. DESIGN.md's "Plan vs actual" dashboard and PRODUCT.md's principle 3 are reworded to say so (§8, records). The cards' components are deleted with their tests, except what a widget or another page reuses.
- **D3. TZ's prop accounts tab is folded into 6C** (§5.3 Accounts): the sub-tabs, the list or grid switch, move to funding, the details view, and the broker and quantity on a challenge.
- **Parity audit (2026-11-25).** An independent audit (`.superpowers/research/tradezella/plan6c-parity-audit.md`, P6C-01 to P6C-26) checked this doc and the comps against the record, and the record against its sources. Every finding was verified and corrected in the record, this doc, the comps and the plan; the C rows above cite the results.
- **The owner's standing rule (2026-11-25):** what TZ has, nothing more; less only where Keel has no plans (AI, mentors). TZ's behaviour and features, never its UI.
- **Approval.** Asked to approve this doc, the owner delegated it ("if it needs to be approved do so", 2026-11-25). It is approved on that word, with D1 to D3 and the Keel's calls in §6.1 as written.

### 6.3 Answered by the record

- **Export PDF sits on the Performance tab only**, not every report (rec §7). #51's "any report page" is corrected (§7).
- **A breach is permanent** in TZ (rec §3.4), so Keel's form stops offering a status change once a challenge is breached.
- **The score ignores the unit** [rec S04] and needs one trade [inv-1 035].

## 7. Corrections to existing records

| Record | Says | Should say |
| --- | --- | --- |
| BACKLOG #46 | Layouts with widgets; four charts | TZ's 12 upper and 17 lower widgets and their behaviour, at most 5 upper, several templates with an edit mode (§5.1), in Keel's own layout and look |
| BACKLOG #23 | Our own score, not a copy | TZ's score's behaviour (six components, weights, curves), in Keel's name and look (D1) |
| BACKLOG #45 | Spend and payouts; pass rate per firm; breach reasons | Adds transactions with a review status, log payout, ROI and its chart, pass rate by type, size and strategy, breach facts, six filters; reasons from a fixed list; and TZ's accounts tab (D3, §5.3) |
| BACKLOG #49 | LIFO and average later | FIFO, LIFO and weighted average per account, in the account dialog and the accounts table |
| BACKLOG #51 | Any report page | The Performance tab only |
| Feature map DA4 | A score of our own | TZ's score's behaviour in Keel's look (D1) |
| DESIGN.md, Overview and Dashboard cards; PRODUCT.md principle 3 | A "Plan vs actual" dashboard led by "Your plan" | TZ's widget dashboard; the trader's rules are measured on the Progress tracker and Strategies pages (D2) |
| New backlog rows | None | The snapshot's style image (with #49, when seen); export a note as PDF (with #43) |

## 8. Left to the builder

**Comps**

- Per module, light and dark, at 390 and 1440, under `.impeccable/mocks/plan6c/`.
- They settle the placements: the template button; the collapse toggle; the snapshot button on `/app/calendar`; Export PDF on Performance.

**Copy**

- Every label is Keel's own, the score's name and its band words included. TZ's names in this doc only describe.
- The score, prop and widget metric definitions go in `metric-definitions.ts`.

**Wiring**

- Module, hook and query-key names.
- Invalidation: a trade, account, cash flow, challenge or transaction write refreshes the widgets and prop figures that read it.
- The cost method reaches every `realizations` caller through `MetricContext`.

**Seed v6** (C57): new random streams, so every existing sample value is unchanged.

**Tests**

- Domain-first tests: every score component and edge (C23), the curve's join at 1.8 (C21), the 2 Nov fixture and the component readings (C59); FIFO, LIFO and average on the help's example, on a reversal, and on a USDJPY trade with several exits; the rebuild keeping ids and journal fields; every prop aggregate, ignored rows, C28's fee replacement, C60's sign rule, C32's pass rate, C34's breach facts; the template operations; the scatter series.
- The v3 to v4 migration test.
- End-to-end:
  - edit a template: add, remove, move, save, switch, delete;
  - add a transaction, log a payout, mark a challenge breached, read the dashboard;
  - change an account's cost method and see a day's P&L move;
  - download the calendar image;
  - collapse the sidebar, reload, still collapsed;
  - Export PDF opens the print dialog (stubbed);
  - import a large fixture without a long task over 50 ms.

**Review Focus candidates**

1. The score reproduces 76.3 on the 2 Nov forex trades, and its curves meet TZ's component readings.
2. No widget double-counts a currency or reads the wrong unit.
3. A cost-method change keeps every trade's id and journal fields; closed totals hold except pairs converted at the exit's rate.
4. Ignored transactions never count; fee fields never count twice; the sign decides spent or earned.
5. Privacy masks money in widgets, the prop dashboard, the calendar image and the PDF.

**Records at the end**

- Close #45, #46, #23, #48, #49, #50, #51, E44, E51, E52, E55 and E95.
- Add the new rows in §7.
