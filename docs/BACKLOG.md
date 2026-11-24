# Backlog: deferred and missing

Nothing deferred gets dropped. Each item says why it's deferred and what it's waiting on. Update this file whenever scope moves.

Origin key: **TZ** = TradeZella has it · **MTJ** = MyTradingJourney has it · **Both** · **Keel** = our own addition.

## Platform foundations (milestone 2 candidates)

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 1 | Backend API and database (Postgres) behind the repository interfaces | — | Milestone 1 is UI-first on local data | Data layer interfaces from M1 |
| 2 | Auth: sign-up, login, sessions, password reset, OAuth | Both | Not needed for a single-user local demo | #1 |
| 3 | Billing and plan gating (Stripe) | Both | Prices and tiers undecided | #1, #2, pricing decision |
| 4 | Real product name, logo and brand identity | — | Working name "Keel" for now | User decision |
| 5 | Trade screenshots and attachments (upload, storage) | TZ | Needs file storage | #1 |
| 6 | Voice memos on trades | TZ | Needs storage and audio capture | #1, #5 |
| 7 | ~~Data export (CSV) of trades and reports~~. Done in Plan 5: Export CSV on the trade log (Task 6) and on the breakdown reports (Task 15) | Both | Done | Done |
| 8 | Multi-currency aggregation with FX rates | Keel | Sample accounts are USD-only | FX rate source |
| 9 | Internationalisation (languages, number formats) | — | English-only to start | — |

## Plan 6: new modules on local data

Picked by the user on 2026-11-22 from the TradeZella feature map (`docs/research/tradezella-feature-map.md`, rows marked P6). Each needs its own comps before it is built.

