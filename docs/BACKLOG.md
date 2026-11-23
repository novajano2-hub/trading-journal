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
| 7 | Data export (CSV) of trades and reports | Both | Small, but kept out to keep M1 lean | — (can pull into M1 if wanted) |
| 8 | Multi-currency aggregation with FX rates | Keel | Sample accounts are USD-only | FX rate source |
| 9 | Internationalisation (languages, number formats) | — | English-only to start | — |

## Plan 6: new modules on local data

Picked by the user on 2026-11-22 from the TradeZella feature map (`docs/research/tradezella-feature-map.md`, rows marked P6). Each needs its own comps before it is built.

| # | Item | Feature map IDs | Waiting on |
|---|---|---|---|
| 35 | Progress tracker: trading days, a daily discipline score from prepare/trade/reflect rules, custom checklist rules, heatmap, streaks, follow rate, and its dashboard card (absorbs E50) | PT1, PT2, DA3 | Comps |
| 36 | Day page: plan mode (daily note, chart screenshots) and review mode (the day's trades and stats), with the day's checklist | DV1 | Comps, #35 |
| 37 | Trade log grouped by day and by week, with a mini calendar | TR7 | Comps |
| 38 | Merge and split trades; move trades between accounts (absorbs E10) | TR8, TR9 | Comps |
| 39 | Several targets and stops per trade with partial sizes; default stop/target rules and default commission/fee rules per account and instrument | TD3, SE4, SE5 | Comps |
| 40 | Trade-behaviour flags computed by rules (back-to-back losses, winner turned loser, held a loser, scaling, high volume) as filters and trade badges | X7 | Comps |
| 42 | Edit history: field-level log of changes with their source | X8 | Comps |
| 43 | Screenshots on trades and images in notes, stored locally; note column layouts, colours, font settings, version history, voice dictation | TD4, NB7, NB8, NB9 | Comps |
| 44 | Missed trades logged against a strategy; a strategy template gallery written by us, with example trades | ST6, ST7 | Comps, template content |
| 45 | Prop finances (payouts, fees, resets; totals invested, earned, net) and pass-rate / breach-reason insights | PF5, PF6 | Comps |
| 46 | Saved dashboard layouts with widgets; balance, drawdown, time-of-day and duration charts on the dashboard (absorbs E51) | DA1, DA2 | Comps |
| 47 | Getting started: first-run setup and sign-up survey (experience, capital, broker, instruments, goals, referral source) that tailor defaults; a getting-started checklist | ON1, ON2, ON3 | Comps |
| 48 | Import parsing in a worker (E44's worker part) | — | — |
| 49 | Cost method per account (LIFO, average); save the calendar as an image | AC5, CA5 | Comps |

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
| 22 | AI assistant: Q&A on trades, auto-tagging, session review, pre-market plan | TZ | Needs backend and an LLM provider | #1 |
| 23 | Composite performance score (our own, not a copy of the Zella Score) | TZ (concept) | Needs design and validation | Metrics from M1 |

## Risk and routines

| # | Item | Origin | Why deferred | Waiting on |
|---|---|---|---|---|
| 24 | Live prop-firm rule tracking (daily loss, trailing drawdown, consistency) with firm presets | TZ | Preview only in M1 | #1, #12, firm rule data |
| 25 | Economic calendar in routines | TZ | Needs a data source | Provider choice |
| 26 | Notifications and email recaps (daily/weekly) | — | Needs backend | #1, #2 |
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

## Engineering follow-ups (from Plan 1 reviews)

| # | Item | Owner plan |
|---|---|---|
| E1 | ~~Import validation: reject zero/negative quantities and unparseable times before the trade builder~~. Done in Plan 2 | Done |
| E2 | ~~Options that expire worthless need a synthetic closing fill at expiry, or their loss stays hidden as "open"~~. Done in Plan 2 | Done |
| E3 | ~~Partition trades by `pnlCurrency` (`partitionByCurrency`) before calling metrics; unconverted cross pairs subtract account-currency fees from quote-currency gross, so flag them in import~~. Done in Plan 2 | Done |
| E4 | ~~Unify metric signatures into one `MetricContext`~~. Done in the TradeZella alignment (40fa14c) | Done |
| E5 | Clamp R-distribution tails (a tiny `initialRisk` creates thousands of bins) | Plan 5 (Reports) |
| E6 | `canonicalSymbol` strips a leading `/`, and Plan 2 pins slash, case and space variants as one position. Confirm against real broker exports, including exchange suffixes (`/ESZ5:XCME`) and MetaTrader broker suffixes (`EURUSD.m`) | With #11 (sample exports) |
| E7 | ~~Tooling: .prettierignore, format, engines, pins~~. Done in Plan 3 | Done |
| E8 | ~~Next scaffold defaults, metadata, README~~. Done in Plan 3 | Done |
| E9 | Thin test gaps: exact session boundaries, more negative half-even ties, ZB/ZN/6E/lowercase symbol parsing, `Math.max(...)` spread above ~100k trades | Any |
| E10 | Manual **merge / split** of trades after import (TradeZella has it) | Plan 5 (Trades) |
| E11 | ~~Import picks its own **source timezone** (TradeZella has it), separate from the display timezone~~. Done in Plan 2 | Done |
| E12 | Prop setup accepts daily loss as **% or $** (UI converts % against the starting balance) | Plan 5 (Prop firms) |
| E13 | Verify the undocumented behaviours (breakeven in win %, profit factor with no losses, drawdown basis, fill grouping) against a real TradeZella test import, and align if they differ | When an account is available |
| E14 | ~~`PreviewRow.rowIndex` so import preview rows number by real file row~~. Done in Plan 2 | Done |
| E15 | **Don't publish the marketing site** until the app plans land: feature pages describe milestone-1 modules in the present tense | Release |
| E16 | ~~Trading Floor ceiling items (tickets, pit ornament, time-clock imprint)~~. Dropped with the rejected world in Plan 3b | Dropped |
| E17 | ~~Mechanical stamps on dropped tickets~~. Dropped with the rejected world in Plan 3b | Dropped |
| E18 | ~~Rename the leftover ticket identifiers (`ticketPrice`, `Preview.tickets`) to row/fill names; none reach visible copy~~. Done in Plan 2 | Done |
| E19 | App tickers mount after data, so a failed hydration cannot leave $0.00 there; the landing hero case remains | Release polish |
| E20 | `RuleList` carries landing-only tick hooks; split the landing animation from the app component | Plan 5 (Strategies) |
| E21 | Test and type tidy: kv tuple looseness, `grouped()` Number re-parse, no motion-behaviour tests | Any |
| E22 | Derive the "Trailing drawdown" label from `drawdownType` instead of hand-typing it | Plan 5 (Prop firms) |
| E23 | /login and /signup now offer "Open the sample workspace"; point "Get started" at the real sign-up flow when auth lands | #2 |
| E24 | Dashboard rule and mistake rows have hover fills; a hover/focus value readout on breakdown bars and product trade-row hovers remain | Plan 5 (Reports) |
| E25 | Excel (.xlsx) import. Spec §7 says CSV/Excel, but the §5 stack has no spreadsheet parser; users save as CSV meanwhile | Plan 5 decision |
| E26 | Options that expire after their last import stay open until the next import into that account settles them; settle at app start or in a server job | Milestone 2 (#1) |
| E27 | Import maps one fees and one commission column; swap/financing and extra fee columns aren't summed | With #11 |
| E28 | The spec's Playwright import-to-trade-log test (upload a CSV in the UI, see the trades in the log) | Plan 5 |
| E29 | A broker's own expiration row imported after Keel settled the option synthetically opens a phantom short that is settled again (gross 0, inflates counts). Pairs with E26 | With E26 |
| E30 | Settings UI should show "Browser default (zone)" until the user picks a timezone; day buckets follow the browser zone when travelling | Plan 5 (Settings) |
| E31 | Edits or deletes made to a trade between import context and commit (a tag added in another tab, a trade deleted by hand) are overwritten or resurrected by the commit's `bulkPut`; detect via a per-trade revision | Milestone 2 (#1) |
| E32 | Two open trades in one symbol: raise a `TradeFlag` and a user-facing notice when an overlapping export flips a trade's direction on merge (deferred from Task 6) | Plan 5 (Import UI) |
| E33 | Deleting an open imported position: `trades.remove` refuses an open trade with an `importId` (`OpenImportedTradeError`), so the user has to undo the import. A tombstone flow would let them delete it while later imports' fills still match against it instead of opening a phantom opposite position; a phantom position can still arise by deleting the closed trade that continued an open position, undoing the import that closed it, then re-importing that file (probe phantom2); the tombstone flow must cover it | Plan 5 (Trades) |
| E34 | When undo restores a trade, also restore the journal links the commit pruned from it (`prunedLinks` on the job record, about 30-40 lines). Likewise Task 6's `inherit` drops the second merged trade's journaling. Both need two open trades in one symbol, which nothing builds today | With E32 |
| E35 | Import parsing edge cases: Papa's delimiter auto-detect misreads files with 2+ leading blank lines; `parseDecimal` returns -0 (documented); `Date.UTC` maps years 0-99 to 1900-1999; untested `Z` variants (fraction, lowercase `z`, a space, `+0500`); a file whose only decimals have exactly 3 digits falls back to the delimiter rule. The mapping UI must show the decimal mark, the kind (fills or closed trades) and the date order, and let the user change each; wall-clock times in a DST gap roll forward silently (documented in `fill-time.ts`) | Plan 5 (Import UI) |
| E36 | Column-mapping upkeep: the synonym lists are duplicated between `mapping.ts` and `guess-columns.ts`, and an "Exit Strategy"-style header can flip the detected kind (close/exit detection matches on contains) | Plan 5 (Import UI) |
| E37 | `instrumentKey` keys CFD names (HK50, DJ30, EU50) to a futures root letter; the point-value prompt should show the file's symbol beside the key | Plan 5 (Import UI) |
| E38 | Expiry settlement test gaps: preserved order, two accounts kept apart, a last fill after the close; a malformed expiry throws `RangeError`; float residue in the net quantity of fractional option quantities | Any |
| E39 | Plan identity can drift off the journaled fill after a reversal split plus two more overlapping imports (`anchorOf` falls back to `executions[0]`; search the `:b` descendants first). Ids stay unique. Merged trades share execution and instrument objects with the stored rows (shallow copy) | Plan 5 (Import UI) |
| E40 | Sample generator: realism bounds are asserted only at the pinned seed; the stock size cap uses the first leg's price; price levels are frozen at late-2024 values; weekly recaps skip partial weeks | Any |
| E41 | Test-strength gaps: metrics (a non-base-currency account in the balance test, per-currency drawdown, a trade-count floor in the perf test); store (a two-tab seed barrier test, prefs storing only set fields, the refused-open `cause`); entities (cross-workspace removes, sort order); imports (the `list()` tie-break test can't catch a missing tie-break, since the index already yields ids in order); the e2e seed poll can pass before a late double seed lands; filters (an unknown `range=`, a to-only range) | Any |
| E42 | A stalled IndexedDB open never recovers in place: retries wait on the same request. A failed load of the store's lazily loaded Dexie chunk also surfaces as a plain error, not `StorageUnavailableError`. The storage-error retry should reload the page | Plan 4 |
| E43 | Re-importing a file with a corrected timezone or decimal mark duplicates its trades, because row fingerprints use parsed values. Suggest undoing the earlier import first; after undoing an earlier overlapping import, rows a later import skipped as its duplicates belong to no trade until that later file is re-imported; the undo flow should say so | Plan 5 (Import UI) |
| E44 | Large and non-UTF-8 files: `file.text()` decodes UTF-8 only, so Windows-1252 cells are reported as row issues; `planImport` runs synchronously in render for files up to 20 MB, so move it to a worker | Plan 5 (Import UI) |
| E45 | **Fix before the Plan 5 import UI:** `useImportPlan` (`src/data/query/derived.ts`) returns `status: 'success'` with `data: undefined` on the render pass where it resets its plan identity (context load, after each commit/undo, input change), breaking the `Derived` contract; an inline `input` object also loops. Fix: compare inputs by their four fields, plan from the stored identity input, and report `'pending'` until the identity is current; add a per-pass contract test and an inline-input test (recipe and probes in the Plan 2 final re-review) | Plan 5 (Import) |
| E46 | Tag a trade from the drill-down ("tag what is missing" in the dashboard contract story); needs the tag picker the Trades page builds | Plan 5 (Trades) |
| E47 | Drill-down and recent-trade rows link to `/app/trades/[id]` once trade detail exists | Plan 5 (Trades) |
| E48 | ~~Search over trade text (notes, ids) and journal entries~~. Done in Plan 5 Task 17 (the trade log reads trade-note text; the Notebook searches title, text and tags). The top-bar search still covers modules, symbols, strategies and tags only | Done |
| E49 | Dashboard shows one currency at a time with a switch; a combined view waits on FX | #8 |
| E50 | More goal types: monthly, trade count, TradeZella-style routine rules (trading hours, stop on every trade, start-my-day) | Plan 5 decision |
| E51 | Customisable dashboard widgets (TradeZella has them); the contract fixes one layout for milestone 1 | Milestone 2 decision |
| E52 | Focus Not Obscured (WCAG 2.4.11): the sticky desktop bar and the pinned mobile row can cover a focused element when tabbing backwards; needs scroll-padding without breaking the chip scroller | Plan 5 polish |
| E53 | A closing filter popover stays interactive through its 160ms exit (Escape then fast Tab lands in its fields) | Plan 5 polish |
| E54 | ~~`useGlobalFilters` writes the pathname it rendered with, and any late `replaceState` during a pending Next navigation discards that navigation (reproduced 0-10ms after a workspace switch); write against `window.location.pathname` and avoid late writes while a navigation is pending~~. Done in Plan 5 Task 4 (writes use `window.location.pathname`; the stale-link clean-up waits while the address bar and the render disagree on the page) | Done |
| E55 | Top bar polish: a "controls drop" or three-row layout so wrapped chips keep a full row (prototyped in the Plan 4 re-review); the phone bar overflows below 375px (let the controls row wrap or hide the sample label); extend the Tab-walk e2e to the 640-1023 band; refresh two stale comments | Plan 5 polish |
| E56 | Remaining Phosphor root imports (theme-toggle, site mobile-menu, product-menu, module-icons) move to dist/ssr | Any |
| E57 | An archived-only workspace with no filters reads "No closed trades yet", though its trades are closed; say the trades sit in archived accounts | Plan 5 (Settings) |
| E58 | Rebrand residuals: the equity chart has no hover read-out (a crosshair with date and balance, as Kraken and Coinbase do); the hero's count-up copies NumberTicker's logic because the ticker can't set a small raised "%" (give NumberTicker an opt-in suffix slot); the hero gradient and the logo gradient use literal hexes (add fixed `--hero-*` tokens) | Plan 5 polish |
| E59 | Recent trades against comp C: the header still reads "Symbol" (the comp says "Instrument") and mistakes sit in the Strategy cell rather than a Mistake column; an option's expiry ("TSLA 370 Put 20 Nov") reads like a repeat of the Time column on 0DTE trades | Plan 5 (Trades) |
| E60 | `Chip` has no raised tone (white, hairline, lift), so the site keeps its own `Pill` for codes on the canvas; an accent `IconTile` on the canvas loses its fill (accent-soft is close to #ECEEF8), so pricing uses tinted tiles on a white card; fold both into the shared parts | Any |
| E61 | The app scope in theme.css repeats the root values now that marketing follows Daylight premium; collapse it to what the app actually overrides once the two settle | Any |
| E62 | User-made tag categories with their own colours, as TradeZella has | Plan 5 (Tasks 2, 18) |
| E63 | Filters v2 leftovers: the "More filters" panel is one long scroll (collapsible sections or a two-pane layout would shorten it); the R range tests net P&L over initial risk whatever the Gross/Net switch says; weekday and month read the day a trade opened; the account switcher's search lives inside a menu, so a real combobox popover would be a better fit | Plan 5 polish |
| E64 | The Trades, Calendar and Reports pages (Tasks 5 on) must pass `range` through their metric contexts as `useMetrics` and the dashboard do, so day figures clip to the date range; equity and drawdown curves still run over the whole filtered trade set | Plan 5 |
| E65 | Calendar day panel: the comp's "Rules kept" and "Mistakes" figures are not built (the panel shows trades, win rate, fees, gross or net, and realized R); the day's percentage and R units fall back to dollars for ticks, pips and points; below the container width of 600px the cells show only the day number and a bar (the figures sit in the panel, the week totals in a list) | Plan 5 polish |
| E66 | Calendar weeks start on Monday as ruled, so November 2026 has six rows (1 Nov is a Sunday); the brief's test said five, which holds only for Sunday-first weeks. A week-start preference would settle it | Plan 5 decision |
| E67 | Notebook leftovers: an Empty Trash button; moving a note by drag; a template picker on New (today a kind starts from its default); the weekly recap's "week in numbers" and the daily review's figures are not inserted into the body; the editor's Trade button (a note's trades are linked from "+ Link" under the title); the entry-list excerpt of a daily note begins with its section titles; a daily note's figures follow the base currency only. Done in module G fix round 1: the day card's "Rules kept" and "+ Link" (link or unlink trades through `linkedTradeIds`) | Plan 5 polish |
| E68 | ~~The Notebook's built-in folders are by kind: Daily journal holds daily reviews and pre-market plans, Sessions recap holds weekly recaps only, My notes holds plain notes without a folder, and a trade note or daily note in a user folder also stays in its built-in one. Revisit if TradeZella's folders show a different split~~. Done in module G fix round 1 (pre-market plans moved to Daily journal) | Done |
