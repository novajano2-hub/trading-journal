# TradeZella feature map for Keel

Built on 2026-11-22 from three sources:
- the user's walkthrough of a new TradeZella account (121 screenshots, every module);
- TradeZella's official MCP connector, read-only, which exposes their data model;
- their public help centre, summarised in [tradezella-plan5-features.md](tradezella-plan5-features.md).

**Rule:** we take features and behaviour. The look stays Keel's approved Daylight design, the wording is our own, and no screen layout is copied.

**Where each item goes:**
- **P5** goes in Plan 5. These are the milestone 1 modules that already have approved comps; new parts extend the comps' language.
- **P6** goes in Plan 6. These are new modules that still run on local data but need their own comps first.
- **B#n** goes to the backlog, waiting on a backend, market data, AI or a provider (the number is the BACKLOG.md item).

Nothing is dropped: whatever isn't in Plan 5 or Plan 6 is in the backlog, and you decide when it comes in.

**Keel today:**
- **Built** means it ships on main now.
- **Spec** means it's in the foundation spec or the approved Plan 5 comps.
- **Gap n** means it's research gap n.
- **New** means this walkthrough found it.

## Cross-cutting

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| X1 | **One shared filter set**, used by the trade log, dashboard, calendar and reports. It covers symbol include/exclude, side, win/loss/breakeven, open/closed, intraday/multiday, reviewed, rating, strategy (include, exclude, match all, none), tags by category (include/exclude), weekday, month, entry-time and exit-time windows, duration, entry/exit price, size, volume and R-multiple ranges. Changes take effect with Apply, Reset or Cancel | Spec has 6 filters; Gap 6 | P5 |
| X2 | Date presets: today, this week, this month, last 30 days, last month, this quarter, year to date, custom | Built (partly) | P5 |
| X3 | Pick several accounts at once, with search by name or broker | Built (single) | P5 |
| X4 | Display unit switch: dollars, % return, R-multiple | Spec has gross/net; Gap 5 | P5 |
| X5 | Privacy mode that hides every money figure (for screen sharing) | New | P5 |
| X6 | Display in ticks, pips or points per instrument | New | P6 |
| X7 | Trade-behaviour flags computed by rules, not AI: back-to-back losses, a winner that turned into a loser, holding a loser too long, scaling in/out, unusually high volume. They work as filters and on trades | New | P6 |
| X8 | Field-level history of edits (entity, field, old value, new value, source: you, import or the app) | New | P6 |
| X9 | Extra metrics: Sharpe, Sortino, max winning/losing streaks by day, avg daily win %, longest trading day | New | P5 |

