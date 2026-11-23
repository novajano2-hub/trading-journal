# TradeZella feature behaviour reference (Plan 5 input)

Method: public help-centre articles only (help.tradezella.com), no login. All text is paraphrased. "(inferred)" marks anything not stated in the source. Where an article was silent, that is recorded as "not documented" so Keel does not invent parity. Article URLs are abbreviated as `HC/<id>` = `https://help.tradezella.com/en/articles/<id>`.

## 1. Trade log and trade view

**Structure.** The Trades page merges the old Daily Journal and Trade Log; tabs Day, Week, All. Toolbar shared across tabs: Start my day, Add trade, select columns, $/% toggle, filters, date range, account switch. Clicking a trade opens a quick preview, with a link to the full trade page. [HC/17096919-understanding-the-trades-page]

**All tab (the log).**
- Four stat widgets above the table: net cumulative P&L, profit factor, trade win %, average win/loss. A hide/show-stats toggle is remembered per browser only. [HC/7143872-understanding-the-all-tab]
- Default columns: open date, symbol, status, close date, volume, net P&L, net ROI, Zella Insights, Zella Scale, reviewed. Columns are chosen from a searchable picker with select-all, reset-to-default, then Update. The full column list is not documented; no column cap stated. [HC/6387251-how-to-customize-the-all-tab-columns]
- Header click sorts ascending, second click descending. [HC/7143872]
- Net ROI = (returned amount - adjusted cost - commissions) / adjusted cost x 100, where adjusted cost per execution = qty x multiplier x price, summed over fills. [HC/8076175-understanding-net-roi-calculation-in-tradezella]

**Filters.** Three layers: main filters, date range (presets or custom), account (one or more). [HC/12417670-using-filters-in-tradezella]
- General: instrument, intraday vs multiday, open vs closed, reviewed vs unreviewed, side, symbol, trade rating, entry price, exit price, R-multiple, position size, volume, and an "excluding" option.
- Tags (by category), Day & Time (weekday, month, duration in minutes, entry time, exit time), Playbook, Zella Insights (beta, AI-derived).
- Conditions combine (AND). Operators not documented; example implies comparisons such as R above 2. "Apply filters" and "Reset all" buttons. Saved filter sets: announced as coming, not available. Most filters apply across tabs, a few behave differently per report.

**Bulk actions** (checkbox select, then Bulk actions): mark reviewed or not, export selection to CSV, merge (2+ selected), split (exactly 1 selected), add to strategy, add tag, transfer to another account, delete. [HC/7143872, HC/5858166-how-can-i-delete-a-trade, HC/6706238-how-to-transfer-trades-between-accounts-in-tradezella]
- Merge/split work on executions: pick which executions to include or separate. Merge only advisable for same ticker, account and instrument/contract type. Imports auto-group executions into trades; merge/split regroup them. [HC/7031683-how-can-i-split-or-merge-a-trade]
- Delete is permanent; notes and tags on the trade go with it; no confirmation or undo described. Deleted notes (not trades) are restorable 30 days from the notebook's recently-deleted area. [HC/5858166]
- Transfer works per selection or whole account; limits and reversibility not documented. [HC/6706238]
- Clearing all trades of an account (single or multi-account) requires listing trade counts and ticking an acknowledgement; trades and their tags are unrecoverable, the account stays. [HC/5851898-how-to-delete-clear-all-trade-data-in-your-tradezella-account]
- CSV export of selected trades exists as a bulk action. (Separate export article exists; not fetched.)

**Trade detail.** [HC/5860216-understanding-the-trade-detail-page]
- Left sidebar lists the day's trades, with a date switcher and collapse; day summary shows net P&L, trade count, win rate, profit factor.
- Quick actions: reviewed toggle, insights count, replay, share.
- Tabs: Stats (customisable field set, SL/PT, manual commissions/fees per execution), Strategy (a.k.a. Playbook: pick one strategy, tick rules followed), Executions (view/add/edit fills, view all), Attachments (screenshots and files).
- Chart with entry/exit markers; settings: saved indicator defaults, arrows at price level vs on candle, pre-market toggle, smooth candles, economic-event filters, options price chart for option trades, running P&L over the life of the trade.
- Two note kinds: a trade note (one per trade) and the shared daily journal note for that day.
- MAE/MFE and star rating are not described in the fetched articles; rating exists as a filter and column (rating filter listed in HC/7143872). (MAE/MFE absence from the public help is itself a finding.)