| # | Item | Feature map IDs | Waiting on |
|---|---|---|---|
| 35 | Progress tracker: trading days, a daily discipline score from prepare/trade/reflect rules, custom checklist rules, heatmap, streaks, follow rate, and its dashboard card (absorbs E50). The recording adds: a current streak, a score for the chosen date range, and today's progress as rules met over active rules; a daily checklist showing each rule's live value against its limit (start time, trades linked to a strategy, trades with a stop, trades past the per-trade loss cap, the day's loss against its cap); a rules table with condition, rule streak, average value and follow rate; a weekday-by-week heat grid with non-trading days unscored and today marked; the page follows the date range and account filters; the dashboard card shows today's score and a button to the checklist. | PT1, PT2, DA3 | Comps |
| 36 | Day page: plan mode (daily note, chart screenshots) and review mode (the day's trades and stats), with the day's checklist. The recording adds: review mode lists the day's trades (symbol, outcome, entry, exit, net, Net ROI) with net, win rate and session length from first entry to last exit; plan mode has the note with a change-template choice and a screenshot drop zone; both modes carry the rules card and an import shortcut; the daily start routine marks the start-by rule met. | DV1 | Comps, #35 |
| 37 | Trade log grouped by day and by week, with a mini calendar. The recording adds: a day card (running P&L chart that enlarges, a stat grid of trades, gross, winners and losers, commissions, win rate, volume and profit factor, open or add the day note, expand in place to the day's trade table); a mini calendar marking days green or red where a click filters to that day; a week card (a tile per weekday with net and count, a daily P&L bar chart, the stat grid, and the week's trades with a Day column). | TR7 | Comps |
| 38 | Merge and split trades; move trades between accounts (absorbs E10) | TR8, TR9 | Comps |
| 39 | Several targets and stops per trade with partial sizes; default stop/target rules and default commission/fee rules per account and instrument. The recording adds: each target and stop is entered in a chosen unit (price at least, the other units were not seen), with a quantity per level and an add-level control; the trade page shows the planned reward and risk in money. | TD3, SE4, SE5 | Comps |
| 40 | Trade-behaviour flags computed by rules (back-to-back losses, winner turned loser, held a loser, scaling, high volume) as filters and trade badges. The recording adds the full flag list, each by the condition it detects: two losses in a row; a drawdown inside the trade four times its profit; a hold longer than the trader's average; a gain that fell back to breakeven; a gain that turned into a loss; a loser held on to; a size in the top quarter by volume; the most time spent under water; a trade that never went against the entry; a trade with poor risk and reward; a profit five times its worst drawdown; a loss that recovered into a profit; adding to a position; reducing a position. The trade log gets a flag-count column, and a top-patterns summary gives each flag's share and count marked as strength, area to improve or neutral. Several flags need the price path inside a trade (#14). | X7 | Comps |
| 42 | Edit history: field-level log of changes with their source | X8 | Comps |
| 43 | Screenshots on trades and images in notes, stored locally; note column layouts, colours, font settings, version history, voice dictation. The recording adds: full-screen note editing, text alignment, a setting that strikes through ticked checklist items, and a live preview of the font settings. | TD4, NB7, NB8, NB9 | Comps |
| 44 | Missed trades logged against a strategy; a strategy template gallery written by us, with example trades. The recording adds: the create flow opens a chooser (a template or a blank start) with an asset-class filter, search and a show-every-time choice. Templates stay ones we write; templates other users wrote on their platform are theirs and out of scope. | ST6, ST7 | Comps, template content |
| 45 | Prop finances (payouts, fees, resets; totals invested, earned, net) and pass-rate / breach-reason insights. The recording adds: spend and payouts broken down by firm, challenge type, account size and expense type; the pass rate per firm (passed of attempted); the most common breach reasons, ranked. | PF5, PF6 | Comps |
| 46 | Saved dashboard layouts with widgets; balance, drawdown, time-of-day and duration charts on the dashboard (absorbs E51). The recording adds widgets for: net daily P&L bars, a month calendar, an account balance line with deposits and withdrawals, a drawdown area, and time-of-day and duration scatters each with an entry or exit time switch. | DA1, DA2 | Comps |
| 47 | Getting started: first-run setup and sign-up survey (experience, capital, broker, instruments, goals, referral source) that tailor defaults; a getting-started checklist. The recording adds: a checklist with a done count and next-step suggestions that follow the user's setup (for prop traders, setting up daily loss and max drawdown monitoring). | ON1, ON2, ON3 | Comps |
| 48 | Import parsing in a worker (E44's worker part). Excel import was Plan 5's (E25, done) | — | — |
| 49 | Cost method per account (LIFO, average); save the calendar as an image. The options report (days to expiry) and ticks, pips and points were Plan 5's, and are done. The recording adds: download the calendar image, or copy it to the clipboard. | AC5, CA5 | Comps |
| 50 | Shell polish: collapse the sidebar to icons on desktop, and the Settings navigation likewise (with E52 and E55) | X10 | Comps |
| 51 | Export a report as a PDF: any report page with its charts and tables in a print layout | RE9 | Comps |
| 52 | Trade scale: where a trade's P&L sits between the largest loss and largest win of the set, as a trade-log column, a trade-page row, a strip on week cards and an average on reports. The two ends need settling first (with #37) | TR10 | Comps, a definition |
| 53 | Strategy cover photo, stored locally (with #43) | ST10 | Comps, local file storage |
| 54 | Performance metrics, second pass: the metrics left out of the first catalogue (account balance, daily drawdown series, logged days, average MAE and MFE, breakeven days and trades) as per-period and running series. Average drawdown was built in Task 25 | RE10 | Comps |

## Data in

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 10 | Broker auto-sync (broker APIs, an aggregator, MT4/MT5 bridges) | Both (TZ "500+", MTJ "1,300+" claimed) | Each integration is backend work, often with partner agreements | #1, provider choice |
| 11 | Broker-specific CSV presets (beyond generic column mapping) | Both | Generic mapping ships first | Sample exports per broker |
| 12 | Prop-firm account connections | Both | Same as #10 | #10 |

## Market data, replay, backtesting

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 13 | Licensed historical market data (bars, ticks) | Both | Costs money; licence choice | Vendor decision |
| 14 | Real MAE/MFE from price history | TZ | Sample data has synthetic values | #13 |
| 15 | Trade replay (bar-by-bar or tick, synced to fills) | Both | Structure page only in M1 | #13 |
| 16 | Manual backtesting (bar replay with an order panel) | Both | Structure page only in M1 | #13 |
| 17 | Automated backtesting (rule-based, multi-year) | TZ | Large engine | #13, #16 |
| 18 | Backtest analytics (Sharpe, Sortino, Calmar, edge grade) | Both | Rides on #16–17 | #16 |

## Coaching, community, AI

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 19 | Mentor mode (invite a mentor to view stats and journal) | Both | Multi-user | #1, #2 |
| 20 | Spaces: rooms, shared trades, challenges, leaderboards | TZ | Multi-user and moderation | #19 |
| 21 | Public or verified track record page | MTJ | Needs verified (synced) data | #10 |
| 22 | AI assistant: Q&A on trades, auto-tagging, session review, pre-market plan. The recording adds: generated recaps (a first-import analysis, weekly, monthly) listed by type with a viewed state; headline figures with a short reading; a story per trade. | TZ | Needs backend and an LLM provider | #1 |
| 23 | Composite performance score (our own, not a copy of the Zella Score) | TZ (concept) | Needs design and validation | Metrics from M1 |

## Risk and routines

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 24 | Live prop-firm rule tracking (daily loss, trailing drawdown, consistency) with firm presets | TZ | Preview only in M1 | #1, #12, firm rule data |
| 25 | Economic calendar in routines. The recording adds: event dots on calendar days with country and impact filters, an events overlay on a trade chart, and a page of events with actual, forecast and previous values. | TZ | Needs a data source | Provider choice |
| 26 | Notifications and email recaps (daily/weekly). The recording adds: a notification centre with unread marks, mark all read and an action per item; weekly and monthly recap emails sent only once enough closed trades exist (the other journal uses at least four). | — | Needs backend | #1, #2 |
| 27 | Options analytics (multi-leg spread grouping, Greeks) | — | Generic trades first | #13 for Greeks |

## Separate products

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 28 | Trade copier (MT4/MT5 add-on: multi-account copy, SL/TP and trailing changes, partial close, VPS) | MTJ | A separate product | Desktop/EA development, #10 |
| 29 | Education / University (courses, webinars) | Both | Content, not software | Content plan |
| 30 | Native mobile apps | — | Responsive web first | Usage evidence |

## Marketing

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 31 | Blog and changelog CMS | Both | Static pages first | CMS choice |
| 32 | Free trading calculators (position size, R:R, pip value) | TZ | SEO play, not core | — |
| 33 | Comparison pages vs. other journals | TZ | Needs careful, factual claims | Legal review |
| 34 | Real social proof (testimonials, counts, ratings) | — | None exists; must not be invented | Real users |

## From the TradeZella recording (backlog)

Found by comparing a recorded TradeZella account with Keel (Part 2 of Plan 5). Each needs a backend, a new field or a decision before it is built.

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 55 | Swap and financing per trade: read from the import (pairs with E27), shown on the trade page and totalled on the Overview | TZ | Needs a new field and an import mapping | #11, E27 |
| 56 | Choose which fields the trade page lists | TZ | Low value: Keel already shows every field | None |
| 57 | Share a trade by link, as a read-only page (like the note share in the feature map, NB10) | TZ | Needs a backend | #1 |
| 58 | Opt-in support access to the user's data, off by default | TZ | Needs a backend and accounts | #1, #2 |
| 59 | Accounts list: search by name or broker, a filter and bulk select | TZ | Low value with a handful of accounts | None |

## Engineering follow-ups (from Plan 1 reviews)

| # | Item | Owner plan |
|---|---|---|
| E1 | ~~Import validation: reject zero/negative quantities and unparseable times before the trade builder~~. Done in Plan 2 | Done |
| E2 | ~~Options that expire worthless need a synthetic closing fill at expiry, or their loss stays hidden as "open"~~. Done in Plan 2 | Done |
| E3 | ~~Partition trades by `pnlCurrency` (`partitionByCurrency`) before calling metrics; unconverted cross pairs subtract account-currency fees from quote-currency gross, so flag them in import~~. Done in Plan 2 | Done |
| E4 | ~~Unify metric signatures into one `MetricContext`~~. Done in the TradeZella alignment (40fa14c) | Done |
| E5 | ~~Clamp R-distribution tails (a tiny `initialRisk` creates thousands of bins)~~. Done in Plan 5 Task 15: bins clamp to -5R and +5R, and the tails fold into "-5R or less" and "+5R or more" | Done |
| E6 | `canonicalSymbol` strips a leading `/`, and Plan 2 pins slash, case and space variants as one position. Confirm against real broker exports, including exchange suffixes (`/ESZ5:XCME`) and MetaTrader broker suffixes (`EURUSD.m`) | With #11 (sample exports) |
| E7 | ~~Tooling: .prettierignore, format, engines, pins~~. Done in Plan 3 | Done |
| E8 | ~~Next scaffold defaults, metadata, README~~. Done in Plan 3 | Done |
| E9 | Thin test gaps: exact session boundaries, more negative half-even ties, ZB/ZN/6E/lowercase symbol parsing, `Math.max(...)` spread above ~100k trades | Any |
| E10 | Manual **merge / split** of trades after import (TradeZella has it) Moved to Plan 6 (#38) | Plan 6 (#38) |
| E11 | ~~Import picks its own **source timezone** (TradeZella has it), separate from the display timezone~~. Done in Plan 2 | Done |
| E12 | ~~Prop setup accepts daily loss as **% or $** (UI converts % against the starting balance)~~. Done in Plan 5 Task 19: a limit is entered in % or $ and shown with its dollar value | Done |
| E13 | Verify the undocumented behaviours (breakeven in win %, profit factor with no losses, drawdown basis, fill grouping) against a real TradeZella test import, and align if they differ | When an account is available |
| E14 | ~~`PreviewRow.rowIndex` so import preview rows number by real file row~~. Done in Plan 2 | Done |
| E15 | **Don't publish the marketing site** until the app plans land: feature pages describe milestone-1 modules in the present tense | Release |
| E16 | ~~Trading Floor ceiling items (tickets, pit ornament, time-clock imprint)~~. Dropped with the rejected world in Plan 3b | Dropped |
| E17 | ~~Mechanical stamps on dropped tickets~~. Dropped with the rejected world in Plan 3b | Dropped |
| E18 | ~~Rename the leftover ticket identifiers (`ticketPrice`, `Preview.tickets`) to row/fill names; none reach visible copy~~. Done in Plan 2 | Done |
| E19 | App tickers mount after data, so a failed hydration cannot leave $0.00 there; the landing hero case remains | Release polish |
| E20 | ~~`RuleList` carries landing-only tick hooks; split the landing animation from the app component~~. Done in Plan 5 Task 16, checked by a markup diff of the landing and four feature pages | Done |
| E21 | Test and type tidy: kv tuple looseness, `grouped()` Number re-parse, no motion-behaviour tests | Any |
| E22 | ~~Derive the "Trailing drawdown" label from `drawdownType` instead of hand-typing it~~. Done in Plan 5 Task 19: the label follows the stored drawdown type | Done |
| E23 | /login and /signup now offer "Open the sample workspace"; point "Get started" at the real sign-up flow when auth lands | #2 |
| E24 | ~~Dashboard rule and mistake rows have hover fills; a hover/focus value readout on breakdown bars and product trade-row hovers remain~~. Done in Plan 5 Task 14: bars, lines and cross-analysis cells carry a hover, focus and touch readout | Done |
| E25 | ~~Excel (.xlsx) import. Spec §7 says CSV/Excel, but the §5 stack has no spreadsheet parser; users save as CSV meanwhile~~. Done in Plan 5 Task 11: read-excel-file reads .xlsx files in the same upload as CSV and TXT | Done |
| E26 | Options that expire after their last import stay open until the next import into that account settles them; settle at app start or in a server job | Milestone 2 (#1) |
| E27 | Import maps one fees and one commission column; swap/financing and extra fee columns aren't summed | With #11 |
| E28 | ~~The spec's Playwright import-to-trade-log test (upload a CSV in the UI, see the trades in the log)~~. Done in Plan 5 Task 20: `e2e/import.spec.ts` uploads `e2e/fixtures/fills.csv` in My workspace, maps, previews, confirms, finds the trades in the log and the calendar, and undoes it from Import history | Done |
| E29 | A broker's own expiration row imported after Keel settled the option synthetically opens a phantom short that is settled again (gross 0, inflates counts). Pairs with E26 | With E26 |
| E30 | ~~Settings UI should show "Browser default (zone)" until the user picks a timezone; day buckets follow the browser zone when travelling~~. Done in Plan 5 Task 18: Profile reads "Browser default (zone)" until a zone is picked, and "Use browser default" forgets it again | Done |
| E31 | Edits or deletes made to a trade between import context and commit (a tag added in another tab, a trade deleted by hand) are overwritten or resurrected by the commit's `bulkPut`; detect via a per-trade revision | Milestone 2 (#1) |
| E32 | ~~Two open trades in one symbol: raise a `TradeFlag` and a user-facing notice when an overlapping export flips a trade's direction on merge (deferred from Task 6)~~. Done in Plan 5 Task 12 as a `direction-flipped` flag, shown in the preview | Done |
| E33 | Deleting an open imported position: `trades.remove` refuses an open trade with an `importId` (`OpenImportedTradeError`), so the user has to undo the import. A tombstone flow would let them delete it while later imports' fills still match against it instead of opening a phantom opposite position; a phantom position can still arise by deleting the closed trade that continued an open position, undoing the import that closed it, then re-importing that file (probe phantom2); the tombstone flow must cover it Plan 5 Task 7 now explains why the trade cannot be deleted and links to Import history; the tombstone flow stays here | Plan 5 (Trades) |
| E34 | When undo restores a trade, also restore the journal links the commit pruned from it (`prunedLinks` on the job record, about 30-40 lines). Likewise Task 6's `inherit` drops the second merged trade's journaling. Both need two open trades in one symbol, which nothing builds today | With E32 |
| E35 | ~~Import parsing edge cases: Papa's delimiter auto-detect misreads files with 2+ leading blank lines; `parseDecimal` returns -0 (documented); `Date.UTC` maps years 0-99 to 1900-1999; untested `Z` variants (fraction, lowercase `z`, a space, `+0500`); a file whose only decimals have exactly 3 digits falls back to the delimiter rule. The mapping UI must show the decimal mark, the kind (fills or closed trades) and the date order, and let the user change each; wall-clock times in a DST gap roll forward silently (documented in `fill-time.ts`)~~. Done in Plan 5 Task 11: the mapping UI shows and edits the kind, the decimal mark and the date order. The parser edge cases in this row are still open as E69 | Done |
| E36 | ~~Column-mapping upkeep: the synonym lists are duplicated between `mapping.ts` and `guess-columns.ts`, and an "Exit Strategy"-style header can flip the detected kind (close/exit detection matches on contains)~~. Done in Plan 5 Task 11 (mapping UI). The duplicated synonym lists between `mapping.ts` and `guess-columns.ts` remain as E94 | Done |
| E37 | ~~`instrumentKey` keys CFD names (HK50, DJ30, EU50) to a futures root letter; the point-value prompt should show the file's symbol beside the key~~. Done in Plan 5 Task 11: the point-value prompt shows the file symbol beside the key | Done |
| E38 | Expiry settlement test gaps: preserved order, two accounts kept apart, a last fill after the close; a malformed expiry throws `RangeError`; float residue in the net quantity of fractional option quantities | Any |
| E39 | Plan identity can drift off the journaled fill after a reversal split plus two more overlapping imports (`anchorOf` falls back to `executions[0]`; search the `:b` descendants first). Ids stay unique. Merged trades share execution and instrument objects with the stored rows (shallow copy) | Plan 5 (Import UI) |
| E40 | Sample generator: realism bounds are asserted only at the pinned seed; the stock size cap uses the first leg's price; price levels are frozen at late-2024 values; weekly recaps skip partial weeks | Any |
| E41 | Test-strength gaps: metrics (a non-base-currency account in the balance test, per-currency drawdown, a trade-count floor in the perf test); store (a two-tab seed barrier test, prefs storing only set fields, the refused-open `cause`); entities (cross-workspace removes, sort order); imports (the `list()` tie-break test can't catch a missing tie-break, since the index already yields ids in order); the e2e seed poll can pass before a late double seed lands; filters (an unknown `range=`, a to-only range) | Any |
| E42 | A stalled IndexedDB open never recovers in place: retries wait on the same request. A failed load of the store's lazily loaded Dexie chunk also surfaces as a plain error, not `StorageUnavailableError`. The storage-error retry should reload the page | Plan 4 |
| E43 | ~~Re-importing a file with a corrected timezone or decimal mark duplicates its trades, because row fingerprints use parsed values. Suggest undoing the earlier import first; after undoing an earlier overlapping import, rows a later import skipped as its duplicates belong to no trade until that later file is re-imported; the undo flow should say so~~. Done in Plan 5 Task 12: the undo and re-import copy says to undo the earlier import first | Done |
| E44 | Large and non-UTF-8 files. Encoding done in Plan 5 Task 11 (a file in a legacy encoding is read as such). The worker part is open: `planImport` runs synchronously in render for files up to 20 MB, so move it to a worker (Plan 6 #48) | Plan 6 (#48) |
| E45 | **Fix before the Plan 5 import UI:** `useImportPlan` (`src/data/query/derived.ts`) returns `status: 'success'` with `data: undefined` on the render pass where it resets its plan identity (context load, after each commit/undo, input change), breaking the `Derived` contract; an inline `input` object also loops. Fix: compare inputs by their four fields, plan from the stored identity input, and report `'pending'` until the identity is current; add a per-pass contract test and an inline-input test (recipe and probes in the Plan 2 final re-review) | Plan 5 (Import) |
| E46 | ~~Tag a trade from the drill-down ("tag what is missing" in the dashboard contract story); needs the tag picker the Trades page builds~~. Done in Plan 5 Task 7: the drill-down's "Tag" button opens the tag picker, scoped to the mistake categories (desktop and tablet; the trade page offers the same on a phone) | Done |
| E47 | ~~Drill-down and recent-trade rows link to `/app/trades/[id]` once trade detail exists~~. Done in Plan 5 Task 9: the dashboard's recent-trade and drill-down rows link the instrument to `/app/trades/[id]` | Done |
| E48 | ~~Search over trade text (notes, ids) and journal entries~~. Done in Plan 5 Task 17 (the trade log reads trade-note text; the Notebook searches title, text and tags). The top-bar search still covers modules, symbols, strategies and tags only | Done |
| E49 | Dashboard shows one currency at a time with a switch; a combined view waits on FX | #8 |
| E50 | More goal types: monthly, trade count, TradeZella-style routine rules (trading hours, stop on every trade, start-my-day) Moved to Plan 6 (#35) | Plan 6 (#35) |
| E51 | Customisable dashboard widgets (TradeZella has them); the contract fixes one layout for milestone 1 | Milestone 2 decision |
| E52 | Focus Not Obscured (WCAG 2.4.11): the sticky desktop bar and the pinned mobile row can cover a focused element when tabbing backwards; needs scroll-padding without breaking the chip scroller | Plan 6 (top-bar polish) |
| E53 | A closing filter popover stays interactive through its 160ms exit (Escape then fast Tab lands in its fields) | Plan 5 polish |
| E54 | ~~`useGlobalFilters` writes the pathname it rendered with, and any late `replaceState` during a pending Next navigation discards that navigation (reproduced 0-10ms after a workspace switch); write against `window.location.pathname` and avoid late writes while a navigation is pending~~. Done in Plan 5 Task 4 (writes use `window.location.pathname`; the stale-link clean-up waits while the address bar and the render disagree on the page) | Done |
| E55 | Top bar polish: a "controls drop" or three-row layout so wrapped chips keep a full row (prototyped in the Plan 4 re-review); the phone bar overflows below 375px (let the controls row wrap or hide the sample label); extend the Tab-walk e2e to the 640-1023 band; refresh two stale comments | Plan 6 (top-bar polish) |
| E56 | Remaining Phosphor root imports (theme-toggle, site mobile-menu, product-menu, module-icons) move to dist/ssr | Any |
| E57 | ~~An archived-only workspace with no filters reads "No closed trades yet", though its trades are closed; say the trades sit in archived accounts~~. Done in Plan 5 Task 18: an archived-only workspace says its trades sit in archived accounts. The empty-active-account case is E96 | Done |
| E58 | Rebrand residuals: the equity chart has no hover read-out (a crosshair with date and balance, as Kraken and Coinbase do); the hero's count-up copies NumberTicker's logic because the ticker can't set a small raised "%" (give NumberTicker an opt-in suffix slot); the hero gradient and the logo gradient use literal hexes (add fixed `--hero-*` tokens) | Plan 5 polish |
| E59 | ~~Recent trades against comp C: the header still reads "Symbol" (the comp says "Instrument") and mistakes sit in the Strategy cell rather than a Mistake column; an option's expiry ("TSLA 370 Put 20 Nov") reads like a repeat of the Time column on 0DTE trades~~. Done in Plan 5 Task 6: the header reads Instrument, mistakes have their own column (off by default, as comp 01 has it) and the 0DTE expiry is labelled | Done |
| E60 | `Chip` has no raised tone (white, hairline, lift), so the site keeps its own `Pill` for codes on the canvas; an accent `IconTile` on the canvas loses its fill (accent-soft is close to #ECEEF8), so pricing uses tinted tiles on a white card; fold both into the shared parts | Any |
| E61 | The app scope in theme.css repeats the root values now that marketing follows Daylight premium; collapse it to what the app actually overrides once the two settle | Any |
| E62 | ~~User-made tag categories with their own colours, as TradeZella has~~. Done in Plan 5 Tasks 2 and 18: tag categories with their own names and colours | Done |
| E63 | Filters v2 leftovers: the "More filters" panel is one long scroll (collapsible sections or a two-pane layout would shorten it); the R range tests net P&L over initial risk whatever the Gross/Net switch says; weekday and month read the day a trade opened (Task 22 added exit weekday and exit month filters, `xwd` and `xmo`, so a report set to exit time links to the day it bucketed by; the R range now reads the P&L basis, as the R report does); the account switcher's search lives inside a menu, so a real combobox popover would be a better fit | Plan 5 polish |
| E64 | ~~The Trades, Calendar and Reports pages (Tasks 5 on) must pass `range` through their metric contexts as `useMetrics` and the dashboard do, so day figures clip to the date range; equity and drawdown curves still run over the whole filtered trade set~~. Done in Plan 5 Tasks 13 to 17: the calendar, the reports and the notebook day card clip realizations to the date range | Done |
| E65 | ~~Calendar: the day panel's "Rules kept" and "Mistakes" are built (Plan 5 Task 13 fix round). Still open: the day's percentage and R units fall back to dollars for ticks, pips and points; below a container width of 600px the cells show only the day number and a bar (the figures sit in the panel and the week totals in a list)~~. Done in Part 2 Task 30: days, weeks, the month and each exit carry their ticks, pips and points, so the panel and cells read in those display units. The phone cell is a compact figure by design | Done |
| E66 | ~~Calendar weeks start on Monday as ruled, so November 2026 has six rows (1 Nov is a Sunday); the brief's test said five, which holds only for Sunday-first weeks. A week-start preference would settle it~~. A plan-text error, not a bug: Monday-first weeks give November 2026 six rows, and Task 13 asserts 6 | Done |
| E67 | Notebook leftovers: an Empty Trash button; moving a note by drag; a template picker on New (today a kind starts from its default); the weekly recap's "week in numbers" and the daily review's figures are not inserted into the body; the editor's Trade button (a note's trades are linked from "+ Link" under the title); the entry-list excerpt of a daily note begins with its section titles; a daily note's figures follow the base currency only. Done in module G fix round 1: the day card's "Rules kept" and "+ Link" (link or unlink trades through `linkedTradeIds`) | Plan 5 polish |
| E68 | ~~The Notebook's built-in folders are by kind: Daily journal holds daily reviews and pre-market plans, Sessions recap holds weekly recaps only, My notes holds plain notes without a folder, and a trade note or daily note in a user folder also stays in its built-in one. Revisit if TradeZella's folders show a different split~~. Done in module G fix round 1 (pre-market plans moved to Daily journal) | Done |

## Plan 5 follow-ups

Deferred minors from the Plan 5 module reviews, one line each, and the TradeZella number check. None blocks the merge. Rows already in the tables above (E63, E65, E67 and the like) are not repeated.

| # | Item | Module |
|---|---|---|
| E69 | Import parser edge cases from E35 still open: Papa's delimiter auto-detect with 2+ leading blank lines, `parseDecimal` returning -0, `Date.UTC` for years 0-99, untested `Z` variants, a file whose only decimals have three digits, wall-clock times in a DST gap rolling forward silently | Import |
| E70 | ~~Headline **max drawdown** should use the daily P&L curve, as TradeZella does; Keel's is trade by trade. Found in the 2026-11-23 number check (`docs/research/tradezella-plan5-features.md`), where every other figure agreed~~. Done in 26c8a98: the headline max drawdown (reports Overview, risk report curve, strategies) is the peak-to-trough of the cumulative daily P&L, days booked by exit; the sample futures account reads -$2,168.55 as TradeZella does | Done |
| E71 | ~~**USDJPY rounding**: Keel rounds each exit's converted dollar amount before summing, which differs from TradeZella by one cent on 11 of 45 trades with several exits (6 cents in total). Sum unrounded, round once per trade, then share the cents among the exits with the leftover on the last. The spec says money rounds at the trade level~~. Done in 49f009c, widened to every trade after the crypto check: each exit converts at its own rate, the gross is summed unrounded, the net rounds once half away from zero (TradeZella's Ruby backend) and gross = net + fees; the exits share the cents with the leftover on the last. Known, accepted limit: Keel stores each trade in whole cents where TradeZella sums unrounded values, so totals on fractional-quantity instruments (crypto, forex) can still differ by a few cents | Done |
| E72 | E13 is only partly verified: fill grouping, fees, P&L by exit date and win rate agree with TradeZella on the futures and forex files. Still to check with a file that has $0.00 trades (breakeven in win rate) and with the stocks, options and crypto file (option multipliers, expiry) | Metrics |
| E73 | Equity label against the by-exit equity line, a stale comment near `dashboard-view.tsx:218` and a duplicate stacked comment at the `equityLine` call | Dashboard |
| E74 | Split `more-filters.tsx` field parts, the `filters.ts` URL codec from its predicate, and `display.ts` hook from pure functions | Filters |
| E75 | `tagCategories.update` does not invalidate `keys.tags`; the sample view copies category colours and `GROUPS` is duplicated in `db.ts` | Data |
| E76 | Weak tests: R and % dashboard tests, the account search keyboard path, the filter sheet below `md`, `pctBaseOf`. Under Gross the % is gross over the base, not "Net ROI": record that in the ruling text | Filters, Display |
| E77 | Confirm Import shows no spinner when no file is chosen (`useImportPlan(null)` stays pending) | Import |
| E78 | Trade log: the Tag button is hidden below `sm` with the Mistakes column (the trade page offers another path) | Trades |
| E79 | Bulk delete: the title counts trades that cannot be deleted, and the body says notes are removed though only unlinked ones are | Trades |
| E80 | Previous/Next on the trade page include open trades while the log defaults to Closed, and read "No earlier trade" while loading | Trades |
| E81 | Stop and target blur saves the rounded text over a more precise stored value | Trades |
| E82 | The manual form opens for archived accounts, forex suggestions are hard-coded, a future without a contract month is accepted, and a re-entry after flat gets the "reverse" sentence | Trades |
| E83 | CSV export: R is always net, open trades get an R, and times drop seconds. ~~There is no formula-injection guard on cells starting with `=`, `+`, `-` or `@`~~. Done in the Plan 5 final fix wave: both exports write through `csvField`, which puts `'` before a text cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return and never before a number | Trades |
| E84 | The time-zone test is not tied to a fixed process zone | Trades |
| E85 | Large files and duplicated helpers: `trade-view.tsx` (1153 lines), `manual-trade-form.tsx` (1012), `trades-view.tsx` (837); `decoded`, `StateBlock` and `Message`, `tone`, `pnlTone` and `signTone`, `listOf`, `TagChip` and `TagToken`; price and qty formatting in `columns.tsx`; `domain/manual-trade.ts` imports from `data/repository` | Trades |
| E86 | Raw colours remain (`!text-white` in the confirm dialog, a `#6B7280` fallback); two `h1`s on the manual form; `aria-selected` on table rows; the status chip tone; the fills chart label and ticks; "Saved" without a time; "per point" for forex | Trades |
| E87 | The Open-empty branch of the log is unreachable, the strip ignores the search box, and the editor toolbar has no strike button | Trades |
| E88 | Strategy and tag names truncate at 1440 (the title holds the full name), an option's expiry clips against the Side chip, and the Open and Duration headers are tight | Trades |
| E89 | The StackPlus and StackMinus icons look alike on the phone bulk bar; the "Back to trades" link repeats the breadcrumb | Trades |
| E90 | Import: changing the account rebuilds the mapping and drops manual edits; point-value drafts can disagree; after an inline new account "Using your saved mapping for {new}" can show falsely and overruled notes persist, the new account's time zone no longer feeds the mapping's source zone, known overrides belong to the previous account while the new-account form is open, and Preview may block on a root Map did not ask for | Import |
| E91 | Import preview: the net label counts open and foreign trades the sum leaves out, and "Expired worthless" shows a raw ISO date | Import |
| E92 | Import undo: the dialog repeats the title, and "{n} trades are removed" overstates when the job rebuilt trades (plan-mandated copy) | Import |
| E93 | Import: View trades is silent on a failed workspace switch, "Removed account" flashes before accounts load, the drop zone accepts any file type, and the tick size default from price precision can mis-guess on short samples (stored if untouched) | Import |
| E94 | `guess-columns.ts` and `mapping.ts` import each other (move the lists to `synonyms.ts`), plural and count helpers are duplicated, `map-step.tsx` (662) and `preview-step.tsx` (637) are large, the stepper has a raw rgb shadow with no dark variant, and import order | Import |
| E95 | `planImport` recomputes in render on every point-value keystroke: measure on a large file (ties to the worker in #48) | Import |
| E96 | An archived-only workspace with no active accounts is not told apart from an empty one (the E57 case that is left) | Settings |
| E97 | Calendar: the `DAY` regex accepts 2026-02-31 (validation covers it), `PANEL_CARD` is dead, `addDays` and `daysInMonth` are re-exported, risk and R logic is duplicated in `bookDays` and `dayExits`, `toneInk` against `TONE_INK`, `calendar-view.tsx` is 625 lines (split StatsMenu and DaySheet), and month and day changes use `replaceState`, so Back skips them | Calendar |
| E98 | Calendar keys: ArrowUp and ArrowDown jump over muted days and do not cross months | Calendar |
| E99 | Reports: metric tips are missing on secondary words (green and red days, trading days net, won, the cross-analysis select) | Reports |
| E100 | Reports: Wins vs losses lacks the breakeven count and stacks below `md`; the cross-analysis "Trades" prints the count twice | Reports |
| E101 | Reports: `compare.tsx` (722), `report-chart.tsx` (794) and `breakdown-report.tsx` (about 900) are large, with duplicated `Stat`, `hhmm`, currency switch and error and empty states, and a hand-built Options empty state; `BreakdownCards` gained a required `report` prop and `SummaryColumn` and `ReportChart` deviate from the plan: record both in DESIGN.md | Reports |
| E102 | Reports: domain code came before tests (RED shown by revert) in Tasks 14 and 15 | Reports |
| E103 | Report chart: the pressed ref is not cleared on blur or an off-plot press (Tab-in skips the period-1 default); `largestCell` matches by P&L cents (equal cents take the first trade; under R it is largest in money); Compare's chart name uses the shared pctBase for "ends at"; wins-losses P&L is now signed without an announcement; Export CSV ignores the reader's sort; `chartLabel` says "Net P&L" under Gross | Reports |
| E104 | Strategies: `strategy-form.tsx` (726) and `strategy-view.tsx` (547) are large (extract GroupEditor, RuleRow, ChecklistEditor, RuleTable, StatsCard); `rate()` duplicates `followRate`; a `ruleCells` non-null assertion; the stacked list and the table are both computed | Strategies |
| E105 | Strategy form: errors persist until the next submit, a live region and `role=alert` double-announce, an empty-text rule is dropped silently, and there is no unsaved-changes guard | Strategies |
| E106 | Strategies: the headers "Win rate kept" and "PF kept" differ from the definitions' "when followed", the Move buttons are named "Move {text} up" (more descriptive than the brief), and `feature-visual.tsx` import order | Strategies |
| E107 | Equity line: the status region announces on every pointer move, and a touch lift clears the readout while focused | Strategies |
| E108 | Notebook: the rail below `lg` has no overflow cue; `noteIndex` and `textIndex` duplicate (share one note-text helper); `notebook-view.tsx` (538) and `day-card.tsx` (328) are large; test gaps (body autosave, a keyboard walk, invalidation on external writes); an option's raw symbol in trade-note titles; rail template links | Notebook |
| E109 | Notebook: All notes overrides the chosen folder and drops `returnTo` under a search; the trash notice shifts the grid (a magic height) and focus falls to the body after Dismiss; linked chips for trades without an exit that day are unexplained; a tiny `trashNow` keystroke window; trash then revisit makes a second daily note on edit | Notebook |
| E110 | Settings: Logs has no Imports tab strip (one card); the broker is truncated without a title and the "Yours" time-zone cell is vague; `dayBefore` throws on malformed dates; cross-currency trades are summed into the account currency; `tags.tsx` is 700 lines, `SaveStatus` has no shared home, the lowercase test sits in the wrong file, grouping is quadratic, and swatch hexes duplicate `theme.css`; a comment about `useDisplay` outside a provider in accounts and cash-flows (balances stay in dollars on purpose) | Settings |
| E111 | `maxDrawdown` handles a flow on the first day inconsistently; `trades-view` has an empty `archivedAccountIds` until accounts load (the repository refuses, with a generic failure); same-date flows sort unstably; `ArchivedAccountError` is not mapped to specific copy outside the bulk bar | Settings, Trades |
| E112 | Prop firms: the account select offers live and demo accounts and does not change the type on link; "Same rules as step 1" then linking an account replaces the copy (say so); the consistency message "1 to 100" accepts 0.5; `challenge-form.tsx` (863) and `challenge-card.tsx` (535) are large; `prop-view` imports `strategy-states` (move to shared); at 390 the consistency track sits alone in its row; no test edits a challenge with an archived phase account | Prop firms |
| E113 | Prop firms: after the atomic save writes back created ids, the link select holds an id not yet in its options until the refetch; a reseed leaves the sample's per-workspace meta (overrides, import-revision) as Reset does; `SAMPLE_SEED_VERSION` is bumped by hand when the generator changes | Prop firms, Data |
| E114 | Every `useDisplay()` outside a `FigureSourceContext` shows dollars for `cash` figures under a percentage or R: the trade page's gross, fee and risk lines, the import preview, the settings balances and the challenge form's example amounts. Chosen on purpose (a single trade or balance has no base to be a percentage of), found by the Task 20 sweep | Display |
| E115 | Task 22 bucket links: the Untagged bucket and the R report's "No stop" bucket have no filter (no "no tags" or "no initial risk" field), and sessions are cut in New York time, so none of the three is a link. A "no tags" filter and a session filter would complete it | Reports |
| E116 | Task 22: (the currency part is closed: a `ccy` filter, carried by report links when trades span more than one currency). Duration and size buckets use an excluded upper bound (`_<5` in the address), which the More filters fields cannot yet write | Reports |
| E117 | Task 29: the top and bottom 10 limiter is on Symbols by symbol only (not by instrument or price); the best win-rate highlight has no minimum trade count, so a one-trade bucket at 100% can win; trades with an entry or exit price of zero or below file in no price range; the Reports landing demo (`reports-demo`, `sample-view`) does not show the new views | Reports |
| E118 | Notebook: the day card stays in money under a display unit that narrows the trade set (Ticks, Pips, Points, R), while the rest of the app narrows. Revisit if the card should follow the unit | Notebook |
| E119 | Notebook editor: the Checklist slash command cannot insert a checklist inside a collapsible section | Notebook |
| E120 | Task 31: Choose figures lists the Overview's figures from a fixed list in `overview-choice.tsx`, held to the page by a test; "Last import" sits under the account name on desktop and is not shown in the phone rows | Reports, Settings |
| E121 | Dashboard: dead space under the Mistakes and Goals cards (design check, Part 2, finish batch F) | Dashboard |
| E122 | Date ranges still read with a hyphen ("1-20 Nov", "16-20 Nov", "10-15 Nov 2026") in the range caption, the filter chip and the goals card; finish batch F moved only the numeric ranges (price buckets) to "to". The sample's trades are drawn in New York time and book on the reader's local day, so a reader east of New York sees Friday evening exits on Saturday; the sample's end date also follows the real clock (the last New York weekday before today) | Reports, Calendar |
