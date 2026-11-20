# Keel: platform foundation, milestone 1

Status: **approved by the user** · 2026-11-20
Related: [PRODUCT.md](../../../PRODUCT.md) (product truth), [BACKLOG.md](../../BACKLOG.md) (everything deferred), landing direction contract at `.impeccable/surfaces/src-app-marketing-page-tsx.md`

## 1. Intent

Keel (working name) is a commercial trading journal. It rebuilds the *systems* of TradeZella and MyTradingJourney as one product: their features, data model and workflows, but not their UI, copy or branding. It's for the same people those products serve:
- retail traders of stocks, options, futures, forex and crypto, at every stage
- prop-firm traders
- mentors and communities

Positioning: the whole improvement loop in one place. **Trade → journal → review against your own rules → test the fix → trade again.** PRODUCT.md holds the full product record.

This document covers **milestone 1**:
- the whole UI structure
- the marketing landing page and supporting marketing pages
- the core app pages working end to end on realistic sample data

Data comes through a data layer that a real backend replaces in milestone 2, without the pages changing.

## 2. Goals, non-goals, anti-goals

**Goals (milestone 1)**
- Every module from both products has its place in the navigation and a real page.
- Six modules work fully on sample data: Dashboard, Trades (log and detail), Calendar, Reports, Strategies, Notebook.
- Five modules are honest structure-only pages, since they need backends or market data first: Backtesting, Replay, Prop firms, Mentor & Spaces, AI assistant.
- A marketing site that sells the product in its committed visual world (Trading Floor). Its primary action is a working file drop that leads into the import flow.
- A CSV import flow that works on the user's own file in the browser, so a visitor's own trades can appear in the app.
- Correct, tested trading metrics. Numbers are the product.

**Non-goals (milestone 1).** All tracked in BACKLOG.md:
- backend, database, auth, billing
- broker auto-sync
- market data
- replay and backtesting engines
- AI
- the trade copier
- multi-user sharing
- native mobile apps

**Anti-goals.** Any of these makes the milestone a failure even if it "works":
- It looks like a template, or like either source product.
- Any number is wrong, rounded flatteringly, or computed without fees.
- A module pretends to work when it doesn't.
- The UI breaks with thousands of trades.
- Profit and loss are told apart by colour alone.

## 3. Constraints