**Risk fields on a trade.** [HC/12450459-how-to-set-profit-targets-and-stop-losses-in-tradezella-trade-page]
- Profit target and stop loss, each defined by one of six rule types: price, price movement, ticks, points, P&L ($), pips. Optional partial PT and partial SL levels, each with price and quantity.
- Derived: initial target, trade risk, planned R (target / risk), realized R (actual P&L / risk, after close). Without both PT and SL no target/risk/R is computed; the reports note realized R needs only a stop. (Reports articles say average planned R needs PT and SL entered manually; realized R needs a stop.)
- Defaults can be set via rules per account, instrument type and symbols, using any unit and per-level position percentages; applied automatically on future imports and optionally pushed to existing trades with an overwrite checkbox. Example: a $300/$150 P&L rule on MNQ gives planned 2R. [HC/12053164-setting-default-profit-target-and-stop-loss-for-your-trades]

**Open trades.**
- Open positions add nothing to daily P&L until exited; partial exits book P&L on the date of the exit, so one trade can touch several days. [HC/10528734-how-the-dashboard-calendar-calculates-and-shows-daily-profit-loss-p-l]
- Open vs closed is a filter; "open trades" is a count in the reports. Unrealized display on the log is not documented.
- Broker-synced accounts also import same-day trades; auto-refresh about every 3 hours, manual re-sync allowed every 15 minutes. [HC/8542897-broker-sync-same-day-trades]
- Expired options: a setting adds a $0 closing execution on the expiry date for open option trades and re-checks every 24 hours for future imports. [HC/8164984-trade-settings-tab-explained]
- Manual entry saves fills one by one (entry and exit are separate fills; fees go on one fill only); saving an entry-only trade is not documented. Fields: asset type, symbol (with expiry for futures), date/time, qty, side, price, commission/fees, multiplier, expiry, strike. More fills are added from the trade page. [HC/5829532-how-to-add-a-trade-manually-in-tradezella]
- Profit-calculation method per account (FIFO, LIFO, weighted average), set in account edit; default not stated, FIFO suggested. [HC/6826141-different-profit-calculation-methods-in-tradezella-fifo-lifo-weighted-average]
- Manual per-execution commissions/fees edited in the executions list; forex swap can only be entered as a positive fee. [HC/6387098-how-to-manually-add-commissions-fees-in-tradezella]

## 2. Importing

Three routes: broker sync (about 22 brokers), file upload (about 40 broker-specific guides), manual add. Index at HC/9585790-get-your-trades-imported-into-tradezella and the upload collection (`help.tradezella.com/en/collections/3267490-upload-your-trades`).

**Generic CSV** [HC/8239862-how-to-import-trades-from-unsupported-broker-into-tradezella-via-generic-csv-file-upload]
- Two layouts. Execution-based, one row per fill: required date/time (single column or separate date and time), symbol, buy/sell, quantity, price; optional expiration, strike, call/put, commission, fees, spread/asset type. Trade-history, one row per closed trade: required open time, close time, symbol, direction, volume, open price, close price; optional commission, swap, currency, P&L, expiration/strike/call-put (futures need expiry unless in the symbol; options need all three).
- File types CSV (recommended), TXT, XLSX. Asset classes stocks, futures, options, forex, crypto, CFDs. No size or row limits stated.
- The user sets the file's time zone and date format on upload; a wrong date format causes affected rows to be skipped.
- Column-mapping screen opens when headers don't match: choose execution vs trade format, auto-matched fields marked, remaining mapped from dropdowns; the import button stays disabled until all required fields are mapped; mapping can be saved for later uploads to the same account.
- Duplicate handling: not documented.
- An article exists on using an AI assistant to convert an unsupported file into the generic format (HC/16718343, not fetched).

