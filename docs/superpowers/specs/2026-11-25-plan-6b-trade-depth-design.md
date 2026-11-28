# Plan 6B: Trade depth, design

**Date:** 2026-11-25. **Branch:** `claude/m1-p6b-6ab9ab` (design only; the build starts after Plan 6A lands). **Backlog:** #38, #39, #40, #42, #43, #44, #52, #53, #55, #56, with E10 and part of E27. **Feature map:** TR8, TR9, TR10, TD3, TD4, TD5, TD6, SE4, SE5, X7, X8, NB7, NB8, NB9, ST6, ST7, ST10.

**Authorities, in order:**

1. The user's parity rule: Keel copies TradeZella's (TZ) behaviour and adds no feature of its own. Where TZ's behaviour is confirmed, Keel follows it.
2. The behaviour record, `.superpowers/research/tradezella/plan6b-behaviour.md` in this worktree (git-ignored), cited as "record §n". Its source tags are kept:
   - `[rec Sxx]` is the recording, `[inv-n NNN]` the screenshot inventories, `[help NNNN]` a help article and `[connector]` TZ's read-only connector;
   - INFERRED marks a reading drawn from the evidence; UNKNOWN marks what no source shows.
3. `DESIGN.md` and `PRODUCT.md`.
4. The Plan 5 rulings, and the approved Plan 6A spec (`2026-11-25-plan-6a-daily-routine-design.md`), whose seams this plan picks up.

Where TZ is unknown this doc decides, as a **Keel's call (TradeZella unknown)** with an id (B1 to B60, all listed in §6.1; "B" for 6B, so they never clash with 6A's K ids). The owner's decisions are in §6.2 (U1 to U4).

## 1. Intent and why

Plan 5 gave Keel TZ's trade log and trade page; Plan 6A gives it TZ's daily routine. What is still missing is the depth TZ has on a single trade and around it:

