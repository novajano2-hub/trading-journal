# Plan 5 screen comps: brief

Plan 5 builds the rest of Keel's milestone 1 app. Before any code, the user approves hi-fi comps of every new screen in one round. The user hated the earlier plain look and approved **Daylight premium** (comp C). These comps extend that world to the new screens. They are not new directions.

## Binding references
- **World:** `.impeccable/mocks/rebrand-app/c-daylight-premium.html` and `.png`, plus the shipped app at http://localhost:3200/app/dashboard, which matches it. Read `DESIGN.md` for the tokens, type ramp, radii, shadows, icon tiles, chips, buttons, segmented control, charts and dark tokens.
- **What each screen must do:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md` §6 (route depths), §7 (domain model, metric definitions, the platform-alignment table, import rules) and `PRODUCT.md` (principles: exact numbers, never fake capability).
- **Bar:** Kraken Pro, Coinbase Advanced, Gemini ActiveTrader, Public. Premium, precise, alive.
- **References:** if the Mobbin tools (`search_screens`) are available, look at one or two references per screen type (trade history tables, P&L calendars, analytics reports, settings tables, rich-text editors) from fintech and trading products. Use them for patterns and quality, never as pixel copies. Never copy TradeZella's or MyTradingJourney's UI.

## Shared rules
- **Shell:** every comp uses the same sidebar and top bar as comp C (copy its markup and CSS), with the right nav item active and the right page title. The global filter chips appear on Trades, Calendar and Reports, the screens they drive. Put the shared CSS in `plan5/shell.css` and link it from each comp, so each screen file holds only its main area.
- **Size:** 1440px wide. Height is 900, or up to 1400 for a screen that scrolls (Reports, Trade detail); the first 900px must still read as the screen.
- **Data:** use the sample workspace as the live app shows it (http://localhost:3200: its accounts, symbols, strategies, tags, rules and dates around 16-20 Nov 2026). Numbers must be plausible and internally consistent: sums add up, signs are right, and profit and loss always carry + or −.
- **Never fake capability.** There are no price candles (market data is in the backlog), no AI, and no broker sync. Where a chart needs market data, show what Keel has instead, such as the fills over time.
- **Anti-slop:** no glows, gradient text, glass, mesh, emoji, decorative dots or eyebrows (small uppercase tracked labels). No em or en dashes in copy. One accent, and colour always paired with a sign or a label.
- **Icons:** Phosphor glyphs (inline SVG paths are fine in a comp), in the comp's 28px tinted tiles by job.

## Screens (one HTML file each, in `.impeccable/mocks/plan5/`)
1. `01-trades.html`, `/app/trades`.
   - A summary strip for the filtered set: trades, net, win rate, profit factor, expectancy.
   - The trades table:
     - **Columns:** time, instrument, side, quantity, entry, exit, net, realized R, duration, strategy, setup and mistake tags, rules kept or broken, rating.
     - **Behaviour:** sortable headers, row selection with a bulk "Tag" action, and an open/closed status switch.
   - Pagination or a count.
2. `02-trade-detail.html`, `/app/trades/[id]`.
   - **Header:** instrument, side, status, net and realized R, plus previous and next trade.
   - **Stats grid:** avg entry and exit, quantity, gross, fees, duration, planned stop and target, planned R and realized R, MAE and MFE.
   - **Fills:** a timeline (price over time, from the fills only) and the executions table.
   - **Journal parts:** the strategy's rule checklist, which the trader toggles kept or broken; tags grouped by setup, mistake and emotion; a rating; and a notes editor.
3. `03-import-map.html`, `/app/import`, step 2 of 4.
   - A stepper: Upload, Map columns, Preview, Confirm.
   - The file chip.
   - Account, source timezone, and whether rows are fills or closed trades.
   - The mapping table: CSV column, Keel field and sample values. An unknown symbol root asks for its point value.
4. `04-import-preview.html`, step 3 of 4.
   - **Summary:** rows read, trades built, duplicates skipped, rows with issues.
   - The issues list.
   - The built trades preview, where a file P&L that differs from Keel's figure by more than $0.01 is flagged.
   - The Confirm action.
   - A line about undo.
5. `05-calendar.html`, `/app/calendar`.
   - A month grid. Each day shows net P&L and its trade count, and is green, red or flat-blue (breakeven range).
   - A weekly totals column.
   - **Month summary:** net, green days, best and worst day.
   - Month navigation.
   - One day selected, with its trades in a side panel.
6. `06-reports.html`, `/app/reports`.
   - Report tabs: Overview, Time, Symbol, Strategy, Tags and mistakes, Side, Duration, R distribution.
   - The overview KPIs: net, win rate, profit factor, expectancy, avg win and loss, largest win and loss, max drawdown, streaks, green-day %.
   - Cumulative P&L and daily P&L bars.
7. `07-report-time.html`, `/app/reports/time`.
   - **Controls:** bucket 5/15/30/60 minutes, entry or exit time.
   - Net P&L by time of day as bars.
   - A weekday breakdown.
   - A table per bucket: trades, win rate, net, profit factor, average.
8. `08-strategies.html`, `/app/strategies`.
   - One strategy per row or card: name, asset classes, rule count, trades, net, win rate, rule adherence, status.
   - "New strategy".
9. `09-strategy-detail.html`, `/app/strategies/[id]`.
   - Rules grouped as entry, exit, risk and management, each with adherence and cost when broken.
   - The checklist.
   - Stats, and this strategy's equity.
   - A link to its trades.
10. `10-notebook.html`, `/app/notebook`.
    - Folders and an entry list: daily review, pre-market plan, weekly recap and notes, with dates.
    - An open daily review: title, the template's sections, rich text, linked-trade chips, and the day's stats.
11. `11-settings-accounts.html`, `/app/settings/accounts`.
    - Settings sub-navigation: Profile, Accounts, Import history.
    - The accounts table: name, broker, type (live, demo, prop evaluation, prop funded), currency, starting balance, status, prop rules set or not, and actions.
12. `12-prop-firms.html`, `/app/prop-firms`.
    - One card per prop account: firm and phase, and status (Active, Near a limit, Breached, Passed).
    - Its tracks: profit target, max drawdown left (with its type), today's daily loss, minimum trading days, and consistency.
    - Rules set up per account.

## Deliverables
- The 12 HTML files plus `shell.css`, each rendered to a PNG of the same name at 1440 width. Write your render script at `scripts/.comp-shot.tmp.mjs`, run it from the repo root, and delete it afterwards.
- Look at every PNG and fix what reads wrong before you finish. All 12 must feel like one product with comp C and the shipped Dashboard.