**Import history** [HC/6706087-import-history-on-tradezella]: rows show account, broker, upload date, transaction count, trade count, status. Expanding a row shows errors with tooltip detail. A trash icon undoes (deletes) an import. Status values not enumerated.

**Timezone.** The global display timezone does not clearly govern import parsing; the upload step has its own file-timezone choice. [HC/6497739-how-to-change-your-timezone-in-tradezella]

## 3. Calendar

- Year calendar: day cells coloured win/loss/breakeven (green, red, grey in this article, blue for breakeven in the settings article). Monthly view: P&L per week; monthly summary: win % plus winning and losing trade counts. Click behaviour not documented. [HC/7189346-reports-calendar]
- Dashboard "advanced" calendar widget: note marker on days with a journal entry; user selects which stats appear in the cell (for example R-multiple, ticks); weekly net P&L and number of trading days per week; monthly total P&L and trading days at the top. [HC/9689020-advanced-calendar-widget-in-tradezella-dashboard]
- Daily P&L lands on the close or partial-exit date, never the open date. [HC/10528734]
- Week tab: seven tiles (Sunday-Saturday) with net P&L, trade count, trend arrow; empty days blank; tile click opens a popup with that day's charts, stats and trades; weekly stats (trades, gross P&L, winners/losers, commissions, win rate, volume, profit factor); a "scale" slider placing week P&L between that week's max loss and max profit; weeks expand into a trade table with an added Day column. [HC/17096845-understanding-the-week-tab]
- Day tab: realized net P&L (after fees), trades, winners/losers, win rate, volume (each buy and sell contract counted), profit factor, commissions, gross P&L; mood check-in (five levels, optional reason); intraday cumulative P&L chart with hover-to-trade; mini calendar with hover preview and click-to-jump; expandable chronological trade list; day note. [HC/5829446-understanding-the-day-tab]
- Dashboard $/% views exist (HC/12451049, HC/9858998, not fetched).

## 4. Reports

Reports listed in the collection: overview, calendar, day & time, symbol, win vs losses, compare, options (DTE), risk, playbook, tags; plus filters, "Zella Insights", first-import analysis, weekly/monthly performance reports (last three not fetched). [help.tradezella.com/en/collections/3252845-reports-and-filters]

**Overview** [HC/5829394-reports-overview-section]: date range (default all imported trades), per-stat visibility menu, gross/net switch. Charts: daily net cumulative P&L, net daily P&L. Trade stats: total P&L, average daily volume, average win/loss, trade count, winning/losing/breakeven counts, max consecutive wins/losses, commissions (only when the broker file has them), fees, swap, largest profit/loss, average hold time (all, winners, losers, scratch), average trade P&L, profit factor, open trades, average planned R, average realized R, expectancy (no formula given in that article; the Keel spec cites a separate expectancy article). Day stats: trading days, winning/losing/breakeven days, logged days, max consecutive win/loss days, average daily P&L, average winning/losing day, largest winning/losing day.

**Shared report anatomy** (day & time, symbol, risk, playbook, tags): a performance summary (best, worst, most active, highest win rate), up to three chart metrics with bar or line, a sortable summary table (columns grouped risk/profit/consistency, activity/volume/position, streaks), and a cross-analysis secondary dimension. Metric catalogue common to all: average trading-day and hold duration, longest trade, average daily net P&L, average win/loss, net P&L, profit factor, expectancy, daily net drawdown (average, max), planned/realized R, breakeven days and trades, daily volume, trade count, open trades, logged days, net account balance, long/short counts and win %, outcome counts, daily win %, consecutive streaks, largest net win/loss.
- Cross-analysis dimensions: account, playbook, tag; top 10/bottom 10 symbols, entry price, exit price, instrument; weekday, month, duration; entry or exit time in 5/15/30/60-minute buckets; position size, R-multiple.
- **Day & Time** tabs: Days (weekday), Month, Trade Time, Trade Duration. [HC/11391581-reports-day-time]
- **Symbol** tabs: Symbols (top 10 / bottom 10), Instruments (asset type), Prices (price ranges). [HC/11391905-reports-symbol]
- **Risk** tabs: Volume, Position Size, R-Multiples (grouped into risk-reward categories). [HC/6509413-reports-risk]
- **Playbook**: one row per playbook. Rule-adherence stats are not described in this article. [HC/11595424-reports-playbook]
- **Tags**: one tab per tag category (e.g. mistakes, emotions, setups). [HC/11595729-reports-tags]
- **Win vs Losses**: wins and losses side by side with a statistics block each and a daily net cumulative P&L chart each; no controls described. [HC/7180060-reports-win-vs-losses-section]
- **Compare**: two trade groups, each defined by filters (example: long vs short on one instrument); metrics not described. [HC/7180119-reports-compare-section]
- **Options**: days-to-expiration report with trade distribution by DTE and P&L by DTE; no controls described. [HC/6080476-reports-options-section]
- **Drawdown widgets**: running drawdown, max drawdown with date, average drawdown; $ view uses cumulative P&L only, % view uses running balance including deposits/withdrawals. [HC/8427754-understanding-drawdown-widgets-in-tradezella]

