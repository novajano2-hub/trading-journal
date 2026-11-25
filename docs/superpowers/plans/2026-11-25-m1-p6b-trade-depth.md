# Milestone 1 · Plan 6B: Trade depth, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TradeZella's trade depth on local data:
- merge, split and move trades (#38);
- several targets and stops, with default target, stop and fee rules (#39);
- patterns from fills (#40);
- an edit history (#42);
- trade attachments, note images and the full note editor (#43);
- missed trades and Keel's strategy templates (#44), and a strategy photo (#53);
- swap on a trade (#55), and choosing the trade page's stats (#56).

**Architecture:**
- **Domain:** pure and test-first. `src/domain/risk.ts` (levels and R), `src/domain/grouping.ts` (merge and split), `src/domain/rules/` (default target and fee rules), `src/domain/patterns/`.
- **Storage:** the next Dexie version adds `files`, `noteVersions`, `history`, `targetRules`, `feeRules` and `missedTrades`. New repositories sit behind new TanStack Query hooks, and every write that changes a logged record writes its history row in the same transaction.
- **Screens:** client leaves under `src/components/app/{trades,notes,strategies,settings,reports}/`; one new route, `/app/settings/notebook`.

**Tech Stack:** unchanged from Plan 6A: Next.js 16.4.6, React 19.3, TypeScript strict, Tailwind 4, TanStack Query 5 and Table 9, Dexie 4, Tiptap 3, Phosphor icons, Vitest 5 with happy-dom and fake-indexeddb, Playwright on system Chrome.
- **New dependencies (Task 19, 20):** Tiptap 3 extensions pinned to the repo's `3.33.0`: `@tiptap/extension-text-style` (TextStyle, Color, FontFamily, FontSize), `@tiptap/extension-highlight`, `@tiptap/extension-text-align`, `@tiptap/extension-subscript`, `@tiptap/extension-superscript`, `@tiptap/extension-image`, `@tiptap/extension-youtube`, `@tiptap/extension-drag-handle-react`, `@tiptap/extension-mathematics` and `@tiptap/extension-emoji`; plus `katex`. Before installing each, check on npm that it is MIT-licensed and free; if one isn't, build that node by hand in `src/components/app/notes/extensions/` instead.

**Spec:** `docs/superpowers/specs/2026-11-25-plan-6b-trade-depth-design.md`. It is approved; B1 to B59 are its Keel's calls and U1 to U4 the owner's decisions. The authorities, in order:
1. **The behaviour record,** `.superpowers/research/tradezella/plan6b-behaviour.md` in this worktree (git-ignored). **TradeZella's record wins on behaviour** over the spec's wording, the comps and this plan.
2. **The spec,** including its corrections (§7) and its Keel's calls (§6.1).
3. **The comps.** They are the binding look, and only the look:
   - `.impeccable/mocks/plan6b/01-trade-page.html` to `09-patterns.html` (04 is `04-settings-trading.html`), with `shell.css`, `shell.js` and `log.js`;
   - their `?state=` variants (listed in each task), and `?theme=dark` on any comp;
   - the captures in `.impeccable/mocks/plan6b/captures/` (git-ignored).
4. **The parity audit,** `.superpowers/research/tradezella/plan6b-parity-audit.md` (P6B-01 to P6B-32, all fixed in the spec and comps).
5. **`DESIGN.md`, `src/styles/theme.css` and `PRODUCT.md`;** Plan 5's and 6A's plans and rulings.

**TradeZella parity is behaviour and features only, never its UI** (the owner, 2026-11-25). Layout, arrangement, look, wording and icons are Keel's. Every control, column, field, stat, step and state must trace to the record or to a marked Keel's call (B or U id).

**Execution:**
- **Start only after Plan 6A has landed on `m1-p6a`,** when the coordinating session says so. Then, first: `git merge m1-p6a` into this branch, resolve, and run `npm test && npm run typecheck && npm run lint`. 6A's day views (`src/components/app/trades/log/`, `src/components/app/day/`, `src/data/day-log.ts`) and Dexie v3 must be present before Task 1.
- **One implementer at a time,** never in parallel (the owner's call), with superpowers:subagent-driven-development.
- **Each implementer brief says:** the record wins over the comps on behaviour; every control, column, field, stat, step and state traces to the record or a marked B or U call; no TradeZella wording (§8's "Never used" list).
- **Each module ends with a review in two parts:** the code review, and a **parity check** of that module's tasks against `plan6b-behaviour.md`, section by section (the module table names the sections). The parity check reports anything the module adds, omits or changes, against both the record and this plan, and the module isn't done until it is clean.
- **Playwright** runs on port **3130** with a temporary config (copy `playwright.config.ts` to a git-ignored `playwright.6b.config.ts` with `webServer.port` and `use.baseURL` on 3130). **Never stop the owner's dev server on port 3000.**

| Module | Tasks | Parity check against the record |
|---|---|---|
| A Foundations | 1-4 | §4 (history), §5.1 (attachments), and the storage parts of §2, §6, §8, §9 |
| B Risk on a trade (#39) | 5-7 | §2.1 |
| C Merge, split and move (#38) | 8-10 | §1 |
| D Default rules (#39) | 11-12 | §2.2, §2.3 |
| E Trade page depth (#55, #56, #43) | 13-15 | §2.3 (costs by hand), §5.1, §9, §10 |
| F Patterns (#40) | 16-18 | §3 |
| G Notes (#43) | 19-22 | §5.2 to §5.6 |
| H Strategies (#44, #53) | 23-24 | §6, §8 |
| I History page, sample, finish | 25-27 | §4, then every section once more |

## Global Constraints

- **Toolchain:** Node ≥ 22, npm, Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind 4, Vitest 5, Playwright with `channel: 'chrome'`.
- **Branch and commits:** work on `claude/m1-p6b-6ab9ab`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or merge to main.
- **Next.js docs first.** Before route code, read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `layout.md`. `params` and `searchParams` are Promises. If `next dev` rewrites AGENTS.md, commit that change with the task.
- **Boundaries:** pages and components use only the hooks in `src/data/query/*`; nothing under `src/components` or `src/app` imports `src/data/local/*`, Dexie or IndexedDB (tests excepted); `src/domain/**` stays pure.
- **Storage safety** (spec §3, §4.3): the upgrade rewrites no row; new tables start empty; new fields are optional; the sample reseeds by version; My workspace never does. Any change to the trade shape also applies to `imports.replacedTrades` (see `tradeToV2` in `db.ts`).
- **The 6A day lock stays in the write path:** note images, version restores and note imports on a finished day's daily note are refused (`LockedDayError`). Trades stay editable on finished days (B55); a finished day's frozen score never changes.
- **History in the write path:** every write to a logged record (B26) writes its history row inside the same `rwTx`. A failed write leaves no row.
- **Look:**
  - The comps are binding on look; real data wins over comp numbers. Design G, graphite dark, no icon tiles.
  - Tokens only through their Tailwind names (`bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`, `warn*`, `info*`), shadows as `shadow-[var(--shadow-card)]`, cards with `CARD`, `CARD_PAD` and `CardHeader` from `src/components/app/dashboard/shared.tsx`.
  - Hue jobs: accent for what is chosen; green and red for money and for kept or broken, always with a sign or a word. Pattern tones are neutral chips with the words Helps, Hurts, Neutral (B25).
- **Copy:** Keel's own, from the comps. Never: Zella, Zella Insights, Zella Scale, Insights (as a feature name), Rules & Fees, Transfer data, Transfer trades, Customize Info, Select Default, Update (as a save button), Show every time I create a strategy, Create your own, Browse templates, Target in Price, Add PT, Add SL, Initial target, Trade risk, Total swap, Held onto loser, Strength, Area to improve, Reset to defaults, Old value, New value. No em or en dashes; ranges "a to b"; "None" for an empty value. Every new metric label carries a `MetricTip` whose text lives only in `src/content/metric-definitions.ts`.
- **Numbers:** tabular figures. Every money figure goes through `useDisplay()` (`display.figure` or `display.cash`), so Privacy masks it: pattern sentences, levels' money, rule amounts, swap, fill costs and history values included.
- **Phone:** below `sm`, tables become two-line rows and dialogs become full-height sheets with a fixed footer.
- **Accessibility and layout:** WCAG 2.2 AA, a visible focus ring, 44px targets on coarse pointers, a keyboard path for every action (drag handles have a menu alternative: Move up, Move down). No horizontal page overflow from 390 to 1680px.
- **Motion:** only in `'use client'` leaves, through `src/lib/motion.ts`. Under reduced motion, nothing moves.
- **Performance,** on the sample (~1,230 trades): every pattern for the whole workspace under 50 ms; filtering plus patterns under 50 ms; the history table pages at 50 rows; thumbnails load lazily and revoke their object URLs on unmount.
- **Tests:** component tests start with `// @vitest-environment happy-dom` and `afterEach(cleanup)`. Domain and data work is test-first. `npm run e2e` builds first; use the 3130 config.
- **Verification:** before each commit, `npm test`, `npm run typecheck` and `npm run lint` pass; before each module's last commit, `npm run build` and that module's e2e spec pass.
- **Out of scope:** AI (#22); the trade scale (#52, U1); price-path patterns T1, T2, T4, T5, T6, T9, T10, T11, T12, T13, D2, D6, D8, D12 (#14); shared strategies (#19); backtesting (#16); the strategy cap and paywall; a strategy colour (Plan 5 ruling 41).

## Review Focus

1. **A legacy trade's R never moves.** A trade saved before 6B (one `plannedStop`, `initialRisk` from `riskFromStop`) shows the same Realized R, Planned R, R filter result and R display unit after the upgrade and after an unrelated edit. Pinned in Tasks 5 and 6.
2. **Grouping never corrupts history.** After a merge, split or move, a finished day's frozen score is unchanged; each touched trade has one history row; undoing an import whose trades were regrouped is refused with the reason (B8). Pinned in Tasks 9 and 25.
3. **A rule never overwrites without the override box.** Without override, a target rule skips any trade with levels and a fee rule skips any trade with a costed fill; with override, it replaces. Deleting a rule leaves applied values (B57). Pinned in Task 11.
4. **Missed trades and template examples never reach a figure.** No summary, filter, report, calendar, tracker score or pattern counts them. Pinned in Tasks 23 and 24.
5. **Privacy hides money everywhere new:** pattern sentences, Planned reward and risk, level amounts, rule amounts, swap, fill costs and history values. Counts, R and percentages stay. Pinned in Tasks 7, 12, 14, 17 and 25.

## Calls this plan makes (builder level)

These settle what the spec left to the builder (§8). Reviewers should not "fix" them.

| Question | Call |
|---|---|
| Where a level trade's risk lives (B14) | `initialRisk` stays the stored "stop side's loss", rewritten on every save of the stops (`tradeRisk`). `rOf`, `unitKeeps` and the R filter keep reading it unchanged. Planned risk shows it only when a target exists too |
| The fills chart with several levels | `fills-timeline.tsx` draws one line per level (targets and stops), replacing its single stop and target lines; the zones shade from the average entry to the farthest level on each side |
| History values | Stored raw (`oldValue`, `newValue` as JSON-safe primitives) with the field id; formatted at read time with the reader's Display, so Privacy and units apply |
| File ownership | `owner` is a string `trade:<id>`, `note:<id>` or `strategy:<id>`, indexed `[workspaceId+owner]`. A note image's node stores `src: "keel-file:<id>"`; the editor resolves it to an object URL |
| When a version is kept (B39) | The editor host (`useNoteVersions`) keeps a version when the body changed and 5 minutes passed since the last one, on unmount if the body changed since the last version, and before a restore |
| PDF export (B40) | `window.print()` on a print route-free layout: the note is rendered into a hidden `#print-note` node with `@media print` rules that hide the app. 6C's report PDF may share the stylesheet `src/styles/print.css` |
| Pattern ids | Keel's own ids (`held-longer`, `long-loss-hold`, `loss-after-loss`, `added-to-position`, `exited-in-parts`, `large-size`, `losses-outweighed`, `switched-sides-red`, `switched-sides-green`, `one-strong-trade`, `low-return`, `sized-up-after-wins`, `more-trades`, `waited-then-won`, `quick-reentries`, `rushed-red-day`, `busier-than-green`), never TradeZella's slugs |
| The filter's URL key | `pat` (repeatable), like the other list filters in `FILTER_PARAMS` |
| Swap in the trade builder | `finalize()` stays as it is; the closed-trades import adds `swap` after building, then sets `net = net + swap` and leaves `gross`. A fills import has no swap (TradeZella's execution layout has none) |
| Template covers | Inline SVG drawings in Keel's palette, one per template, in `src/content/strategy-templates.ts`; a copied strategy stores its template's cover as a `files` row, so a copy's photo can be replaced |
| Version numbers (B52) | Dexie: the next free version after 6A's v3 at merge time (expected 4). Sample seed: the next after 6A's 5 (expected 6) |

## File map

```
src/domain/            risk.ts grouping.ts   rules/{target-rules,fee-rules}.ts   patterns/{defs,trade,day,index}.ts   (+ tests)
                       (modified) types.ts trade-builder.ts manual-trade.ts metrics/{summary,units}.ts tracker/inputs.ts
                       import/{mapping,rows,plan}.ts
src/data/              (modified) repository.ts trade-patch.ts filters.ts trade-columns.ts csv-export.ts
src/data/local/        files.ts history.ts target-rules.ts fee-rules.ts missed-trades.ts note-versions.ts grouping.ts   (+ tests)
                       (modified) db.ts schema.ts trades.ts accounts.ts cashflows.ts strategies.ts tags.ts tag-categories.ts
                       imports.ts journal.ts prefs.ts local-repository.ts migration.test.ts
src/data/query/        (modified) keys.ts hooks.ts
src/data/seed/         (modified) generate.ts version.ts
src/content/           strategy-templates.ts   (modified) metric-definitions.ts
src/styles/            print.css
src/components/app/trades/        levels-block.tsx size-helper.tsx stats-chooser.tsx trade-files.tsx file-viewer.tsx
                                  fill-costs.tsx patterns-button.tsx group-dialogs.tsx move-dialog.tsx
                                  (modified) trade-view.tsx bulk-bar.tsx columns.tsx fills-timeline.tsx manual-trade-form.tsx
                                  trades-view.tsx log/day-card.tsx
src/components/app/day/           (modified) day-header.tsx
src/components/app/notes/         editor-toolbar.tsx extensions/{columns,page-break,timed-list,link-chip,tweet}.ts
                                  image-view.tsx version-history.tsx note-export.ts dictation.ts
                                  (modified) note-editor.tsx slash-menu.tsx note-prose.css
src/components/app/strategies/    template-chooser.tsx templates-tab.tsx template-card.tsx missed-trades.tsx photo-field.tsx
                                  (modified) strategies-view.tsx strategy-form.tsx strategy-view.tsx
src/components/app/settings/      rule-cards.tsx target-rule-dialog.tsx fee-rule-dialog.tsx apply-rule-dialog.tsx
                                  notebook-settings.tsx history-card.tsx
                                  (modified) trading.tsx accounts.tsx import-history.tsx settings-nav.tsx
src/components/app/reports/       patterns-report.tsx   (modified) report-keys.ts reports-shell.tsx overview-costs.tsx overview-choice.tsx
src/components/app/               (modified) more-filters.tsx filter-model.ts
src/app/(app)/app/settings/       notebook/page.tsx
e2e/                              trade-depth.spec.ts rules.spec.ts notes-depth.spec.ts strategies-depth.spec.ts
docs/BACKLOG.md docs/research/tradezella-feature-map.md DESIGN.md   (modified)
```

---

## Module A: Foundations

### Task 1: Types and storage

Delivers spec §4.3 and B52.

**Files:**
- Modify: `src/domain/types.ts`, `src/data/local/db.ts`, `src/data/local/schema.ts`, `src/data/local/prefs.ts`
- Test: `src/data/local/migration.test.ts`, the prefs tests (`grep -ln "prefs.update" src/data/local/*.test.ts`)

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export type LevelUnit = 'price' | 'movement' | 'amount' | 'ticks' | 'points' | 'pips';
  export interface Level { value: number; qty: number }
  export interface LevelSide { unit: LevelUnit; levels: Level[] }
  // Trade: add
  targets?: LevelSide; stops?: LevelSide; swap?: Cents; grouping?: 'manual';
  // Strategy: add
  photoId?: string; templateId?: string;
  export interface StoredFile { id: string; workspaceId: string; owner: string; bytes: ArrayBuffer;
    type: string; name: string; size: number; createdAt: string }
  export interface NoteVersion { id: string; workspaceId: string; noteId: string; body: unknown;
    savedAt: string; kind: 'auto' | 'before-restore' }
  export type HistoryType = 'trade' | 'account' | 'cash-flow' | 'strategy' | 'tag' | 'tag-category'
    | 'target-rule' | 'fee-rule' | 'import';
  export type HistoryAction = 'created' | 'edited' | 'deleted' | 'merged' | 'split' | 'moved' | 'undone';
  export type HistorySource = 'you' | 'import' | 'rule' | 'system';
  export interface HistoryRow { id: string; workspaceId: string; at: string; type: HistoryType;
    action: HistoryAction; source: HistorySource; entityId: string; label: string;
    field?: string; oldValue?: string | number | boolean | null; newValue?: string | number | boolean | null }
  export interface RuleLevel { value: number; pct: number }
  export interface TargetRule { id: string; workspaceId: string; accountId: string; assetClass: AssetClass | 'future-option';
    symbols: string[]; target?: { unit: LevelUnit; levels: RuleLevel[] }; stop?: { unit: LevelUnit; levels: RuleLevel[] };
    createdAt: string }
  export interface FeeRule { id: string; workspaceId: string; accountId: string; assetClass: AssetClass | 'future-option';
    symbols: string[] /* empty: all */; mode: 'per-contract' | 'per-execution'; applyOn: 'all' | 'entry' | 'exit';
    commission: Cents; fee: Cents; createdAt: string }
  export interface MissedTrade { id: string; workspaceId: string; strategyId: string; symbol: string;
    at: string /* UTC ISO */; price?: number; commission?: Cents; fees?: Cents }
  export interface NoteType { h1: number; h2: number; h3: number; body: number; strikeChecked: boolean }
  // UserPrefs: add
  tradeStats?: string[] /* the stat-card rows shown; undefined: all */;
  noteType?: NoteType; strategyChooser?: boolean /* undefined: on */;
  ```
- Produces, in `db.ts`: `this.version(N).stores({ files: '[workspaceId+id], workspaceId, [workspaceId+owner]', noteVersions: '[workspaceId+id], workspaceId, [workspaceId+noteId]', history: '[workspaceId+id], workspaceId, [workspaceId+at]', targetRules: '[workspaceId+id], workspaceId', feeRules: '[workspaceId+id], workspaceId', missedTrades: '[workspaceId+id], workspaceId, [workspaceId+strategyId]' })` with no `.upgrade`, N being the next free version, and typed tables of those names.
- Produces, in `schema.ts`: `DATA_TABLES` gains the six tables.

- [ ] **Step 1: Write the failing tests** in `migration.test.ts`. Add `openV3(indexedDB, rows, meta)` beside `openV2`, with `V3_STORES` (V2's plus `trackers`, `days`, `dayShots`).
  - `'the 6B upgrade keeps every row and adds empty tables'`: a trade (with `plannedStop` and `initialRisk`), account, strategy, journal entry, day record and import job with `replacedTrades`, in both workspaces, plus prefs. After `new KeelDb(...).open()`, each row deep-equals its original, and the six new tables count 0.
- [ ] **Step 2: Write the failing prefs tests.** `update({ tradeStats: ['fees', 7] })` throws RangeError; `noteType` sizes must be integers 10 to 40 and `strikeChecked` a boolean, else RangeError; `strategyChooser` must be a boolean.
- [ ] **Step 3:** `npm test -- src/data/local`. Expected: FAIL.
- [ ] **Step 4:** Implement the types, the version, `DATA_TABLES` and the prefs validation.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(data): storage for trade depth: files, versions, history, rules, missed trades (#38-#56)`.

---

### Task 2: The file store

Delivers B31, B56 and the storage half of B30, B32, B48.

**Files:**
- Create: `src/data/local/files.ts`, `src/data/local/files.test.ts`
- Modify: `src/data/repository.ts`, `src/data/local/local-repository.ts`, `src/data/query/keys.ts`, `src/data/query/hooks.ts`, `src/data/local/trades.ts` (`remove`), `src/data/local/strategies.ts` (`remove`), `src/data/local/journal.ts` (the 30-day purge)

**Interfaces:**
- Consumes: `StoredFile` (Task 1); `SHOT_MAX_BYTES`, the quota detection in `src/data/local/day-shots.ts`.
- Produces, in `repository.ts`:
  ```ts
  export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
  export class FileRejected extends Error { constructor(readonly reason: 'type' | 'size' | 'quota') }
  export interface NewFile { bytes: ArrayBuffer; type: string; name: string }
  export interface FilesRepo {
    list(ws: string, owner: string): Promise<StoredFile[]>;              // upload order
    get(ws: string, id: string): Promise<StoredFile | undefined>;
    add(ws: string, owner: string, file: NewFile, opts: { images: boolean }): Promise<StoredFile>;
    remove(ws: string, id: string): Promise<void>;
    reassign(ws: string, from: string, to: string): Promise<void>;       // used by merge (Task 9)
  }
  ```
  and `Repository.files`.
- Produces, in `hooks.ts`: `useFiles(owner: string)`, `useFile(id: string | undefined)`, `useAddFile()` (`{ owner, file, images }`), `useRemoveFile()` (`{ id }`); `keys.files(ws, owner)`, `keys.file(ws, id)`; `WriteKind` `'files.add' | 'files.remove'`.
- Produces: `deleteOwnerFiles(db, ws, owner)` in `files.ts`, called inside the trade and strategy `remove` transactions and the journal purge (B56).

- [ ] **Step 1: Write the failing tests** in `files.test.ts`:
  - `'add keeps upload order and owner'`; `'add refuses a type'` (`{images: true}` with `application/pdf` → `FileRejected('type')`; `{images: false}` accepts it); `'add refuses over 10 MB'` (`FileRejected('size')`); `'a quota error becomes FileRejected("quota")'`;
  - `'removing a trade removes its files'`; `'removing a strategy removes its photo'`; `'purging a trashed note removes its files'`;
  - `'add refuses a locked daily note'`: owner `note:<id>` of a `daily-review` entry whose date is finished throws `LockedDayError`.
- [ ] **Step 2:** `npm test -- src/data/local/files`. Expected: FAIL.
- [ ] **Step 3:** Implement `localFiles(ctx)`, the hooks and the cascade deletes.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(data): one local file store for trades, notes and strategies (#43, #53)`.

---

### Task 3: History rows for trades

Delivers B26 and B29 for trades, and the history write path.

**Files:**
- Create: `src/data/local/history.ts`, `src/data/local/history.test.ts`
- Modify: `src/data/repository.ts`, `src/data/local/trades.ts`, `src/data/local/local-repository.ts`, `src/data/query/keys.ts`, `src/data/query/hooks.ts`

**Interfaces:**
- Produces, in `history.ts`:
  ```ts
  /** One row per changed field; created and deleted rows carry no field. */
  export function fieldChanges<T extends object>(before: T, after: T, fields: readonly (keyof T & string)[]):
    { field: string; oldValue: HistoryRow['oldValue']; newValue: HistoryRow['newValue'] }[];
  export async function logHistory(db: KeelDb, ws: string, rows: Omit<HistoryRow, 'id' | 'workspaceId' | 'at'>[], ctx: LocalContext): Promise<void>;
  export const HISTORY_DAYS = 30;
  ```
  Values are primitives: an array field (`tagIds`, `strategyIds`) logs as a comma-joined string of ids; a levels side logs as its JSON string.
- Produces, in `repository.ts`: `HistoryRepo { list(ws: string): Promise<HistoryRow[]> /* newest first; purges rows older than 30 days */ }`, `Repository.history`; hook `useHistory()`; `keys.history(ws)`; every trade `WriteKind` also invalidates `keys.history(ws)`.
- Logged trade fields: `strategyIds`, `tagIds`, `rating`, `reviewed`, `targets`, `stops`, `noteId`, `accountId`, `swap`, `executions` (as "fills", value the count).
- Trades: `update`, `updateMany`, `createManual`, `replaceManual` (source `you`, label `${symbol} ${local open date}`) and `remove` (action `deleted`).

- [ ] **Step 1: Write the failing tests** in `history.test.ts`:
  - `'fieldChanges lists only changed fields'`; `'an update writes one row per changed field'` (rating 3 to 4 and reviewed → two rows, source `you`, type `trade`);
  - `'a failed write leaves no row'` (an `ArchivedAccountError` update writes nothing);
  - `'list purges rows older than 30 days'` (fake clock); `'list is newest first'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS with `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `feat(data): edit history for trades, written in the same transaction (#42)`.

---

### Task 4: History rows for everything else

Delivers B26 and B27.

**Files:**
- Modify: `src/data/local/{accounts,cashflows,strategies,tags,tag-categories,imports}.ts` and their tests

**Interfaces:**
- Consumes: `logHistory`, `fieldChanges` (Task 3).
- Logged: accounts (`name`, `broker`, `type`, `currency`, `startingBalance`, `status`); cash flows (`amount`, `kind`, `at`, `note`); strategies (`name`, `description`, `status`, `icon`, `photoId`; groups as "rules", value the rule count); tags and categories (`name`, `color`, `categoryId`, `description`). Target and fee rules log in Task 11.
- An import commit logs one row: type `import`, action `created`, source `import`, label the file name, `field: 'trades'`, `newValue` the trade count (B27). An undo logs action `undone`.
- Settling expired options (Plan 5) logs its trade edits with source `system`.
- `accounts.clearTrades` logs one account row (field `trades`, old value the count, new value 0, source you). Deleting a strategy, tag or category logs one row on that entity, not one per trade it was removed from; `journal.ensureTradeNote` (the system linking a note) logs nothing (ledger ruling).

- [ ] **Step 1: Write the failing tests,** one per repository: `'<entity> create, edit and delete each log'`; `'an import logs one row, not one per trade'`; `'an undo logs one row'`; `'settled options log as system'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (test, typecheck, lint).
- [ ] **Step 5:** Commit: `feat(data): edit history for accounts, flows, strategies, tags and imports (#42)`.
- [ ] **Step 6: Module A review:** code review plus the parity check (record §4 and the storage parts of §2, §5.1, §6, §8, §9).

---

## Module B: Risk on a trade (#39)

### Task 5: Levels and R (test-first)

Delivers spec §5.2's maths, B9 to B14, P6B-01.

**Files:**
- Create: `src/domain/risk.ts`, `src/domain/risk.test.ts`

**Interfaces:**
- Consumes: `Trade`, `LevelSide` (Task 1); `quoteToPnl`; `riskFromStop` (`summary.ts`, legacy).
- Produces:
  ```ts
  export function pipSize(i: Instrument): number;                        // JPY quote 0.01, else 0.0001
  export function unitsFor(i: Instrument): LevelUnit[];                  // B9
  /** The price a level sits at; `side` is 'target' or 'stop'. */
  export function levelPrice(t: Trade, side: 'target' | 'stop', unit: LevelUnit, level: Level): number;
  /** Money (P&L currency cents, positive) if the level fills. */
  export function levelMoney(t: Trade, side: 'target' | 'stop', unit: LevelUnit, level: Level): Cents;
  /** The trade's sides; a legacy trade reads as one Price level each at maxPosition (B14). */
  export function sidesOf(t: Trade): { targets?: LevelSide; stops?: LevelSide };
  export function hasStop(t: Trade): boolean;
  export function tradeRisk(t: Trade): Cents | undefined;               // the stop side's loss, alone
  export function plannedReward(t: Trade): Cents | undefined;           // only when both sides exist
  export function plannedRisk(t: Trade): Cents | undefined;             // only when both sides exist
  export function plannedRMultiple(t: Trade): number | undefined;       // reward over risk
  export type LevelProblem = { side: 'target' | 'stop'; index: number; kind: 'wrong-side' | 'over-size' };
  export function levelProblems(t: Trade, sides: { targets?: LevelSide; stops?: LevelSide }): LevelProblem[];
  ```
- Units: `price` is the level; `movement` and `points` add or subtract the value from the average entry; `ticks` uses `value × tickSize`; `pips` uses `value × pipSize`; `amount` is the money on that level's quantity (B10), converted back through the trade's own money per price unit.

- [ ] **Step 1: Write the failing tests:**
  - `'the help worked example'`: a long stock, entries 10 at 100 and 10 at 105; targets 7 at 110, 3 at 120, 10 at 125; stops 15 at 95, 5 at 90. Expect `plannedReward` 33000, `plannedRisk` 17500, `plannedRMultiple` toBeCloseTo(1.886, 3).
  - `'an MNQ amount rule gives 2R'`: amount target 300, stop 150 at full size → 2.
  - `'one side only shows nothing planned'`: stops only → `plannedReward`, `plannedRisk`, `plannedRMultiple` undefined, `tradeRisk` defined (P6B-01).
  - `'a short reverses the sides'`; `'ticks, points and pips convert'` (ES, EURUSD, USDJPY); `'unitsFor'` (future: all six but pips; forex: price, movement, amount, pips; stock: price, movement, amount; an option with `optionOn: 'future'` adds ticks and points).
  - `'a legacy stop reads as one Price level at full size, and tradeRisk equals riskFromStop'` (Review Focus 1).
  - `'levelProblems'`: a long's stop above the average entry → wrong-side; quantities over `maxPosition` → over-size; a shortfall → none.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(domain): several targets and stops in six units, and R from them (#39)`.

---

### Task 6: Every R reader on one path

Delivers B14 and the 6A tracker seam.

**Files:**
- Modify: `src/data/trade-patch.ts`, `src/domain/metrics/summary.ts` (`plannedR`), `src/domain/tracker/inputs.ts` (L73), `src/domain/manual-trade.ts`, `src/domain/import/plan.ts` (`mergedRisk`, `inherit`), `src/components/app/trades/fills-timeline.tsx`, `src/data/csv-export.ts`, and their tests

**Interfaces:**
- Consumes: Task 5.
- `TradePatch` adds `targets`, `stops` (both CLEARABLE). `applyTradePatch`: when the patch sets `stops`, it writes `initialRisk = tradeRisk(result)` (or deletes it when no stop remains), and deletes `plannedStop` and `plannedTarget` once either side is saved in the new shape (B14).
- `summary.ts` `plannedR(t)` returns `plannedRMultiple(t)`. `inputs.ts` counts `hasStop(t)`.
- `buildManualTrade`: a stop or target writes a one-level Price side and `initialRisk = tradeRisk`.
- `plan.ts` `inherit`: copies `targets` and `stops` when the direction is unchanged, and recomputes `initialRisk` from them on the rebuilt trade.

- [ ] **Step 1: Write the failing tests:**
  - `trade-patch.test.ts`: `'saving stops rewrites initialRisk'`; `'clearing every stop clears initialRisk'`; `'saving a side drops the legacy fields'`.
  - `summary.test.ts`: `'plannedR of a legacy trade is unchanged'` (a fixture from today's sample shape, value pinned before the change).
  - `inputs.test.ts`: `'a trade with only level stops counts as having a stop'`.
  - `plan.test.ts`: `'a rebuilt open trade keeps its levels and recomputes its risk'`.
  - `filters.test.ts`: `'the R filter keeps a level trade by its stop side'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement, and draw one fills-chart line per level.
- [ ] **Step 4:** PASS (test, typecheck, lint).
- [ ] **Step 5:** Commit: `refactor(domain): every R figure reads one risk, legacy trades unchanged (#39)`.

---

### Task 7: The trade page's targets and stops

Delivers spec §5.2's screen. Comp: `01-trade-page.html`, `?state=over`, `?state=wrong-side`, `?state=stop-only`. Everything on that comp that this task doesn't name (Choose stats, Attachments, Patterns, fill costs) belongs to Tasks 14, 15 and 17.

**Files:**
- Create: `src/components/app/trades/levels-block.tsx`, `size-helper.tsx`, and a test
- Modify: `src/components/app/trades/trade-view.tsx` (replace the Planned stop and Planned target rows), `src/content/metric-definitions.ts` (`planned-reward`, `planned-risk`)

**Interfaces:**
- Consumes: `unitsFor`, `levelProblems`, `plannedReward`, `plannedRisk`, `plannedRMultiple`, `tradeRisk` (Task 5); `save` in `TradePage`.
- Produces: `LevelsBlock({ trade, side: 'target' | 'stop', value?: LevelSide, readOnly, onCommit(next: LevelSide | undefined): void })` and `SizeHelper({ position: number; onPick(qty: number): void })` (a share of the position, B12).
- Derived figures in the comp's order: Planned R, Realized R, Planned reward, Planned risk.

- [ ] **Step 1: Write the failing tests:** `'adding a level starts with what is left'` (B11); `'a wrong-side level shows its error and does not save'` (B13); `'over-size shows its error'`; `'stops only: Planned R, reward and risk read None, Realized R a figure'`; `'Privacy masks reward, risk and amount levels'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comp, light and dark, 390 and 1440. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): targets and stops in levels on the trade page (#39)`.
- [ ] **Step 6: Module B review:** code review plus the parity check (record §2.1). Run `npm run build`.

---

## Module C: Merge, split and move (#38)

### Task 8: Grouping (test-first)

Delivers B1 to B4.

**Files:**
- Create: `src/domain/grouping.ts`, `src/domain/grouping.test.ts`
- Modify: `src/domain/trade-builder.ts` (export the single-trade builder)

**Interfaces:**
- Consumes: `buildTrades`, `finalize` internals; `BuildOptions`.
- Produces:
  ```ts
  /** One trade from the given fills, never cut at a flat point; open if the position doesn't end flat. */
  export function buildGroupedTrade(executions: readonly Execution[], base: Trade, opts: BuildOptions): Trade;
  export type GroupRefusal = 'mixed-account' | 'mixed-instrument' | 'too-few' | 'nothing-left';
  export function canMerge(trades: readonly Trade[]): GroupRefusal | null;
  export interface MergeResult { kept: Trade; removedIds: string[]; changed: Trade[]; unlinkNoteIds: string[] }
  export function mergeTrades(sources: readonly Trade[], picked: ReadonlySet<string> /* execution ids */, opts: BuildOptions): MergeResult;
  export interface SplitResult { original: Trade; created: Trade }
  export function splitTrade(trade: Trade, moved: ReadonlySet<string>, opts: BuildOptions & { serial: number; id: string }): SplitResult;
  ```
- Merge (B2, B3): the earliest-opened source is `kept` (id, serial, note, rating, reviewed, levels, rule checks); tags and strategies are the union, and the others' rule checks are added where `kept` has none; unpicked executions stay in their trade (`changed`, rebuilt); a source left empty is in `removedIds`; the others' `noteId`s are in `unlinkNoteIds`. Every result is `grouping: 'manual'`.
- Split (B4): `original` keeps its record with the remaining fills; `created` copies tags and strategies only, takes `serial`, is not reviewed.
- Swap (ledger R3): `buildGroupedTrade` carries `base.swap` and adds it to net; a merged trade's swap is the sum of its sources'; a split keeps swap on the original.

- [ ] **Step 1: Write the failing tests:** `'merge across a flat point makes one trade'`; `'an unticked fill stays in its trade'`; `'the earliest-opened source keeps its record'`; `'tags and strategies are united'`; `'canMerge refuses mixed accounts and instruments'`; `'split leaves an open part when it does not end flat'`; `'split refuses moving all or none'`; `'the new part copies tags and strategies only'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(domain): merge and split trades by their fills (#38)`.

---

### Task 9: Merge, split and move in storage

Delivers B5 to B8, B55 and Review Focus 2.

**Files:**
- Create: `src/data/local/grouping.ts`, `src/data/local/grouping.test.ts`
- Modify: `src/data/repository.ts` (`TradesRepo`), `src/data/local/imports.ts` (`context`, `undo`), `src/data/query/{keys,hooks}.ts`

**Interfaces:**
- Consumes: Task 8; `reassign` (Task 2); `logHistory` (Task 3); `assertEditable`.
- Produces, on `TradesRepo`:
  ```ts
  merge(ws: string, ids: readonly string[], picked: readonly string[]): Promise<Trade>;
  split(ws: string, id: string, moved: readonly string[]): Promise<{ original: Trade; created: Trade }>;
  move(ws: string, ids: readonly string[], accountId: string): Promise<number>;
  moveAccount(ws: string, fromAccountId: string, toAccountId: string): Promise<number>;
  ```
  hooks `useMergeTrades()`, `useSplitTrade()`, `useMoveTrades()`, `useMoveAccountTrades()`; `WriteKind`s `'trades.merge' | 'trades.split' | 'trades.move'` invalidating trades, journal, imports, history, days and `keys.filesAll(ws)` (merge reassigns files with `FilesRepo.reassign`, which has no hook of its own).
- Each runs in one `rwTx` over trades, journal, files, accounts, history; refuses archived accounts (source or destination) with `ArchivedAccountError`; writes history rows (merged, split, moved; source you; a move logs `field: 'accountId'`).
- `imports.ts` `context`: `openTrades` excludes `grouping === 'manual'`. `undo`: refuses with `{ ok: false, reason: 'regrouped', tradeIds }` when any trade the import built was merged, split or moved since (history rows with those actions on its trade ids, or a missing id). Extend `UndoResult` with that reason.

- [ ] **Step 1: Write the failing tests:**
  - `'merge writes one trade, unlinks the other notes, moves their files, logs each trade'`;
  - `'split writes two trades and logs both'`; `'move keeps note, tags, levels and files'`; `'move refuses an archived destination'`;
  - `'moveAccount moves every trade and leaves cash flows'`;
  - `'a later import does not rebuild a manual trade'`; `'undoing a regrouped import is refused with its reason'`;
  - `'a finished day keeps its frozen score after a merge'` (6A's `freezeDay`, Review Focus 2).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (test, typecheck, lint).
- [ ] **Step 5:** Commit: `feat(data): merge, split and move trades with history (#38)`.

---

### Task 10: The grouping screens

Comps: `02-trade-log.html` (`?state=merge`, `?state=mixed`), `03-split-move.html` (default, `?state=move`, `?state=account-menu` for the menu, `?state=account-move` for the whole-account dialog).

**Files:**
- Create: `src/components/app/trades/group-dialogs.tsx` (`MergeDialog`, `SplitDialog`), `move-dialog.tsx`, and a test
- Modify: `src/components/app/trades/bulk-bar.tsx` (the "Merge, split or move" menu, after Export CSV), `src/components/app/settings/accounts.tsx` (Move trades in the account menu, after Add a trade), `src/components/app/settings/import-history.tsx` (the `regrouped` reason)

**Interfaces:**
- Consumes: Task 9's hooks; `canMerge`.
- A disabled menu item shows its reason as a second line. The move dialog lists active accounts other than the trades' own; picking one in another currency shows a line that the trades keep their own currency and figures (B6). Dialogs say there is no undo (B5).

- [ ] **Step 1: Write the failing tests:** `'Merge is disabled for a mixed selection, with its reason'`; `'Split needs exactly one trade with two or more fills'`; `'the merge dialog ticks every fill'`; `'Move lists other active accounts and notes a currency change'`; `'the account menu moves every trade'`; `'an undo refused for regrouping says why'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comps. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): merge, split and move trades (#38)`.
- [ ] **Step 6: Module C review:** code review plus the parity check (record §1). Build, and `e2e/trade-depth.spec.ts` (merge two trades, split one back, move one; check the history rows).

---

## Module D: Default rules (#39)

### Task 11: Rule engines and storage (test-first)

Delivers B15 to B19, B57, Review Focus 3.

**Files:**
- Create: `src/domain/rules/target-rules.ts`, `src/domain/rules/fee-rules.ts`, their tests; `src/data/local/target-rules.ts`, `src/data/local/fee-rules.ts`, their tests
- Modify: `src/data/repository.ts`, `src/data/local/imports.ts` (commit), `src/data/query/{keys,hooks}.ts`

**Interfaces:**
- Produces, pure:
  ```ts
  export function ruleMatches(rule: { accountId: string; assetClass: TargetRule['assetClass']; symbols: string[] }, t: Trade): boolean;
  export function pickRule<R extends TargetRule | FeeRule>(rules: readonly R[], t: Trade): R | undefined; // symbol beats none, then newest
  /** Levels from a rule: % of maxPosition, rounded down to the step, last level takes the rest; a wrong-side Price level skips that side. */
  export function applyTargetRule(t: Trade, rule: TargetRule): Pick<Trade, 'targets' | 'stops'>;
  export function hasCosts(t: Trade): boolean;                                   // any fill with commission or fee
  export function applyFeeRule(t: Trade, rule: FeeRule): Execution[];            // per contract × qty, or once per fill
  ```
- Produces, storage: `TargetRulesRepo` and `FeeRulesRepo` `{ list; create; update; remove; applyExisting(ws, id, override: boolean): Promise<number> }`, hooks `useTargetRules()`, `useFeeRules()`, `useSaveTargetRule()`, `useSaveFeeRule()`, `useRemoveTargetRule()`, `useRemoveFeeRule()`, `useApplyRule()` (`{ kind, id, override }`), with history rows (rule types; applications logged per trade with source `rule`).
- Import commit: for each new trade, the picked target rule applies when the trade has no levels; the picked fee rule applies when `!hasCosts(t)`. Net and gross are rebuilt from the fills.
- Levels from a rule are written through `applyTradePatch(trade, { targets, stops })`, at import and on Apply to existing, so `initialRisk` is rewritten as Task 6 defines (ledger R1).
- Edit and delete leave applied values (B57).

- [ ] **Step 1: Write the failing tests:**
  - `'a symbol rule beats an all-symbols rule, then the newest'`; `'50% and 50% split the position, last takes the rest'`; `'a wrong-side Price level skips that side'`;
  - `'per contract multiplies by quantity; per execution once'`; `'apply on entry, exit or all'`;
  - `'without override a trade with any costed fill is skipped'` (P6B-06); `'with override every matching fill is replaced'`;
  - `'import applies both kinds to new trades only'`; `'a manual trade is untouched on entry'` (B16); `'deleting a rule leaves applied values'`;
  - `'apply to existing counts and logs with source rule'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(data): default target, stop and fee rules, on import and on demand (#39)`.

---

### Task 12: The rule cards

Comps: `04-settings-trading.html` (default, `?state=target-rule`, `?state=target-rule-filled`, `?state=fees`, `?state=fee-rule`, `?state=apply`).

**Files:**
- Create: `src/components/app/settings/rule-cards.tsx`, `target-rule-dialog.tsx`, `fee-rule-dialog.tsx`, `apply-rule-dialog.tsx`, and a test
- Modify: `src/components/app/settings/trading.tsx` (the two cards after its existing ones, under one note), `src/content/metric-definitions.ts` if a figure needs a tip

**Interfaces:**
- Consumes: Task 11's hooks; `LevelsBlock`'s unit and row look (with % in place of quantity); `unitsFor`.
- Dialog defaults: levels at 100%; All symbols on; Mode per execution; Apply on all executions; 0.00. Instrument: Stock, Option, Future option, Future, Forex, Crypto, CFD. The unit select waits for the instrument.

- [ ] **Step 1: Write the failing tests:** `'the dialogs open with the defaults'`; `'the unit select waits for an instrument'`; `'Apply to existing shows the count and the override box'`; `'Privacy masks rule amounts'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comp. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): default rule cards on Settings > Trading (#39)`.
- [ ] **Step 6: Module D review:** code review plus the parity check (record §2.2, §2.3). Build, and `e2e/rules.spec.ts` (create both rules, import a file, see levels and fees on the new trades; apply to existing without and with override).

---

## Module E: Trade page depth (#55, #56, #43)

### Task 13: Swap

Delivers B49, B50, and E27's swap part. 6B owns the Overview's Swap figure; 6C's plan only checks it (agreed 2026-11-25).

**Files:**
- Modify: `src/domain/import/mapping.ts` (`TradeRowField` `'swap'`, synonyms swap, swaps, rollover, financing), `src/domain/import/rows.ts` (`ImportedTrip.swap?`), `src/domain/import/plan.ts` (`buildTrips`), `src/domain/metrics/summary.ts` (`costsOf` gains `swap`), `src/components/app/reports/{overview-costs,overview-choice}.tsx` (`costs:swap`), `src/components/app/trades/trade-view.tsx` (the Swap row after Fees; the hero's sub-line adds swap), `src/content/metric-definitions.ts` (`swap`)

**Interfaces:**
- `ImportedTrip.swap?: Cents` (signed, as the file has it). `buildTrips`: after building, `t.swap = swap; t.net = t.net + swap` (gross unchanged). Same-currency P&L checks compare against `gross` and the new `net`.
- `costsOf(trades)` returns `{ commissions; fees; swap }`.

- [ ] **Step 1: Write the failing tests:** `'a swap column is guessed and mapped'`; `'swap enters net, not gross'` (−4.86 on a +530.00 gross, −14.00 fees → net 511.14); `'swap survives a merge, a split and a fill-cost edit'` (ledger R3); `'a fills import has no swap'`; `'the Overview lists Swap in costs and can hide it'`; `'Privacy masks swap'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: swap per trade, from the import into net (#55)`.

---

### Task 14: Costs by hand

Delivers B58 and P6B-02. Comp: `01-trade-page.html?state=fill-costs`.

**Files:**
- Create: `src/components/app/trades/fill-costs.tsx` and a test
- Modify: `src/data/repository.ts` (`TradesRepo.setFillCosts`), `src/data/local/trades.ts`, `src/data/query/hooks.ts`, `src/components/app/trades/trade-view.tsx` (`Executions`)

**Interfaces:**
- Produces: `setFillCosts(ws: string, tradeId: string, executionId: string, costs: { commission: Cents; fees: Cents }): Promise<Trade>` (rebuilds `fees`, `gross` and `net` with `buildGroupedTrade` on the trade's own fills, ledger R2; logs a history row, source you; refuses archived accounts); hook `useSetFillCosts()`.
- A row's commission and fee are inputs while editing, saved when the row is confirmed.

- [ ] **Step 1: Write the failing tests:** `'editing a fill's costs recomputes the trade'`; `'it logs one history row'`; `'it is allowed on a finished day and leaves the frozen score'`; `'Privacy masks the inputs' values'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: enter a fill's commission and fee by hand (#39, #55)`.

---

### Task 15: The stat choice and attachments

Delivers B51 and B30. Comps: `01-trade-page.html` (the Attachments card), `?state=chooser`.

**Files:**
- Create: `src/components/app/trades/stats-chooser.tsx`, `trade-files.tsx`, `file-viewer.tsx`, and tests
- Modify: `src/components/app/trades/trade-view.tsx` (`Stats` reads `prefs.tradeStats`; the "Choose stats" button; the Attachments card)

**Interfaces:**
- Consumes: `usePrefs`, `useUpdatePrefs`; `useFiles`, `useAddFile`, `useRemoveFile` (Task 2).
- Produces: `STAT_IDS` (the stat card's row ids, in order) in `trade-view.tsx`; `StatsChooser({ shown: string[]; onSave(next: string[] | undefined): void })` (search, a box and current value per row, Cancel, Reset to default, Save; header figures not listed); `TradeFiles({ trade, readOnly })`; `FileViewer({ files, index, onClose, onDelete })` (shared with note images, Task 20).

- [ ] **Step 1: Write the failing tests:** `'every row is on by default'`; `'unticking hides the row and saves per user'`; `'Reset to default clears the pref'`; `'images show as thumbnails, other files as rows'`; `'a refused file says why'`; `'delete asks first'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comps. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): choose the trade page's stats, and attach files to a trade (#56, #43)`.
- [ ] **Step 6: Module E review:** code review plus the parity check (record §2.3's costs by hand, §5.1, §9, §10). Build.

---

## Module F: Patterns (#40)

### Task 16: Patterns (test-first)

Delivers spec §5.5's table, B20 to B22.

**Files:**
- Create: `src/domain/patterns/defs.ts`, `trade.ts`, `day.ts`, `index.ts`, and tests (one per pattern, plus a performance test)

**Interfaces:**
- Consumes: `tradeVolume`, the breakeven classifier, 6A's `dayOfTrade`, `realizedR` (`rOf`), 6A's `DayRecord.session`.
- Produces:
  ```ts
  export type PatternId = 'held-longer' | 'long-loss-hold' | 'loss-after-loss' | 'added-to-position'
    | 'exited-in-parts' | 'large-size' | 'losses-outweighed' | 'switched-sides-red' | 'switched-sides-green'
    | 'one-strong-trade' | 'low-return' | 'sized-up-after-wins' | 'more-trades' | 'waited-then-won'
    | 'quick-reentries' | 'rushed-red-day' | 'busier-than-green';
  export interface PatternDef { id: PatternId; level: 'trade' | 'day'; tone: 'helps' | 'hurts' | 'neutral'; name: string }
  export const PATTERNS: readonly PatternDef[];
  export interface PatternHit { id: PatternId; tradeId?: string; date?: string; figures: Record<string, number> }
  export interface PatternEnv { timeZone: string; breakevenRange: BreakevenRange; sessions: ReadonlyMap<string, { start: string }> }
  export function computePatterns(trades: readonly Trade[], env: PatternEnv): { byTrade: Map<string, PatternHit[]>; byDay: Map<string, PatternHit[]> };
  ```
- Each condition and threshold is exactly the spec's table (§5.5) and B21, B22: look-back the 60 days before the trade's entry (or the day), rolling; breakevens are neither wins nor losses; open trades skipped by outcome patterns and counted by `added-to-position` and `large-size`.

- [ ] **Step 1: Write the failing tests,** one `describe` per pattern with a hit, a near miss on each side of its threshold, and an empty look-back. Plus: `'a later trade never changes an earlier result'` (B20); `'breakevens are neither'` (B22); `'all 1,230 sample trades in under 50 ms'` (median of 5 runs on the generated sample).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(domain): patterns from fills, by trade and by day (#40)`.

---

### Task 17: Patterns in the log, the trade page and the filters

Comps: `01-trade-page.html?state=patterns`, `02-trade-log.html` (the column), `02-trade-log.html?state=filter`.

**Files:**
- Create: `src/components/app/trades/patterns-button.tsx` and a test
- Modify: `src/data/query/hooks.ts` (`usePatterns()`), `src/data/trade-columns.ts` (`'patterns'` in `ColumnId`, `ALL_COLUMNS`, the All view's `DEFAULT_COLUMNS`), `src/components/app/trades/columns.tsx` (`sortValue`, `cellOf`, width), `src/data/csv-export.ts`, `src/data/filters.ts` (`GlobalFilters.patterns: PatternId[]`, URL `pat`, `applyFilters`: a day pattern keeps that day's trades), `src/components/app/filter-model.ts` (a chip), `src/components/app/more-filters.tsx` (a Patterns section: search, Select all, disabled when none fired), `src/components/app/trades/trade-view.tsx`, `src/content/metric-definitions.ts` (a definition per pattern)

**Interfaces:**
- Consumes: `computePatterns`, `PATTERNS` (Task 16).
- Produces: `usePatterns(): UseQueryResult<ReturnType<typeof computePatterns>>` over all the workspace's trades; `PatternsButton({ hits: PatternHit[] })` (count, popover: name, tone word, a Keel sentence with the figures through Display).
- The column is in the All view's defaults only; the Day and Week tables (6A) don't list it.

- [ ] **Step 1: Write the failing tests:** `'the column counts each trade's patterns'`; `'the filter round-trips in the URL and keeps a day pattern's trades'`; `'Select all ticks every pattern; the section is disabled when none fired'`; `'the popover names, tone words and masked sentences'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comps. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): patterns in the trade log, on the trade page and as a filter (#40)`.

---

### Task 18: Day patterns and the Patterns report

Comps: `09-patterns.html` (default, `?state=report`).

**Files:**
- Create: `src/components/app/reports/patterns-report.tsx` and a test
- Modify: `src/components/app/trades/log/day-card.tsx` (6A; the patterns control in its quick actions), `src/components/app/day/day-header.tsx` (6A; the same control), `src/domain/metrics/breakdowns.ts` (`BreakdownKey` `'pattern'`), `src/components/app/reports/{report-keys,reports-shell}.tsx` (`'patterns'` in `ReportKey`, `REPORT_KEYS`, `REPORT_MENU`, `REPORT_LABELS`)

**Interfaces:**
- Consumes: `usePatterns`; `BreakdownCards` with `by="pattern"`.
- The day control shows the date, net, trade count and the day's patterns. The report has one row per pattern (trades, win rate, net P&L and the shared columns), no cross-analysis select.

- [ ] **Step 1: Write the failing tests:** `'a day card lists its day patterns'`; `'the report lists each pattern with its trades'`; `'a trade with two patterns counts in both rows'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): day patterns and the Patterns report (#40)`.
- [ ] **Step 6: Module F review:** code review plus the parity check (record §3). Build.

---

## Module G: Notes (#43)

### Task 19: The toolbar, marks and paragraph controls

Delivers B33 and spec §5.6's toolbar. Comp: `05-note-editor.html` (default, `?state=insert`).

**Files:**
- Create: `src/components/app/notes/editor-toolbar.tsx` and a test
- Modify: `src/components/app/notes/note-editor.tsx` (extensions; the old `Toolbar` replaced), `note-prose.css`, `package.json`

**Interfaces:**
- Produces: `EditorToolbar({ editor, onHistory, onFullScreen, onDictate? })` in Keel's groups: undo and redo; a style menu (Normal, Heading 1 to 3, Toggle heading 1 to 3, Bulleted list, Numbered list), font family (Sans, Serif, Mono), font size (a select, 8 to 72); bold, italic, underline, and a Format menu (strikethrough, inline code, superscript, subscript, clear formatting); colour and highlight (Keel's palettes); a paragraph menu (Left, Centre, Right, Justify, Start, End, Outdent, Indent); insert (the insert menu, template, dictation); version history; full screen. Each menu item shows the editor library's key binding.
- Phone: two rows, the rest in More.

- [ ] **Step 1: Write the failing tests:** `'every control applies its mark or node'` (table-driven over the toolbar's items, on a test editor); `'the style menu toggles a toggle heading'`; `'the toolbar is hidden when read-only'`.
- [ ] **Step 2:** FAIL. **Step 3:** Install the Tiptap extensions (licence checked), implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(notes): the full editor toolbar in Keel's groups (#43)`.

---

### Task 20: Blocks: images, columns, page break, equation, toggles, timed lists, link chips, emoji, embeds, handles

Delivers B32, B34 to B36, B42, B54. Comp: `05-note-editor.html` (default, `?state=slash`).

**Files:**
- Create: `src/components/app/notes/extensions/{columns,page-break,timed-list,link-chip,tweet}.ts`, `image-view.tsx`, and tests
- Modify: `src/components/app/notes/note-editor.tsx`, `slash-menu.tsx` (`SLASH_ITEMS` adds Normal text, Timed list, Image, Trade, Day, Code block, Toggle, Toggle heading 1 to 3, Align left, centre, right, justify, YouTube, X post)

**Interfaces:**
- Consumes: `useAddFile`, `useFile`, `FileViewer` (Tasks 2, 15).
- Images: paste, drop or insert, block or inline, PNG, JPEG, GIF or WebP up to 10 MB; stored as `keel-file:<id>`; corner resize stores a width percentage; double-click opens the viewer; a caption under a block image. A refused file or a locked day shows its reason.
- Link chips: Trade (a search picker over the workspace's trades) and Day (a date picker); each opens its page.
- Embeds (U4): a pasted YouTube or X link offers to embed; YouTube through `youtube-nocookie.com`; X loads its widget script only when the node mounts and online; the source shows under the embed; offline, the plain link.
- Handles: "+" opens the slash menu at the block; drag moves it; the handle's menu offers Move up and Move down for the keyboard.

- [ ] **Step 1: Write the failing tests:** `'a pasted image is stored and referenced'`; `'an image on a locked daily note is refused'`; `'a timed list item starts with the time'` (fake clock); `'columns hold two or three'`; `'an equation renders'`; `'a trade chip links to its trade'`; `'a YouTube link offers an embed with the no-cookie domain'`; `'Move up and Move down move a block'`; `'the slash list includes justify'`; `'":" opens the emoji search and inserts the pick'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(notes): images, columns, equations, toggles, timed lists, links, embeds and block handles (#43)`.

---

### Task 21: Version history, full screen, dictation, export and import

Delivers B37 to B40. Comp: `05-note-editor.html?state=history`.

**Files:**
- Create: `src/data/local/note-versions.ts` and a test; `src/components/app/notes/version-history.tsx`, `note-export.ts`, `dictation.ts`, and tests; `src/styles/print.css`
- Modify: `src/data/repository.ts`, `src/data/query/{keys,hooks}.ts`, `src/components/app/notes/note-editor.tsx` (a `noteId` prop; the version keeper and the History control live inside `NoteEditor`, ledger R4), and every editor host to pass `noteId` (`trade-journal.tsx` `TradeNote` and `DayNote`, the Notebook's entry pane, 6A's day page note). Hosts under `src/components/app/trades/log/` (6A's note dialog) pass it with Task 18, after 6A lands

**Interfaces:**
- Produces: `NoteVersionsRepo { list(ws, noteId): Promise<NoteVersion[]>; keep(ws, noteId, body, kind): Promise<void>; restore(ws, noteId, versionId): Promise<JournalEntry> }` (purges older than 30 days; `restore` keeps the current body as `before-restore` first, then writes the body only; refuses a locked daily note); hooks `useNoteVersions(noteId)`, `useKeepVersion()`, `useRestoreVersion()`; `useVersionKeeper(noteId, body)` (B39 timing).
- `VersionHistory({ noteId, readOnly })`: a dialog with the list (Current, versions by time, Before restore) beside a read-only preview, and Restore with a confirmation.
- `exportNote(entry, 'pdf' | 'keel')` and `importNote(file): Promise<JournalDraft>` (Keel's note file is `{ kind: 'keel-note', version: 1, title, body, tags }`; images are not embedded in the file).
- `dictation.ts`: `speechSupported(): boolean`, `startDictation(onText: (text: string) => void): () => void` (the browser's `SpeechRecognition`); the control is hidden where unsupported and says the browser's speech service does the recognition.
- Full screen: the editor fills the window over the app; Escape or the control leaves it.

- [ ] **Step 1: Write the failing tests:** `'a version is kept after 5 idle minutes and on leaving'`; `'restore keeps a before-restore version and restores the body only'`; `'versions older than 30 days are removed'`; `'a locked daily note's history is read-only and restore is refused'`; `'export to a Keel note file and import it back'`; `'dictation is hidden when unsupported'`; `'Escape leaves full screen'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(notes): version history, full screen, dictation, export and import (#43)`.

---

### Task 22: Note settings

Delivers B41. Comp: `06-notebook-settings.html`.

**Files:**
- Create: `src/components/app/settings/notebook-settings.tsx` and a test; `src/app/(app)/app/settings/notebook/page.tsx`
- Modify: `src/components/app/settings/settings-nav.tsx` (Notebook after Tags), `src/components/app/notes/note-editor.tsx` and `note-prose.css` (CSS variables from `prefs.noteType`; the strike-through rule)

**Interfaces:**
- Defaults 28, 24, 20 and 14 px; each select 10 to 40; the box crosses out ticked items, on by default; a live preview; Reset to default; Save disabled until changed. The settings apply to every editor and read view.

- [ ] **Step 1: Write the failing tests:** `'Save is disabled until a change'`; `'the preview follows the selects'`; `'Reset to default clears the pref'`; `'an editor applies the sizes and the strike-through'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): note settings (#43)`.
- [ ] **Step 6: Module G review:** code review plus the parity check (record §5.2 to §5.6). Build, and `e2e/notes-depth.spec.ts` (paste an image, format text, restore a version, export and import a note).

---

## Module H: Strategies (#44, #53)

### Task 23: Templates, the chooser, and copies

Delivers U3, B44 to B47, B59. Comps: `07-strategies.html` (`?state=templates`, `?state=chooser`, `?state=copy`).

**Files:**
- Create: `src/content/strategy-templates.ts`; `src/components/app/strategies/{template-chooser,templates-tab,template-card}.tsx`, and tests
- Modify: `src/components/app/strategies/strategies-view.tsx` (tabs My strategies and Templates), `strategy-form.tsx` (a `fromTemplate` prefill), `strategy-view.tsx` (the examples section on a copy), `src/data/local/strategies.ts` (`templateId`)

**Interfaces:**
- Produces, in `strategy-templates.ts`:
  ```ts
  export interface ExampleTrade { symbol: string; side: Direction; openedAt: string; closedAt: string; net: Cents; r?: number }
  export interface StrategyTemplate { id: string; name: string; description: string; styles: ('swing' | 'intraday' | 'scalping')[];
    assetClasses: AssetClass[]; groups: { title: string; rules: { text: string; showWhen: RuleShowWhen }[] }[];
    cover: string /* inline SVG */; examples: ExampleTrade[] }
  export const STRATEGY_TEMPLATES: readonly StrategyTemplate[];          // six (U3)
  export function exampleStats(t: StrategyTemplate): { winRate: number; trades: number; winLoss: number | null };
  ```
  Six Keel-written templates: one each for stocks, futures, forex, options and crypto, and one intraday playbook; three to five examples each; Keel's own names and text.
- The chooser opens on New strategy while `prefs.strategyChooser !== false`; it has an asset filter, a search, Start blank, the box, and template rows; picking one opens the form filled from it, unsaved; Cancel on the form returns to the chooser; closing returns to the list. The Templates tab has filters (assets, style), a search, cards (cover, name, chips, the three example stats labelled as examples, the author "Keel", "+"), an "Added" mark, and the same box.
- "+" creates a copy (groups, rules, description, asset classes; `templateId`; the cover stored as a `files` photo) and opens it. The copy's page lists the examples apart; nothing else reads them.

- [ ] **Step 1: Write the failing tests:** `'six templates, each with examples'`; `'exampleStats'`; `'+ creates a copy and opens it'`; `'a copied template is marked added and can be copied again'`; `'the chooser box turns the chooser off and the Templates tab turns it back on'`; `'picking a template fills the form unsaved'`; `'examples never reach a figure'` (strategy stats and the summary unchanged by a copy).
- [ ] **Step 2:** FAIL. **Step 3:** Implement to the comps. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): Keel's strategy templates, the chooser and copies (#44)`.

---

### Task 24: Missed trades and the photo

Delivers B43, B48. Comps: `07-strategies.html` (`?state=strategy`, `?state=missed-form`, `?state=form-photo`; the last also shows B59's prefilled form).

**Files:**
- Create: `src/data/local/missed-trades.ts` and a test; `src/components/app/strategies/{missed-trades,photo-field}.tsx`, and tests
- Modify: `src/data/repository.ts`, `src/data/query/{keys,hooks}.ts`, `strategy-view.tsx` (the missed-trades card; the photo band), `strategies-view.tsx` (the band on cards; "n missed" beside the trade count), `strategy-form.tsx` (the Photo field), `src/data/local/strategies.ts` (`remove` deletes its missed trades)

**Interfaces:**
- Produces: `MissedTradesRepo { list(ws, strategyId); create(ws, input: Omit<MissedTrade, 'id' | 'workspaceId'>); update(ws, id, patch); remove(ws, id) }`; hooks `useMissedTrades(strategyId)`, `useSaveMissedTrade()`, `useRemoveMissedTrade()`.
- The form holds exactly symbol, date and time, price, commission and fees. Missed trades live in their own table; no trade list, filter, summary, report, calendar, tracker or pattern reads it.
- Photo: PNG, JPEG or WebP up to 10 MB (the form enforces this itself: `FilesRepo.add` with `images: true` also accepts GIF, which B48 doesn't allow for a photo); replace and remove; a cover band on the card and the page header; the icon stays.

- [ ] **Step 1: Write the failing tests:** `'a missed trade saves exactly its fields'`; `'missed trades never reach the summary, the log or patterns'` (Review Focus 4); `'deleting a strategy deletes its missed trades and photo'`; `'the photo shows as a band and can be removed'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): missed trades and a strategy photo (#44, #53)`.
- [ ] **Step 6: Module H review:** code review plus the parity check (record §6, §8). Build, and `e2e/strategies-depth.spec.ts` (copy a template, log a missed trade, add a photo).

---

## Module I: History page, sample, finish

### Task 25: The history card

Delivers B29 and spec §5.9's screen. Comp: `08-history.html`.

**Files:**
- Create: `src/components/app/settings/history-card.tsx` and a test
- Modify: `src/components/app/settings/import-history.tsx` (the History card below the import log)

**Interfaces:**
- Consumes: `useHistory()` (Task 3).
- Columns in Keel's order: Time (profile zone, GMT offset); Record (type over identifier); Change (field, then from and to on one line, formatted with Display; Privacy masks money); Action; Source. Search over type, identifier and field; Filter by type, action and source; 50 rows a page. Phone: the time and the record, then the change, action and source.

- [ ] **Step 1: Write the failing tests:** `'rows are newest first and page at 50'`; `'search and each filter narrow the rows'`; `'money values are masked under Privacy'`; `'the empty and no-match states'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(app): the edit history on Settings > Logs (#42)`.

---

### Task 26: The sample

Delivers B53.

**Files:**
- Modify: `src/data/seed/generate.ts`, `src/data/seed/version.ts` (the next version), and the seed tests

**Interfaces:**
- New random streams from `opts.seed + 107` on, run after every existing draw, so no existing sample value moves.
- The sample gets: levels on about a third of trades (both sides on half of those, stops only on the rest); two merged trades and one split, marked `grouping: 'manual'`; one target rule and one fee rule; swap on forex trades from the closed-trades shape; one missed trade per strategy; history rows for those edits stamped relative to the seed time; no files.

- [ ] **Step 1: Write the failing tests:** `'every existing sample value is unchanged'` (a snapshot of the prior version's trades by id, minus the new fields); `'the sample shows every new state'` (levels both and one-sided, a manual grouping, rules, swap, missed trades, history).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(data): sample with levels, grouping, rules, swap and missed trades (#38-#55)`.

---

### Task 27: Audit, records and final checks

- [ ] **Step 1: Parity audit.** A fresh reviewer, who has not seen the build reviews, checks the whole branch against `plan6b-behaviour.md` row by row and against the spec's B and U calls: every control, column, field, stat, step and state. Fix every verified finding.
- [ ] **Step 2: Records.** In `docs/BACKLOG.md`: close #38, #39, #40 (fills-only), #42, #43, #44, #53, #55, #56, E10 and E27's swap part; add rows for the price-path patterns and D8 (with #14), and move #52 to the market-data plan (U1). In `docs/research/tradezella-feature-map.md`, mark the rows done and correct TR10 (spec §7). Record new components in `DESIGN.md`.
- [ ] **Step 3: Final checks.** `npm test && npm run typecheck && npm run lint && npm run build`, then every e2e spec on port 3130. Check 390, 768, 1440 and 1680 in light and dark for each new surface.
- [ ] **Step 4:** Commit: `docs: Plan 6B records and parity audit`.
