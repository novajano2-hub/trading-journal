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