## 5. Playbooks (strategies)

- Fields: name, short description, icon/image, colour; starter templates from named traders can be adopted and edited. Per-strategy stats: expectancy, win rate, profit factor; counts of followed and missed trades; detail view has rules, executed trades, missed trades, notes. [HC/7020769-getting-started-with-strategies]
- Rules live in groups (examples: entry criteria, exit criteria, market conditions; custom groups allowed). Each rule has a visibility condition: show only on winners, losers, breakeven, or always. That setting becomes locked once a trade is linked. No group/rule limit stated. [HC/6986848-what-are-groups-and-rules-in-strategies]
- Recording: on a trade, the user ticks rules followed (manual). Per-rule stats: follow rate, net P&L of trades that followed it, profit factor, win rate. [HC/6986848, HC/5860216]
- Attaching trades: from the trade's Strategy tab, or bulk action on multiple trades. Rule checks on attach not documented. [HC/10254425-how-to-add-trades-to-your-strategy-in-tradezella]
- Missed trades: either a manual trade tagged "missed" (appears in reports, filterable) or a Missed Trades tab inside the strategy (hypothetical date/time, symbol, optional price/fees; excluded from dashboard, calendar, reports). [HC/9737204-how-to-log-missed-trades]
- Delete: permanent; trades remain, the strategy link is removed from them. [HC/8496683-how-to-delete-a-strategy]
- Sharing of strategies exists (HC/6986852, HC/8032349, not fetched).
- No separate "checklist" object is described; rule groups play that role.

## 6. Notebook / daily journal

- Entry kinds: daily journal (day-level) and trade notes (trade-level); created from dashboard, day view, trade page or notebook. Built-in folders: Daily Journal, Trade Notes, Sessions Recap (cannot be deleted); unlimited custom folders with name and icon. [HC/7190696-organizing-and-managing-your-notes-within-your-tradezella-notebook, HC/6387353-how-to-create-or-delete-a-folder-in-the-notebook]
- Templates: per-folder default template pre-fills new notes; picker groups favourites, recommended, own; searchable; create from the picker; usable in notebook, trade preview/detail, day view, dashboard planning. [HC/6191674-how-to-create-a-default-template-for-adding-notes]
- Trade linking: a note can be written first and linked later; exactly one note per trade and one trade per note; unlinking keeps the note in Trade Notes without trade stats. [HC/11517879-create-a-trade-note-before-importing-a-trade-and-link-it-later]
- Deleted notes go to Trash for 30 days. Note tags are separate from trade tags. Tag filter on the list; note search not documented. Public share link per note, revocable. PDF export, version history restore, font size settings, rich text editor exist (HC/6384117, HC/17516125, HC/16750914, HC/8410320, not fetched).
- Daily stats inside an entry: the Day tab figures (see section 3); the trade note shows the linked trade's stats.
- "Start my day" planning/mood flow: a collection exists (collections/19749623-start-my-day), not fetched.

## 7. Settings

