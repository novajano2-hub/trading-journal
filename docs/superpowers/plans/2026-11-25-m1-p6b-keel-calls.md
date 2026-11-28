# Plan 6B: every Keel call (branch claude/m1-p6b-6ab9ab)

For the owner to check. Keel calls are made only where TradeZella's behaviour is unknown; the spec marks each one. Source: docs/superpowers/specs/2026-11-25-plan-6b-trade-depth-design.md §6.1 (B calls) and §6.2 (the owner's U calls).

## B calls in the spec (B1 to B61)

| id | topic | Keel's call |
|---|---|---|
| B1 | Merge guard | One account and one instrument, or Merge is disabled with the reason |
| B2 | Which executions merge | All ticked; an unticked one stays in its trade; a source left empty is removed; the ticked ones form one trade even across a flat point |
| B3 | What a merged trade keeps | The earliest-opened source's record (id, note, rating, reviewed, levels, rule checks); tags and strategies united, and the others' rule checks added where the kept one has none; other notes unlinked and kept in Trade notes; files moved |
| B4 | Split | At least one execution moved and one left; each part rebuilt, open if unbalanced. The original keeps its id, serial, levels (an over-size side shows §5.2's error until fixed), rating, reviewed mark and rule checks; the new trade takes the next serial, is not reviewed, and copies tags and strategies only |
| B5 | Undo | None; the dialogs say what happens; history logs it; merge and split reverse each other |
| B6 | What a move carries; currency | Everything attached to the trade; the source account, its cash flows and balance stay; active accounts only. Any active account, whatever its currency: the trade keeps its own P&L currency and figures, and the dialog says so when they differ |
| B7 | The whole-account move's label and place | "Move trades" in the account's menu; its place in the menu is the comps' |
| B8 | Imports after a manual grouping | A trade marked `grouping: 'manual'` is never handed to an import's open-trade rebuild (`plan.ts` `openTrades`), so new fills on its symbol start their own trade, and fingerprint dedupe drops fills it already holds. Undoing an import whose trades were merged, split or moved since is refused with the reason, as Keel already refuses an undo a later import depends on |
| B9 | Units per instrument | Price, Price movement, Amount always; Ticks, Points for futures and options on futures (`optionOn: 'future'`); Pips for forex |
| B10 | The PnL unit | Per level: the money on that level's quantity |
| B11 | Level quantities | First is the position; each new one what's left; over is an error; short is allowed |
| B12 | The calculator control | Enter a share of the position; it fills the quantity |
| B13 | A level on the wrong side | Refused inline |
| B14 | Old single stop and target; one risk figure | A trade without levels keeps today's path (`plannedStop`, `plannedTarget`, `initialRisk`, `riskFromStop`), so its R is unchanged; it shows as one Price level each at full size and is saved in the new shape on its next edit. A trade with levels stores its stop side's loss ("the loss if every stop fills") in `initialRisk` on every save, so every existing R reader (`rOf`, `unitKeeps`, the R filter) keeps working; Planned risk shows that figure only when a target exists too (P6B-01). A shortfall counts only the covered quantities ("the loss if every stop fills"). Every R figure (trade page, log, display unit, R filter, reports, the tracker's stop rule) reads this one `tradeRisk` |
| B15 | Rule scope and precedence | One account; instrument required; symbols optional (empty is all); a symbol match beats none, then the newest |
| B16 | Manual trades | Not on entry; included by Fill in logged trades |
| B17 | % to quantity | A % of the trade's max position when the rule is applied, rounded down to the instrument's step; the last level takes the remainder. A trade that grows later is not re-levelled. A Price-unit level that falls on the wrong side for a trade skips that side for that trade |
| B18 | Fee maths and precedence | Per fill: per contract is the amount × the fill's quantity, per execution the amount once; account currency; a fill "lacks" costs when its commission and fee are both zero; override replaces both. The rule writes the execution's values, and the trade's fees and net are recomputed. A symbol rule beats an all-symbols rule, then the newest |
| B19 | The rule list | A table in each card: account, instrument, symbols, summary, a menu (Fill in logged trades, Edit, Delete) |
| B20 | Scope of the look-back | The workspace's trades, all accounts, days in the profile zone; computed, never stored. Each trade's look-back is the 60 days before its own entry (a day pattern's, the 60 days before that day), so later trades never change an earlier result; computed with a rolling window to fit the 50 ms budget |
| B21 | Thresholds and readings TZ doesn't give | As in §5.5's table: every "Keel threshold (U2)" there, D13's "and they lost", D15's neutral tone |
| B22 | Breakeven trades; short history; open trades | Not wins or losses for T3, T7, T8, D1, D13; a look-back shorter than 60 days uses what exists; open trades are skipped by outcome patterns and counted by T14 and T16 |
| B23 | Pattern text | Keel's own sentences with the figures; never TZ's |
| B24 | Where they show; the report | Log column (default), trade page button, filter, day cards, day page, and a Patterns breakdown report on Keel's breakdown anatomy |
| B25 | Tone | A word on each pattern, Keel's own: Helps, Hurts, Neutral, in neutral chips (green and red stay for money) |
| B26 | Types, actions, sources | As §5.9 |
| B27 | Imports | One row per import |
| B28 | Retention | 30 days |
| B29 | Search and filters | Search over type, identifier, field; Filter by type, action, source |
| B30 | Trade attachments | Images as thumbnails, other files as rows, 10 MB, no count cap, no captions |
| B31 | Where files live | A new `files` table; `dayShots` stays |
| B32 | Note images | As §5.6 |
| B33 | The toolbar's grouping and lists | As §5.6: every TZ function, in Keel's own groups |
| B34 | Slash items TZ names without detail | Timed list, trade and day chips, as §5.6 |
| B35 | Equation | KaTeX |
| B36 | Columns, page break | Two or three columns; dashed page break |
| B37 | Full screen | The window, Escape leaves |
| B38 | Voice | Browser speech recognition where present |
| B39 | When a version is kept | 5 minutes idle after an edit, on leaving, before a restore |
| B40 | Export and import formats | PDF through print; Keel's note file both ways |
| B41 | Size options | 10 to 40 px |
| B42 | Embeds | As §5.6: YouTube (privacy-enhanced) and X, loaded only while the note is open and online, with the source shown and a link fallback |
| B43 | The missed-trade tab | TZ's fields only (symbol, date and time, price, commission, fees); a list with add, edit and delete (TZ unknown); its own table |
| B44 | Template stats; the author line | From the examples, labelled as examples; the author line reads Keel |
| B45 | Turning the chooser back on | The same box on the Templates tab |
| B46 | An added template | "+" adds the copy and opens it; the card is marked added; "+" adds another copy |
| B47 | Examples in a copy | Listed apart on the copy's page, never in a figure |
| B48 | Photo | PNG, JPEG, WebP, 10 MB; a cover band on card and header |
| B49 | Swap in net | Net = gross − fees + swap; signed, negative a cost |
| B50 | Where swap shows | Trade page and Overview, labelled "Swap"; a calendar month reaches it through the month panel's link to the Overview (Plan 5 C3). 6B builds the Overview figure; 6C checks it |
| B51 | The stat choice | Every stat-card row switchable; the header figures fixed; all on by default; per user; fixed order |
| B52 | Version numbers | The next Dexie and seed versions after whatever lands before 6B |
| B53 | Sample seed | Two merged trades and one split; levels on a third of trades; two default rules of each kind; swap on forex trades; files none; a missed trade per strategy; history rows for the seed's edits, stamped relative to the seed time so the 30-day purge keeps them for a month |
| B54 | Block handles; toggle versus collapsible section | "+" and drag on hover, with Tiptap's drag handle; a toggle folds the blocks under it, and Keel's collapsible section is unchanged |
| B55 | Trade edits on a finished day | Allowed, as today (6A locks the note, ticks, rating, mood, session and shots, not trades). The day's frozen score stays (6A K3); its displayed P&L follows the trades |
| B56 | When files are deleted | Deleting a trade or strategy deletes its files. A note's files go when the note is purged from Trash. At the 30-day version purge, a note's image files referenced neither by its body nor by a kept version are deleted (a scan of that note's bodies) |
| B57 | Editing or deleting a default rule | Values already applied stay; only Fill in logged trades rewrites them |
| B58 | Costs by hand: when it saves | When the row is confirmed; recomputes the trade; logged |
| B59 | Picking a template in the chooser | Opens the create form filled from it, unsaved |
| B60 | Swap and the places that derive costs | Swap is a cost of its own, never part of "commissions" or "fees": wherever a view derives a cost as gross minus net, it uses the trades' fees instead; the Overview's Gross to net shows a Swap line (only when some trade has a swap) so gross, fees, swap and net add up |
| B61 | A fee rule and a trade settled in another currency | A fee rule's amounts are in its account's currency, so it leaves alone a trade whose P&L currency is not the account's (a trade moved in from an account in another currency keeps its own, B6), at import and in Fill in logged trades. Fill in logged trades counts those trades and says they are left as they are. A target rule has no currency and covers them |

## The owner's decisions (U1 to U4)

- U1: trade scale (#52) moves to the market-data plan with #14 (its potential side needs MAE and MFE).
- U2: patterns whose condition TZ gives only in words (D1, D3, D4, D5, D7, D9, D11, D14, D15) use Keel thresholds, each marked "Keel threshold (U2)"; D8 waits with the price-path patterns.
- U3: six Keel-written strategy templates (stocks, futures, forex, options, crypto, one intraday playbook), example trades labelled, covers drawn in Keel's style.
- U4: YouTube and X embeds and dictation stay as TZ has them, each saying where the content comes from.

## Calls made during the build (behaviour, where TZ is unknown)

- R1: levels written by a rule go through the same patch as the trade page, so the stored risk is rewritten one way.
- Costs: a fee rule or a cost typed by hand moves fees, gross and net by the change in the fills' costs, not by rebuilding the trade (replaced ledger R2).
- R3: swap survives merge and split: a merged trade's swap is the sum of its sources'; a split keeps it on the original.
- R4: the note version keeper sits inside the note editor, so every note host gets versions.
- Planned R for a trade without stored levels keeps the old price ratio, so legacy figures don't move; Realized R reads None while a trade is open.
- Archived strategies keep their missed trades and can still add them.
- History: rows of one edit are ordered by record, then field; a cost-method change is logged.
- Note images (B56): the 30-day version purge, the Trash purge and a delete for good remove an image only when no note body, kept version or template in the workspace still shows it, and the version purge only touches images older than the cutoff; an image another note shows moves to that note.
- Fee rules skip the synthetic expiry-settlement fill everywhere (import, Fill in logged trades, its preview).
- Ticks per contract shows for futures only, as Ticks does; None before a future's first exit.
- Wording that replaced TZ's (parity audit): "Fill in logged trades" (B207), "Replaced" (B208), "Use Keel's settings" (B209).
- The slash menu lists only TZ's slash items; Two and Three columns, Page break and Equation stay in Insert only (B35, B36).
- Not TZ matters, fixed for users: the top bar's chip fit no longer flips under Reduce motion (main's E55 loop).
- The sample (B53, seed version 10): swap follows v8's draw (about 71% charges) on forex trades no note states; each weekly recap is restated from the trades after grouping and swap.
- A shared report chart starts its plot far enough in that a tilted first label shows whole (found by the 6B sweep on the Patterns report).
