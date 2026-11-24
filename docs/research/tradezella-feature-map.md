# TradeZella feature map for Keel

Built on 2026-11-22 from three sources:
- the user's walkthrough of a new TradeZella account (121 screenshots, every module);
- TradeZella's official MCP connector, read-only, which exposes their data model;
- their public help centre, summarised in [tradezella-plan5-features.md](tradezella-plan5-features.md).

**Rule (the user, 2026-11-22):** TradeZella's system is the reference: where it has a behaviour, Keel adopts it, built in Keel's own UI with better UX where possible. We take features and behaviour. The look stays Keel's approved Daylight design, the wording is our own, and no screen layout is copied.

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
| X1 | **One shared filter set**, used by the trade log, dashboard, calendar and reports. It covers symbol include/exclude, side, win/loss/breakeven, open/closed, intraday/multiday, reviewed, rating, strategy (include, exclude, match all, none), tags by category (include/exclude), weekday, month, entry-time and exit-time windows, duration, entry/exit price, size, volume and R-multiple ranges. Changes take effect with Apply, Reset or Cancel | Spec has 6 filters; Gap 6 | P5, Done |
| X2 | Date presets: today, this week, this month, last 30 days, last month, this quarter, year to date, custom | Built (partly) | P5, Done |
| X3 | Pick several accounts at once, with search by name or broker | Built (single) | P5, Done |
| X4 | Display unit switch: dollars, % return, R-multiple (built as seven units in one Display menu, beside the Gross/Net choice, and shown on every money figure) | Spec has gross/net; Gap 5 | P5, Done |
| X5 | Privacy mode that hides every money figure (for screen sharing) | New | P5, Done |
| X6 | Display in ticks, pips or points per instrument (moved into Plan 5) | New | P5, Done |
| X7 | Trade-behaviour flags computed by rules, not AI: back-to-back losses, a winner that turned into a loser, holding a loser too long, scaling in/out, unusually high volume. They work as filters and on trades | New | P6 |
| X8 | Field-level history of edits (entity, field, old value, new value, source: you, import or the app) | New | P6 |
| X9 | Extra metrics: Sharpe, Sortino, max winning/losing streaks by day, avg daily win %, longest trading day | New | P5, Done |
| X10 | Shell polish: collapse the sidebar to icons on desktop, and the Settings navigation likewise (with E52 and E55) | New (recording) | P6 (BACKLOG #50) |

## Trades (`/app/trades`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| TR1 | Summary strip over the filtered set (net, profit factor, win %, avg win/loss), with an option to hide it | Spec | P5, Done |
| TR2 | Column chooser with a saved column order | Gap 4 | P5, Done |
| TR3 | Reviewed / not reviewed on each trade: a column, a filter and a bulk action | Gap 1 | P5, Done |
| TR4 | Bulk actions on selected trades: tag, add to strategy, mark reviewed, export CSV, delete. A trade carries several strategies, so the bulk bar adds or removes one | Gap 2 | P5, Done |
| TR5 | Net ROI column, plus % display | Gap 5 | P5, Done |
| TR6 | Export trades to CSV | Backlog #7 | P5, Done |
| TR7 | Day-grouped view (one card per day with its net and a link to that day's note) and a week view, with a mini month calendar to jump between dates | New | P6 |
| TR8 | Merge and split trades by hand | Gap 3, E10 | P6 |
| TR9 | Move trades to another account | Research "Later" | P6 |
| TR10 | Trade scale: where a trade's P&L sits between the largest loss and largest win of the set, as a trade-log column, a trade-page row, a strip on week cards and an average on reports. The two ends are not settled | New (recording) | P6 (BACKLOG #52, with TR7) |

## Adding trades by hand

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| MA1 | **Manual trade entry from fills.** Pick the asset type (stock, option, future, future option, forex, crypto, CFD), pick or type the symbol, then add fill rows: time, buy/sell, quantity, price, commission, fee. Futures and options also need expiry, strike, call/put and a contract multiplier, entered once per trade. Times use the account's time zone | New (import only today) | P5, Done |
| MA2 | Symbol lists per asset type for autocomplete (forex pairs, crypto pairs, futures roots) | Built (instrument table) | P5, Done |

## Trade page (`/app/trades/[id]`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| TD1 | Stats, fills, rule checklist, tags, rating and notes | Spec | P5, Done |
| TD2 | One note per trade, stored in the notebook's Trade notes folder. It is titled with the symbol and date and shows the trade's stats | Gap 14 | P5, Done |
| TD3 | Several profit targets and stop losses per trade, each with a share of the position (partials), feeding planned R | Gap 7 | P6 |
| TD4 | Chart screenshots attached to a trade (stored locally) | Backlog #5 | P6 |
| TD5 | Swap and financing per trade, read from the import and shown on the trade page and the Overview | New (recording) | B#55 (with E27) |
| TD6 | Choose which fields the trade page lists | New (recording) | B#56 |
| TD7 | Share a trade by link, as a read-only page | New (recording) | B#57 (like NB10) |

## Import (`/app/import`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| IM1 | Fills or closed trades, file time zone, column mapping, preview, undo | Built (engine); UI in spec | P5, Done |
| IM2 | Choose the date format on upload; a wrong format reports the skipped rows | Gap 11, E35 | P5, Done |
| IM3 | Save a column mapping per account and reuse it automatically | Gap 11 | P5, Done |
| IM4 | Import history with fill and trade counts per import, and delete/undo per import | Spec + Gap 11 | P5, Done |
| IM5 | Recognise a known broker's file and offer its preset | Backlog #11 | B#11 |
| IM6 | Broker catalogue: each broker with the methods it supports (sync, file, manual) and the asset types each covers | New | B#10 |
| IM7 | Excel (.xlsx) and .txt files (moved into Plan 5; E25) | E25 | P5, Done |
| IM8 | Broker auto-sync (e.g. MetaTrader with a read-only investor login) | Backlog #10 | B#10 |

## Calendar (`/app/calendar`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| CA1 | Month grid with each day's net, trade count and colour (breakeven range included); weekly totals with day count; monthly summary; a selected day's trades | Spec | P5, Done |
| CA2 | Choose which stats each day shows; a marker on days that have a note | Gap 9 | P5, Done |
| CA3 | Year view: twelve small months, net or gross | Gap 9 | P5, Done |
| CA4 | P&L is booked on the day a trade closes or is partly closed; open trades count nothing until then | Gap 8 | P5, Done |
| CA5 | Save the calendar as an image | New | P6 |

## Reports (`/app/reports`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| RE1 | Overview, plus reports by day and time, symbol, strategy, tags and mistakes, side, duration, R-distribution | Spec | P5, Done |
| RE2 | Up to three chart metrics per report (bar or line), a sortable summary table, and a second dimension to cross-analyse by | Gap 10 | P5, Done |
| RE3 | Wins vs losses: the same stats for winners and losers side by side | Gap 10 | P5, Done |
| RE4 | Compare: two groups, each defined by its own filters, side by side | Gap 10 | P5, Done |
| RE5 | Risk report: position size, R-multiple buckets, drawdown | Gap 10 | P5, Done |
| RE6 | Performance report with a dollars/R switch | Gap 10 | P5, Done |
| RE7 | Options report by days to expiry (moved into Plan 5) | Research "Later" | P5, Done |
| RE8 | Weekly and monthly written recaps | AI | B#22 |
| RE9 | Export a report as a PDF in a print layout, charts and tables included | New (recording) | P6 (BACKLOG #51) |
| RE10 | Performance metrics, second pass: account balance, the daily drawdown series, logged days, average MAE and MFE, breakeven days and trades, as per-period and running series. Average drawdown was built in Task 25 | New (recording) | P6 (BACKLOG #54) |

## Strategies (`/app/strategies`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| ST1 | Rule groups with rules; rule checklist on trades; adherence; stats per strategy and equity | Spec | P5, Done |
| ST2 | When each rule is shown: always, on winners, on losers or on breakeven trades | Gap 12 | P5, Done |
| ST3 | Per-rule stats: follow rate, and P&L, win rate and profit factor when followed | Gap 12 | P5, Done |
| ST4 | Active and archived strategies | New | P5, Done |
| ST5 | A strategy's icon or colour, and a description | New | P5, Done |
| ST6 | Missed trades logged against a strategy | Research "Later" | P6 |
| ST7 | A template gallery of ready-made strategies to copy, written by us (never copied from theirs), with example trades | New | P6 |
| ST8 | Share a strategy, or have strategies shared with you | Backlog #19 | B#19 |
| ST9 | Backtest a strategy on a historical session | Backlog #16 | B#16 |
| ST10 | A cover photo for a strategy, stored locally | New (recording) | P6 (BACKLOG #53, with NB7) |

## Notebook (`/app/notebook`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| NB1 | Folders, daily review, pre-market plan, weekly recap and trade-linked notes | Spec | P5, Done |
| NB2 | Built-in folders that can't be deleted next to your own: Daily journal (daily notes and pre-market plans), Sessions recap (weekly recaps), Trade notes and My notes, by kind; favourites; search | Gap 14 + New | P5, Done |
| NB3 | Trash that keeps deleted notes for 30 days | Gap 14 | P5, Done |
| NB4 | A daily note keyed by its date, showing that day's P&L; a default daily template (prep, session log, end-of-day recap) that every new day starts from; a template manager | Spec + New | P5, Done |
| NB5 | Tags on notes, separate from trade tags | Gap 14 | P5, Done |
| NB6 | Rich text: headings, lists, checklists, bold/italic, links, quotes, collapsible sections, tables, a slash menu | Spec (rich text) | P5, Done |
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
| AC1 | Account list with broker, type, currency, balance, status and prop rules | Spec | P5, Done |
| AC2 | Dated deposits and withdrawals that feed the balance and % drawdown | Gap 13 | P5, Done |
| AC3 | Archive an account, which makes it read-only; clear an account's trades after a confirmation | Gap 13 | P5, Done |
| AC4 | Each account's own time zone, used for manual entry and as the import default | New | P5, Done |
| AC5 | Cost method per account (FIFO today; LIFO or average later) | Research "Later" | P6 |
| AC6 | Search the accounts list by name or broker, filter it, and select several rows | New (recording) | B#59 |

## Prop firms (`/app/prop-firms`)

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| PF1 | Rule set per prop account with live status against the account's trades | Spec | P5, Done |
| PF2 | **A challenge with phases:** 1-step or 2-step plus the funded phase. Each phase is linked to its own journal account and has its own rules (step 2 can copy step 1). The funded phase has no target or time limit | Gap 16 + New | P5, Done |
| PF3 | Phase rules: minimum trading days, period length or none, profit target, max daily loss, max drawdown (static, end of day or trailing, each in % or $), drawdown floor (the level where a trailing drawdown stops trailing and locks: the starting balance, or a fixed level above it; a static drawdown has none), best-day consistency % | Spec + Gap 16 | P5, Done |
| PF4 | Challenge status active, passed or breached (marking the last evaluation step passed saves the funded phase as active; the card reads Passed until a funded account is linked); why it was breached; its evaluation and activation fees | Gap 16 | P5, Done |
| PF5 | Prop finances: payouts, fees and resets as dated transactions marked reviewed or ignored, with totals invested, earned and net | Research "Later" | P6 |
| PF6 | Pass rate and top breach reasons across challenges | Research "Later" | P6 |
| PF7 | Firm presets (plans, sizes, fees). Our own data only | Backlog #24 | B#24 |
| PF8 | Importing prop fees from a bank feed | New | B#10 |

## Settings

| ID | Feature | Keel today | Goes |
|---|---|---|---|
| SE1 | Profile: name, time zone, base currency | Spec, E30 | P5, Done |
| SE2 | Trading preferences: instruments you trade, breakeven range in $ or %, settle expired options automatically | Spec + New | P5, Done |
| SE3 | Tags: categories with colour, tags with an optional description and their trade counts; you make as many categories as you like, each with its own colour; Mistakes is a role a category can have (the Mistakes column and the mistake figures read it), and Custom tags is the default | Spec + Gap 15 | P5, Done |
| SE4 | Default stop and target rules per account, instrument and symbols, applied to newly imported trades | Gap 7 | P6 |
| SE5 | Default commission and fee rules per account and instrument, applied to fills that lack them | Research "Later" | P6 |
| SE6 | Email recaps, reminders | Backlog #26 | B#26 |
| SE7 | Subscription and plan limits | Backlog #3 | B#3 |
| SE8 | AI settings and an AI-assistant connector for Keel itself | Backlog #22 | B#22 |
| SE9 | Opt-in support access to the user's data, off by default | New (recording) | B#58 |

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

## Plan 5, Part 2: gaps found by the recording

Built after comparing a recorded TradeZella account (with Keel's sample data imported) against this branch. Each row extends a row above, in Keel's own UI and words. The longer wish lists the recording adds to the Plan 6 and backlog rows are in BACKLOG.md (#35 to #49, #22, #25 and #26).

| ID | Feature | Extends | Goes |
|---|---|---|---|
| U1 | The display unit decides which trades count: Ticks and Points keep futures, Pips keeps forex, R keeps trades with a risk, and every page narrows its counts and averages to that set | X4, X6 | P5, Done |
| D1 | Open positions listed beside Recent trades on the dashboard | Dashboard | P5, Done |
| D2 | Day win rate and the average win to loss ratio on the dashboard | Dashboard | P5, Done |
| D3 | The last import on the dashboard | Dashboard | P5, Done |
| T1 | The trade summary strip adds the win to loss ratio, breakevens and a running P&L | TR1 | P5, Done |
| T2 | A trade's status column reads its outcome | TR2 | P5, Done |
| T3 | Rows per page and a page jump on the trade log | TR1 | P5, Done |
| TP1 | Rows for each display unit on the trade page | TD1 | P5, Done |
| TP3 | The day's journal reachable from the trade page | TD2 | P5, Done |
| TP4 | Manage tags from a trade | TD1, SE3 | P5, Done |
| C1 | Calendar day panel: winners, losers, volume and profit factor | CA1 | P5, Done |
| C2 | Ticks, pips and points as day stats, within the three-stat cap | CA2 | P5, Done |
| C3 | A month's full picture, one link to its stats | CA1 | P5, Done |
| R1 | Overview: months, trade and day counts, logged days, day figures, hold time, volume and costs, with links to the day or trade behind a figure | RE1 | P5, Done |
| R2 | Average daily win rate is the share of winning days | RE1 | P5, Done |
| R3 | Choose which Overview figures show: a dialog with a checkbox and the current value for every figure, saved in the preferences | RE1 | P5, Done |
| R4 | Performance: a full metric catalogue | RE6 | P5, Done |
| R5 | Expand a chart to full screen | RE2 | P5, Done |
| R6 | Highlights on breakdown reports | RE2 | P5, Done |
| R7 | Breakdown table columns and a column chooser | RE2 | P5, Done |
| R8 | Symbols by instrument and by price | RE2 | P5, Done |
| R9 | More dimensions to cross-analyse by | RE2 | P5, Done |
| R10 | From a report row to its trades | RE2 | P5, Done |
| S1 | Strategy figures follow the date range and the account filters | ST1 | P5, Done |
| A1 | Account rows: Import trades and Add a trade with that account chosen, and the last import (under the account name) | AC1 | P5, Done |
| A2 | Manage accounts from the top bar's account menu | X3 | P5, Done |

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

## Plan 5 delivery notes (2026-11-23)

Every P5 row above is built and passes its journey in `e2e/` on the sample workspace (`trades`, `import`, `calendar`, `reports`, `notebook`, `settings`, `prop` and `pages`). Where Keel moved to match TradeZella during the build, the rows above now say so. In short:
- **Several strategies per trade** (`Trade.strategyIds`), each with its own rule checklist.
- **User-made tag categories** with colours; a mistake is a tag whose category has the mistake role. Tag names are lowercase.
- **Dates:** a trade's P&L books on the day it exits (or partly exits), in the calendar, the reports and the notebook's day card. Trade-level figures keep matching a closed trade by its close date.
- **Display units:** dollar, percent, R, ticks, pips, points and privacy, from one menu; Gross and Net sit in the same menu. Return % and drawdown % are measured on the real balance, deposits and withdrawals included.
- **Notebook:** one note per trade in Trade notes, a daily note created on its first edit, and Trash for 30 days.
- **Import:** fills or closed trades, a mapping saved per account (matched by header name), file encoding detected, Excel files, and undo from Import history.
- **Prop firms:** a challenge has steps and a funded phase, each linked to its own account; the sample workspace reseeds when its seed version changes.

Known gaps left open are in BACKLOG.md: E65 and E67 (calendar and notebook leftovers), the number-check follow-ups E70 to E72, and the deferred minors under "Plan 5 follow-ups".