- Next.js (user's choice), TypeScript strict, web only, responsive.
- No invented claims on the marketing site: no customer counts, ratings, testimonials, broker counts or prices. Sample data and screenshots are allowed when labelled as sample.
- No licensed assets. Price charts use TradingView **Lightweight Charts** (Apache-2.0), not the licensed TradingView Charting Library that TradeZella uses. Highcharts needs a commercial licence, so we don't use it.
- Accessibility: WCAG 2.2 AA. Every P&L value carries a sign (+/−); buy/sell carries a B/S letter as well as colour.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | One Next.js app with `(marketing)` and `(app)` route groups. Domain types, metrics, data access and UI live in separate top-level folders. | Fastest to ship, one deploy, server-rendered marketing for search. The folder boundaries mirror option B's packages, so promoting to a monorepo later is a move, not a rewrite. |
| B | Turborepo monorepo: separate marketing app, product app, `ui` and `domain` packages. | Cleaner isolation and independent deploys, but double setup before a second app needs it. |
| C | Next.js frontend plus a separate backend service and Postgres from day one. | Real persistence early, but it delays the UI milestone and fixes API shapes before the screens have shown what they need. |

The user chose Next.js and left the rest to me, so A is my call. Competitors, for reference:
- TradeZella: Webflow marketing site, plus a React SPA (Vite, Heroku) using the TradingView Charting Library, Highcharts, Redux, Lexical/Slate, Stripe, Intercom and PostHog.
- MyTradingJourney: Framer marketing site, plus a Next.js app on Vercel with NextAuth and Redux.

## 5. Stack (my calls unless noted)

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router, React, TypeScript strict (**user**) | One codebase for marketing and app |
| Package manager | npm | Ships with Node, no extra install (pnpm was planned but is not installed on this machine) |
| Styling | Tailwind CSS v4 with design tokens as CSS variables | Tokens come from the committed world. Utilities stay fast |
| Primitives | Radix UI primitives, styled in-house | Accessible behaviour without a stock look |
| Fonts | Self-hosted with `next/font`: Big Shoulders Display, Barlow, DotGothic16 | From the direction contract |
| Price and equity charts | Lightweight Charts (Apache-2.0) | Purpose-built for financial time series, free |
| Other analytics charts | visx (MIT) | Full control, so charts match the world rather than a library's look |
| Tables | TanStack Table + TanStack Virtual | Sorting, column control, 10k-row virtualisation |
| Client data | TanStack Query over the repository interface | The same calls survive the swap to a real API in milestone 2 |
| Local persistence | IndexedDB (via Dexie) | User writes in milestone 1: imports, tags, notes, strategies |
| CSV parsing | Papa Parse, in the browser | Files never leave the user's machine in milestone 1 |
| Rich text (Notebook) | Tiptap | Mature, MIT core, JSON documents |
| Dates | date-fns v4 + @date-fns/tz | Timezone-correct session and day bucketing |
| Tests | Vitest (domain and components), Testing Library, Playwright (smoke and import flow) | TDD on metrics; end-to-end on key paths |
| Lint/format | ESLint, Prettier | Standard |
| Design QA | Impeccable detector and finish review on each finished surface | The user's no-slop bar |

## 6. Information architecture

**Marketing** (`src/app/(marketing)`):
- `/` home
- `/features/[module]`: one template for journal, analytics, strategies, notebook, backtesting, replay, prop-firms, mentors
- `/pricing`: tier structure with prices marked "to be announced"
- `/brokers`: what can be imported today, honestly stated
- `/changelog`
- `/login`, `/signup`: UI only in milestone 1; continue into the sample workspace
- `/terms`, `/privacy`: placeholders

**App** (`src/app/(app)/app/...`, URL prefix `/app`):

| Route | Milestone 1 depth |
|---|---|
| `/app/dashboard` | Full |
| `/app/trades`, `/app/trades/[id]` | Full |
| `/app/calendar` | Full |
| `/app/reports`, `/app/reports/[report]` | Full: overview, plus reports by time (weekday/hour/session), symbol, strategy, tag/mistake, side, duration, R-distribution |
| `/app/strategies`, `/app/strategies/[id]` | Full: rules, checklist, stats per strategy, rule adherence |
| `/app/notebook`, `/app/notebook/[entryId]` | Full: daily review, pre-market plan, weekly recap templates; trade-linked notes; folders |
| `/app/import` | Full: drop → map columns → preview → confirm |
| `/app/settings/{profile,accounts,import-history}` | Full on local data |
| `/app/prop-firms` | Full on local data (my call): the user enters a rule set per prop account (profit target, daily loss limit, max drawdown and its type, min trading days, consistency %). Keel computes the real status against that account's trades. No firm presets yet (backlog #24) |
| `/app/backtesting`, `/app/replay`, `/app/mentors`, `/app/assistant` | Structure only: a real page that says it isn't live yet and shows its planned shape, with no fake numbers |

**App chrome:**
- a sidebar with the modules
- an account switcher (the trader badge)
- global filters that drive Dashboard, Trades, Calendar and Reports: date range, account, symbol, side, strategy, tags

Filters live in the URL search params, so every view is linkable.

## 7. Domain model

Money is stored in **integer minor units** (cents), with rounding at the trade level. Prices are numbers kept at instrument tick precision. Times are stored in UTC and shown in the user's timezone. Session and day bucketing use that timezone.

```
User            id, name, timezone, baseCurrency, breakevenThreshold (minor units)
Account         id, name, broker, type: live|demo|prop-evaluation|prop-funded,
                currency, startingBalance, status: active|archived, propRules?
PropRuleSet     firm, phase, profitTarget, dailyLossLimit, maxDrawdown,
                drawdownType: static|trailing|eod-trailing, minTradingDays, consistencyPct?
Instrument      symbol, assetClass: stock|option|future|forex|crypto|cfd,
                pointValue (multiplier), tickSize, underlying?, expiry?, strike?, right?
Execution       id, accountId, symbol, side: buy|sell, qty, price, time, fees, commission, orderId?
Trade           id, serial, accountId, instrument, direction: long|short, status: open|closed,
                openedAt, closedAt?, executions[], avgEntry, avgExit?, maxPosition,
                gross, fees, net, plannedStop?, plannedTarget?, initialRisk?, r?,
                mae?, mfe?, strategyId?, tagIds[], rating?, ruleChecks[], noteId?
Tag             id, name, category: setup|mistake|emotion|custom
Strategy        id, name, description, assetClasses[], rules[] (grouped entry|exit|risk|management),
                checklist[], status: active|archived
RuleCheck       ruleId, followed: true|false|null
JournalEntry    id, kind: daily-review|pre-market|weekly-recap|note, date?, title,
                body (Tiptap JSON), linkedTradeIds[], folder?
ImportJob       id, accountId, fileName, mapping, rowCount, tradeCount, status, createdAt
BacktestSession, MentorShare: type stubs only (structure pages)
```

**Trade building.** A trade is built from executions. A position goes from flat → open → flat, using FIFO matching. It handles:
- scale-ins and partial exits
- reversals: a fill that crosses through flat closes one trade and opens the next
- open positions at the end of data

This is the riskiest logic, so it's built test-first.

**Metrics** (pure functions over a filtered trade set, all test-first):
- **P&L:** net and gross P&L (fees shown separately).
- **Win rate:** breakeven trades, within the user's threshold, are excluded from it.
- **Win/loss quality:**
  - profit factor
  - expectancy (per trade, and in R where risk is known)
  - average win, average loss, and their ratio
  - largest win and largest loss
- **Drawdown:** max drawdown in money and %, closed-trade equity basis.
- **Streaks:** win/loss streaks, by trade and by day.
- **Days:** green-day %, best and worst day.
- **Rules:** rule adherence %.
- **Breakdowns:** by weekday, hour, session, symbol, strategy, tag, side and duration bucket.
- **R-distribution.**
- **MAE/MFE:** shown when present (sample data has them; real values need market data, which is in the backlog).

**Metric definitions (my calls).** Keel defines its own metrics and documents each one in-app (a tooltip on every metric). TradeZella doesn't publish its formulas, so exact parity isn't possible to verify.
- A **breakeven** trade has |net| ≤ the user's threshold (default $0).
  - It is excluded from win rate, average win and average loss.
  - It counts in trade count, net P&L and profit factor (where it adds zero).
  - It neither extends nor breaks a streak.
- A **green day** has net P&L > 0 after fees. A red day has net P&L < 0.
- **Drawdown** is peak-to-trough on closed-trade equity. Equity = sum of the selected accounts' starting balances + cumulative net P&L.
  - Drawdown % = drawdown ÷ the peak equity at that point.
  - With several accounts selected, starting balances add up.
- **R** needs `initialRisk`, taken from the planned stop, or entered by the user. Trades without it are excluded from R metrics and counted as "no risk set".

**Import rules (my calls).** Import is generic CSV/Excel with column mapping. Rows are either:
- **Fills:** one execution per row. They go through the FIFO trade builder, and Keel computes P&L from price × quantity × point value, less fees and commissions from mapped columns.
- **Closed trades:** one round trip per row, with entry and exit. These are imported as trades. If the file has its own P&L column, it is shown beside Keel's computed figure, and mismatches beyond $0.01 are flagged on the preview, never silently picked.

Point values and currency:
- Point values come from a small built-in registry of common instruments (major US index, energy and metal futures and their micros; forex pairs at 100,000 units per standard lot; stocks at 1).
- An unknown symbol root blocks confirmation until the user enters its point value in the mapping step. The value is remembered for next time.
- Forex P&L in a non-USD quote currency is converted using the trade's own exit rate when USD is the base currency (e.g. USDJPY).
- Crosses without a USD leg need a mapped P&L column, or they stay unconverted and are flagged. Proper FX conversion is backlog #8.

`/brokers` states exactly this: generic import works with any export that has these columns. It names no brokers as "supported" until a preset is tested (backlog #11).

**Platform alignment (2026-11-20, user directive: "make them like those two platforms").** Where TradeZella's help centre documents a calculation, Keel matches it, and this replaces the matching "my calls" above. MyTradingJourney publishes none of these definitions.

| Behaviour | Keel now |
|---|---|
| Breakeven | A From/To range in **$ or % of Net ROI**, asymmetric allowed (default 0..0). It applies to trades **and days**: days inside the range are flat/"blue" |
| Expectancy | Win% × Avg Win − Loss% × Avg Loss |
| Gross / net | A switch: gross excludes fees and commissions. Every P&L metric follows it, except prop-firm rules, which always use net |
| R | **Planned R** (needs both target and stop) and **Realized R** (needs stop / initial risk), reported separately |
| Time reports | Time of day in 5/15/30/60-minute buckets, by **entry or exit** time |
| Prop setup | Static / EOD / Trailing drawdown, daily loss in $ or % (the UI converts % to $ against the starting balance), an optional best-day consistency rule, and Active/Breached status |
| Timezone | The user's display timezone drives day and time bucketing; imports choose their own source timezone (Plan 2) |

Still Keel's own, because neither platform documents them:
- Breakevens are excluded from win %.
- Profit factor shows "—" with no losses.
- Drawdown is on closed trades, as a % of peak.
- FIFO trade grouping.
- Breakevens don't affect streaks.
- Session hours.
- The trailing lock at the starting balance.
- Daily loss breaches at the intraday dip.
- The prop "near" warning.

Sources: help.tradezella.com articles on dashboard widgets, reports overview, breakeven range, trade expectancy, the Day & Time report, global settings, and PropFirm Sync setup.

## 8. Data layer

`src/data` defines repository interfaces (`TradesRepo`, `StrategiesRepo`, `JournalRepo`, `AccountsRepo`, `ImportRepo`). Milestone 1 ships one implementation, **LocalRepository**:

- **Seeded sample workspace.** A deterministic generator with a fixed seed, so screenshots and tests are stable. It produces:
  - three accounts: a futures live account, a forex prop evaluation and a stocks/options account
  - about six months and about 1,200 trades, with realistic partial fills, scale-ins, fees, four strategies with rules, tags, rule checks, journal entries and synthetic MAE/MFE
  - all of it labelled "Sample workspace" in the UI
- **Workspaces are a first-class scope (my call), so sample and real numbers never mix.**
  - There are two workspaces: **Sample workspace** (seeded, resettable) and **My workspace** (empty until the first import). They switch from the trader badge.
  - Every repository call takes a `workspaceId`, and that carries into milestone 2.
  - An import always lands in My workspace and creates or picks an account there during mapping.
  - Edits in either workspace persist to IndexedDB.
  - "Reset sample workspace" restores the seed. "Delete my workspace data" clears the user's data after a confirmation.

Pages talk only to TanStack Query hooks over the interfaces. In milestone 2 a server-backed implementation replaces LocalRepository, and pages don't change.

## 9. Visual direction

**Landing and marketing:** the committed **Trading Floor** world. Its direction contract is at `.impeccable/surfaces/src-app-marketing-page-tsx.md`:
- jacket-gold ground, navy ink, ticket card stock
- B/S letters in circles, rubber-stamp states, trader-badge identity
- Big Shoulders Display, Barlow, and a dot-matrix face for timestamps

**App screens:** the same world, used with restraint for long working sessions. This is the planned translation; each app surface still gets its own Impeccable structure round inside the world before it's built.
- Ticket-stock and navy surfaces.
- Gold reserved for the primary action and the active state.
- Trades render as ticket rows, and the trade detail as a full ticket.
- Tags and mistakes render as stamps.
- Timestamps use the dot-matrix face.
- Dense, keyboard-first tables.

**Landing file drop (my call, honest version of the signature interaction).**
1. A dropped file is parsed in the browser.
2. Columns are auto-guessed.
3. The first few rows "print" into the ticket stack as unstamped tickets showing only raw facts: side, symbol, quantity, price, time. Stamps appear only on the labelled sample tickets, because a new visitor has no rules yet.
4. "Map columns and continue" hands the parsed file to `/app/import` through IndexedDB.

The "or choose your broker" control records the broker's name, used to name the account, and opens short "how to export from this broker" help. It does not imply a preset.

**Approved composition.** No image generation is available, so the build is code-led. The chosen sketch `.impeccable/mocks/decision/model-pick.html` is the composition the landing build matches and the finish review checks against.

**Pricing page.** It shows the tier structure as "Pricing to be announced", without module gating or prices, until the user decides (backlog #3).

**Not in the app nav in milestone 1:** trade copier, University, composite score and economic calendar. They live in the backlog. The approved page map didn't include them, and empty pages for them would add nothing.

**Shared design system.** One design-token layer serves both sections. `DESIGN.md` is written from the built result at the end of the milestone by Impeccable's documenter.

## 10. Quality and testing

- **TDD** for everything in `src/domain`: trade building, metrics, bucketing, CSV mapping.
- **Component tests** where interaction has logic: filters, import mapping, the trade-table column state.
- **Playwright smoke tests:**
  - every route renders
  - the import of a fixture CSV reaches the trade log with correct totals
- **Prop-firm rule evaluation** is also built test-first. It covers daily loss, and static, trailing and end-of-day-trailing drawdown.
- **Each finished surface:** Impeccable detector, plus the finish review against its direction contract.
- **Performance:**
  - the trade log stays smooth at 10,000 rows
  - dashboard metrics for 1,200 trades compute in under 50 ms
- **Responsive:**
  - marketing is fully responsive
  - the app is desktop-first, and Dashboard, Calendar, Trade detail and Notebook are usable at 390 px

## 11. Milestone 1 definition of done

- All routes in section 6 exist and render at desktop and mobile widths without overflow.
- The six full modules work on the sample workspace, and filters affect them consistently.
- A user-supplied CSV imports through the mapping flow and shows correctly in Trades, Dashboard and Calendar.
- Metric unit tests pass, including fee-inclusive, breakeven, reversal and partial-fill cases.
- The landing page passes Impeccable's finish review against its contract, and DESIGN.md exists.
- BACKLOG.md lists every deferred item with its dependency.

## 12. Decided by the user

- Rebuild both products' systems as one, not their UI. Own visual language, drawn from the user's reference libraries (Mobbin, HorizonX, Refero) and Impeccable.
- A commercial product for the same audience as the source products.
- Full page map approved, with the depth split above.
- Deferred items tracked rather than dropped.
- Working name; real name later.
- Positioning: "everything", with best practice left to me.
- Next.js.
- Visual direction: Trading Floor.
- Design sign-off:
  - The user approves the layout of the **app shell and the Dashboard**, chosen from options on the Impeccable decision page, before they are built.
  - The remaining app screens are built in that pattern, each with its own Impeccable layout step and finish review.
  - The user then reviews those screens finished.
  - This is the plan's one blocking design checkpoint for the app. Domain, data-layer and landing work can run while it's open.

## 13. Left to the builder

- File and component structure within the folders above.
- Exact chart types per report.
- The sample generator's internals and distribution realism.
- CSV column-guessing heuristics.
- Copy for feature pages, within PRODUCT.md's evidence rules.
- Which Mobbin/HorizonX references inform each app surface during its Impeccable round.
