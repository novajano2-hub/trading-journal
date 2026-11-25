# Plan 6A: Daily routine, design

**Date:** 2026-11-25. **Branch:** `m1-p6a`. **Backlog:** #35, #36, #37, #47, with E50. **Feature map:** PT1, PT2, DA3, DV1, TR7, ON1 to ON3.

**Authorities, in order:**

1. The user's parity rule: Keel copies TradeZella's (TZ) behaviour and adds no feature of its own. Where TZ's behaviour is confirmed, Keel follows it.
2. The behaviour spec, `.superpowers/research/tradezella/plan6a-behaviour.md` (git-ignored), cited as "spec §n", and the controller's resolutions to the builder check, `plan6a-builder-resolutions.md` in the same folder. The spec's source tags are kept:
   - `[rec Sxx]` is the recording, `[inv-n NNN]` the screenshot inventories, `[help NNNN]` a help article and `[connector]` TZ's read-only connector;
   - **help centre** marks behaviour in TZ's help that the user's account did not show (in scope, as TZ's current product);
   - INFERRED marks a reading drawn from the evidence.
3. `DESIGN.md` and `PRODUCT.md`.
4. The Plan 5 rulings (the Rulings table of `docs/superpowers/plans/2026-11-22-m1-p5-rest-of-the-app.md`, and `2026-11-22-m1-p5-rulings.md`).

Where TZ is unknown this doc decides, as a **Keel's call (TradeZella unknown)** with an id (K1 to K56, all listed in §6.1).

## 1. Intent and why

TZ's daily routine is a loop [help 10352042, 16934706, 13863136]:

1. pick the day;
2. plan in its note;
3. trade and import;
4. review the day against a few discipline rules;
5. finish the day;
6. watch a streak and a heat grid grow.

Keel has the parts around it (daily notes, the calendar, strategy rule checks, goals) but not the loop. Plan 6A rebuilds TZ's four modules for it, with TZ's behaviour in Keel's design:

- the progress tracker and its dashboard card (#35);
- the day page, in plan and review modes (#36);
- the trade log grouped by day and by week, with a mini calendar (#37);
- getting started: welcome, sign-up survey, first preferences and the Home checklist (#47).

All four run on local data, and together they make the third product principle, the trader's own rules as the yardstick, a daily habit.

## 2. Goals, non-goals, anti-goals

**Goals**

- TZ parity for the four modules. That includes the help-centre features:
  - the day page's stage navigation: planning, trading, import and review [help 16934706];
  - the start-trading timer;
  - finish my day, which locks the whole day;
  - the mood check-in;
  - the day rating;
  - the week-tile popup;
  - the mini-calendar hover.
- One note per date, shared by the day page, the day-view dialog, the trade page's Daily note and the Notebook.
- A safe upgrade for every existing Dexie database. A sample workspace that shows every state.

**Non-goals** (each stays in the backlog):

- **AI:** market sentiment, session review, the auto-tagger, Explore's agents card (#22, out at the user's word).
- **Email:** the streak reminder. There is no server; it goes with #26.
- **Price-path features:** replay (#15).
- **The week card's scale strip** goes with trade scale (#52) in 6B, once its two ends are defined.
- **Data Keel lacks:**
  - the week events list (#25);
  - prop-firm sync (#12).
- **Day insights:** with #40.
- **Commercial screens:** the paywall and the promo [gaps rows 100, 119].
- **Anything TZ does not have.**

**Anti-goals**

- No TZ wording, layout, icons or emoji. The streak face and the mood emoji become words or plain glyphs.
- No control that does nothing. What Keel can't run is left out, or says plainly that it isn't live.
- No typed-in scores. Scores derive from trades, notes and day records. Only custom-rule ticks and the lock are entered by hand.
- No rescoring of past days when rules change.

## 3. Constraints

- **Local-first.** Everything lives in Dexie: no server, accounts, email or uploads. Screenshots are Blobs in IndexedDB.
- **Design system.** The rules that bite here:
  - design G, graphite dark, no icon tiles;
  - new modules go in More (the tab bar stays Dashboard, Trades, Calendar, Reports, More);
  - hue jobs (accent for adherence and what is chosen, green and red for money and kept or broken);
  - "None" for empty values;
  - no em or en dashes; numeric ranges "a to b";
  - two-line rows instead of tables below `sm`;
  - a MetricTip on every metric, its text in `src/content/metric-definitions.ts`;
  - Privacy hides every money figure, tracker values and chart labels included.
- **TZ parity.** Keel's calls only where TZ is unknown (§6).
- **Comps first.** Impeccable comps for each module, light and dark, at 390 and 1440, before it is built.
- **Migration safety** (§4.3):
  - no existing row is rewritten;
  - new tables start empty;
  - new fields are optional and default when unset;
  - the sample reseeds by version, and My workspace never does.
- **Plan 5's Global Constraints carry over:**
  - the toolchain;
  - Next.js docs first (`params` is a Promise);
  - components read hooks only, and `src/domain` stays pure;
  - hand-rolled SVG charts with text alternatives;
  - WCAG 2.2 AA and 44px coarse targets;
  - no overflow from 390 to 1680;
  - test-first domain work;
  - test, typecheck and lint per commit, and a build per module.
- **Performance,** on the ~1,230-trade sample:
  - filtering plus any recompute stays under 50 ms, including scoring the whole sample history and grouping the Day and Week views;
  - the Day view renders 20 cards at a time and the Week view 8 weeks;
  - tables page at 50 rows;
  - thumbnails load lazily, and their object URLs are revoked on unmount.

## 4. Approach

### 4.1 The split

The user split Plan 6 into three sub-plans:

- **6A, the daily routine:** #35, #36, #37 and #47.
- **6B and 6C:** the other Plan 6 rows, each scoped in its own spec.

6A goes first: its modules depend on each other and on nothing later. Where it meets a later row, it stops at a seam:

| Row | The seam |
| --- | --- |
| #40 | Insights on day cards |
| #43 | Images in notes, which will reuse 6A's screenshot store |
| #46 | The tracker card becomes a removable widget |
| #50 | The slim rail on the day page |
| #52 | The scale strip |

### 4.2 Order inside 6A

| Step | Work | Why here |
| --- | --- | --- |
| 1. Foundations | Types, Dexie v3, tracker scoring in `src/domain` (test-first), day records and the day lock, hooks, seed v5, the shared start-my-day date popover | Every surface reads the score, the day record and the lock |
| 2. Tracker (#35) | Page, rules dialog, dashboard card | #36 waits on #35, and the day page's rules card is the tracker's checklist |
| 3. Day page (#36) | Stages, plan and review, rules card, screenshots, timer, rating, finish | Step 4's day cards link into it |
| 4. Day and Week views (#37) | Day cards, week cards, mini calendar, note dialog, mood | Reuses the day page's note binding and the day record |
| 5. Getting started (#47) | Welcome, survey, preferences, default account, Home | Independent. Last, because its checklist links to the modules above |

### 4.3 Storage at a glance

Dexie version 3 adds three workspace tables. All join `DATA_TABLES`, so a workspace clear and a sample reseed cover them.

| Table | Key | Holds |
| --- | --- | --- |
| `trackers` | `[workspaceId+id]`, one row, id `tracker` | `startedOn`, and `versions[]`. Each version: `from` date, `tradingDays`, built-in rule settings, custom rules |
| `days` | `[workspaceId+id]`, id `YYYY-MM-DD` | `noteStartedAt`, `session`, `ticks`, `finishedAt`, `locked`, `mood`, `rating` |
| `dayShots` | `[workspaceId+id]`, index `[workspaceId+date]` | `date`, `blob`, `type`, `name`, `size`, `createdAt` |

**New optional fields** (no migration):

- `JournalEntry.templateId`;
- on `UserPrefs`: `onboarding`, `firstName`, `lastName`, `username`, `dayColumns`, `weekColumns`, `seenTips`.

**Three Keel-written daily templates** (K32) join `builtInTemplates`, never as the default. `writeBuiltIns` already adds missing built-ins on open, so every workspace gets them as new rows, with no migration.

**The upgrade writes one thing:** the onboarding flag, for a user who counts as onboarded (K54), so an existing user never meets the first run.

**A migration test:**

1. opens a v2 database with data in both workspaces, then upgrades it;
2. asserts every v2 row unchanged and the new tables empty;
3. asserts the flag is set for each onboarded signal, and unset on a fresh database.

**Other storage rules:**

- `SAMPLE_SEED_VERSION` goes to 5.
- The tracker row is created lazily, in one transaction, on the first read of any tracker surface. Creation is idempotent: two tabs never make two rows.
- **The lock is enforced in the write path.** For a finished date, the repositories refuse writes to:
  - the date's daily note;
  - its ticks, rating and mood;
  - its screenshots.

## 5. Modules

### 5.1 Progress tracker and its dashboard card (#35)

**TZ's behaviour** (spec §1)

**Page**

- The header holds the date range and the account picker, nothing else [rec S08].
- Three tiles:
  - the current streak;
  - the period score, as a half gauge;
  - today's progress, as met over active, with a bar [rec S08; rec S54].
- Today's checklist card holds the rule rows and a start-my-day button only [rec S08]. Each rule row shows its live value against its limit and a status mark.
- The heat grid, with a Today control [rec S08].
- The rules table:
  - columns: status, rule, condition, rule streak, average performance, follow rate;
  - an Edit rules control [rec S08].

**Rules dialog** [inv-3 102-106; help 10371695, 12141413]

- A notice that edits score from today on.
- Trading days, Mo to Su, with Mo to Fr on [connector]. Rules apply only on the selected trading days.
- A streak email reminder.
- Three stages, prepare, trade and reflect, each with an add-rule row: a name, and weekdays that default to Mon-Fri.
- Reset all progress, behind a second confirmation:
  - it deletes streaks, rules and "achievements";
  - it never touches trades.
- Cancel, and Save changes, which stays disabled until something changes.

**Built-in rules** [connector settings; inv-3 102-103; help 10371695]

| Rule | Stage | Default | Limit |
| --- | --- | --- | --- |
| Journal the day by a time | prepare | on | 09:30 |
| Trade within set hours | trade | off | 09:00 to 12:00, zone as a GMT offset |
| Every trade has a strategy | reflect | on | On or off only: 100% of the day's trades |
| Every trade has a stop | reflect | on | On or off only: 100% of the day's trades |
| Max net loss per trade | reflect | on | $100, or % of balance |
| Max net loss per day | reflect | on | $100, all accounts |

**Scoring** [connector day, summary]

- **Points.** An active rule scores 0 or 1 a day. The day's total is the number of rules active that day.
- **Unscored days.** Non-trading days are never scored, custom rules included, and the grid leaves them blank [help 10371695].
- **No trades.** A trading day with no trades scores 0 on every rule, the daily cap included. A profitable day earns the cap's point.
- **Values.**
  - A percent rule holds the share of the day's trades that meet it.
  - The cap holds the day's net loss.
- **Per rule.**
  - Average performance is the mean daily score.
  - Follow rate is followed days over scored days.
  - The rule streak is the run of followed days.
- **Summary.** It also has the current streak, the best streak, and perfect days as "x of N".
- **History.** Edits never rescore past days [inv-3 102].

**Help centre** [help 10371695, 16934706, 10352042]

- Finish my day (on the day page, 5.2) locks the day, and an unticked rule stays unticked.
- Locked days count toward the streak and the grid.
- Custom rules are ticked by hand.

**Grid** [rec S08; rec S02; help 10352075]

- Weekday rows, week columns and month labels.
- Five shades from less to more. Weekends are blank.
- Today is marked on the page only.
- It runs from the tracker's first day to today.

**Card** [rec S02; inv-1 035; help 10352075]

- The grid, and today's score as "x of y" with a bar.
- A link to the page, and a checklist button.
- In TZ it is added through the dashboard template editor.

**States**

- **Nothing done yet** [rec S08]:
  - 0 days;
  - an empty gauge;
  - 0 of 5;
  - pending marks;
  - a failed time rule once its time has passed.
- **A non-trading today:** an empty state pointing at the trading days and at manual rules, and 0 of 0 [inv-3 101].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Scoring | `localDate`; the trade's `strategyIds`, `plannedStop` and `net`; `balanceAt`; Plan 5's realized net by exit; the "more than the limit" test of `dailyLossProgress` | `src/domain/tracker/` (day score, aggregates, streaks, grid steps), pure, test-first |
| Page | The date-range chip and Keel's global account selection, `MetricTip`, `ConfirmDialog`, `MorphDialog` (scroller, fixed footer) for Edit rules, `TaskCheckbox` for ticks | `/app/progress`, with sidebar and More entries |
| Heat grid | The Goals card's day grid, as a pattern | `HeatGrid`, for the page and the card |
| Card | The dashboard card shell | `ProgressCard`, shown by default (K21) |
| Start my day | None | `StartMyDay`, the date popover, shared with #36 and #37 |

**Accounts.** The page, its scores and the dashboard card follow Keel's global account selection, as TZ's tracker has an account picker.

The "Your plan" and Goals cards are Keel's own and stay unchanged and separate (K22).

**Data**

- **The `trackers` row:** `startedOn` (K13), and `versions[]`, newest last.
- **A version:** `{ from, tradingDays, builtIn, custom }`.
  - `builtIn` holds:
    - `startBy {on, time}`;
    - `hours {on, from, to}`;
    - `strategy {on}` and `stop {on}`;
    - `lossPerTrade {on, unit: 'amount' | 'percent', value}`;
    - `lossPerDay {on, amount}`.
  - `custom` is a list of `{ id, name, stage, days }`.
  - A save replaces any version dated today (K16).
- **A day's score** is derived. Per rule: `{ points, score, status: met | failed | pending }`, from the version in effect that date. A finished day rebuilds it from `days.locked` (K3).
- **The tracker's parts of a `days` row:** `noteStartedAt`, `ticks` (by custom rule id), `finishedAt`, `locked`.

**States**

- **Loading:** skeletons, no figures.
- **A new tracker, or one just reset:** a streak of 0, period score None, every rule pending, and a grid of today alone.
- **A day in progress:** live values. Rules stay pending until decided (K19).
- **Today not scored:** the empty checklist links to Edit rules, and today reads 0 of 0.
- **Unscored dates** (K20): before the tracker's start, on non-trading days and in the future.
- **No trades:** the time rule and custom rules can still be met. Trade rules score 0, as TZ's do.
- **A finished day:** the rows are read-only.

**Phone**

- The tiles form one strip of compact figures; the gauge shrinks to its figure.
- The checklist, the grid and the rules follow, each a full-width card. The grid fits what it can, with back, forward and Today.
- The rules become two-line rows. Line one is the rule and its follow rate; line two holds the condition, streak and average.
- Edit rules is a full-height sheet with a fixed footer.
- The page is in More.

### 5.2 Day page: stages, plan and review (#36)

**TZ's behaviour** (spec §2)

**Shell**

- Two routes per date, plan and review. A switch moves between them and keeps the date, and each switch adds a browser history entry [inv-2 054, 060; rec S23; rec S23 zoom].
- A pinned header [rec S23]:
  - the date, a plain label in plan and a picker in review;
  - the switch;
  - Import trades, on both modes;
  - the account picker, in review only.

**Plan mode** [rec S23 9:04; inv-2 060-061]

- **Note card:** a line naming its template, a change-template link, and the editor.
- **Rules card:** the tracker's active rules, each with its status mark. The time rule shows its time. A link leads to the tracker.
- **Screenshots card:** a drop zone, for PNG or JPG up to 10 MB.

**Review mode** [rec S23 8:46, 8:54]

- **Trades card:** a count, then symbol, outcome, entry, exit, net and Net ROI. It has a fixed height and scrolls inside itself.
- **Tiles:** net P&L, win rate and session.
- **Rules and note cards.** Nothing sits below the note.

**Help centre** [help 16934706]

- **Stage navigation.** Planning, trading, import and review run across the top.
- **The timer.** A start-trading control beside the date runs a session timer. While it runs, the stage reads as trading with an elapsed clock, and the timer feeds Session.
- **Day rating.** In review mode; it works on days without trades.
- **Finish my day.** On the review stage only. Every stage stays editable until the day is finished. Finishing locks the whole day: the rules, note, rating, mood and screenshots. No unlock is shown anywhere.

**The note** [help 5858190; connector; inv-3 083, 085; rec S23]

- It is the date's one daily note, kept in Daily journal.
- It is shared with the day-view dialog and the Notebook (INFERRED).
- It saves itself (INFERRED).
- The day-view dialog's Templates control inserts a saved template [help 5858190].

**Session**

- Session is not first entry to last exit. A seven-trade day read 0m [rec S23 8:46], and the help ties Session to the timer.

**Getting there**

- Start my day opens a month popover with today ringed and future dates enabled. A past date opened review [rec S22; inv-2 054].
- The Trades page offers the same flow [help 17096919].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Stages | `Segmented` look | A stage bar: planning and review are the two routes, trading is plan mode with the timer running, and import opens Keel's Import page |
| Note | `DayNote` and its autosave (`trade-journal.tsx`), `dailyNote(ws, date)`, `findDailyEntry`, the default daily template, `templates-dialog.tsx` | Templates and Change template (K32), which writes `templateId`. The `noteStartedAt` stamp, written in the journal save's transaction from any editor (K9) |
| Rules card | The tracker's day score, `TaskCheckbox`, the kept and broken marks | `DayRules`, shared with the tracker's checklist |
| Trades card | The trade log's cells (instrument, `StatusChip`, formatters, `TradeLink`), `PhoneRows`, the global account selection | The day's trade set (K34) |
| Tiles | The display formatter and `MetricTip` | Session from the day record, never `dayLengths` (first entry to last exit) |
| Screenshots | The import drop zone's look | The `dayShots` store, thumbnails, viewer, delete |
| Timer, rating, finish | The look of `RatingRow` | Day-record writes, and the lock |
| Locked state | None | A read-only locked state in every editor bound to the date's note: the day page, the note dialog, the trade page's Daily note and the Notebook |
| Routes | Next 16 `params` | `/app/day/[date]/plan` and `/review`. `/app/day/[date]` redirects by K26 |
| Notebook New | The New menu | It no longer offers Pre-market plan; existing entries stay readable (U3) |

**Accounts.** The review trades and the rules card follow the global account selection. The normal shell stays, and Import links to Keel's Import page (K33).

**Data**

- **The day page's parts of a `days` row:** `session { start, end? }`, `rating` (1 to 5), `finishedAt`, `locked`.
- **Elsewhere:** `dayShots` rows, `JournalEntry.templateId` and `UserPrefs.seenTips`.

**States**

- **Review, no trades:**
  - an empty line with an Import link;
  - net $0.00;
  - win rate and session None.
- **Unscored dates** (K20):
  - before the tracker's start, the rules card says the day isn't tracked yet and when the tracker started, and the day can't be finished;
  - a non-trading day says so;
  - a future day opens plan mode only, with no rules state, timer or finish.
- **A finished day:** every stage is read-only, rules, note, rating, mood and screenshots, and the finish time shows.
- **First visit to plan mode:** a one-time tip by the template control. It is TZ's coachmark [inv-2 054], in Keel's words.
- **A refused write:** a lock, or a screenshot over quota, shows the neutral "Couldn't save".
- **A bad URL date:** the plain-page state, with a link to today.

**Phone**

- **Header:** the date and the timer control on top, with the stage bar at full width below.
- **Import:** in the stage bar and the trades card.
- **Plan:** the note, then the rules, then the screenshots, two thumbnails to a row.
- **Review:**
  - the tiles as one strip;
  - the trades as two-line rows, five then "Show all", with no inner scroll;
  - then the rules and the note.
- **Finish my day:** at the foot of the review stage's rules card.

### 5.3 Trade log by day and by week (#37)

**TZ's behaviour** (spec §3)

**Views**

- Day, Week and All sit under one switch, each a route [rec S24].
- The shared toolbar holds columns, unit, filters, date range and accounts. The state lives in the URL [rec S28-29].
- The header holds start my day and add trade.
- The switch, the toolbar and the mini calendar stay pinned [rec S26].

**Day view** [rec S24; rec S26; rec S28; help 5829446; inv-2 052]

- Cards, newest first, for days with trades or a note (INFERRED). An empty recent day gets no card [rec S26 9:46 zoom]. Cards start collapsed [rec S24, S26 zoom].
- A collapsed card holds:
  - the date and the net P&L, always net after costs;
  - quick actions, and add or view note;
  - an intraday cumulative P&L chart: green above zero, red below; hover shows the trade, and a click enlarges it;
  - a stat grid: total trades, gross P&L, winners and losers, commissions, win rate, volume, profit factor.
- Expanded, it adds the trade table: open time, ticker, side, instrument, net, Net ROI, realized R, strategy, and tags with a "+".

**Figures** [rec S24; rec S26; help 5829446, 17096845]

- **Sums:** net and gross sum the closed trades only.
- **Counts:**
  - total trades includes open trades;
  - winners and losers count closed trades.
- **Ratios:**
  - win rate is winners over (winners + losers);
  - profit factor is gross profit over gross loss, after costs.
- **Commissions:** gross minus net.
- **Volume:** both sides.
- **Open trades:** a muted "(open)" before the amount, with a bracketed ROI.

**Week view** [rec S24 9:34, 9:36; rec S30]

- A card for each week that has trades, latest first: the span and the net.
- Seven weekday tiles. Each shows a trend mark, the weekday, the date, the net and the count, with a green or red tint. A day without trades is blank.
- A daily P&L bar chart, then the stat grid.
- The week's trade table, with a Day column. The column is there by default: it appeared on its own, without the column chooser [rec S24 9:34, 9:36 zoom].
- The first week card starts expanded [rec S24 9:34 zoom]. The current week gets no card while it has no trades [rec S24 9:34; rec S26 9:46 zoom].
- A scale strip, out of 6A (#52): its marker sits at the week net's linear share of the span between the two ends. The ends are unknown [rec S24 9:36; rec S29 12:11 zoom].
- Under a one-day filter, the card shows the week that holds the day. Only that day's tile is filled and the stats cover the filtered trades, but the table still lists the week's other days [rec S29 12:11].

**Mini calendar** [rec S24; rec S28; rec S29]

- Arrows and a weekday header.
- Underlines by the sign of the day's net. Today is bold; the selected day is outlined.
- A click filters the list to that day, and the date chip gains a clear control.

**Help centre** [help 5829446, 17096845]

- **Quick actions:** mood, insights, review, replay, and add or view note.
- **Mood:** five values from very negative to very positive, with an optional note. It shows only on days logged through start my day.
- **Mini-calendar hover:** previews the day's P&L and count.
- **A weekday tile:** opens the day's charts, stats and trades.

**Note dialog** [rec S26 10:02; help 5858190]

- Templates, view in notebook, a star, a menu and close.
- A summary row of date, net, and "n trades, x% win rate". It expands to the trades.
- The editor, and Save.

**Other**

- A trade row opens the trade [help 17096919; rec S31].
- A tags "+" opens a tag dialog [rec S26 10:40].
- A column chooser [help 5829446].
- Replay is paywalled [rec S20].
- With no trades: an illustration, a line and Import [inv-2 051].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Routes | `/app/trades` stays All, so every report and drill-down link still lands there. The filter bar, Display menu, account switcher, `?per=` paging | `/app/trades/day` and `/app/trades/week`. The sidebar and tab bar's Trades opens Day (K36) |
| Grouping, stats | The trade log's date rule, `tradeVolume`, the breakeven classifier, the display formatter, `RatioText` | `src/data/day-log.ts`: day and week groups, the seven stats, the intraday series |
| Charts | The Performance card's SVG style; `MorphDialog size="full"` | The intraday chart, and the week bars on the `BreakdownChart` pattern |
| Tables | `columns.tsx` cells, `ColumnsMenu` (saved per table), `TagPicker`, `PhoneRows` | The day and week column sets |
| Note dialog | `DayNote`'s autosave, `templates-dialog.tsx`, `favorite`, Trash | `DayNoteDialog`, read-only on a finished day |
| Mini calendar | The `weekStart` pref, `rotateFromWeekStart` | `MiniCalendar` |
| Quick actions | None | The mood control, and a review link to the day page |
| Calendar page | The day panel's trades link | It now opens the Day view on that date, as TZ's view details does [rec S18-19] |

**Data**

- `days.mood`: `{ value 1 to 5, note? }` (K44). Locked on a finished day.
- Prefs `dayColumns` and `weekColumns`.
- All else is computed.

**States**

- **No trades or notes:** Keel's empty state, with Import and Add trade.
- **Filters match nothing:** "No trades match these filters." with Clear filters.
- **A note but no trades:** a card with the date, a no-trades line and View note.
- **Open trades only:** net None and no chart. The total counts the open trades.
- **A one-day filter:** Day shows one card. Week behaves as TZ's does (above).
- **A narrowing unit:** as in the trade log.
- **Other currencies:** left out of the sums and shown apart (K24).

**Phone**

- **The switch:** full width.
- **The mini calendar:** a Calendar button opens it as a sheet. A pick closes the sheet and filters.
- **A day card:**
  - the date and net, with 44px glyph quick actions;
  - a full-width chart;
  - a two-column stat grid;
  - two-line trade rows.
- **A week card:**
  - one row of seven narrow tiles: weekday initial, day number and compact net, with the count in the tile's label and its dialog;
  - then the bars, the stats and two-line rows.
- **Dialogs:** full-height sheets.

### 5.4 Getting started (#47)

**TZ's behaviour** (spec §4)

**First run** [inv-1 001-016]

1. A welcome screen.
2. A six-step survey.
3. The paywall (out).
4. Home, with a preferences dialog.
5. A time-zone notice.
6. A promo (out).

**Survey** [inv-1 002-008]

- **Chrome:**
  - a progress bar;
  - Back from step 2 on;
  - Continue, disabled until the step is answered;
  - a log-out link;
  - a social-proof strip.
- **Steps:**
  1. years trading: one of four bands;
  2. capital traded: personal, prop, not yet (several);
  3. main broker: type-ahead, one;
  4. instruments: stocks, options, forex, crypto, futures, CFD, other (several);
  5. goals: journal, analyse, backtest, learn (several);
  6. how you heard: one of ten sources, free text for other.

**Preferences** [inv-1 013-015; inv-3 108]

- First name, last name and username, all required.
- A currency, USD first.
- A time zone, US/Eastern by default. A zone change re-times how trades show.

**Home** [rec S01; inv-1 016]

- **A greeting:** the time of day and the first name.
- **A getting-started card:** "n of 3 complete" with a bar, over three prop-led steps:
  1. sync your prop firm;
  2. create your first challenge;
  3. add your first trade.
- **Step marks:** the next step's number is ringed. A done step shows a tick in place of its number, a struck-through title and a Done chip, with no button [rec S01 0:00; rec S63 22:18 zoom].
- **Explore:** prop sync, journal, backtesting, agents. Hovering a card shows only a pointer cursor, with no highlight [rec S01 0:11 zoom].
- **Recommended focus:** four prop rows. The list is static [rec S01 0:11].
- **Resources:** academy, community, changelog.
- **Landing:** the user's account landed on Home after the first run [rec S01; rec S55].

**Inferred and connector** [rec S01; rec S46; connector]

- INFERRED: the checklist is computed from a prop connection, a challenge and any trade.
- Sign-up also makes a primary account, a demo account, a backtesting account and five note folders.

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Welcome, survey | The auth pages' centred layout, `Segmented`, More filters' pill toggles, the search combobox pattern | `/app/welcome/[step]`, and a first-run gate in the app layout (K56) |
| Preferences | Profile's zone and currency controls, `isValidTimeZone` | First name, last name and username, stored in prefs for the future account (Profile shows them; an existing `displayName` reads as the first name). The zone field opens on US/Eastern, as TZ's does, and the zone notice follows |
| Default account | The account repository and Settings > Accounts' new-account defaults | One account, "My account", in My workspace, in the chosen currency, made when the preferences save, so Add trade and the trade rules have an account. TZ's demo and backtesting accounts are not mirrored: the Sample workspace is the demo, and backtesting isn't live |
| Home | The card shell, and the accounts, challenges and trades hooks | `/app/home`, at the top of the sidebar, in More on a phone |
| Checklist | Those hooks | `gettingStarted(accounts, challenges, trades)`, pure |
| Folders | The Notebook's built-in folders, which already match TZ's | Nothing |

Left out:

- **Log-out:** there are no accounts.
- **The social-proof strip:** PRODUCT.md forbids inventing such evidence.

**Data**

- `UserPrefs.onboarding`: `{ status: 'done', at, survey?, existing? }`.
- `survey`: `{ experience, capital[], broker, instruments[], goals[], heardFrom, heardFromOther? }`. The answers are stored only and change nothing else (U2).
- `firstName`, `lastName` and `username`.
- The checklist is computed.

**States**

- **The first run:** the gate covers every `/app/*` route, the sample workspace link included, until the first run is done (U1, K56).
- **A reload mid-survey:** resumes (K55).
- **Home:**
  - 0 of 3 in an empty My workspace;
  - 3 of 3 in the sample, where the card stays (K51).
- **Loading:** the greeting over skeleton cards.

**Phone**

- The welcome and the survey are one column, with Continue pinned above the safe area.
- One option per row; instrument tiles two to a row.
- Home's cards and the steps stack. Home is in More.

## 6. Open questions

### 6.1 Keel's calls (TradeZella unknown)

Every row below is Keel's call (TradeZella unknown). Q numbers are the spec's 41 questions.

**Progress tracker**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| K1 | Period score (Q1) | The mean, over the range's scored days (clipped to the tracker's start and today), of points met over rules active, as a %. None with no scored day | INFERRED; today's score is met over active [connector] |
| K2 | Current streak (Q2) | Consecutive perfect scored days (every active rule met). It ends today if today is perfect, else yesterday; today never breaks it early. Best streak is the longest run. The tile's second line gives the best streak and perfect days | The day streak read 0 on a day that earned a point [connector 2026-10-19] |
| K3 | Unfinished days; the lock (Q2) | Unfinished days score live, with the version in effect that day. Finishing freezes each rule's inputs per account (counts, sums, largest loss) with the ticks, so any account selection rebuilds the frozen score | Points earned on an unfinished day [connector] |
| K4 | Which trades a trade rule reads (Q3) | Trades opened on that date, in the profile zone, in the selected accounts | [help 10371695] |
| K5 | The per-trade pair (Q3) | x is trades within the loss limit (winners included); y is the trades opened that day. Met when x = y and y > 0. Shown "x of y" | Reads like the strategy and stop pairs (INFERRED) |
| K6 | Per-trade average (Q4) | The day's largest single-trade loss (0 if none), averaged over scored days | The rule caps the largest loss |
| K7 | A loss at the limit (Q5) | Passes, for both loss rules | "More than the limit" [help 10371695]; Keel's goal agrees |
| K8 | The daily cap's figure | The realized net booked that date (Plan 5's day rule), always net, in the selected accounts (every account when all are selected, as the help describes). It needs a trade opened or exited that day | [help 10371695]; the Plan 5 ruling |
| K9 | What meets the time rule (Q6) | `noteStartedAt`: the first edit made on the note's own date, by the trader's clock, from any surface, at or before the limit. Planning ahead on an earlier date doesn't stamp it | Rule key `day_journaling_in_time` [connector]; [help 10371695] |
| K10 | Trading hours (Q7) | A trade opened that day enters inside the window, and exits inside it if it exits that day. Score: the share of such trades | [help 10371695] |
| K11 | Custom rules (Q8) | The same seven weekday toggles, Mo to Fr by default; a rule is active only on its days that are trading days. Ticked on the day page's rules card and the tracker's checklist rows until the day is finished. No cap | [help 10371695] |
| K12 | Grid (Q10) | Five accent steps by share met: none, under 1/3, under 2/3, short of all, all. Unscored days blank. Hover and focus give the date and "p of n rules met". As many weeks as fit, with back, forward and Today | Five steps [rec S08]; Today implies paging |
| K13 | Tracker start (Q11) | The date the tracker row is first created. The sample starts on its first trading day | INFERRED |
| K14 | Date range (Q12, Q13) | The range drives the period score and the rules table. The streak, today's progress, the checklist and the grid ignore it | INFERRED |
| K15 | The $ or % unit (Q14) | Stored on the rule. % is a share of the trade's account balance at the start of its day (`balanceAt`) | [inv-3 103] |
| K16 | Edits and today | They apply today at once. A second save the same day replaces that day's version | [inv-3 102] |
| K17 | Reset (Q15, Q17) | There are no achievements. Reset restores the defaults, deletes custom rules, ticks, locks and history, and restarts the tracker today. Notes, timers, moods, ratings, shots and trades stay. Per workspace, two confirmations | [help 12141413] |
| K18 | Destinations (Q16) | The card's checklist button opens today's day page in plan mode. The page's start-my-day opens the date popover | INFERRED |
| K19 | Marks and the face (Q17, Q18) | Met: gain CheckCircle. Failed: loss XCircle. Pending: faint clock. A rule is decided once met, once it can't be met, or at day's end. No streak face (no emoji) | [rec S08]; DESIGN.md |
| K20 | Unscored dates and finishing | Before the tracker's start, the rules card quietly says the day isn't tracked yet and gives the start date. A non-trading day says it isn't a trading day. A future date opens plan mode only, with no rules state. Only scored days, today or earlier, can be finished, after a confirmation, so locked days never stretch the grid before the start | None seen |
| K21 | The dashboard card | Shown by default; it becomes removable with #46 | Keel has no widget editor yet |
| K22 | Goals and the tracker | Superseded by U4: the Goals card is removed and the tracker keeps TZ's $100 default | The user, 2026-11-25 |
| K23 | The sample's tracker | Its "today" is `sampleEndDate`. The seed writes tracker history, so the sample shows a streak, partial days, a perfect day, a finished day and a broken day | The sample shows every state |
| K24 | Currencies | Money rules (the loss caps) and day and week sums use the base currency only. Trades in other currencies are left out of them and shown apart, as the dashboard goals do | The Plan 5 ruling on goals |

**Day page**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| K25 | The review date control (Q19) | The start-my-day popover. Plan keeps a plain date | INFERRED |
| K26 | Modes and future dates (Q20) | Any date opens. Today and future dates open plan; past dates open review | [rec S22] |
| K27 | Screenshots after upload (Q21) | Thumbnails in upload order. A click opens a full-size viewer with previous, next and a confirmed delete. No caption, no cap. Type and size checked first. Plan mode only | [inv-2 061] |
| K28 | Saving (Q22) | Autosave, as Keel's editors do. Version history waits for #43 | INFERRED [rec S23] |
| K29 | A review row (Q23) | Opens the trade page, as trade-log rows do | Keel has no preview drawer |
| K30 | The timer | Today only, by the date in plan mode. One start and stop a day; a running timer ends at finish or at local midnight. Session is its length, None if never started | [help 16934706] |
| K31 | The day rating | 1 to 5 stars (Keel's trade-rating control), in review, today and past, with or without trades. The Calendar's Day rating keeps reading trade ratings until TZ is shown to differ | [help 16934706] |
| K32 | Templates | The note's Templates control inserts a saved template at the cursor, as the day-view dialog does [help 5858190]. Change template replaces the body, after a confirmation when the body isn't empty, and records `templateId`. The list offers the user's daily templates plus three Keel-written ones that mirror TZ's three recommended (TZ's structure, Keel's content), then Manage templates and Edit default | [help 5858190; inv-2 056] |
| K33 | Shell and import | The normal shell until #50. Import links to Keel's Import page | Keel's import is a page |
| K34 | The day's trades | The Day view's grouping (K37) | One rule for every day surface |
| K35 | The note's date zone | One zone everywhere: the trader's profile zone. It sets the day page, the note, the tracker, the day and week groups, and the trade page's Daily note (changed from the account's zone, §7), so a trade's note and its day card always match | One day must mean one date |

**Trade log by day and by week**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| K36 | Last view (Q33) | Not remembered: Trades opens Day. `/app/trades` stays All | [rec S24; inv-2 051] |
| K37 | A trade's day | The trade log's date, in the profile zone: the close date if closed, the open date if open. Net and gross sum the closed trades | [rec S26 9:54] |
| K38 | Row order (#37 conflict) | Newest open time first | [rec S26 9:54]; the help differs |
| K39 | No-loss profit factor; flat day (Q27) | Profit factor None. A flat day gets a neutral underline, with the figure in hover and label | Keel's empty-value and colour rules |
| K40 | Quick actions (Q28) | Mood, review (to the day page) and note. Insights wait for #40; replay is out | [help 5829446] |
| K41 | Weeks (Q29) | Later week cards start collapsed, like day cards; only the first is seen expanded. Gap weeks between traded weeks are left out, as the empty current week is. An empty Week view uses the Day view's empty state | [rec S24 9:34; rec S26 9:46 zoom] |
| K42 | Paging (Q30) | 20 day cards, more on scroll, and a Show more button for the keyboard. Weeks 8 at a time | The performance budget |
| K43 | The note dialog (Q31) | Its menu holds Move to Trash. The summary expands to the trade table. Autosave; Save flushes and closes | Keel's editors autosave |
| K44 | Mood | Five values as words with plain faces, no colour, an optional note. Shown where the date has a day record or a daily note | [help 5829446]; nothing is written on view |
| K45 | Units (Q32) | Every display unit, as the trade log | Keel's Display menu |
| K46 | The week-tile dialog | The day card's body in a `MorphDialog` from the tile. A tile without trades is not a button | [help 17096845] |

**Getting started**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| K47 | Broker list; not yet (Q35) | A Keel-written list (the brokers page's), plus Other and None yet. "Not yet" and the other two clear each other | [inv-1 004] |
| K48 | Username rules; skipping (Q37) | The username takes letters, digits, dots and underscores, 3 to 30 characters; uniqueness waits for accounts (#2). The preferences step can't be skipped | [inv-1 013] |
| K49 | Step links (Q38) | Step 1: a new prop account in Settings > Accounts. Step 2: a new challenge. Step 3: Add trade. Focus rows link to these and to Prop firms | INFERRED [spec 4.2] |
| K50 | Step 1 and completion (Q40) | Step 1 reads as adding your prop firm, and says plainly that automatic sync isn't live yet; it completes when a prop-firm account or a challenge exists. Step 2: a challenge exists. Step 3: any trade exists. Computed for the active workspace | INFERRED [spec 4.4]; sync is #12 |
| K51 | Steps 1 and 2 done; 3 of 3 (Q39) | Steps 1 and 2 take TZ's done look when done. At 3 of 3 the card stays, with no dismiss | The done look [rec S01 0:00; rec S63 22:18 zoom]; nothing else seen |
| K52 | Variants (Q41) | One prop-led variant | [inv-1 016; rec S01] |
| K53 | Explore, resources | Explore: Prop firms, the Dashboard, and Backtesting marked not live; agents is AI, left out. Resources: the changelog only (no academy #29 or community #20) | Never fake capability |
| K54 | The onboarded signal | A user counts as onboarded when any of these exist: a prefs record, any My workspace rows (accounts, trades, notes), or an active-workspace meta row. The v3 upgrade sets the flag for them | TZ asks only at sign-up |
| K55 | A reload mid-survey | Answers kept for the browser session; nothing saved before the preferences step | Keel's call |
| K56 | The gate and the landing | The gate covers every `/app/*` route, the sample workspace link included. After the first run, while the checklist is incomplete, `/app` lands on Home; once it is complete, on the Dashboard | Home seen as the landing [rec S01; rec S55] |

### 6.2 Answered by the spec

- **A no-trade trading day breaks the streak.** A trading day with no trades scores 0 on every rule [connector], so it is never perfect and always breaks the streak (K2). A test pins it.

### 6.3 Decided by the user (2026-11-25)

- **U1. When the first run shows:** on the first app open in a browser, before any workspace (option a). The gate covers the sample workspace link too (K56).
- **U2. The survey answers:** stored only; they change no default and hide nothing (option a).
- **U3. The Notebook's Pre-market plan kind:** Notebook > New no longer offers it, and existing entries stay readable (option b).
- **U4. Keel's Goals card** (weekly net goal, daily loss limit; Plan 5) has no TZ counterpart. It is removed, TZ's way: the progress tracker's rules (daily loss cap, per-trade cap and the rest) take its place on the dashboard, and the tracker card sits where Goals was. Existing goal settings are dropped, with no migration of values. Remove the Goals card, its editor, `goalDays` and the goal prefs, and their tests. This supersedes K22. E50 closes.
- **Approved by the user, 2026-11-25.**
- **The comps** (`.impeccable/mocks/plan6a/`) were approved by the user on 2026-11-25. Their labels are Keel's: "Plan the day", "Close the day", "Start session" and "End session"; the stages Plan, Trade, Import and Review; and the moods Rough, Low, Steady, Good and Great, as words.

## 7. Corrections to existing records

| Record | Says | Should say |
| --- | --- | --- |
| BACKLOG #36 | Session runs from first entry to last exit; the start routine meets the time rule | Session is the timer's length: a seven-trade day read 0m [rec S23 8:46; help 16934706]. The rule is met by the day note's first edit made on its own date, in time (K9). Add the stage navigation, and the lock of the whole day |
| BACKLOG #35 | The checklist counts trades past the per-trade cap | Which side TZ counts is unknown; Keel shows trades within the cap over trades taken (K5). The strategy and stop rules are on or off only, at 100%. Finish my day sits on the day page; the streak email is out |
| BACKLOG #37 | No row order | Newest open time first [rec S26 9:54]; the help says chronological. The scale strip is not in 6A (#52) |
| BACKLOG #52 | The ends are the set's largest loss and largest win | Contradicted: the ends seen dwarf every P&L in the data and move with the filter [rec S24 9:34; rec S29 12:11]. The marker is the week net's linear share of the span [rec S24 9:36; rec S29 12:11 zoom]. The help calls it potential versus actual [help 7218420], which points at the price path. It waits on a definition and #14 |
| BACKLOG #47; ON1 to ON3 | The survey tailors defaults and hides prop pages; the checklist is account, import, strategy; next steps follow setup | No source shows the survey changing anything, and the user decided it stores answers only (U2). The checklist seen is prop-led: sync, challenge, trade [rec S01]. The focus list is static [rec S01 0:11] |
| Feature map DV1 | Review shows the session length | The timer's length, as #36 |
| Plan 5: the trade page's Daily note | Dates the day note by the account's clock (`dayNoteDate` with the account's zone) | Dates it by the trader's profile zone, as every 6A surface does, so a trade's note and its day card always match (K35) |
| E50 | Monthly and trade-count goals; routine rules | Closed: the routine rules come with #35, and the Goals card itself is removed (U4) |

## 8. Left to the builder

**Comps**

- Per module, light and dark, at 390 and 1440, under `.impeccable/mocks/plan6a/`.
- They settle the placements:
  - start my day on the Dashboard and Trades headers;
  - the stage bar, the rating and finish on the review stage;
  - where Home and Progress tracker sit in the sidebar.

**Copy**

- Every label is Keel's own, buttons and the three daily templates included. "Start my day" and "finish my day" in this doc only describe.
- The tracker and day and week metric definitions go in `metric-definitions.ts`.

**Wiring**

- Module, hook and query-key names.
- Invalidation: a trade edit, a journal save or a day-record write refreshes the scores.
- The `noteStartedAt` stamp, and the lock's refusal, in the write paths for every editor.
- E109's "second daily note after trash", which one note per date depends on. Fix it in Foundations.

**Seed v5** (K23)

- Tracker defaults, plus one custom rule a stage, anchored to `sampleEndDate`.
- Day records on traded days:
  - note stamps mostly before 09:30, some late;
  - timers around the first entry and last exit;
  - a streak, partial days, a perfect day, a finished day and a broken day;
  - some moods and ratings.
- No screenshots.
- New random streams, so every existing sample value is unchanged.

**Tests**

- Domain-first tests for every rule and K edge:
  - a loss at the limit;
  - a no-trade trading day breaking the streak;
  - a custom rule set on a non-trading weekday, never scored;
  - version dates;
  - the lock, rebuilt under another account selection;
  - reset;
  - the streak across today;
  - a mixed-currency day.
- The v2 to v3 migration test, one case per onboarded signal.
- End-to-end tests:
  - the daily loop: start my day, then the note, a tick, review, finish, and the grid;
  - a finished day refusing edits from the day page, the note dialog, the trade page and the Notebook;
  - Day and Week filters round-tripping;
  - the first run, with its default account.

**Review Focus candidates**

1. A rule edit today never changes yesterday.
2. A multi-day trade: which day each rule, day card and week tile counts it on.
3. A finished day stays frozen after its trades change, and refuses every write.
4. The first-run gate never traps a user who has data.
5. Privacy hides money in tracker values, tiles, day cards and charts.

**Records at the end**

- Close #35, #36, #37, #47 and E50.
- Add rows for:
  - the streak email (with #26);
  - the day page's slim rail (#50);
  - day-card insights (#40);
  - the week events list (#25);
  - the replay quick action (#15).