- Accounts: active or archived only (no named live/demo/prop types in the article); plan-limited number of active accounts; archived accounts are read-only, do not count toward the cap, and synced ones return unlinked; unarchive is all-or-nothing against the cap; optional groups with ordering; delete is permanent and removes notes and tags. [HC/8164981-account-management-in-tradezella, HC/8688036-archiving-accounts-in-tradezella]
- Balance: an initial balance plus dated deposit/withdrawal adjustments (type, amount, description, datetime), editable; fees and dividends logged as deposits. [HC/7236181-setting-your-account-balance-deposit-withdrawal-amounts-in-tradezella]
- Global: display timezone (affects charts, running P&L, session stats; changes take minutes) and display currency with 11 options (USD, EUR, AUD, GBP, CAD, INR, JPY, CHF, CNY, HKD, CZK). [HC/8164985-global-settings-tab-explained]
- Trade settings: breakeven range with From/To, in $ (default 0/0) or % of each trade's Net ROI, applies to live and backtest trades, blue on calendar; day classification rule not documented. Auto-close expired options toggle. [HC/8164984, HC/6954498-how-to-set-breakeven-range-for-your-trades-in-tradezella]
- Commissions/fees rules: by instrument (option, stock, future, future option, forex, CFD, crypto), symbol or all, per contract or per execution, applied to all/entry/exit fills, separate commission and fee amounts; auto-applied to future imports but skip rows that already carry fees (override available); "apply to existing trades" with optional override; deleting a rule leaves applied fees. [HC/6954370-how-to-set-default-commissions-and-fees-for-your-trades]
- Gross vs net: a P&L switch on reports (HC/5829394). A documented global gross/net setting was not found in fetched pages.
- Tags: tags belong to categories; categories have name and colour; tag has name, category, optional description, 255-char name limit (over-length fails silently); deleting a tag strips it from trades; deleting a category deletes its tags; reset-to-defaults needs typed confirmation. Managed under Settings, Content. [HC/5858184-tag-management-in-tradezella, HC/5944650-creating-and-deleting-tags-and-tag-categories]

## 8. Prop firm tracking (PropFirm Sync)

- Statuses: phase Evaluation or Funded; status Active or Breached (breach is permanent and remains in analytics). [HC/13463750-how-to-create-a-new-challenge-in-propfirm-sync, HC/14502950-how-to-track-your-prop-firm-accounts-in-propfirm-sync]
- Challenge setup: nickname, firm (searchable; manual entry allowed; supported firms prefill), size presets 25K to 200K or custom, 1 or 2 steps, start date, broker, quantity, optional strategies, evaluation and activation fees. Rules per step: min trading days, period length or none, profit target (% or $), max daily loss (% or $), max drawdown (% or $, type static, EOD or trailing), best-day consistency %. Funded phase: max daily loss, min days, max drawdown, consistency; copy-from-step-1 shortcut. Accounts can be auto-created or linked to existing ones. [HC/13463750]
- Progress shown per account: profit toward target, trading days vs minimum, daily loss used, drawdown used, consistency %; balance chart by day/hour/trade; win rate, averages, best/worst day. Failure reason picker (max drawdown, overtrading, time pressure, poor risk management, custom) feeds breach insights. [HC/14502950]
- Dashboard: funded and evaluation balances, total spent, total earned, net and ROI; ROI progression (1W/1M/1Y); finance breakdown by firm, type, size, expense type; pass-rate by firm/type/size/strategy; breach insights; filters by firm, phase, status, size, type, strategy and a date range. Payout logging and Plaid or manual finance import exist. [HC/13463814-how-to-read-your-propfirm-dashboard-metrics-and-data-explained, HC/13463710-getting-started-with-the-propfirm-sync-feature]

## MyTradingJourney

mytradingjourney.com redirects to a domain-sale page and no public help docs were found, so nothing about its behaviour can be reported. A web search turned up nothing attributable to it. Not used as a source.

## Gaps vs Keel's spec

Compared with spec sections 6 and 7 (`docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md`). Already covered by spec: breakeven range, gross/net switch, planned and realized R, time buckets by entry/exit, prop drawdown types and consistency, FIFO, tags with categories, strategy rule groups, notebook folders and templates, import preview and mapping.