- regrouping fills by hand, and moving trades between accounts (#38);
- planning a trade with several targets and stops, and filling them, and the costs, by rule (#39);
- the behaviour patterns TZ detects from a trader's fills (#40);
- a log of every change (#42);
- files on a trade, images in notes, and TZ's full note editor (#43);
- missed trades and ready-made strategies (#44), and a strategy's photo (#53);
- swap on a trade (#55), and choosing which stats the trade page lists (#56).

Each of these exists in TZ and is visible in the user's account or in TZ's help. Together they finish the trade page and the journal around it, on local data.

## 2. Goals, non-goals, anti-goals

**Goals**

- TZ parity for each row above, as the record shows it.
- One file store for trade attachments, note images and strategy photos, built on 6A's screenshot store (6A spec §4.1 seam).
- One risk model: every R figure in Keel (trade page, trade log, display unit, filters, reports, the tracker's stop rule) reads the same target and stop levels.
- A safe upgrade for every existing Dexie database, and a sample workspace that shows every new state.

**Non-goals** (each stays in, or goes to, the backlog):

- **Price-path features** (they need market data, #13 and #14):
  - the trade scale (#52), whose "potential" side the evidence ties to MAE and MFE (record §7; moved to the market-data plan by U1);
  - the patterns that read how far price moved inside a trade: T1, T2, T4, T5, T6, T9, T10, T11, T13 and the day patterns D2, D6, D12 (record §3), and T12 ("not a strong trade"): TZ gives no criteria, and the trades it flagged had no stop or target, so their strength can only come from the price path (record §3.2, INFERRED);
  - the chart's screenshot camera (#13).
- **AI:** the recap and its top-patterns slide, the session review, the AI buttons in the editor (#22).
- **A server:** shared strategies and TZ's community templates (#19), sharing a trade (#57).
- **Backtesting** (#16): the Backtesting choice in the rule dialogs, and "save and backtest".
- **Commercial:** the strategy count cap (0/10), the paywall.
- **Already ruled:** a strategy's own colour. TZ offers an icon or a colour [inv-3 096]; Plan 5 ruling 41 kept Keel's hue jobs over per-strategy colour, and Keel's icon tells strategies apart. 6B adds the photo only.
- **Anything TZ does not have.**

**Anti-goals**

- No TZ wording, layout, icons or emoji. "Zella Insights" and "Zella Scale" never appear; Keel names its own (§8).
- No control that does nothing. What Keel can't run is left out, or says plainly that it isn't live.
- No rewritten history: a merge, split or move is logged, and no edit silently changes a finished (locked) day's frozen score (6A K3).
- No example data passed off as real: template stats and example trades are labelled as examples (PRODUCT.md, Evidence on hand).

## 3. Constraints

- **Local-first.** Everything lives in Dexie: no server or accounts. Files are bytes in IndexedDB, as 6A's screenshots are.
- **Design system.** The rules that bite here:
  - design G, graphite dark, no icon tiles;
  - hue jobs: accent for what is chosen; green and red for money, and for kept or broken; green and red always travel with a sign or a word;
  - "None" for empty values; no em or en dashes; numeric ranges "a to b";
  - two-line rows instead of tables below `sm`; dialogs become full-height sheets with a fixed footer;
  - a `MetricTip` on every new metric, its text in `src/content/metric-definitions.ts`;
  - Privacy hides every money figure, pattern sentences, rule amounts, swap and history values included.
- **TZ parity is behaviour and features only, never its UI** (the owner, 2026-11-25). Layout, the arrangement of a screen, look, wording and icons are Keel's own (design G and the comps); copying a screen's arrangement from the recording counts as copying TZ's UI. Keel's calls only where TZ's behaviour is unknown (§6.1).
- **Comps first.** Impeccable comps for each surface, light and dark, at 390 and 1440, before it is built (§8).
- **Migration safety:** no existing row is rewritten by the upgrade; new tables start empty; new fields are optional; the sample reseeds by version; My workspace never does.
- **After 6A.** The build starts once Plan 6A is merged. 6B takes the next Dexie version after 6A's v3 (expected v4; if 6C lands first, the next free one) and the next sample seed version.
- **Plan 5's and 6A's Global Constraints carry over:** the toolchain; Next.js docs first; components read hooks only and `src/domain` stays pure; hand-rolled SVG charts; WCAG 2.2 AA and 44px coarse targets; no overflow from 390 to 1680; test-first domain work; test, typecheck and lint per commit, a build per module.
- **Performance,** on the sample (~1,230 trades): computing every pattern for the whole workspace stays under 50 ms; the history table pages at 50 rows; thumbnails load lazily and revoke their object URLs.

## 4. Approach

### 4.1 Approaches considered

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| **A. One sub-plan, built in dependency order** (foundations, then the trade's risk, then trade operations, then settings rules, then patterns, then notes, then strategies, then history) | One branch, one review per module; every later module reads the foundations | **Chosen.** The modules share the file store, the history write path and the risk model |
| B. Split 6B again into "trades" and "notes and strategies" | Two smaller branches, but both need the file store and the history log, so one would wait on the other | Rejected: it adds a merge point without saving work |
| C. Build each row as it was listed (#38 first, #56 last) | Simple to follow, but #39's risk model and #42's log would be retrofitted into work already done | Rejected |

### 4.2 Order inside 6B

| Step | Work | Why here |
| --- | --- | --- |
| A. Foundations | Types; the next Dexie version (files, noteVersions, history, targetRules, feeRules, missedTrades); the file store; the history write path; hooks; sample seed | Every module writes history; three modules store files |
| B. Risk on a trade (#39) | Levels and units in `src/domain`, test-first; one `tradeRisk` used by every R figure; the trade page's target and stop blocks; the tracker's stop rule reads levels | #39's rules (D) and patterns (E) read it |
| C. Trade operations (#38) | Merge, split and move on the trade log's bulk bar; Move trades in Settings > Accounts | Needs the history path and the file store (attachments move) |
| D. Default rules (#39) | Two rule cards on Settings > Trading; apply on import and to existing trades | Reads B's levels |
| E. Swap (#55), stat choice (#56), attachments (#43 on trades) | The trade page's remaining depth | Small, on the same page |
| F. Patterns (#40) | Domain, test-first; the log column, the trade page, filters, day cards and the day page (6A seam), the patterns report | Reads B (R for D5) and 6A's session (D11) |
| G. Notes (#43) | Images, toolbar, slash items, version history, full screen, voice, export and import, note settings | Uses A's file store |
| H. Strategies (#44, #53) | Missed trades, the chooser and templates, the photo | Uses A's file store |
| I. History page (#42) and finish | Settings > Logs gains History; audit; records | Last, so every writer above is logged |

### 4.3 Storage at a glance

The next Dexie version adds six workspace tables. All join `DATA_TABLES`, so a workspace clear and a sample reseed cover them.

| Table | Key | Holds |
| --- | --- | --- |
| `files` | `[workspaceId+id]`, index `[workspaceId+owner]` | `owner` (`trade:<id>`, `note:<id>` or `strategy:<id>`), `bytes`, `type`, `name`, `size`, `createdAt`. 6A's `dayShots` stays as it is (B31) |
| `noteVersions` | `[workspaceId+id]`, index `[workspaceId+noteId]` | `noteId`, `body`, `savedAt`, `kind: 'auto' \| 'before-restore'` |
| `history` | `[workspaceId+id]`, index `[workspaceId+at]` | `at`, `type`, `action`, `source`, `entityId`, `label`, `field?`, `oldValue?`, `newValue?` |
| `targetRules` | `[workspaceId+id]` | `accountId`, `assetClass`, `symbols[]`, `target {unit, levels[{value, pct}]}`, `stop {unit, levels[]}`, `createdAt` |
| `feeRules` | `[workspaceId+id]` | `accountId`, `assetClass`, `symbols[]` (empty is all), `mode`, `applyOn`, `commission`, `fee`, `createdAt` |
| `missedTrades` | `[workspaceId+id]`, index `[workspaceId+strategyId]` | `strategyId`, `symbol`, `at`, `price`, `commission`, `fees` |

**New optional fields** (no migration):

- `Trade`: `targets?`, `stops?` (each `{ unit, levels: [{ value, qty }] }`), `swap?` (cents, signed), `grouping?: 'manual'`.
- `Strategy`: `photoId?`, `templateId?`.
- `UserPrefs`: `tradeStats?` (the trade page's shown stats), `noteType?` (`{ h1, h2, h3, body, strikeChecked }`), `strategyChooser?` (default on).
- `ImportMapping` for closed trades: a `swap` column.

**Read-time defaults, no rewrite:** a trade with `plannedStop` or `plannedTarget` and no levels reads as one Price level each, at the full size (B14).

**A migration test:** opens a 6A-version database with data in both workspaces, upgrades it, and asserts every row unchanged and the new tables empty.

### 4.4 Seams with 6A and 6C

| Where | The seam |
| --- | --- |
| 6A's day cards and day page | 6A left "insights" out (6A spec §2, §4.1). 6B adds the patterns control to both (§5.6) |
| 6A's tracker | The "every trade has a stop" rule reads "has at least one stop level" (§5.2). Finished days keep their frozen scores (6A K3) |
| 6A's lock | Note images, version restores and imports into a finished day's note are refused in the write path, as 6A refuses note edits |
| 6A's screenshot store | `dayShots` stays; the new `files` table follows its shape, limits and quota handling |
| 6A's week strip | Still waits for #52, which moved to the market-data plan with #14 (U1) |
| 6C's report PDF (#51) | 6B's note PDF uses a print layout; 6C should reuse its print stylesheet, or the other way round, whichever lands first |
| 6C's dashboard widgets (#46), prop finances (#45) | No overlap; only the Dexie version and seed version numbers are shared (§3) |

## 5. Modules

### 5.1 Merge, split and move trades (#38)

**TZ's behaviour** (record §1)

- **Where.** The trade log's bulk actions: merge (two or more selected), split (exactly one selected), and transfer, beside mark reviewed, export, add to strategy, add tag and delete [help 7143872]. Settings > Accounts, an account's menu: Transfer data [rec S58 21:01; help 6706238].
- **Merge.** Pick which executions to include, then confirm. Advisable only for one ticker, one account and one instrument [help 7031683].
- **Split.** On one trade, pick which executions to separate, then split [help 7031683].
- **Move.** A selection: pick the destination account, confirm; only those trades move. A whole account: from its menu, pick the destination, finish [help 6706238].
- **Documented nearby.** An unlinked trade note stays in Trade notes without the trade's stats [help 11517879].
- **Unknown:** what each result keeps, undo, guards beyond the advice, what a move carries.

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Bulk bar | `bulk-bar.tsx` and its menu style | Merge, Split and Move to account among the existing actions, placed by Keel's own grouping (the comps) |
| Dialogs | `MorphDialog` with a scroller and a fixed footer; the fills table of `trade-view.tsx` (`Executions`) | `MergeDialog`, `SplitDialog` (an execution list with ticks), `MoveDialog` (an account picker) |
| Domain | `trade-builder.ts` | `buildGroupedTrade(executions)`: one trade from a given list, open if the position doesn't return to flat, never cut at a flat point |
| Data | The trades repository | `merge`, `split`, `move` in one transaction each, with history rows |
| Accounts | `accounts.tsx` row menu | Move trades in the account's menu (its place is the comps'), and its dialog |

**Behaviour in Keel**

- **Merge** (B1 to B3, B5): enabled when two or more trades share one account and one instrument; otherwise disabled with the reason in its tooltip and label. The dialog lists every execution of the selected trades, newest last, all ticked. Unticking one leaves it in its trade. Confirm builds one trade from the ticked executions. The earliest-opened source keeps its record; tags and strategies are the union; the other sources' notes are unlinked and stay in Trade notes; their files move to the merged trade. A source left with no execution is removed.
- **Split** (B4, B5): the dialog lists the trade's executions, none ticked. Ticking moves an execution to the new trade; Split is enabled while at least one is ticked and one is left. Each part is rebuilt; a part that doesn't return to flat is open. The original keeps its record; the new trade copies tags and strategies only.
- **Move** (B6): a selection moves to any active account other than its own. Everything attached to a trade goes with it (note, tags, strategies, rule checks, levels, rating, reviewed, files). A trade keeps its own P&L currency and figures, whatever the destination's currency; when they differ, the dialog says so. The source account stays; its cash flows and balance don't move. A whole account's move works the same from its menu, with the same dialog. Archived accounts neither give nor receive.
- **After each:** a toast says what happened; the history log has a row per trade touched (§5.9). There is no undo (B5): the dialogs say so.
- **Imports later** (B8): merged and split trades are marked `grouping: 'manual'`. A later import drops duplicate fills by fingerprint, as now, so a manual grouping is never regrouped.

**States**

- A mixed selection: Merge disabled, with "Merge needs one account and one instrument."
- One trade with one execution: Split disabled, with the reason.
- No other active account: Move disabled, with the reason.
- Selection includes a sample-workspace trade: works as in My workspace (the sample is editable today).

**Phone:** the bulk bar's overflow menu holds the three actions; dialogs are full-height sheets with the fills as two-line rows (time and side; quantity and price).

### 5.2 Several targets and stops on a trade (#39)

**TZ's behaviour** (record §2.1)

- A Profit target block and a Stop loss block on the trade's stats, each with its own unit dropdown, then level rows: a value, a quantity prefilled with the position size (with a calculator control), and "+" to add a level [rec S11 4:47].
- Six units: Price, Price movement, Ticks, Points, PnL, Pips [help 12450459].
- Levels add up: Initial target is the profit if every target fills; Trade risk the loss if every stop fills; Planned R is target over risk; Realized R is the actual P&L over risk [help 12450459]. Each level is its quantity times its distance from the average entry (the help's worked example: +330, 175, 1.89).
- No target, risk or planned R without both; realized R needs only a stop [help 12450459; plan5-features].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Domain | `instruments.ts` (tick size, point value, pip size), Plan 5's unit availability | `src/domain/risk.ts`: unit to price, level money, `plannedReward`, `plannedRisk` (`tradeRisk`, the stop side's loss, also used alone by Realized R), `plannedR`, `realizedR`; legacy read (B14). Test-first, including the help's worked example |
| Every R figure | `summary.ts`, the display unit's R, the R filter, reports, the tracker's `inputs.ts` | All read `tradeRisk` |
| Trade page | `PriceField`, `Stat` | `LevelsBlock` (unit select, rows, add, remove, the size helper), replacing the Planned stop and Planned target rows; derived rows Planned reward and Planned risk (Keel's labels for TZ's initial target and trade risk), Planned R, Realized R |
| Manual trade form | `manual-trade-form.tsx` | Its stop and target fields write one Price level each |

**Behaviour in Keel** (B9 to B14)

- Units by instrument: Price, Price movement and Amount everywhere; Ticks and Points for futures and for options on futures (Keel's option with `optionOn: 'future'`); Pips for forex (B9). Amount is the money on that level's quantity (B10).
- The first level's quantity is the position size; each added level starts with what's left; a side can't exceed the position (inline error), and may fall short (B11). The size helper takes a share of the position and fills the quantity (B12).
- A stop on the profit side of the average entry, or a target on the loss side, is refused inline (B13).
- Planned reward, Planned risk and Planned R show None until both sides have a level, as TZ computes none of them without both [help 12450459]. Realized R needs only a stop and a closed trade: the actual P&L over the loss if every stop fills [plan5-features §1]. Each shows None, as TZ's "--", until its inputs exist.
- Edits save on blur, as the trade page's fields do today; history logs the side changed.

**States:** an open trade shows Planned R but Realized R None; a trade with only a stop shows Planned reward, Planned risk and Planned R as None and Realized R as a figure; a level on the wrong side shows its inline error (B13); levels on a trade whose size changed after a merge or split keep their quantities and show the over-size error until fixed.

**Phone:** each block stacks; a level row is value over quantity, with remove at the end.

### 5.3 Default rules: targets and stops, commissions and fees (#39)

**TZ's behaviour** (record §2.2, §2.3)

- A settings page of default rules, in two kinds. The target and stop kind carries a note: values apply to newly uploaded trades only [inv-3 114]; the fee kind also applies to future imports only [help 6954370].
- Target and stop rule: Account, Instrument, Symbols, a target unit (waits for the instrument) with levels of value and % (default 100) and "+", the same for the stop, Cancel, Create [inv-3 116; help 12053164].
- Fee rule: Account, Instrument, All symbols (on), Mode (per contract or per execution), Apply (all, entry or exit executions), Commission $, Fee $ [inv-3 117; help 6954370].
- Both apply to new imports. Each rule's menu: Apply to existing trades (an override box; unticked fills only what's missing), Edit, Delete. Deleting a fee rule leaves applied fees [help 12053164; help 6954370].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Page | `trading.tsx` (Settings > Trading), `settings-ui.tsx` | Two cards on Settings > Trading, after its existing cards: "Targets and stops" and "Commissions and fees", under one note that both apply to imported trades (Keel's grouping: trade settings in one place; no new nav entry) |
| Rule dialogs | `MorphDialog`, the tag picker's chip input for symbols, `LevelsBlock`'s unit and level rows (with % in place of quantity) | `TargetRuleDialog`, `FeeRuleDialog` |
| Engine | `src/domain/import/plan.ts` (where fills become trades) | `applyTargetRules(trade, rules)` and `applyFeeRules(fills, rules)`, pure; run in the import commit; "Fill in logged trades" runs them over matching trades in one transaction |

**Behaviour in Keel** (B15 to B19)

- One account per rule; the instrument is required; symbols are optional, empty meaning every symbol (B15). Precedence: a rule naming the symbol beats one that doesn't; then the newest (B15, B18).
- New imports get both kinds. Manual trades aren't touched on entry; "Fill in logged trades" covers every matching trade, manual included (B16).
- A % becomes a quantity rounded down to the instrument's step; the last level takes the remainder (B17).
- Fee maths: per contract is the amount times the fill's quantity; per execution is the amount once per fill; amounts are in the account's currency (B18). A trade lacks costs when none of its fills has a commission or fee, as TZ leaves alone any trade that already carries costs [help 6954370]; at import the unit is the fills new in that import (a closing fill that joins a trade opened by an earlier import is costed unless the file gave it costs, since TZ skips "rows that already carry fees" [plan5-features §7]): without override, only such trades get the rule, on every matching fill; with override, every matching fill's commission and fee are replaced.
- The synthetic fill that closes an expired option at 0 (Keel's settlement, no broker's execution) is never costed: not at import, not by Fill in logged trades and not in its count, with or without override. A rule on exits only changes nothing on an option whose one exit is that fill.
- Each card lists its rules as a table: account, instrument, symbols, and a summary (the levels, or the costs), with a menu of Fill in logged trades, Edit and Delete (B19). TZ only showed the empty state.
- Editing or deleting either kind of rule leaves values already applied, as TZ's fee rule does [help 6954370]; only Fill in logged trades rewrites them (B57).
- The dialogs open with TZ's defaults: each level at 100%; All symbols on; Mode per execution; Apply on all executions; commission and fee 0.00 [inv-3 116, 117].
- The Instrument list is Keel's six asset classes plus "Future option" (an option with `optionOn: 'future'`), mapping TZ's seven [help 12053164].
- Every change a rule makes is logged with the source "Rule" (§5.9).

**States:** an empty card (a line and Add rule), the note always, a confirmation for Fill in logged trades ("Fill in logged trades with this rule?") with the override box and the count of trades it will touch, a toast with the count changed.

**Phone:** rules as two-line rows; dialogs as sheets.

### 5.4 Swap, the stat choice, and attachments on the trade page (#55, #56, #43)

**TZ's behaviour** (record §9, §10, §5.1)

- **Swap:** a Total swap row after Commissions & fees on the trade; Total swap on the Overview (hideable) and in Reports > Calendar's stats; an optional Swap column in the generic trade-history CSV; manual swap goes in the fees [rec S13; help 5829394; help 7189346; help 8239862; help 6387098]. No separate financing field.
- **Stat choice:** a gear beside Net P&L opens a dialog with a search over the fields, a reset to the default, and Update [help 5860216].
- **Attachments:** a tab on the trade page for charts, screenshots or files [rec S13; help 5860216]. Limits unknown.
- **Costs by hand:** each execution's commission and fee can be entered on the trade page's executions list, confirmed per row; it is also how TZ enters swap by hand [help 6387098].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Swap | `Trade.net` derivation, the import mapping, `overview-costs.tsx`, `overview-choice.tsx` | `Trade.swap`; a `swap` closed-trade column (guessed from swap, swaps, rollover, financing); the Swap row; the Overview's Swap figure |
| Stat choice | `ColumnsMenu`'s search and reset pattern | `StatsChooser`; `UserPrefs.tradeStats` |
| Attachments | 6A's shot viewer and drop zone | `TradeFiles` card on the trade page, on the `files` store |
| Costs by hand | `trade-view.tsx` `Executions` | Commission and fee editable per row; save on confirm; the trade's fees and net recomputed; a history row (source You) |

**Behaviour in Keel**

- **Swap** (B49, B50): one signed amount per trade, negative a cost. Net = gross − fees + swap; gross unchanged; existing trades carry none, so no figure moves. Shown as "Swap" after Fees on the trade page, and as "Swap" in the Overview's costs group (hideable like the rest). TZ also lists it among Reports > Calendar's month statistics; in Keel the month view's panel opens the Overview set to that month (Plan 5 C3, gaps row 109), so the Overview's Swap figure covers it (agreed with 6C, 2026-11-25). Manual trades have no swap field: as in TZ, swap by hand goes in a fill's fees. "Financing" is this same figure.
- **Stat choice** (B51): a control on the trade page's stats card opens a dialog: search, every stat row with a box and its current value, Cancel, Reset to default, Save. Default: every row on (Keel shows all today). Saved per user. Order stays fixed. The header figures (Net P&L, Net ROI, Realized R) are not in the list: they are always shown.
- **Costs by hand** (B58): each execution row's commission and fee are editable on the trade page and saved when the row is confirmed; the trade's fees and net are recomputed and the change is logged. Allowed on a finished day (B55).
- **Attachments** (B30): images (PNG, JPEG, GIF, WebP) as thumbnails, other files as named rows with their size and an open action; 10 MB each; no count cap; upload order; the viewer steps through images, with a confirmed delete; no captions.

**States:** no attachments (a drop zone and a line); a refused file (type or size) says why; over quota says "Couldn't save".

**Phone:** attachments as a two-up thumbnail grid, then file rows; the chooser is a sheet.

### 5.5 Patterns: trade-behaviour flags from fills (#40)

**TZ's behaviour** (record §3)

- Rule-computed flags at trade and day level, each with a tone (positive, negative, neutral) [connector; help 12418995].
- Shown as a count column on the trade log, a count button on the trade page, an icon on the day in the journal and the day cards, a filter, and a Trade Insights report whose layout was never seen [help 6387251; rec S13; rec S31; help 12418995; connector].
- **In 6B, the fills-only flags** (record §3.2, §3.3):

| Id | Keel's name (copy is the comps') | Condition | Tone |
| --- | --- | --- | --- |
| T3 | Held longer than usual | Held longer than 75% of your trades with the same outcome over the past 60 days (B21) | neutral |
| T7 | Long hold on a loss | A loss held longer than half your losses of the past 60 days, and larger than their average loss | negative |
| T8 | Loss after a loss | A loss entered within 30 seconds of a losing trade's exit (B21) | negative |
| T14 | Added to the position | Two or more entries | neutral |
| T15 | Exited in parts | Two or more exits | neutral |
| T16 | Large size | Volume above 75% of your trades of the past 60 days | neutral |
| D1 | Losses outweighed wins | Keel threshold (U2): a red day with a win rate of 50% or more and an average loss at least twice the average win (B21) | negative |
| D3 | Switched sides, red | Keel threshold (U2): a red day with three or more changes of side within one symbol (B21) | negative |
| D4 | Switched sides, green | Keel threshold (U2): a green day with three or more changes of side within one symbol (B21) | negative |
| D5 | One strong trade | Keel threshold (U2): one trade on the day, a win, realized R of 3 or more (B21) | positive |
| D7 | Low return for the effort | Keel threshold (U2): three or more trades, green, net below half your average green day of the past 60 days (B21) | negative |
| D9 | Sized up after wins | Keel threshold (U2): a size above the previous trade's after three or more wins in a row, then a loss larger than your average loss (B21) | negative |
| D10 | More trades than usual | Keel threshold (U2): more trades than your 60-day daily average by a third or more (flagged days were 33% and 50% over [connector]; the help's example is 100%) (B21) | negative |
| D11 | Waited, then won | Keel threshold (U2): 90 minutes or more from the day's session start (6A's timer; TZ's "session" may mean the market's) to the first entry, on a green day; only on days with a session (B21) | positive |
| D13 | Quick re-entries after a loss | Two or more trades entered within 1 minute of a loss's exit, and they lost (the help's example: two, both lost) (B21) | negative |
| D14 | Rushed red day | Keel threshold (U2): a red day with five or more trades, a median hold under 5 minutes and a median gap under 2 minutes (B21) | negative |
| D15 | Busier than a green day | Keel threshold (U2): at least twice your average trade count on green days of the past 60 days; tone neutral, as TZ states none (B21) | neutral |

- D8 (giving back the day's peak) waits with the price-path patterns (U2): the record can't tell whether its peak is the realized running P&L or the open P&L.

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Domain | `tradeVolume`, the trade log's day rule (6A K37), `tradeRisk` | `src/domain/patterns/`: `tradePatterns(trades, at)` and `dayPatterns(days)`, pure, test-first, one test per condition and edge |
| Hook | The query layer | `usePatterns()`: computed over the workspace's trades, all accounts, never stored (B20) |
| Trade log | `columns.tsx`, `ColumnsMenu` | A "Patterns" count column in the All view's default set (TZ's default), not in the Day and Week tables [rec S24; rec S30] |
| Trade page | The header's action row | A patterns button with the count; a popover lists each pattern: name, tone word, a Keel sentence with the figures |
| Filters | More filters' sections | A Patterns section: a searchable multi-select of every pattern with Select all, disabled when no pattern has fired; a day pattern matches that day's trades (B24) [inv-1 043-045] |
| Day cards, day page | 6A's quick actions and header | The patterns control: the date, net, trade count and the day's patterns (TZ's popup, help 5829446) |
| Report | Plan 5's breakdown report anatomy | A "Patterns" breakdown: one row per pattern with trades, win rate, net P&L and the rest of the shared columns (B24: TZ's layout is unknown) |

**States:** no patterns (the column reads 0, the button is disabled with its reason); with fewer than 60 days of history the look-back uses what exists, and open trades are skipped by outcome patterns and counted by T14 and T16 (B22).

**Phone:** the column becomes a count on the two-line row; the popover is a sheet.

### 5.6 Notes: images, the editor's extras, version history, settings (#43)

**TZ's behaviour** (record §5.2 to §5.6)

- Toolbar: microphone, template insert, text style menu (Normal, H1 to H3, toggle headings, lists), font family, size stepper, bold with more formatting, link, clear formatting, text colour, highlight, alignment (left, centre, right, justify, start, end, outdent, indent), insert (rule, page break, image, inline image, table, columns, equation, toggles), undo, redo, version history, full screen [inv-2 054-059].
- Slash menu: text, headings, bulleted, numbered, checklist and timed lists, table, image, trade, day, quote, code block, divider, toggles, collapsible section, alignment, tweet and YouTube embeds; ":" opens emoji [help 8410320].
- Images: paste or drag, corner resize, double-click to enlarge, a caption under each [help 8410320].
- Version history: 30 days; Current, saved versions, "before restore"; read-only preview; restore confirms and saves the current first; body and images only [help 17516125].
- Export as PDF or the editor's own format, one note at a time, from every note surface; import in the same menu [help 6384117; help 8410320].
- Settings > Notebook: H1 28, H2 24, H3 20, Body 14 px; strike through checked items (on); live preview; reset; save [inv-3 118; help 16750914].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Editor | `note-editor.tsx` (Tiptap 3: StarterKit, TaskList, Table, Details), `slash-menu.tsx`, `note-prose.css` | Extensions: text style, font family and size, colour, highlight, text align, indent, underline, sub- and superscript, image (block and inline, resizable, captioned), columns, page break, equation, timed list item, trade and day link chips, emoji suggestion |
| Toolbar | The editor's current controls | `EditorToolbar`, shared by every note surface (Notebook, trade notes, day page, note dialog) |
| Images | The `files` store, 6A's viewer | Paste, drop and insert; refs `keel-file:<id>` in the body |
| History | Journal saves | `noteVersions` writes and the History panel |
| Export, import | None | Print layout to PDF; Keel's note file (`.json`) out and in |
| Settings | `settings-ui.tsx` | `/app/settings/notebook`, in the nav after Tags (Keel's grouping: content settings together); `UserPrefs.noteType` applied as CSS variables on every editor and read view |

**Behaviour in Keel** (B32 to B42)

- Images: PNG, JPEG, GIF or WebP up to 10 MB, pasted, dropped or inserted, as a block or inline; resize by corner handles; double-click opens the viewer; a caption line under a block image (B32).
- Toolbar (B33), every TZ function in Keel's own grouping: history (undo, redo); text (a style menu, font family, font size as a select); marks (bold, italic and underline as buttons, and a Format menu with strikethrough, inline code, superscript, subscript, clear formatting); colour and highlight (Keel's palettes); a paragraph menu (alignment and indent); insert (the insert menu, a template, dictation); then version history and full screen. Font family Sans, Serif and Mono; size 8 to 72.
- The style menu holds Normal, Heading 1 to 3, Toggle heading 1 to 3, Bulleted list and Numbered list; the paragraph menu holds Left, Centre, Right, Justify, Start, End, Outdent and Indent [inv-2 057, 058]. Each has the editor library's own key binding, shown in the menu.
- Slash additions to Keel's current list (headings, lists, checklist, quote, collapsible section, table, divider): normal text, a timed list (each item starts with the time), image, trade and day link chips picked by search or date, code block, toggle and toggle headings 1 to 3 (a toggle folds the blocks under it; Keel's collapsible section stays as it is), alignment; ":" opens an emoji search (B34).
- Block handles: hovering a block shows a "+" (opens the slash menu there) and a drag handle to move it [inv-2 055] (B54). Equations render with KaTeX, a new dependency (B35). Columns come in two or three; a page break shows as a dashed rule and breaks the PDF page (B36).
- Full screen fills the window over the app; Escape or the control leaves it (B37).
- Voice uses the browser's speech recognition where it exists, and is hidden where it doesn't; the control says the browser's speech service does the recognition (B38; U4).
- Version history: a version is kept when an edited note goes 5 minutes without one, on leaving the editor, and before a restore; versions older than 30 days are removed; restore asks, keeps the current as a version marked "Replaced", and brings back the body (images by reference) (B39). Files referenced by a kept version are not deleted.
- Export: "PDF" opens the browser's print dialog on a print layout; "Keel note" downloads the note file. Import reads a Keel note file into a new note in the current folder (B40).
- Note settings: the four sizes (defaults 28, 24, 20 and 14 px), each 10 to 40 px; a box, on, that crosses out ticked checklist items; a live preview; "Use Keel's settings", which forgets the saved sizes and box (its status line reads "Using Keel's settings"); Save, disabled until changed (B41).
- A finished day's note (6A lock): images, restores and imports are refused, the version history dialog is read-only.
- Embeds (U4): a pasted YouTube or X link offers to embed it, and the slash menu has both. An embed loads only while its note is open and online (YouTube through its privacy-enhanced domain), shows the source under it, and falls back to the plain link offline (B42).

**States:** an empty history ("No earlier versions yet"); a refused image; voice unsupported (no microphone control); a version restored (a toast).

**Phone:** the toolbar wraps to two rows, the rest in a More menu; full screen works as on desktop; version history is a full-height sheet.

### 5.7 Strategies: missed trades, templates, the photo (#44, #53)

**TZ's behaviour** (record §6, §8)

- **Missed trades:** a manual trade tagged "missed" (counts like any trade), or a Missed Trades tab inside a strategy (left out of the dashboard, calendar and reports) with symbol, a hypothetical date and time, price, commission and fees; the strategy shows followed and missed counts [help 9737204; help 7020769].
- **The chooser:** Create strategy opens a dialog with "Show every time I create a strategy" (ticked), an asset-class rail, a search, template cards (name, style and asset chips, description, author), and "Create your own" [rec S52; inv-3 094].
- **The Templates tab:** filters for assets and style, a search; cards with a cover image, title, chips, three stats from the template's sample trades (win rate, trades, win/loss), the author, and "+" to add a copy [inv-3 099]. A copy is the user's own, editable [help 7020769].
- **The photo:** the form's Photo upload under Description; an icon or image plus a colour [rec S52; help 7020769].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Missed trades | `strategy-view.tsx`, `manual-trade-form.tsx`'s fields | A missed-trades card on the strategy page (its arrangement is the comps'); `missedTrades` store; "n missed" beside the trade count on the card and page |
| Chooser | `MorphDialog`, the strategies list's search | `TemplateChooser`; `UserPrefs.strategyChooser` |
| Templates | `strategy-style.ts`, the strategy card | `src/content/strategy-templates.ts` (Keel-written, U3); a Templates tab; template cards; copy |
| Photo | The `files` store, the drop zone | Photo field in `strategy-form.tsx`; a cover band on the card and the page header |

**Behaviour in Keel** (B43 to B48)

- **Missed trades** (B43): the missed-trades card lists them (date and time, symbol, price, commission, fees) with Add, Edit and Delete. The form holds exactly TZ's fields: symbol, the date and time, price, commission and fees [help 7020769]. They live in their own table, so no figure, filter or report sees them [help 9737204]. A manual trade tagged "missed" needs nothing new.
- **Templates** (B44, B46, B47; content U3: six templates): Keel-written, each with a name, description, styles, asset classes, rule groups, a cover image and example trades labelled as examples. A card's three stats come from its examples and say so. On the Templates tab, "+" adds a copy (groups, rules, description, asset classes, the cover as its photo) to My strategies and opens it (B46); the card then marks it added, and "+" still adds another copy. The copy links to its template, and its page lists the examples apart, never in a figure.
- **The chooser** (B45, B59): opens on Create strategy while its box is on; with the box off, Create goes straight to the blank form. Picking a template opens the create form filled from it, unsaved (TZ: "presumably pre-fills", INFERRED); Start blank opens the empty form. Cancel on the form returns to the chooser, and closing the chooser returns to the strategies list [rec S52 20:04-20:06]. The Templates tab carries the same box, so it can be turned back on there.
- **The photo** (B48): PNG, JPEG or WebP up to 10 MB; replace and remove; a cover band on the strategy's card and page header. The icon stays.
- Strategies' tabs become My strategies and Templates (Shared with me needs a server, #19; Backtest scenarios is #16).

**States:** no missed trades (a line and Add); no templates match the filters ("No templates match."); a strategy without a photo (no band).

**Phone:** the chooser is a sheet with the asset filter as chips above the list; cards stack.

### 5.8 Trade scale (#52)

Out of 6B: moved to the market-data plan with #14 (U1). The record (§7) ties TZ's "potential" side to MAE and MFE: the week strip's ends match the inflated MAE and MFE sums, and no trade in the data has a plan. It joins #14 with the price-path patterns.

### 5.9 Edit history (#42)

**TZ's behaviour** (record §4)

- Settings > Logs holds imports and a history. History: a search by type, a Filter by select, and a table of Type, Action, Source, Time (with the GMT offset), Identifier, Field, Old value, New value. Seen: Account, creation, manual, the account's name [inv-3 122].

**Mapping onto Keel**

| Part | Reuses | New |
| --- | --- | --- |
| Page | `import-history.tsx` at `/app/settings/import-history` ("Logs") | History beside the import log on the same page, in an arrangement of Keel's own (the comps); `HistoryTable` |
| Writes | Every repository write path | `history.log(...)` inside the same transaction as the change |

**Behaviour in Keel** (B26 to B29)

- Logged: trades, accounts, cash flows, strategies, tags, tag categories, and the two kinds of default rule; actions created, edited (one row per field), deleted, merged, split and moved. Not logged: notes (version history covers them), preferences, the tracker (B26).
- Sources: You, Import, Rule (a default rule's change), System (expired options settled) (B26).
- An import logs one row (type Import, created n trades), not one per trade; undoing it logs one more (B27).
- Rows older than 30 days are removed on open (B28).
- Search over type, identifier and field; Filter by type, action and source; 50 rows a page; times in the profile zone with its GMT offset; values as display text, money masked by Privacy (B29).
- The table is Keel's own order: Time; the record (its type over its identifier); the change (the field, then from and to on one line); then the action and the source (B29).

**States:** empty ("No changes yet"); filters match nothing; loading skeleton rows.

**Phone:** two-line rows: the time and the record; then the change, the action and the source.

## 6. Open questions

### 6.1 Keel's calls (TradeZella unknown)

Every row below is Keel's call (TradeZella unknown). "Basis" names the evidence it leans on.

**Merge, split and move**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B1 | Merge guard | One account and one instrument, or Merge is disabled with the reason | TZ advises it [help 7031683]; a Keel trade has one account and one instrument |
| B2 | Which executions merge | All ticked; an unticked one stays in its trade; a source left empty is removed; the ticked ones form one trade even across a flat point | "Pick which executions to include" [help 7031683] |
| B3 | What a merged trade keeps | The earliest-opened source's record (id, note, rating, reviewed, levels, rule checks); tags and strategies united, and the others' rule checks added where the kept one has none; other notes unlinked and kept in Trade notes; files moved | Note unlinking [help 11517879] |
| B4 | Split | At least one execution moved and one left; each part rebuilt, open if unbalanced. The original keeps its id, serial, levels (an over-size side shows §5.2's error until fixed), rating, reviewed mark and rule checks; the new trade takes the next serial, is not reviewed, and copies tags and strategies only | "Pick which executions to separate" [help 7031683] |
| B5 | Undo | None; the dialogs say what happens; history logs it; merge and split reverse each other | Nothing seen |
| B6 | What a move carries; currency | Everything attached to the trade; the source account, its cash flows and balance stay; active accounts only. Any active account, whatever its currency: the trade keeps its own P&L currency and figures, and the dialog says so when they differ | "Transfer" [help 6706238]; archived accounts are read-only [help 8164981]; currency UNKNOWN (record §1.4) |
| B7 | The whole-account move's label and place | "Move trades" in the account's menu; its place in the menu is the comps' | The feature [rec S58 21:01; help 6706238] |
| B8 | Imports after a manual grouping | A trade marked `grouping: 'manual'` is never handed to an import's open-trade rebuild (`plan.ts` `openTrades`), so new fills on its symbol start their own trade, and fingerprint dedupe drops fills it already holds. Undoing an import whose trades were merged, split or moved since is refused with the reason, as Keel already refuses an undo a later import depends on | Keel's import plan and undo (`imports.ts`) |

**Targets and stops**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B9 | Units per instrument | Price, Price movement, Amount always; Ticks, Points for futures and options on futures (`optionOn: 'future'`); Pips for forex | The unit list waits for an instrument [inv-3 116] |
| B10 | The PnL unit | Per level: the money on that level's quantity | Both readings agree at 100% [help 12053164] |
| B11 | Level quantities | First is the position; each new one what's left; over is an error; short is allowed | The prefilled size [rec S11 4:47]; the worked example sums to the position [help 12450459] |
| B12 | The calculator control | Enter a share of the position; it fills the quantity | The icon [rec S11]; rules use % [inv-3 116] |
| B13 | A level on the wrong side | Refused inline | Direction rule [help 12450459] |
| B14 | Old single stop and target; one risk figure | A trade without levels keeps today's path (`plannedStop`, `plannedTarget`, `initialRisk`, `riskFromStop`), so its R is unchanged; it shows as one Price level each at full size and is saved in the new shape on its next edit. A trade with levels stores its stop side's loss ("the loss if every stop fills") in `initialRisk` on every save, so every existing R reader (`rOf`, `unitKeeps`, the R filter) keeps working; Planned risk shows that figure only when a target exists too (P6B-01). A shortfall counts only the covered quantities ("the loss if every stop fills"). Every R figure (trade page, log, display unit, R filter, reports, the tracker's stop rule) reads this one `tradeRisk` | No migration (§3); [help 12450459] |

**Default rules**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B15 | Rule scope and precedence | One account; instrument required; symbols optional (empty is all); a symbol match beats none, then the newest | The dialog [inv-3 116]; one rule per type advised [help 12053164] |
| B16 | Manual trades | Not on entry; included by Fill in logged trades | "Newly uploaded" [inv-3 114]; "matching trades" [help 12053164] |
| B17 | % to quantity | A % of the trade's max position when the rule is applied, rounded down to the instrument's step; the last level takes the remainder. A trade that grows later is not re-levelled. A Price-unit level that falls on the wrong side for a trade skips that side for that trade | None seen |
| B18 | Fee maths and precedence | Per fill: per contract is the amount × the fill's quantity, per execution the amount once; account currency; a fill "lacks" costs when its commission and fee are both zero; override replaces both. The rule writes the execution's values, and the trade's fees and net are recomputed. A symbol rule beats an all-symbols rule, then the newest | [help 6954370] |
| B19 | The rule list | A table in each card: account, instrument, symbols, summary, a menu (Fill in logged trades, Edit, Delete) | Only the empty state seen [inv-3 114-115] |

**Patterns**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B20 | Scope of the look-back | The workspace's trades, all accounts, days in the profile zone; computed, never stored. Each trade's look-back is the 60 days before its own entry (a day pattern's, the 60 days before that day), so later trades never change an earlier result; computed with a rolling window to fit the 50 ms budget | "Your trades"; "based on trades before" the trade's date [connector texts] |
| B21 | Thresholds and readings TZ doesn't give | As in §5.5's table: every "Keel threshold (U2)" there, D13's "and they lost", D15's neutral tone | Examples in [help 12418995]; [connector] |
| B22 | Breakeven trades; short history; open trades | Not wins or losses for T3, T7, T8, D1, D13; a look-back shorter than 60 days uses what exists; open trades are skipped by outcome patterns and counted by T14 and T16 | The breakeven range (Plan 5); look-back start UNKNOWN (record §3.2) |
| B23 | Pattern text | Keel's own sentences with the figures; never TZ's | Copy rule |
| B24 | Where they show; the report | Log column (default), trade page button, filter, day cards, day page, and a Patterns breakdown report on Keel's breakdown anatomy | [help 12418995; rec S31; connector]; the report's layout is unknown, and TZ's report pages share one anatomy [plan5-features §4] |
| B25 | Tone | A word on each pattern, Keel's own: Helps, Hurts, Neutral, in neutral chips (green and red stay for money) | Tones [connector]; hue jobs |

**History**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B26 | Types, actions, sources | As §5.9 | Only Account, creation, manual seen [inv-3 122] |
| B27 | Imports | One row per import | The Imports tab already lists them [rec S61] |
| B28 | Retention | 30 days | Imports kept a month [rec S61] |
| B29 | Search and filters | Search over type, identifier, field; Filter by type, action, source | "Search by type", "Filter by" [inv-3 122] |

**Files and notes**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B30 | Trade attachments | Images as thumbnails, other files as rows, 10 MB, no count cap, no captions | "Charts, screenshots or files" [help 5860216]; 6A's 10 MB |
| B31 | Where files live | A new `files` table; `dayShots` stays | 6A spec §4.1 seam |
| B32 | Note images | As §5.6 | [help 8410320] |
| B33 | The toolbar's grouping and lists | As §5.6: every TZ function, in Keel's own groups | Functions [inv-2 054-059]; lists unknown |
| B34 | Slash items TZ names without detail | Timed list, trade and day chips, as §5.6 | [help 8410320] |
| B35 | Equation | KaTeX | [inv-2 059] |
| B36 | Columns, page break | Two or three columns; dashed page break | [inv-2 059] |
| B37 | Full screen | The window, Escape leaves | [inv-2 054] |
| B38 | Voice | Browser speech recognition where present | [inv-2 054; help 8410320] |
| B39 | When a version is kept | 5 minutes idle after an edit, on leaving, before a restore | 30 days, before-restore [help 17516125] |
| B40 | Export and import formats | PDF through print; Keel's note file both ways | PDF and the editor's format [help 6384117] |
| B41 | Size options | 10 to 40 px | Defaults [inv-3 118] |
| B42 | Embeds | As §5.6: YouTube (privacy-enhanced) and X, loaded only while the note is open and online, with the source shown and a link fallback | [help 8410320]; U4 |
| B54 | Block handles; toggle versus collapsible section | "+" and drag on hover, with Tiptap's drag handle; a toggle folds the blocks under it, and Keel's collapsible section is unchanged | [inv-2 055]; TZ lists both items [help 8410320] |

**Strategies**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B43 | The missed-trade tab | TZ's fields only (symbol, date and time, price, commission, fees); a list with add, edit and delete (TZ unknown); its own table | [help 7020769; help 9737204] |
| B44 | Template stats; the author line | From the examples, labelled as examples; the author line reads Keel | [inv-3 099]; PRODUCT.md |
| B45 | Turning the chooser back on | The same box on the Templates tab | Only the chooser's box seen [inv-3 094] |
| B46 | An added template | "+" adds the copy and opens it; the card is marked added; "+" adds another copy | `is_downloaded` [connector] |
| B47 | Examples in a copy | Listed apart on the copy's page, never in a figure | Sample trades are illustrations [connector] |
| B48 | Photo | PNG, JPEG, WebP, 10 MB; a cover band on card and header | Template covers [inv-3 099] |

**Swap and the stat choice**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B49 | Swap in net | Net = gross − fees + swap; signed, negative a cost | It's a cost (INFERRED) [help 5829394] |
| B50 | Where swap shows | Trade page and Overview, labelled "Swap"; a calendar month reaches it through the month panel's link to the Overview (Plan 5 C3). 6B builds the Overview figure; 6C checks it | [rec S13; help 5829394; help 7189346] |
| B51 | The stat choice | Every stat-card row switchable; the header figures fixed; all on by default; per user; fixed order | [help 5860216] |

**Storage**

| Id | Question | Keel's call | Basis |
| --- | --- | --- | --- |
| B52 | Version numbers | The next Dexie and seed versions after whatever lands before 6B | §3 |
| B53 | Sample seed | Two merged trades and one split; levels on a third of trades; two default rules of each kind; swap on forex trades; files none; a missed trade per strategy; history rows for the seed's edits, stamped relative to the seed time so the 30-day purge keeps them for a month | The sample shows every state |
| B55 | Trade edits on a finished day | Allowed, as today (6A locks the note, ticks, rating, mood, session and shots, not trades). The day's frozen score stays (6A K3); its displayed P&L follows the trades | 6A spec §5.1, K3 |
| B56 | When files are deleted | Deleting a trade or strategy deletes its files. A note's files go when the note is purged from Trash. At the 30-day version purge, a note's image files referenced neither by its body nor by a kept version are deleted (a scan of that note's bodies) | Versions keep images [help 17516125] |
| B57 | Editing or deleting a default rule | Values already applied stay; only Fill in logged trades rewrites them | Fee rule delete [help 6954370]; target rule UNKNOWN (record §2.2) |
| B58 | Costs by hand: when it saves | When the row is confirmed; recomputes the trade; logged | The row's confirm tick [help 6387098] |
| B59 | Picking a template in the chooser | Opens the create form filled from it, unsaved | "Presumably pre-fills" (record §6.2, INFERRED) |
| B60 | Swap and the places that derive costs | Swap is a cost of its own, never part of "commissions" or "fees": wherever a view derives a cost as gross minus net, it uses the trades' fees instead; the Overview's Gross to net shows a Swap line (only when some trade has a swap) so gross, fees, swap and net add up | TZ lists Total swap beside commissions and fees [help 5829394]; net includes swap (B49) |

### 6.2 Decided by the owner (2026-11-25)

The owner took the recommendation on all four questions, and approved this doc on the condition that every behaviour is TZ's record, with Keel's calls only where TZ is unknown, each marked. A last pass removed the one call that added to a known TZ field list (B43).

- **U1. Trade scale (#52)** moves to the market-data plan with #14. The evidence ties its "potential" side to MAE and MFE (record §7). 6A's week strip seam stays closed until then.
- **U2. Patterns whose condition TZ gives only in words** (D1, D3, D4, D5, D7, D9, D11, D14, D15) are built with the thresholds in §5.5, each marked "Keel threshold (U2)" so the owner can adjust them. D8 waits with the price-path patterns.
- **U3. Template content:** six Keel-written templates, one each for stocks, futures, forex, options and crypto, plus one intraday playbook. Each has rule groups, three to five example trades labelled as examples, and a cover drawn in Keel's style (no photos).
- **U4. Outside services in the editor** stay, as TZ has them: YouTube and X embeds load only while the note is open and online and show where the content comes from; dictation uses the browser's speech service (in Chrome, Google's), and its control says so.

## 7. Corrections to existing records

| Record | Says | Should say |
| --- | --- | --- |
| BACKLOG #40 | Flags include "a trade with poor risk and reward" and "a profit five times its worst drawdown"; a top-patterns summary | "Not a strong trade" has no criteria, and the five-times flag needs the price path. The fills-only set is §5.5's. The top-patterns slide is the AI recap (#22); Keel shows per-pattern figures in a Patterns report |
| BACKLOG #52 | The ends are the set's largest loss and largest win | TZ defines potential versus actual [help 7218420]; the evidence points at MAE and MFE. Moves to the market-data plan with #14 (U1) |
| BACKLOG #43 | Screenshots on trades | Charts, screenshots or files [help 5860216]; add version history's 30 days, export and import, embeds (U4) |
| BACKLOG #53 | A cover photo | An icon or an image plus a colour [help 7020769]; Keel keeps its icon, adds the photo, and keeps ruling 41 on colour |
| BACKLOG #55 | Swap and financing | Swap only; TZ has no financing field |
| BACKLOG #56 | "Low value: Keel already shows every field" | TZ lets the trader choose [help 5860216]; parity applies |
| Feature map TR10 | Between the largest loss and largest win | As #52 |
| E27 | Swap and extra fee columns aren't summed | The swap part closes with #55; extra fee columns stay open |

## 8. Left to the builder

**Comps** (`.impeccable/mocks/plan6b/`, light and dark, at 390 and 1440)

1. Trade page: target and stop blocks, swap, the stat choice, attachments, the patterns button and popover.
2. Trade log: the Patterns column; the bulk bar with Merge, Split and Move; the merge dialog.
3. The split dialog and the move dialog.
4. Settings > Trading with the two rule cards, the target rule dialog, the fee rule dialog, and Fill in logged trades.
5. Notes: the editor with the full toolbar, an image with a caption, columns, the slash menu; the version history panel.
6. Settings > Notebook with the preview.
7. Strategies: the chooser; the Templates tab; a strategy with its photo and its missed trades.
8. Settings > Logs: History.
9. Patterns: the day card's popover and the Patterns report.

**Copy:** every label is Keel's own, from the comps. Never used: Zella, Zella Insights, Zella Scale, Insights (as a feature name), Rules & Fees, Transfer data, Transfer trades, Customize Info, Select Default, Update (as a save button), Show every time I create a strategy, Create your own, Browse templates, Target in Price, Add PT, Add SL, Initial target, Trade risk, Total swap, Held onto loser, Strength, Area to improve, Reset to defaults, Old value, New value; and, as TZ's own labels or a near copy of one: Apply to existing trades, Before restore, and Reset to default on Settings > Notebook (P6B-B207 to B209; the stat chooser's Reset to default stands, TZ's word there being Select Default).

**Wiring:** module, hook and query-key names; invalidation (a trade change refreshes patterns, the tracker and the day views); the history write inside each repository transaction.

**Tests:** domain-first for risk (the help's worked example, every unit, wrong side, shortfall), grouping (merge across a flat point, split leaving an open part), fee and target rules (precedence, rounding, override), every pattern and its edges, history purge; the migration test; e2e for merge then split, move, a default rule on import, an image in a note and a restore, a template copied.

**Review Focus candidates**

1. Every R figure reads `tradeRisk`, and a legacy trade's R is unchanged.
2. A merge, split or move never changes a finished day's frozen score, and logs one row per trade.
3. A rule never overwrites values without the override box.
4. Missed trades and template examples never reach a figure.
5. Privacy hides money in pattern sentences, rule amounts, swap and history values.

**Records at the end:** close #38, #39, #40 (fills-only part), #42, #43, #44, #53, #55, #56, E10 and the swap part of E27; add rows for the price-path patterns and D8 (with #14), and move #52 to the market-data plan (U1).
