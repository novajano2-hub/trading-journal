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
| E19 | Number ticker: if JS loads but hydration fails, KPIs show $0.00; also starts about 300ms after hydration | Plan 4 |
| E20 | `RuleList` carries landing-only tick hooks; split the landing animation from the app component | Plan 5 (Strategies) |
| E21 | Test and type tidy: kv tuple looseness, `grouped()` Number re-parse, no motion-behaviour tests | Any |
| E22 | Derive the "Trailing drawdown" label from `drawdownType` instead of hand-typing it | Plan 5 (Prop firms) |
| E23 | "Get started" goes to /signup, which says accounts open with the release; point it at the real sign-up flow when auth lands | Plan 4 |
| E24 | Optional design ceiling from the Plan 3b finish review: a hover/focus value readout on breakdown bars, and a row hover highlight on product trade rows | Plan 4 |
| E25 | Excel (.xlsx) import. Spec §7 says CSV/Excel, but the §5 stack has no spreadsheet parser; users save as CSV meanwhile | Plan 5 decision |
| E26 | Options that expire after their last import stay open until the next import into that account settles them; settle at app start or in a server job | Milestone 2 (#1) |
| E27 | Import maps one fees and one commission column; swap/financing and extra fee columns aren't summed | With #11 |
| E28 | The spec's Playwright import-to-trade-log test (upload a CSV in the UI, see the trades in the log) | Plan 5 |
| E29 | A broker's own expiration row imported after Keel settled the option synthetically opens a phantom short that is settled again (gross 0, inflates counts). Pairs with E26 | With E26 |
| E30 | Settings UI should show "Browser default (zone)" until the user picks a timezone; day buckets follow the browser zone when travelling | Plan 5 (Settings) |
| E31 | Edits or deletes made to a trade between import context and commit (a tag added in another tab, a trade deleted by hand) are overwritten or resurrected by the commit's `bulkPut`; detect via a per-trade revision | Milestone 2 (#1) |
| E32 | Two open trades in one symbol: raise a `TradeFlag` and a user-facing notice when an overlapping export flips a trade's direction on merge (deferred from Task 6) | Plan 5 (Import UI) |