Core for milestone 1:
1. **Reviewed/unreviewed flag on trades** (column, filter, bulk action, toggle on the trade page). Not in Trade model.
2. **Bulk actions on the trade log**: add tag, add to strategy, mark reviewed, export selection to CSV, delete, transfer between accounts. Spec lists none.
3. **Merge and split trades** at execution level (single-select split, multi-select merge, same-instrument guard). Spec only has automatic FIFO building.
4. **Trade-log column chooser** with defaults (open date, symbol, status, close date, volume, net P&L, net ROI, reviewed), sortable headers, hide-stats widgets.
5. **Net ROI** metric (formula above) as a trade column and $/% display toggle.
6. **Filters beyond the global set**: status open/closed, intraday/multiday, reviewed, rating, entry/exit price, R-multiple, position size, volume, duration, entry/exit time, weekday, month, exclude. Spec's global filters are date, account, symbol, side, strategy, tags.
7. **Planned PT/SL with six unit types and partial levels** feeding planned and realized R (spec has only plannedStop/plannedTarget/initialRisk).
8. **Daily P&L attribution to the close or partial-exit date**; open trades contribute nothing until exited. Spec does not say how partial exits and open trades hit the calendar.
9. **Calendar cell content**: choose stats shown per day, note marker, weekly totals with trading-day count, monthly summary, week tiles; and the day view with mood, intraday cumulative chart, expandable trades.
10. **Report anatomy**: up to three chart metrics with bar/line, a sortable summary table, performance summary, and a cross-analysis second dimension on every breakdown report; plus Win vs Losses, Compare (two filter-defined groups) and a Day & Time report with weekday, month, time, duration tabs.
11. **Import: save mapping per account, import history with transaction and trade counts, per-import delete/undo, date-format and file-timezone settings on upload, skipped-row handling.** Spec has mapping and history list but not date format, per-import undo semantics, or duplicate handling (TradeZella documents none for duplicates either; Keel must define its own).
12. **Rule "show when" condition** (always, winner, loser, breakeven) and per-rule stats (follow rate, P&L when followed, profit factor, win rate); rule ticks recorded manually on the trade.
13. **Account balance adjustments** (deposits/withdrawals, dated) feeding % drawdown; account archive that makes data read-only and clearing an account's trades with an acknowledgement.
14. **One trade note per trade, linkable after the fact; Trash with 30-day restore**; built-in folders that cannot be deleted; note tags separate from trade tags.
15. **Tag constraints**: category colour, tag description, delete cascade rules, name limit.
16. **Prop firm account fields**: phase (evaluation/funded, steps 1 and 2), trading period length, profit target in % or $, evaluation/activation fees, failure reason on breach, progress bars for target/days/loss/drawdown/consistency. Spec has most rule fields but not steps, period limit, fees or failure reason.

Later:
- Missed trades (strategy-only list or "missed" tag).
- Trade transfer between accounts at whole-account level, account groups and ordering, plan-limited active accounts.
- Per-account default commission/fee rules with apply-to-existing and override; default PT/SL rules per instrument.
- Auto-close expired options at $0; LIFO/weighted-average cost methods.
- Display currency conversion (11 currencies).
- Options DTE report; pass-rate and breach insights; prop finances (payouts, expenses, ROI progression, bank import).
- Share trade, share note, share strategy; PDF export; note version history; rich-text and font settings.
- Broker sync with its refresh cadence; Zella-style AI insights; Start my day planning and mood flow; trade replay; saved filter sets (not yet shipped by TradeZella); dashboard widget templates.

## Terms of Use check (2026-11-21)

Read before deciding on a paid walkthrough: https://app.tradezella.com/information/terms (effective 6 Nov 2026). Paraphrased:
- Section 10 bans accessing the service by automated means, with one exception: an AI assistant connected through TradeZella's own connector. An agent driving the web app in a browser pane falls under the ban.
- Section 11 licenses the service only for the subscriber's personal trading activity. Subscribing to study the product for a competing one sits outside that licence.
- Section 10 also bans reverse engineering and commercial use without written consent.