## Trades (`/app/trades`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| TR1 | Summary strip over the filtered set (net, profit factor, win %, avg win/loss), with an option to hide it | Spec | P5 |
| TR2 | Column chooser with a saved column order | Gap 4 | P5 |
| TR3 | Reviewed / not reviewed on each trade: a column, a filter and a bulk action | Gap 1 | P5 |
| TR4 | Bulk actions on selected trades: tag, add to strategy, mark reviewed, export CSV, delete | Gap 2 | P5 |
| TR5 | Net ROI column, plus % display | Gap 5 | P5 |
| TR6 | Export trades to CSV | Backlog #7 | P5 |
| TR7 | Day-grouped view (one card per day with its net and a link to that day's note) and a week view, with a mini month calendar to jump between dates | New | P6 |
| TR8 | Merge and split trades by hand | Gap 3, E10 | P6 |
| TR9 | Move trades to another account | Research "Later" | P6 |

## Adding trades by hand

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| MA1 | **Manual trade entry from fills.** Pick the asset type (stock, option, future, future option, forex, crypto, CFD), pick or type the symbol, then add fill rows: time, buy/sell, quantity, price, commission, fee. Futures and options also need expiry, strike, call/put and a contract multiplier, entered once per trade. Times use the account's time zone | New (import only today) | P5 |
| MA2 | Symbol lists per asset type for autocomplete (forex pairs, crypto pairs, futures roots) | Built (instrument table) | P5 |

## Trade page (`/app/trades/[id]`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| TD1 | Stats, fills, rule checklist, tags, rating and notes | Spec | P5 |
| TD2 | One note per trade, stored in the notebook's Trade notes folder. It is titled with the symbol and date and shows the trade's stats | Gap 14 | P5 |
| TD3 | Several profit targets and stop losses per trade, each with a share of the position (partials), feeding planned R | Gap 7 | P6 |
| TD4 | Chart screenshots attached to a trade (stored locally) | Backlog #5 | P6 |

## Import (`/app/import`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| IM1 | Fills or closed trades, file time zone, column mapping, preview, undo | Built (engine); UI in spec | P5 |
| IM2 | Choose the date format on upload; a wrong format reports the skipped rows | Gap 11, E35 | P5 |
| IM3 | Save a column mapping per account and reuse it automatically | Gap 11 | P5 |
| IM4 | Import history with fill and trade counts per import, and delete/undo per import | Spec + Gap 11 | P5 |
| IM5 | Recognise a known broker's file and offer its preset | Backlog #11 | B#11 |
| IM6 | Broker catalogue: each broker with the methods it supports (sync, file, manual) and the asset types each covers | New | B#10 |
| IM7 | Excel (.xlsx) and .txt files | E25 | P6 |
| IM8 | Broker auto-sync (e.g. MetaTrader with a read-only investor login) | Backlog #10 | B#10 |

## Calendar (`/app/calendar`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| CA1 | Month grid with each day's net, trade count and colour (breakeven range included); weekly totals with day count; monthly summary; a selected day's trades | Spec | P5 |
| CA2 | Choose which stats each day shows; a marker on days that have a note | Gap 9 | P5 |
| CA3 | Year view: twelve small months, net or gross | Gap 9 | P5 |
| CA4 | P&L is booked on the day a trade closes or is partly closed; open trades count nothing until then | Gap 8 | P5 |
| CA5 | Save the calendar as an image | New | P6 |

## Reports (`/app/reports`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| RE1 | Overview, plus reports by day and time, symbol, strategy, tags and mistakes, side, duration, R-distribution | Spec | P5 |
| RE2 | Up to three chart metrics per report (bar or line), a sortable summary table, and a second dimension to cross-analyse by | Gap 10 | P5 |
| RE3 | Wins vs losses: the same stats for winners and losers side by side | Gap 10 | P5 |
| RE4 | Compare: two groups, each defined by its own filters, side by side | Gap 10 | P5 |
| RE5 | Risk report: position size, R-multiple buckets, drawdown | Gap 10 | P5 |
| RE6 | Performance report with a dollars/R switch | Gap 10 | P5 |
| RE7 | Options report by days to expiry | Research "Later" | P6 |
| RE8 | Weekly and monthly written recaps | AI | B#22 |

## Strategies (`/app/strategies`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| ST1 | Rule groups with rules; rule checklist on trades; adherence; stats per strategy and equity | Spec | P5 |
| ST2 | When each rule is shown: always, on winners, on losers or on breakeven trades | Gap 12 | P5 |
| ST3 | Per-rule stats: follow rate, and P&L, win rate and profit factor when followed | Gap 12 | P5 |
| ST4 | Active and archived strategies | New | P5 |
| ST5 | A strategy's icon or colour, and a description | New | P5 |
| ST6 | Missed trades logged against a strategy | Research "Later" | P6 |
| ST7 | A template gallery of ready-made strategies to copy, written by us (never copied from theirs), with example trades | New | P6 |
| ST8 | Share a strategy, or have strategies shared with you | Backlog #19 | B#19 |
| ST9 | Backtest a strategy on a historical session | Backlog #16 | B#16 |

## Notebook (`/app/notebook`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| NB1 | Folders, daily review, pre-market plan, weekly recap and trade-linked notes | Spec | P5 |
| NB2 | Built-in folders that can't be deleted (daily journal, trade notes, recaps) next to your own; favourites; search | Gap 14 + New | P5 |
| NB3 | Trash that keeps deleted notes for 30 days | Gap 14 | P5 |
| NB4 | A daily note keyed by its date, showing that day's P&L; a default daily template (prep, session log, end-of-day recap) that every new day starts from; a template manager | Spec + New | P5 |
| NB5 | Tags on notes, separate from trade tags | Gap 14 | P5 |
| NB6 | Rich text: headings, lists, checklists, bold/italic, links, quotes, collapsible sections, tables, a slash menu | Spec (rich text) | P5 |
| NB7 | Images in notes, column layouts, colours and highlights, font settings | Research "Later" + New | P6 |
| NB8 | Version history of a note | Research "Later" | P6 |
| NB9 | Voice dictation (the browser's speech input) | New | P6 |
| NB10 | Share a note by link | Research "Later" | B#1 |

## Day page (plan and review)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| DV1 | **A page for each trading day.** A plan mode (before and during the session) holds the daily note and a place for chart screenshots. A review mode (after the session) shows that day's trades, net, win rate and session length. Both show the day's discipline checklist | New ("Start my day" in research "Later") | P6 |

## Progress tracker (daily discipline score)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| PT1 | **Trading days and a daily score from rules in three stages: prepare, trade, reflect.** Built-in rules, each switchable with a limit: journaled by a set time, traded only within set hours, every trade linked to a strategy, every trade has a stop, max loss per trade, max loss per day. You can add your own checklist rules per stage and weekday | New (E50 asks for some of these) | P6 |
| PT2 | Score history as a heatmap, current and best streak, perfect days, follow rate per rule. A rule change applies from today on and never rescores past days | New | P6 |
| PT3 | Daily reminder before a streak breaks | Backlog #26 | B#26 |

## Accounts (`/app/settings/accounts`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| AC1 | Account list with broker, type, currency, balance, status and prop rules | Spec | P5 |
| AC2 | Dated deposits and withdrawals that feed the balance and % drawdown | Gap 13 | P5 |
| AC3 | Archive an account, which makes it read-only; clear an account's trades after a confirmation | Gap 13 | P5 |
| AC4 | Each account's own time zone, used for manual entry and as the import default | New | P5 |
| AC5 | Cost method per account (FIFO today; LIFO or average later) | Research "Later" | P6 |

## Prop firms (`/app/prop-firms`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| PF1 | Rule set per prop account with live status against the account's trades | Spec | P5 |
| PF2 | **A challenge with phases:** 1-step or 2-step plus the funded phase. Each phase is linked to its own journal account and has its own rules (step 2 can copy step 1). The funded phase has no target or time limit | Gap 16 + New | P5 |
| PF3 | Phase rules: minimum trading days, period length or none, profit target, max daily loss, max drawdown (static, end of day or trailing, each in % or $), drawdown floor (starting balance or a fixed level), best-day consistency % | Spec + Gap 16 | P5 |
| PF4 | Challenge status active, passed or breached; why it was breached; its evaluation and activation fees | Gap 16 | P5 |
| PF5 | Prop finances: payouts, fees and resets as dated transactions marked reviewed or ignored, with totals invested, earned and net | Research "Later" | P6 |
| PF6 | Pass rate and top breach reasons across challenges | Research "Later" | P6 |
| PF7 | Firm presets (plans, sizes, fees). Our own data only | Backlog #24 | B#24 |
| PF8 | Importing prop fees from a bank feed | New | B#10 |

## Settings

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| SE1 | Profile: name, time zone, base currency | Spec, E30 | P5 |
| SE2 | Trading preferences: instruments you trade, breakeven range in $ or %, settle expired options automatically | Spec + New | P5 |
| SE3 | Tags: categories with colour, tags with an optional description and their trade counts; the default categories are mistakes and custom | Spec + Gap 15 | P5 |
| SE4 | Default stop and target rules per account, instrument and symbols, applied to newly imported trades | Gap 7 | P6 |
| SE5 | Default commission and fee rules per account and instrument, applied to fills that lack them | Research "Later" | P6 |
| SE6 | Email recaps, reminders | Backlog #26 | B#26 |
| SE7 | Subscription and plan limits | Backlog #3 | B#3 |
| SE8 | AI settings and an AI-assistant connector for Keel itself | Backlog #22 | B#22 |

## Dashboard (built in Plan 4)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| DA1 | Saved dashboard layouts with widgets you add and remove | E51 | P6 |
| DA2 | Charts for account balance, drawdown, performance by time of day and by duration | Built (partly) | P6 |
| DA3 | The progress tracker's score and heatmap as a dashboard card | New | P6 (with PT) |
| DA4 | A composite performance score of our own | Backlog #23 | B#23 |

## Getting started

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| ON1 | First-run setup: what you trade, live or prop or both, time zone, base currency. It hides the prop pages for traders who don't use prop firms | New | P6 |
| ON2 | A getting-started checklist (add an account, import trades, set up a strategy) | New | P6 |
| ON3 | Sign-up survey: experience level, what capital you trade (own, prop, not yet), main broker, instruments, goals (journal, analyse, backtest, learn), how you heard of us. It tailors the defaults, for example hiding prop pages | New | P6 (with ON1) |
| ON4 | Paywall, plan choice, retention offers | New | B#3 |
| ON5 | Referral programme | New | B#3 |

## Not for milestone 1

The following stay where the backlog has them:
- the economic calendar (B#25);
- backtesting and backtest scenarios (B#16);
- trade replay (B#15);
- AI assistant, agents and auto-tagging (B#22);
- community spaces (B#20);
- the university (B#29);
- mentor mode (B#19);
- market-data charts on trades (B#13).

## Still to check with real data

E13 needs a check against TradeZella with real trades: breakeven in win %, profit factor with no losses, the drawdown basis, and how fills are grouped into trades. Keel's sample trades are exported in TradeZella's import format, ready for the user to import. Their numbers, read through the connector, then get compared with Keel's.