Route: no agent walkthrough of the web app (Section 10). TradeZella's official MCP connector is the AI access route their terms allow (https://mcp.tradezella.com/mcp, read-only by default; sees trades, reports, strategies, notes and stats; cannot add, edit or delete trades; 30 requests a minute, 1,000 a day). The user may connect it read-only to an account holding imported trades; findings from it are recorded below as behaviour and data shape only. Licence scope (Section 11) was flagged to the user, who decides on their own use. Not legal advice.

## Number check against TradeZella (2026-11-23)

Keel's sample futures account (574 trades, 1,232 fills) was exported in TradeZella's execution-based generic CSV, imported into TradeZella by the user, and read back through TradeZella's official connector. Keel's figures come from the same generated trades (time zone America/New_York).

| Figure | TradeZella | Keel |
|---|---|---|
| Trades, open | 574, 2 open | 574, 2 open |
| Wins / losses / breakevens | 289 / 283 / 0 | 289 / 283 / 0 |
| Net P&L | $11,063.85 | $11,063.85 |
| Win rate | 50.52% | 50.52% |
| Profit factor | 1.22969 | 1.22969 |
| Largest win / loss | +$429.80 / −$390.20 | +$429.80 / −$390.20 |
| Average win / loss | $204.96 / −$170.21 | $204.96 / −$170.21 |
| Expectancy | $19.34 | $19.34 |
| Longest win / loss streak (trades) | 7 / 8 | 7 / 8 |
| Green / red days | 70 / 49 | 70 / 49 |
| P&L per day | 119 days | 119 days, every day equal to the cent |
| Max drawdown | −$2,168.55 (daily buckets) | daily-bucket equivalent −$2,168.55; Keel's headline figure is trade by trade |

What this settles:
- **Fill grouping (E13):** TradeZella builds the same 574 trades from the fills, so Keel's FIFO grouping and partial-exit handling agree.
- **Fees and P&L:** agree to the cent.
- **P&L by exit date:** every day agrees, so the ruling holds.
- **Breakevens:** none in this file, so the breakeven-in-win-rate rule is not exercised (still to check with a file that has $0.00 trades).

One difference of definition:
- **Max drawdown:** TradeZella's figure is the drawdown of the daily P&L curve, "max daily drawdown". Keel's headline is measured on closed-trade equity, trade by trade. Per the user's rule (TradeZella's system is the reference), Keel's headline max drawdown should use the daily curve. Scheduled as a follow-up fix after Task 20.

**Forex file (146 trades, imported into the same TradeZella account):**
- These agree: trades and open count (146, 1 open), wins and losses (71 / 74), win rate (48.97%), streaks (6 / 5), and net P&L for EURUSD (+$209.00), GBPUSD (+$2,877.10) and AUDUSD (+$1,655.60).
- **USDJPY differs by 6 cents in total:** TradeZella −$1,282.19, Keel −$1,282.13.
  - The cause shows trade by trade. 11 of 45 trades differ by one cent, and all 11 closed in two or more exit fills.
  - Both apps convert each exit's yen P&L at that exit's own rate.
  - Keel rounds each exit's dollar amount to the cent before summing, for example −$221.29 + −$174.65 = −$395.94.
  - TradeZella sums the unrounded amounts and rounds once: −$395.9335, then −$395.93.
  - Keel's spec says money is rounded at the trade level, so Keel's per-exit rounding is the bug.
  - Fix: sum the converted exits unrounded and round once per trade, then share the cents among the exits, with the leftover going to the last one. Scheduled with the drawdown alignment.
- TradeZella's trade list shows the **last** exit fill's price as "exit price", where Keel shows the average exit. That's a display convention only; P&L doesn't depend on it.

Still to check: the stocks, options and crypto file (option multipliers, expiry). Its import was stuck at 46% when last checked.

## Sources not fetched or unreachable

- mytradingjourney.com: redirects to a domain broker page; no docs found.
- Not fetched for budget (known to exist): Zella Insights, first-import analysis, weekly/monthly reports, dashboard views and percentage view, shared strategies, notebook editor/PDF/version history, 2FA, billing, PropFirm payout and finance import articles, export-to-CSV article, trade-sharing article, entry/exit-arrow article, per-broker guides.
- No fetch failures on help.tradezella.com. Articles that did not document a requested point are noted inline as "not documented".
