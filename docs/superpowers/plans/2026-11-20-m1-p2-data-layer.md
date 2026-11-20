# Milestone 1 · Plan 2: Data layer, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the app screens (Plans 4 and 5) read from and write to:
- repository contracts keyed by workspace, and their IndexedDB implementation
- TanStack Query hooks
- the seeded sample workspace
- the CSV import pipeline with history and undo
- global filters held in the URL

There is no page UI, no components and no styling.

**Architecture:** Pure import logic extends `src/domain/import`. Pure filter and metric glue lives in `src/data`. `src/data/local` implements the contracts on Dexie, with every row keyed `[workspaceId+id]`. `src/data/query` wraps the contracts in hooks behind one client-only `DataProvider`, which `src/app/(app)/layout.tsx` mounts unstyled. Nothing touches IndexedDB until the first query runs in the browser.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, TypeScript strict, Dexie 4, TanStack Query 5, Papa Parse 5, date-fns 4 + @date-fns/tz, Vitest 5 (+ fake-indexeddb, Testing Library, happy-dom), Playwright on system Chrome.

**Spec:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md`, mainly §5–§8, §10, §11 and §13. Ignore the "Trading Floor" visual direction in §9 and §12: it was replaced, and this plan has no visual work. Deferred work: `docs/BACKLOG.md`.

## Global Constraints

- Node ≥ 22 (`package.json` engines), npm (pnpm is not installed), Next.js 16.4.6, React 19.3.0, TypeScript `strict` + `noUncheckedIndexedAccess`, Vitest 5, Playwright with `channel: 'chrome'`.
- Before any framework-level code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md): `01-app/03-api-reference/04-functions/use-search-params.md`, `01-app/01-getting-started/04-linking-and-navigating.md` ("Native History API"), `01-app/02-guides/single-page-applications.md`. If `next dev` rewrites AGENTS.md, commit that change with the task.
- `src/domain/**` stays pure: no `react`, `next`, browser globals, IndexedDB, or file/network I/O. Papa Parse on strings and `Intl` are allowed.
- "Every repository call takes a `workspaceId`" (§8). The exceptions are `WorkspacesRepo` and `PrefsRepo`, which are user-level.
- "Pages talk only to TanStack Query hooks over the interfaces" (§8). The only file this plan adds under `src/app` is the unstyled provider wrapper `src/app/(app)/layout.tsx`.
- "Sample and real numbers never mix" (§8): every stored row carries `workspaceId` in its primary key.
- "An import always lands in My workspace" (§8).
- "Files never leave the user's machine in milestone 1" (§5): parsing happens in the browser, with no network.
- No IndexedDB access during server render or at module load. Repository construction is side-effect free.
- Money is integer cents, rounded half-even once at the trade level (`toCents`). Times are UTC ISO strings in `Date#toISOString()` form (`…:00.000Z`). Day and time bucketing uses the user's timezone.
- Metrics take single-currency trade sets. Partition by `pnlCurrency` first (E3).
- Dependencies to add, exactly: `dexie`, `@tanstack/react-query`; dev: `fake-indexeddb`, `@testing-library/react`, `@testing-library/dom`, `happy-dom`. Keep `idb-keyval` and `papaparse` as they are. Add nothing else.
- Where TradeZella or MyTradingJourney document a calculation, match it (spec §7 platform-alignment table). Otherwise apply the Rulings below.
- Tests under `noUncheckedIndexedAccess` use `!` on indexed access. Snippets below omit some for brevity.
- Stay on branch `m1-data`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Re-importing the same file, or an export that overlaps an earlier one.**
   - Rows already imported into that account are skipped, so no trade doubles.
   - Two genuine identical fills in one file still both import the first time.
   - Pinned in Tasks 6 and 15.
2. **A position opened in one import and closed in a later one.**
   - It becomes one closed trade, keeping the earlier trade's id, serial and tags.
   - Undoing the later import restores the open trade.
   - Undoing the earlier import first is refused.
   - Pinned in Tasks 6 and 12.
3. **A European CSV saved from Excel** (BOM, CRLF, `;` delimiter, decimal commas) imports correct prices, never 100× prices and never silently dropped rows. Pinned in Tasks 1–4.
4. **Fill times across DST in the import's source timezone.**
   - 09:30 New York is 13:30Z in July and 14:30Z in December.
   - A time written with `Z` or an offset ignores the source timezone.
   - Pinned in Task 2.
5. **A filter link with account, strategy or tag ids that don't exist in the current workspace** (shared link, other workspace, deleted entity). Those ids are dropped, so the view shows data instead of going blank. Pinned in Tasks 7 and 14.

## Rulings

| Question | Ruling | Basis |
|---|---|---|
| IndexedDB library | **Dexie 4** for the data store. `idb-keyval` stays only for the existing landing → import file handoff (`src/lib/pending-import.ts`). Dexie gets its own database, `keel-data`, so it never version-upgrades idb-keyval's `keel` database. | Spec §5 names Dexie. idb-keyval is one key→value store: it has no secondary indexes, compound keys or multi-store transactions. Import commit/undo and every cascade below need atomic multi-table writes. |
| Test DOM | **happy-dom**, not jsdom | jsdom 31 needs Node ^22.22.2 ‖ ≥ 26, while `package.json` allows ≥ 22. happy-dom needs ≥ 20. |
| Repository set | The spec's five, plus `TagsRepo`, `WorkspacesRepo` and `PrefsRepo` | Tag, Workspace and User prefs need storage and fit none of the five. §13 leaves structure to the builder. |
| Sample determinism vs. dates | The output is a pure function of `(seed, endDate)`. The app passes `endDate` = the last weekday before the first visit (New York date), so the sample never looks stale. Tests and screenshots pin the date (`page.clock`). | §8 "fixed seed so screenshots and tests are stable" with §13 realism |
| Which day a trade belongs to, for the date filter | Its local close date, or its open date while open: the same day `dailyPnl` buckets by. | Keel's call (neither platform documents it). Keeps filtered totals equal to the sum of daily bars. |
| No account filter | Active accounts only. An archived account counts only when selected. | Keel's call |
| Unknown ids in filters | Dropped | Keel's call (Review Focus 5) |
| Writing filters to the URL | `window.history.replaceState`. Back leaves the page; it doesn't undo a filter. | Next docs, "Native History API"; Keel's call on replace vs push |
| Fee and commission cells | Costs: stored as an absolute value. Many exports (IBKR, MetaTrader) print them negative. | Keel's call |
| Negative quantity | On a sell row it is the sell size (exports that sign quantity by side). On a buy row it is rejected. Zero is rejected. | E1 + Keel's call |
| A file P&L column (closed-trade rows) | Compared with Keel's **gross and net**, and flagged only when it matches neither within $0.01. For a pair without the account currency, the file figure becomes the trade's gross in the account currency. | §7 "shown beside Keel's figure… never silently picked". MetaTrader's Profit excludes Commission and Swap. |
| Closed-trade rows | Each row is built alone through `buildTrades`, so one row is always one trade | §7 |
| Duplicate detection | Per account, a multiset of row fingerprints from active imports | Keel's call |
| Positions spanning imports | A later import's fills join the account's open trade in that symbol, and FIFO runs across imports | §7 "open positions at the end of data" |
| Options left open past expiry | Close at price 0 at 16:00 New York on the expiry date, at import time and in the seed | E2 |
| MAE / MFE sign | Signed cents: `mae ≤ 0`, `mfe ≥ 0` | §3: every P&L value carries a sign |
| Excel (.xlsx) | Deferred (new E25) | §7 says "CSV/Excel", but the §5 stack has no spreadsheet parser |

## Backlog items owned by this plan

| Item | Where |
|---|---|
| E1 import validation | Task 4 |
| E2 options expiring worthless | Task 5, used by Tasks 6 and 8. Options that expire after their last import stay open until the next import into that account: new **E26**. |
| E3 partition by currency + flag crosses | Task 6 (flag), Task 9 (partition), Task 14 (hooks) |
| E6 `canonicalSymbol` vs real exports | Task 6 pins slash, case and space variants as one position. Confirming against real broker exports stays deferred: no exports exist in the repo yet (it waits on #11). Its scope grows to exchange suffixes (`/ESZ5:XCME`) and MetaTrader broker suffixes (`EURUSD.m`). |
| E11 import source timezone | Tasks 2–3 |
| E14 `PreviewRow.rowIndex` | Task 1 |
| E18 ticket identifiers | Task 1 |

## File map

```
src/domain/import/  csv.ts  numbers.ts  mapping.ts  rows.ts  expiry.ts  plan.ts
                    (modified) preview.ts  fill-time.ts  guess-columns.ts
src/domain/         (modified) types.ts  instruments.ts  time.ts
src/data/           workspaces.ts  filters.ts  metrics.ts  repository.ts  trade-patch.ts
src/data/seed/      random.ts  content.ts  generate.ts
src/data/local/     db.ts  context.ts  local-repository.ts  workspaces.ts  prefs.ts
                    trades.ts  accounts.ts  strategies.ts  tags.ts  journal.ts  imports.ts
src/data/query/     keys.ts  cross-tab.ts  provider.tsx  hooks.ts  derived.ts
src/data/__fixtures__/sample.ts
src/lib/import/     read-file.ts
src/app/(app)/      layout.tsx
e2e/                data-layer.spec.ts
```

---

### Task 1: CSV rows with file row numbers; drop the ticket names (E14, E18)

**Files:**
- Create: `src/domain/import/csv.ts`, Test: `src/domain/import/csv.test.ts`
- Modify: `src/domain/import/preview.ts`, `preview.test.ts`, `fill-time.ts` (doc comment), `fill-time.test.ts` (test title), `src/lib/import/preview-file.test.ts`, `src/content/landing-content.test.ts`, `src/components/product/column-mapping.tsx`, `src/lib/landing/sample-view.ts`, `src/components/product/trade-detail-card.tsx`

**Interfaces:**
- Consumes: `guessColumns`, `normalizeSide`, `PreviewField` (`guess-columns.ts`)
- Produces:
  ```ts
  export interface CsvRow { rowIndex: number /* 1-based file row; the header is row 1 */; cells: string[] /* trimmed */ }
  export interface ParsedCsv { headers: string[] /* trimmed */; rows: CsvRow[] /* non-blank rows only */; delimiter: string }
  export function parseCsv(text: string, opts?: { limit?: number /* data rows */ }): ParsedCsv;
  // preview.ts — `tickets` renamed to `rows`; rows gain rowIndex
  export interface PreviewRow { rowIndex: number; time?: string; symbol?: string; side?: 'buy' | 'sell'; qty?: string; price?: string }
  export interface Preview { headers: string[]; guessed: Partial<Record<PreviewField, number>>; rows: PreviewRow[] }
  // sample-view.ts — renamed from ticketPrice, same behaviour
  export function fillPrice(t: Trade, price: number): string;
  ```

- [ ] **Step 1: Write the failing tests** in `csv.test.ts`:

```ts
test('numbers rows by file row; blank lines are skipped but counted', () => {
  const p = parseCsv('\uFEFFTime,Symbol\r\n09:41, ESZ5 \r\n\r\n  ,  \r\n09:42,NQZ5\r\n');
  expect(p.headers).toEqual(['Time', 'Symbol']);
  expect(p.rows).toEqual([
    { rowIndex: 2, cells: ['09:41', 'ESZ5'] },
    { rowIndex: 5, cells: ['09:42', 'NQZ5'] },
  ]);
  expect(p.delimiter).toBe(',');
});
test('a quoted cell holding a newline is one row', () => {
  expect(parseCsv('a,b\n"x\ny",1\n2,3\n').rows.map((r) => r.rowIndex)).toEqual([2, 3]);
});
test('detects semicolons and stops at the limit', () => {
  const big = ['a;b', ...Array.from({ length: 50000 }, (_, i) => `${i};x`)].join('\n');
  const p = parseCsv(big, { limit: 3 });
  expect(p.delimiter).toBe(';');
  expect(p.rows.map((r) => r.rowIndex)).toEqual([2, 3, 4]);
});
test('empty text', () => {
  expect(parseCsv('')).toEqual({ headers: [], rows: [], delimiter: ',' });
});
```

In `preview.test.ts`, rename `tickets` to `rows` and add `rowIndex: 2` to the two `toEqual` expectations. Rename the test title "prints the first rows as tickets…" to "…as rows…". Add:

```ts
test('preview rows carry their file row', () => {
  expect(previewFromText('Symbol\n\nES\n').rows).toEqual([{ rowIndex: 3, symbol: 'ES' }]);
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/import`. Expected: FAIL (`parseCsv` is undefined, `rows` is undefined).
- [ ] **Step 3: Implement `parseCsv`.**
  - Use Papa Parse with `skipEmptyLines: false` and a `step` callback, so the index of each record is its file row.
  - Skip a record whose cells all trim to `''`. Call `parser.abort()` once `limit` data rows are collected.
  - Default `delimiter` to `','` when Papa reports none.
  - Rebuild `previewFromText` on `parseCsv(csv, { limit })`. `PreviewError('empty')` is thrown when `headers` is empty; keep the rest of its behaviour.
  - Rename `Preview.tickets` → `rows` and `ticketPrice` → `fillPrice` at every use found by `grep -rn "tickets\|ticketPrice" src`.
  - Change "ticket clock format" to "clock format" in `fill-time.ts`'s doc comment and in the test title.
- [ ] **Step 4: Verify:** `npm test && npm run typecheck && npm run lint`. Expected: all pass, and `grep -rni ticket src` finds nothing.
- [ ] **Step 5: Commit** with `feat(import): file-row numbers for CSV rows; drop ticket identifiers (E14, E18)`.

---

### Task 2: Import times and numbers (E11)

**Files:**
- Modify: `src/domain/import/fill-time.ts`, `fill-time.test.ts`, `src/domain/time.ts`, `src/domain/time.test.ts`
- Create: `src/domain/import/numbers.ts`, Test: `src/domain/import/numbers.test.ts`

**Interfaces:**
- Consumes: `TZDate` (`@date-fns/tz`)
- Produces:
  ```ts
  // fill-time.ts
  export type DateOrder = 'mdy' | 'dmy';
  export interface WallClock { year: number; month: number /* 1-12 */; day: number; hour: number; minute: number; second: number }
  export function parseWallClock(raw: string, dateOrder?: DateOrder /* default 'mdy' */): WallClock | null;
  export function fillTimeToUtc(raw: string, opts: { timeZone: string; dateOrder: DateOrder }): string | null;
  export function guessDateOrder(samples: readonly string[]): DateOrder;
  // time.ts
  export function isValidTimeZone(timeZone: string): boolean;
  // numbers.ts
  export type DecimalMark = '.' | ',';
  export function parseDecimal(raw: string, decimal: DecimalMark): number | null;
  ```

Accepted wall-clock shapes:
- ISO `YYYY-MM-DD` with a space or `T`
- MetaTrader `YYYY.MM.DD`
- slashed `MM/DD/YYYY` (mdy) or `DD/MM/YYYY` (dmy)

All take an optional seconds part, fraction and AM/PM. `formatFillTime` keeps its current tests: it is `parseWallClock(raw, 'mdy')` printed by `formatClock`.

- [ ] **Step 1: Write the failing tests.** In `fill-time.test.ts`:

```ts
const ny = { timeZone: 'America/New_York', dateOrder: 'mdy' } as const;
test('wall clock in the source timezone, across DST', () => {
  expect(fillTimeToUtc('2026-07-15 09:30:00', ny)).toBe('2026-07-15T13:30:00.000Z');
  expect(fillTimeToUtc('2026-12-15 09:30', ny)).toBe('2026-12-15T14:30:00.000Z');
  expect(fillTimeToUtc('11/16/2026 2:05 PM', ny)).toBe('2026-11-16T19:05:00.000Z');
  expect(fillTimeToUtc('2026-11-16 23:30:00', { ...ny, timeZone: 'Asia/Tokyo' })).toBe('2026-11-16T14:30:00.000Z');
});
test('a written Z or offset wins over the source timezone', () => {
  expect(fillTimeToUtc('2026-11-16T10:48:00Z', { ...ny, timeZone: 'Asia/Tokyo' })).toBe('2026-11-16T10:48:00.000Z');
  expect(fillTimeToUtc('2026-11-16T10:48:00+05:00', ny)).toBe('2026-11-16T05:48:00.000Z');
});
test('MetaTrader dotted dates and day-first dates', () => {
  const london = { timeZone: 'Europe/London', dateOrder: 'dmy' } as const;
  expect(fillTimeToUtc('2026.11.16 10:48:00', london)).toBe('2026-11-16T10:48:00.000Z');
  expect(fillTimeToUtc('16/11/2026 10:48', london)).toBe('2026-11-16T10:48:00.000Z');
  expect(fillTimeToUtc('16/11/2026 10:48', { ...london, dateOrder: 'mdy' })).toBeNull();
});
test('unparseable values and unknown zones give null', () => {
  for (const raw of ['', 'garbage', '2026-02-30 10:00', '2026-11-16', '10:48:00'])
    expect(fillTimeToUtc(raw, ny)).toBeNull();
  expect(fillTimeToUtc('2026-11-16 10:00', { ...ny, timeZone: 'Not/AZone' })).toBeNull();
});
test('guessDateOrder', () => {
  expect(guessDateOrder(['11/16/2026 10:00', '1/5/2026 9:05'])).toBe('mdy');
  expect(guessDateOrder(['05/11/2026 10:00', '16/11/2026 09:00'])).toBe('dmy');
  expect(guessDateOrder(['2026-11-16 10:00', 'x'])).toBe('mdy');
});
```

In `time.test.ts`, assert `isValidTimeZone('America/New_York')` is true and that `'Not/AZone'` and `''` are false. In `numbers.test.ts`:

```ts
test("'.' decimals with ',' thousands", () => {
  expect(parseDecimal('6010.25', '.')).toBe(6010.25);
  expect(parseDecimal(' $1,234.50 ', '.')).toBe(1234.5);
  expect(parseDecimal('(12.50)', '.')).toBe(-12.5);
  expect(parseDecimal('-12.5', '.')).toBe(-12.5);
  expect(parseDecimal('+3', '.')).toBe(3);
});
test("a decimal comma is never read as thousands in '.' mode", () => {
  for (const raw of ['6010,25', '1,23', '12,3456', '', 'abc', '1.2.3', '--1'])
    expect(parseDecimal(raw, '.')).toBeNull();
});
test("',' decimals with '.' or space thousands", () => {
  expect(parseDecimal('6010,25', ',')).toBe(6010.25);
  expect(parseDecimal('6.010,25', ',')).toBe(6010.25);
  expect(parseDecimal('6 010,25', ',')).toBe(6010.25);
  expect(parseDecimal('€ -1,5', ',')).toBe(-1.5);
  expect(parseDecimal('6010.25', ',')).toBeNull();
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain`. Expected: FAIL, functions undefined.
- [ ] **Step 3: Implement.**
  - `fillTimeToUtc` handles ISO strings ending in `Z` or `±HH:MM` by `Date.parse`. Everything else goes through `parseWallClock` and then `new TZDate(y, m - 1, d, h, mi, s, timeZone)`. Return `new Date(+tz).toISOString()`, because TZDate's own `toISOString` prints the zone's offset, not `Z`. Return `null` when the zone is invalid or the result is `NaN`.
  - `guessDateOrder` returns `'dmy'` when a slashed sample's first number is > 12 and none has a second number > 12. Otherwise it returns `'mdy'`.
  - `parseDecimal`:
    - strip `$ € £ ¥`, spaces at the ends, a leading `+`, and accounting parentheses (which make the value negative)
    - accept thousands separators only in groups of three: `,` in `'.'` mode; `.`, a space, U+00A0 or U+202F in `','` mode
  - `isValidTimeZone` uses `new Intl.DateTimeFormat('en-US', { timeZone })` inside try/catch, and is false for `''`.
- [ ] **Step 4: Verify:** `npm test -- src/domain && npm run typecheck`. Expected: PASS, including the unchanged `formatFillTime` tests.
- [ ] **Step 5: Commit** with `feat(import): source-timezone fill times, date order and decimal marks (E11)`.

---

### Task 3: Column mapping for fills and closed-trade files

**Files:**
- Create: `src/domain/import/mapping.ts`, Test: `src/domain/import/mapping.test.ts`
- Modify: `src/domain/import/guess-columns.ts`

**Interfaces:**
- Consumes: `ParsedCsv` (Task 1); `DateOrder`, `guessDateOrder` (Task 2); `DecimalMark` (Task 2); `ResolveOptions` (`instruments.ts`)
- Produces:
  ```ts
  // guess-columns.ts — guessColumns becomes matchColumns(headers, FIELDS, SYNONYMS); behaviour unchanged
  export function matchColumns<F extends string>(headers: readonly string[], fields: readonly F[], synonyms: Readonly<Record<F, readonly string[]>>): Partial<Record<F, number>>;
  // mapping.ts
  export type FillField = 'date' | 'time' | 'symbol' | 'side' | 'qty' | 'price' | 'fees' | 'commission' | 'orderId';
  export type TradeRowField = 'openTime' | 'closeTime' | 'symbol' | 'side' | 'qty' | 'entryPrice' | 'exitPrice' | 'fees' | 'commission' | 'pnl';
  export type InstrumentOverrides = NonNullable<ResolveOptions['overrides']>; // keyed by instrumentKey (Task 4)
  export interface MappingOptions { sourceTimeZone: string; dateOrder: DateOrder; decimal: DecimalMark; forexQtyUnit: 'lots' | 'units'; overrides: InstrumentOverrides }
  export type ImportMapping =
    | ({ kind: 'fills'; columns: Partial<Record<FillField, number>> } & MappingOptions)
    | ({ kind: 'closed-trades'; columns: Partial<Record<TradeRowField, number>> } & MappingOptions);
  export const REQUIRED_FIELDS: { fills: readonly FillField[]; 'closed-trades': readonly TradeRowField[] };
  export function guessMapping(parsed: ParsedCsv, defaults: { sourceTimeZone: string; overrides?: InstrumentOverrides }): ImportMapping;
  export function missingFields(mapping: ImportMapping): string[]; // required fields with no column, in REQUIRED_FIELDS order
  ```

Rules:
- `REQUIRED_FIELDS.fills` = time, symbol, side, qty, price. `REQUIRED_FIELDS['closed-trades']` = openTime, closeTime, symbol, side, qty, entryPrice, exitPrice.
- **Kind.** The kind is `'closed-trades'` when any of these is true:
  - a header matches a close-time synonym (close time, exit time, closed, close date, exit date, date closed)
  - a header matches an exit-price synonym (exit price, close price, closing price, avg exit, exit)
  - `price` or `time` appears twice, as in MetaTrader reports

  Otherwise the kind is `'fills'`. With MetaTrader duplicates, the first `time`/`price` is the open/entry and the second is the close/exit.
- **Fills.** If both `date` and `time` exist as exact headers, they map separately. Otherwise `time` uses `guessColumns`' synonyms. `orderId` synonyms are order id, order number and order no. Bare "order" is excluded, so "Order Type" never maps.
- **Shared synonyms:**
  - fees: fees, fee, total fees
  - commission: commission, commissions, comm
  - pnl: profit, pnl, p l, net p l, realized p l, profit loss, net profit
  - closed-trade side adds `type`
  - symbol adds `item`
- **Options:**
  - `decimal` is `','` when `parsed.delimiter` is `';'`, else `'.'`
  - `dateOrder` = `guessDateOrder` of the first 50 cells of the time column (the date column when split)
  - `forexQtyUnit` is `'lots'`
  - `overrides` = `defaults.overrides ?? {}`

- [ ] **Step 1: Write the failing tests:**

```ts
const ny = { sourceTimeZone: 'America/New_York' };
const g = (text: string) => guessMapping(parseCsv(text), ny);
test('the landing sample is a fills file', () => {
  expect(guessMapping(parseCsv(readFileSync('e2e/fixtures/sample-fills.csv', 'utf8')), ny)).toEqual({
    kind: 'fills', columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
    sourceTimeZone: 'America/New_York', dateOrder: 'mdy', decimal: '.', forexQtyUnit: 'lots', overrides: {},
  });
});
test('separate date and time columns, with commission, fees and order id', () => {
  expect(g('Date,Time,Symbol,Buy/Sell,Quantity,Price,Commission,Fees,Order ID,Order Type\n').columns).toEqual(
    { date: 0, time: 1, symbol: 2, side: 3, qty: 4, price: 5, commission: 6, fees: 7, orderId: 8 });
});
test('a MetaTrader 4 statement is a closed-trade file', () => {
  const m = g('Ticket,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit\n');
  expect(m.kind).toBe('closed-trades');
  expect(m.columns).toEqual({ openTime: 1, side: 2, qty: 3, symbol: 4, entryPrice: 5, closeTime: 8, exitPrice: 9, commission: 10, pnl: 13 });
});
test('a MetaTrader 5 positions report is a closed-trade file', () => {
  expect(g('Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit\n').columns).toEqual(
    { openTime: 0, symbol: 2, side: 3, qty: 4, entryPrice: 5, closeTime: 8, exitPrice: 9, commission: 10, pnl: 12 });
});
test('a semicolon file with day-first dates (Review Focus 3)', () => {
  expect(g('Time;Symbol;Side;Qty;Price\n16/11/2026 09:41;ESZ5;Buy;2;6010,25\n')).toMatchObject({ decimal: ',', dateOrder: 'dmy' });
});
test('missingFields lists unmapped required fields', () => {
  expect(missingFields(g('Symbol,Side\n'))).toEqual(['time', 'qty', 'price']);
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/import`. Expected: FAIL, `guessMapping` undefined.
- [ ] **Step 3: Implement.** Extract `guessColumns`' two-pass matcher (exact pass, then "contains" pass) into `matchColumns` and keep `guessColumns` as a call to it. In `guessMapping`, decide the kind first, then match that kind's fields. Detect MetaTrader duplicates by normalized header before matching.
- [ ] **Step 4: Verify:** `npm test -- src/domain/import && npm run typecheck`. Expected: PASS, including the existing `guess-columns` tests.
- [ ] **Step 5: Commit** with `feat(import): column mapping for fills and closed-trade files`.

---

### Task 4: Reading rows (E1) and remembered point values

**Files:**
- Modify: `src/domain/instruments.ts`, `src/domain/instruments.test.ts`
- Create: `src/domain/import/rows.ts`, Test: `src/domain/import/rows.test.ts`

**Interfaces:**
- Consumes: `ParsedCsv` (Task 1), `fillTimeToUtc`, `parseDecimal` (Task 2), `ImportMapping`, `FillField`, `TradeRowField`, `guessMapping` (Task 3), `normalizeSide`, `canonicalSymbol(symbol): string` (`trade-builder.ts`), `toCents`, `Execution`, `Cents`
- Produces:
  ```ts
  // instruments.ts
  export function instrumentKey(symbol: string): string; // canonical; futures-pattern symbols → their root
  // resolveInstrument: when no pattern resolves, opts.overrides?.[instrumentKey(symbol)] yields
  // { symbol: trimmed, root: key, assetClass: o.assetClass ?? 'cfd', pointValue, tickSize, quoteCurrency: 'USD' }
  // rows.ts
  export type RowIssueCode = 'missing' | 'time-unparseable' | 'qty-invalid' | 'number-unparseable' | 'side-unrecognised' | 'close-before-open';
  export interface RowIssue { rowIndex: number; field: FillField | TradeRowField; code: RowIssueCode; value: string }
  export interface ImportedFill { rowIndex: number; execution: Execution; fingerprint: string }
  export interface ImportedTrip { rowIndex: number; entry: Execution; exit: Execution; filePnl?: Cents; fingerprint: string }
  export function readRows(parsed: ParsedCsv, mapping: ImportMapping, ids: { importId: string; accountId: string }):
    { fills: ImportedFill[]; trips: ImportedTrip[]; issues: RowIssue[] };
  ```

Rules:
- **Issues.** A row yields at most one issue: the first failing field, in `FillField` / `TradeRowField` declaration order. Rows with an issue produce no execution. A blank required cell is `'missing'`. Blank fees and commission are 0.
- **Times.** `date` + `time` join as `` `${date} ${time}` ``. Times use `fillTimeToUtc` with the mapping's `sourceTimeZone` and `dateOrder`.
- **Numbers.**
  - Numbers use `parseDecimal` with `mapping.decimal`.
  - qty must be > 0. A negative qty on a sell row becomes its absolute value. Anything else is `'qty-invalid'`.
  - fees and commission are `toCents(Math.abs(v))`.
  - `filePnl` is `toCents(v)`, signed.
- **Ids.**
  - A fill is `${importId}:r${rowIndex}`.
  - A trip is `…:entry` and `…:exit`. The entry side follows the row's side (`buy`/`long` → buy). The entry carries all fees and commission; the exit carries 0.
  - `closeTime < openTime` is `'close-before-open'`.
- **Fingerprints.** Persisted, so the format is fixed:
  - fill: `[canonicalSymbol(symbol), side, qty, price, timeIso, orderId ?? ''].join('|')`
  - trip: `['trip', canonicalSymbol(symbol), side, qty, entryPrice, exitPrice, openIso, closeIso].join('|')`

- [ ] **Step 1: Write the failing tests.** In `instruments.test.ts`:

```ts
test('instrumentKey names what a point value is entered for', () => {
  expect(instrumentKey('/ESZ5')).toBe('ES');
  expect(instrumentKey(' zcz5 ')).toBe('ZC');
  expect(instrumentKey('M6EZ5')).toBe('M6E');
  expect(instrumentKey('xauusd')).toBe('XAUUSD');
  expect(instrumentKey('US30')).toBe('US30');
});
test('a remembered point value resolves a symbol no pattern knows', () => {
  expect(resolveInstrument('XAUUSD')).toBeNull();
  expect(resolveInstrument('xauusd', { overrides: { XAUUSD: { pointValue: 100, tickSize: 0.01 } } })).toEqual({
    symbol: 'xauusd', root: 'XAUUSD', assetClass: 'cfd', pointValue: 100, tickSize: 0.01, quoteCurrency: 'USD' });
});
```

In `rows.test.ts`:

```ts
const ids = { importId: 'imp1', accountId: 'acc1' };
const read = (text: string) => { const p = parseCsv(text); return readRows(p, guessMapping(p, { sourceTimeZone: 'America/New_York' }), ids); };
const H = 'Time,Symbol,Side,Qty,Price,Commission\n';
test('a fill row becomes an execution in UTC', () => {
  const r = read(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010.00,2.50\n');
  expect(r.issues).toEqual([]);
  expect(r.fills[0]!.execution).toEqual({ id: 'imp1:r2', accountId: 'acc1', symbol: 'ESZ5', side: 'buy', qty: 2,
    price: 6010, time: '2026-11-16T14:41:00.000Z', fees: 0, commission: 250 });
});
test('rejects bad quantities, times, sides and numbers before the builder (E1)', () => {
  const r = read(H + ['2026-11-16 09:41,ESZ5,Buy,0,6010,0', '2026-11-16 09:41,ESZ5,Buy,-2,6010,0', 'yesterday,ESZ5,Buy,1,6010,0',
    '2026-11-16 09:41,ESZ5,cancel,1,6010,0', '2026-11-16 09:41,,Buy,1,6010,0', '2026-11-16 09:41,ESZ5,Buy,1,6010,x'].join('\n'));
  expect(r.fills).toEqual([]);
  expect(r.issues.map((i) => [i.rowIndex, i.field, i.code])).toEqual([[2, 'qty', 'qty-invalid'], [3, 'qty', 'qty-invalid'],
    [4, 'time', 'time-unparseable'], [5, 'side', 'side-unrecognised'], [6, 'symbol', 'missing'], [7, 'commission', 'number-unparseable']]);
});
```

```ts
test('a negative quantity on a sell row is its size; fees are costs', () => {
  expect(read(H + '2026-11-16 09:41,ESZ5,Sell,-2,6010,(1.25)\n').fills[0]!.execution).toMatchObject({ side: 'sell', qty: 2, commission: 125 });
});
test('decimal commas in a semicolon export (Review Focus 3)', () => {
  expect(read('Time;Symbol;Side;Qty;Price\n16/11/2026 09:41;ESZ5;Buy;2;6010,25\n').fills[0]!.execution.price).toBe(6010.25);
});
test('identical rows share a fingerprint; a different field changes it', () => {
  const r = read(H + '2026-11-16 09:41,ESZ5,Buy,1,6010,0\n2026-11-16 09:41,ESZ5,Buy,1,6010,0\n2026-11-16 09:41,ESZ5,Buy,2,6010,0\n');
  expect(r.fills[0]!.fingerprint).toBe(r.fills[1]!.fingerprint);
  expect(r.fills[2]!.fingerprint).not.toBe(r.fills[0]!.fingerprint);
});
test('a MetaTrader row is an entry and an exit; a balance row is skipped', () => {
  const p = parseCsv('Ticket,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit\n'
    + '1,2026.11.16 10:00:00,sell,0.50,eurusd,1.05200,0,0,2026.11.16 11:30:00,1.05000,-3.50,0,0,100.00\n'
    + '2,2026.11.16 12:00:00,balance,,,,,,,,,,,1000.00\n');
  const r = readRows(p, guessMapping(p, { sourceTimeZone: 'Europe/London' }), ids);
  expect(r.trips[0]).toMatchObject({ rowIndex: 2, filePnl: 10000,
    entry: { id: 'imp1:r2:entry', side: 'sell', qty: 0.5, price: 1.052, time: '2026-11-16T10:00:00.000Z', commission: 350 },
    exit: { id: 'imp1:r2:exit', side: 'buy', qty: 0.5, price: 1.05, time: '2026-11-16T11:30:00.000Z', commission: 0 } });
  expect(r.issues).toEqual([{ rowIndex: 3, field: 'closeTime', code: 'missing', value: '' }]);
});
test('a close before its open is rejected', () => { /* one closed-trade row with close < open → code 'close-before-open' */ });
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `instrumentKey`: `canonicalSymbol`, then if `FUTURES_RE` matches, its first group; otherwise the canonical symbol.
  - Add the generic-override fallback as the last branch of `resolveInstrument`.
  - Write `readRows` per the rules above.
- [ ] **Step 4: Verify:** `npm test -- src/domain && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(import): read and validate rows; remembered point values for unknown symbols (E1)`.

---

### Task 5: Options left open past expiry (E2)

**Files:** Create `src/domain/import/expiry.ts`, Test: `src/domain/import/expiry.test.ts`

**Interfaces:**
- Consumes: `canonicalSymbol`, `buildTrades(executions, opts: BuildOptions): BuildResult`, `resolveInstrument`, `TZDate`
- Produces:
  ```ts
  export function expiryCloseUtc(expiry: string /* YYYY-MM-DD */): string; // 16:00 America/New_York that day
  export interface ExpiredOption { accountId: string; symbol: string /* canonical */; expiry: string; executionId: string }
  export function settleExpiredOptions(executions: readonly Execution[], resolve: (symbol: string) => Instrument | null, asOf: string):
    { executions: Execution[]; expired: ExpiredOption[] };
  ```

Rules:
- Group by `accountId` + `canonicalSymbol`. For an option group whose `expiryCloseUtc(expiry) <= asOf` and whose signed net quantity is not 0, append one synthetic fill:
  - id `` `${accountId}:${symbol}:expiry` ``
  - the opposite side, quantity |net|, price 0, fees 0, commission 0
  - time = the later of the expiry close and the group's last fill
- Input order is preserved, and synthetic fills come last.

- [ ] **Step 1: Write the failing tests:**

```ts
const opts = { workspaceId: 'w', startSerial: 1, resolve: (s: string) => resolveInstrument(s), accountCurrency: () => 'USD' };
const x = (p: Partial<Execution>): Execution => ({ id: 'x1', accountId: 'a1', symbol: 'AAPL  261120C00150000', side: 'buy', qty: 1, price: 1, time: '2026-11-18T15:00:00.000Z', fees: 0, commission: 0, ...p });
const AFTER = '2026-11-21T00:00:00.000Z';
test('expiry close is 16:00 New York', () => {
  expect(expiryCloseUtc('2026-11-20')).toBe('2026-11-20T21:00:00.000Z');
  expect(expiryCloseUtc('2026-07-17')).toBe('2026-07-17T20:00:00.000Z');
});
test('a long call left open past expiry closes at 0 and shows its loss', () => {
  const s = settleExpiredOptions([x({ qty: 2, price: 1.5, commission: 130 })], opts.resolve, AFTER);
  expect(s.expired).toEqual([expect.objectContaining({ accountId: 'a1', expiry: '2026-11-20' })]);
  expect(buildTrades(s.executions, opts).trades[0]).toMatchObject({ status: 'closed', avgExit: 0,
    closedAt: '2026-11-20T21:00:00.000Z', gross: -30000, net: -30130 });
});
test('a short put that expires keeps its premium', () => {
  const s = settleExpiredOptions([x({ symbol: 'SPY   261120P00450000', side: 'sell', price: 2, commission: 65 })], opts.resolve, AFTER);
  expect(buildTrades(s.executions, opts).trades[0]).toMatchObject({ gross: 20000, net: 19935 });
});
test('nothing is added before expiry, for flat positions, or for non-options', () => {
  const flat = [x({}), x({ id: 'x2', side: 'sell', time: '2026-11-19T15:00:00.000Z' })];
  expect(settleExpiredOptions([x({})], opts.resolve, '2026-11-20T20:59:00.000Z').expired).toEqual([]);
  expect(settleExpiredOptions(flat, opts.resolve, AFTER).expired).toEqual([]);
  expect(settleExpiredOptions([x({ symbol: 'ESZ5' })], opts.resolve, AFTER).expired).toEqual([]);
});
test('a partly closed position settles only the remainder', () => {
  const s = settleExpiredOptions([x({ qty: 3 }), x({ id: 'x2', side: 'sell', qty: 1 })], opts.resolve, AFTER);
  expect(s.executions.at(-1)).toMatchObject({ side: 'sell', qty: 2, price: 0 });
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/import/expiry`. Expected: FAIL.
- [ ] **Step 3: Implement** per the rules.
- [ ] **Step 4: Verify:** `npm test -- src/domain && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(import): settle options left open past expiry at 0 (E2)`.

---

### Task 6: Planning an import

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/import/plan.ts`, Test: `src/domain/import/plan.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `buildTrades`, `canonicalSymbol`, `resolveInstrument`, `instrumentKey`, `riskFromStop(trade, stop): Cents` (`metrics/summary.ts`)
- Produces:
  ```ts
  // types.ts
  // Trade gains:  importId?: string  — the import that last built this trade
  export interface ImportJob {
    id: string; workspaceId: string; accountId: string; fileName: string; mapping: ImportMapping;
    rowCount: number; tradeCount: number; skippedCount: number; duplicateCount: number;
    status: 'active' | 'undone'; createdAt: string; undoneAt?: string;
  }
  // plan.ts
  export interface ImportContext { workspaceId: string; accountId: string; accountCurrency: string; nextSerial: number;
    openTrades: Trade[] /* the account's open trades */; fingerprints: string[] /* active imports of the account */; overrides: InstrumentOverrides }
  export type TradeFlag =
    | { tradeId: string; code: 'unconverted-currency'; currency: string }
    | { tradeId: string; code: 'pnl-mismatch'; file: Cents; keel: Cents }
    | { tradeId: string; code: 'expired-worthless'; expiry: string };
  export type ImportBlock = 'no-rows' | 'unresolved-symbols' | 'nothing-new';
  export interface ImportPlan {
    importId: string; workspaceId: string; accountId: string; fileName: string; createdAt: string; mapping: ImportMapping;
    rowCount: number; trades: Trade[] /* to write, serial order */; replacedTrades: Trade[] /* stored trades this import rebuilds */;
    issues: RowIssue[]; duplicateRows: number[] /* rowIndex */; fingerprints: string[] /* of imported rows */;
    unresolvedKeys: string[]; flags: TradeFlag[]; blocked: ImportBlock | null;
  }
  export function planImport(parsed: ParsedCsv, mapping: ImportMapping, ctx: ImportContext,
    meta: { importId: string; fileName: string; now: string }): ImportPlan;
  ```

The algorithm (`createdAt` = `meta.now`, `rowCount` = `parsed.rows.length`):

1. `readRows`. **Duplicates:** count `ctx.fingerprints`, then walk valid rows in file order. A row whose fingerprint still has a count is a duplicate, and each match decrements the count. The other rows are kept.
2. The resolver is `s => resolveInstrument(s, { forexQtyUnit: mapping.forexQtyUnit, overrides: mapping.overrides })`.
3. **Fills:**
   - `merged` = open trades in `ctx.openTrades` whose canonical symbol has a kept fill, plus open options whose `expiryCloseUtc(expiry) <= now`.
   - Feed the merged trades' executions and the kept executions to `settleExpiredOptions(…, meta.now)`.
   - Then call `buildTrades({ workspaceId, startSerial: ctx.nextSerial, resolve, accountCurrency: () => ctx.accountCurrency })`.
   - **Closed trades:** each kept trip goes through `buildTrades([entry, exit], …)` alone, and `merged = []`.
4. **Carry-over.** A built trade whose id equals a merged trade's id keeps that trade's `serial`, `strategyId`, `tagIds`, `rating`, `ruleChecks`, `noteId`, `plannedStop` and `plannedTarget`. Its `initialRisk` is `riskFromStop(built, plannedStop)` when a stop exists, else the old `initialRisk`.
5. **Serials.** The other trades take serials `ctx.nextSerial`, +1, … in `openedAt` order, then by id. Every trade gets `importId = meta.importId`. Sort the trades by serial.
6. **File P&L** (closed trades with `pnl` mapped):
   - If `pnlCurrency !== accountCurrency`: set `gross = filePnl`, `net = gross − fees`, `pnlCurrency = accountCurrency`.
   - Otherwise, flag `pnl-mismatch` (`keel` = gross) when `|filePnl − gross| > 1` **and** `|filePnl − net| > 1`.
7. **Flags:**
   - `unconverted-currency` where `pnlCurrency !== accountCurrency`
   - `expired-worthless` for a trade holding an execution id ending `:expiry`
   - Order: by serial, then code.
8. `unresolvedKeys` = `instrumentKey` of `buildTrades`' `unresolvedSymbols`, deduplicated and sorted.
9. **Blocked:**
   - `'no-rows'` when no row is valid
   - else `'unresolved-symbols'` when `unresolvedKeys` is non-empty
   - else `'nothing-new'` when every valid row was a duplicate
   - else `null`
10. `fingerprints` = the kept rows' fingerprints. `replacedTrades` = `merged`, as stored.

- [ ] **Step 1: Write the failing tests:**

```ts
const csv = readFileSync('e2e/fixtures/sample-fills.csv', 'utf8');
const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
const ctx = (o: Partial<ImportContext> = {}): ImportContext => ({ workspaceId: 'mine', accountId: 'acc1', accountCurrency: 'USD',
  nextSerial: 1, openTrades: [], fingerprints: [], overrides: {}, ...o });
const plan = (text: string, c = ctx(), m: Partial<MappingOptions> = {}, importId = 'imp1', now = '2026-11-21T00:00:00.000Z') => {
  const p = parseCsv(text);
  return planImport(p, { ...guessMapping(p, { sourceTimeZone: 'America/New_York' }), ...m }, c, { importId, fileName: 'f.csv', now });
};
test('the landing sample plans eight trades worth +$1,272.50', () => {
  const p = plan(csv);
  expect(p.blocked).toBeNull();
  expect(p.trades.map((t) => t.serial)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(p.trades.reduce((s, t) => s + t.net, 0)).toBe(127250);
  expect(p.trades.every((t) => t.importId === 'imp1' && t.workspaceId === 'mine')).toBe(true);
  expect(p).toMatchObject({ rowCount: 16, issues: [], duplicateRows: [], flags: [], replacedTrades: [] });
  expect(p.fingerprints).toHaveLength(16);
});
test('serials continue the workspace', () => expect(plan(csv, ctx({ nextSerial: 41 })).trades[0]!.serial).toBe(41));
test('re-importing the same file adds nothing (Review Focus 1)', () => {
  const again = plan(csv, ctx({ fingerprints: plan(csv).fingerprints }));
  expect(again).toMatchObject({ trades: [], blocked: 'nothing-new' });
  expect(again.duplicateRows).toHaveLength(16);
});
test('identical fills in one file both import; only already-imported copies are skipped (Review Focus 1)', () => {
  const twin = H + '2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:50:00,ESZ5,Sell,2,6012\n';
  const first = plan(twin);
  expect(first.trades[0]!.executions).toHaveLength(3);
  expect(plan(twin, ctx({ fingerprints: [first.fingerprints[0]!] })).duplicateRows).toEqual([2]);
});
test('a position closed by a later import is one trade keeping id, serial and tags (Review Focus 2)', () => {
  const open = { ...plan(H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n').trades[0]!, serial: 7, tagIds: ['t1'] };
  const p = plan(H + '2026-11-17 10:00:00,ESZ5,Sell,2,6015\n', ctx({ nextSerial: 9, openTrades: [open] }), {}, 'imp2');
  expect(p.replacedTrades).toEqual([open]);
  expect(p.trades).toEqual([expect.objectContaining({ id: open.id, serial: 7, tagIds: ['t1'], status: 'closed', gross: 50000, importId: 'imp2' })]);
});
test('slash, case and space variants of one symbol are one position (E6)', () => {
  const p = plan(H + '2026-11-16 09:41:00,/ESZ5,Buy,1,6010\n2026-11-16 09:45:00, esz5 ,Buy,1,6011\n2026-11-16 09:50:00,ESZ5,Sell,2,6012\n');
  expect(p.trades).toHaveLength(1);
  expect(p.trades[0]!.instrument.root).toBe('ES');
});
test('an unknown root blocks until its point value is entered', () => {
  const corn = H + '2026-11-16 09:41:00,ZCZ5,Buy,1,450\n2026-11-16 10:41:00,ZCZ5,Sell,1,451\n';
  expect(plan(corn)).toMatchObject({ blocked: 'unresolved-symbols', unresolvedKeys: ['ZC'] });
  const ok = plan(corn, ctx(), { overrides: { ZC: { pointValue: 50, tickSize: 0.25, assetClass: 'future' } } });
  expect(ok.blocked).toBeNull();
  expect(ok.trades[0]!.gross).toBe(5000);
});
test('a cross without the account currency is flagged; USDJPY converts (E3)', () => {
  const p = plan(H + '2026-11-16 03:00:00,EURGBP,Buy,1,0.8700\n2026-11-16 04:00:00,EURGBP,Sell,1,0.8710\n');
  expect(p.flags).toEqual([{ tradeId: p.trades[0]!.id, code: 'unconverted-currency', currency: 'GBP' }]);
  const jpy = plan(H + '2026-11-16 03:00:00,USDJPY,Buy,1,150.00\n2026-11-16 04:00:00,USDJPY,Sell,1,150.10\n');
  expect(jpy.flags).toEqual([]);
  expect(jpy.trades[0]!.pnlCurrency).toBe('USD');
});
test('closed-trade P&L matches gross or net, is flagged otherwise, and carries crosses', () => {
  const T = 'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L\n';
  const row = (pnl: string, sym = 'ESZ5', e = '6000', x = '6004', c = '5.00') => `2026-11-16 09:30:00,2026-11-16 09:45:00,${sym},Long,1,${e},${x},${c},${pnl}`;
  const p = plan(T + [row('200.00'), row('195.00'), row('200.02'), row('125.00', 'EURGBP', '0.8700', '0.8710', '0')].join('\n'));
  expect(p.flags).toEqual([{ tradeId: p.trades[2]!.id, code: 'pnl-mismatch', file: 20002, keel: 20000 }]);
  expect(p.trades[3]).toMatchObject({ pnlCurrency: 'USD', gross: 12500, net: 12500 });
});
test('an option left open by an earlier import settles on the next import (E2)', () => {
  const opt = plan(H + '2026-11-18 10:00:00,AAPL  261120C00150000,Buy,1,1.50\n', ctx(), {}, 'imp0', '2026-11-19T00:00:00.000Z').trades[0]!; // still open
  const p = plan(csv, ctx({ openTrades: [opt] }));
  expect(p.replacedTrades).toEqual([opt]);
  expect(p.trades.find((t) => t.id === opt.id)).toMatchObject({ status: 'closed', avgExit: 0 });
  expect(p.flags).toContainEqual({ tradeId: opt.id, code: 'expired-worthless', expiry: '2026-11-20' });
});
test('nothing valid to import', () => expect(plan(H + 'x,ESZ5,Buy,0,1\n').blocked).toBe('no-rows'));
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/domain/import/plan`. Expected: FAIL.
- [ ] **Step 3: Implement** the algorithm above in `plan.ts`, and add `importId?` and `ImportJob` to `types.ts` (`ImportJob` imports `ImportMapping` as a type).
- [ ] **Step 4: Verify:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(import): plan imports with dedupe, cross-import positions and flags (E3, E6)`.

---

### Task 7: Global filters

**Files:** Create `src/data/filters.ts`, Test: `src/data/filters.test.ts`

**Interfaces:**
- Consumes: `localDate(iso, timeZone)` (`domain/time.ts`), `Account`, `Trade`, `Direction`
- Produces:
  ```ts
  export const DATE_PRESETS = ['today', 'this-week', 'last-week', 'this-month', 'last-month', 'last-30-days', 'ytd'] as const;
  export type DatePreset = (typeof DATE_PRESETS)[number];
  export type DateRange = { preset: DatePreset } | { from?: string; to?: string }; // inclusive local dates; {} = all time
  export interface GlobalFilters { range: DateRange; accountIds: string[]; symbols: string[]; side?: Direction; strategyIds: string[]; tagIds: string[] }
  export const EMPTY_FILTERS: GlobalFilters; // { range: {}, accountIds: [], symbols: [], strategyIds: [], tagIds: [] }
  export const FILTER_PARAMS = ['range', 'from', 'to', 'account', 'symbol', 'side', 'strategy', 'tag'] as const;
  export function parseFilters(params: Pick<URLSearchParams, 'get' | 'getAll'>): GlobalFilters;
  export function serializeFilters(f: GlobalFilters): URLSearchParams;
  export function mergeFilterParams(current: URLSearchParams, f: GlobalFilters): URLSearchParams;
  export function resolveRange(range: DateRange, today: string): { from?: string; to?: string };
  export function selectedAccounts(accounts: readonly Account[], f: GlobalFilters): Account[];
  export interface FilterEnv { timeZone: string; today: string; accounts: readonly Account[] }
  export function applyFilters(trades: readonly Trade[], f: GlobalFilters, env: FilterEnv): Trade[];
  export function sanitizeFilters(f: GlobalFilters, known: { accountIds: ReadonlySet<string>; strategyIds: ReadonlySet<string>; tagIds: ReadonlySet<string> }): GlobalFilters;
  ```

Rules:
- **Matching.**
  - A trade's date is the `env.timeZone` date of `closedAt`, or of `openedAt` while open.
  - Values within a dimension are ORed, and dimensions are ANDed.
  - A symbol matches `instrument.root`. Symbols are uppercased on parse.
  - A tag matches when the trade has any selected tag.
- **Accounts.** With no account filter, only `status: 'active'` accounts count, in both `applyFilters` and `selectedAccounts`.
- **Parsing:**
  - drop invalid dates, unknown presets, sides other than `long`/`short`, empty values and duplicates
  - swap `from > to`
  - `range=` wins over `from`/`to`
- **Serialising.** Keys come in `FILTER_PARAMS` order, multi-values are repeated keys sorted ascending, and defaults are omitted. `mergeFilterParams` keeps non-filter keys in their original order, then appends the serialized filter keys.
- **Presets.** Weeks start Monday. `last-30-days` is today − 29 days through today.

- [ ] **Step 1: Write the failing tests:**

```ts
const acct = (id: string, status: Account['status'] = 'active') => ({ id, status }) as Account;
const env = { timeZone: 'America/New_York', today: '2026-11-20', accounts: [acct('a'), acct('b', 'archived')] };
test('presets resolve against today (weeks start Monday)', () => {
  const r = (preset: DatePreset) => resolveRange({ preset }, '2026-11-20');
  expect(r('today')).toEqual({ from: '2026-11-20', to: '2026-11-20' });
  expect(r('this-week')).toEqual({ from: '2026-11-16', to: '2026-11-20' });
  expect(r('last-week')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  expect(r('last-month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  expect(r('last-30-days')).toEqual({ from: '2026-10-22', to: '2026-11-20' });
  expect(r('ytd')).toEqual({ from: '2026-01-01', to: '2026-11-20' });
});
test('a trade belongs to its local close day', () => {
  const t = makeTrade({ net: 1, accountId: 'a', closedAt: '2026-03-03T02:00:00Z' }); // 21:00 on 2 Mar in New York
  const day = (d: string) => applyFilters([t], { ...EMPTY_FILTERS, range: { from: d, to: d } }, env);
  expect(day('2026-03-02')).toHaveLength(1);
  expect(day('2026-03-03')).toHaveLength(0);
});
test('no account filter means active accounts; an archived one counts when selected', () => {
  const ts = [makeTrade({ net: 1, accountId: 'a' }), makeTrade({ net: 1, accountId: 'b' })];
  expect(applyFilters(ts, EMPTY_FILTERS, env).map((t) => t.accountId)).toEqual(['a']);
  expect(applyFilters(ts, { ...EMPTY_FILTERS, accountIds: ['b'] }, env).map((t) => t.accountId)).toEqual(['b']);
  expect(selectedAccounts(env.accounts, EMPTY_FILTERS).map((a) => a.id)).toEqual(['a']);
});
test('symbol by root, side, strategy and any-of tags combine with AND', () => { /* ESZ5 and ESH6 both match 'ES'; side 'short' excludes longs; tagIds ['t2'] keeps a trade tagged ['t1','t2'] */ });
test('URL round trip is canonical', () => {
  const f: GlobalFilters = { range: { from: '2026-01-01', to: '2026-03-31' }, accountIds: ['b', 'a'], symbols: ['ES'], side: 'long', strategyIds: ['s1'], tagIds: ['t2', 't1'] };
  const qs = 'from=2026-01-01&to=2026-03-31&account=a&account=b&symbol=ES&side=long&strategy=s1&tag=t1&tag=t2';
  expect(serializeFilters(f).toString()).toBe(qs);
  expect(serializeFilters(parseFilters(new URLSearchParams(qs))).toString()).toBe(qs);
  expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('');
});
test('garbage is dropped; reversed dates swap; presets win', () => {
  expect(parseFilters(new URLSearchParams('side=up&from=2026-02-30&range=bogus&account=&tag=t1&tag=t1&symbol=es')))
    .toEqual({ ...EMPTY_FILTERS, tagIds: ['t1'], symbols: ['ES'] });
  expect(parseFilters(new URLSearchParams('from=2026-03-31&to=2026-01-01')).range).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  expect(parseFilters(new URLSearchParams('range=ytd&from=2026-01-05')).range).toEqual({ preset: 'ytd' });
});
test('merging keeps other params', () => {
  expect(mergeFilterParams(new URLSearchParams('by=hour&side=short&tag=x'), { ...EMPTY_FILTERS, side: 'long' }).toString()).toBe('by=hour&side=long');
});
test('ids unknown to the workspace are dropped (Review Focus 5)', () => {
  const f = { ...EMPTY_FILTERS, accountIds: ['a', 'ghost'], strategyIds: ['old'], tagIds: ['t1'], symbols: ['ES'] };
  expect(sanitizeFilters(f, { accountIds: new Set(['a']), strategyIds: new Set(), tagIds: new Set(['t1']) }))
    .toEqual({ ...f, accountIds: ['a'], strategyIds: [] });
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/filters`. Expected: FAIL.
- [ ] **Step 3: Implement** with date-fns on `YYYY-MM-DD` strings. Validate dates by round-tripping them through `parse`/`format`.
- [ ] **Step 4: Verify:** `npm test -- src/data && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): global filters, URL round trip and trade filtering`.

---

### Task 8: Sample workspace generator

**Files:**
- Create: `src/data/workspaces.ts`, `src/data/seed/random.ts`, `src/data/seed/content.ts`, `src/data/seed/generate.ts`
- Test: `src/data/seed/random.test.ts`, `src/data/seed/generate.test.ts`

**Interfaces:**
- Consumes: `buildTrades`, `resolveInstrument`, `settleExpiredOptions` (Task 5), `riskFromStop`, `TZDate`, domain entity types
- Produces:
  ```ts
  // workspaces.ts
  export const SAMPLE_WORKSPACE: Workspace; // { id: 'sample', name: 'Sample workspace', kind: 'sample' }
  export const USER_WORKSPACE: Workspace;   // { id: 'mine', name: 'My workspace', kind: 'user' }
  export const WORKSPACES: readonly Workspace[]; // [SAMPLE_WORKSPACE, USER_WORKSPACE]
  // random.ts — mulberry32
  export interface Random { next(): number /* [0,1) */; int(min: number, max: number): number /* inclusive */; pick<T>(xs: readonly T[]): T; chance(p: number): boolean; around(mean: number, spread: number): number }
  export function createRandom(seed: number): Random;
  // generate.ts
  export const SAMPLE_SEED = 20261120;
  export interface SampleWorkspace { seed: number; endDate: string; accounts: Account[]; strategies: Strategy[]; tags: Tag[]; trades: Trade[]; journal: JournalEntry[] }
  export function generateSampleWorkspace(opts: { seed: number; endDate: string /* YYYY-MM-DD */ }): SampleWorkspace;
  export function sampleEndDate(now: string): string; // the last weekday strictly before now's New York date
  ```

Content. Distribution realism is the builder's call (§13), within these bounds:
- **Accounts** (all USD, `status: 'active'`):

  | id | name | type | instruments | startingBalance |
  |---|---|---|---|---|
  | `sample-futures` | Futures live | live | ES, NQ, MES, MNQ, CL, GC (front-month symbols) | 5,000,000 |
  | `sample-forex-prop` | Forex evaluation | prop-evaluation | EURUSD, GBPUSD, AUDUSD, USDJPY | 10,000,000 |
  | `sample-multi` | Stocks & options | live | AAPL, NVDA, MSFT, TSLA, SPY, OCC options on them, BTCUSD, ETHUSD | 2,500,000 |

  - The prop account's `propRules` are `{ firm: 'Sample prop firm', phase: 'evaluation', profitTarget: 800_000, dailyLossLimit: 500_000, maxDrawdown: 1_000_000, drawdownType: 'trailing', minTradingDays: 5, consistencyPct: 0.4 }`.
  - It trades only in the last 12 weeks.
- **Calendar and positions:**
  - About 126 weekdays end at `endDate`.
  - Times are built on the New York clock (futures, stocks and options in 09:30–16:00; forex in 03:00–11:30) and converted with TZDate.
  - Each account and symbol holds one position at a time, so the FIFO builder rebuilds the planned trades.
  - About 25% exit in two legs and about 15% scale in. 2–5 positions are still open at `endDate`.
  - Some options get no closing fill and are settled by `settleExpiredOptions` (as of the end of `endDate`).
- **Fees** (integer cents):
  - futures: $2.25 per contract per side, plus a $0.35 exchange fee
  - forex: $3.50 per lot per side
  - stocks: $0.005 per share per side, minimum $1.00 per fill
  - options: $0.65 per contract per side
  - crypto: 0.1% of notional per side
- **Strategies, rules and tags:**
  - Four strategies, each with rules in all four groups and a 3–5 item checklist.
  - About 85% of trades have a strategy, with one RuleCheck per rule (about 80% `true`, 12% `false`, 8% `null`).
  - Tags cover all four categories. Mistake tags concentrate on losses and rule breaks.
- **Risk and excursion.** About 85% of trades have a `plannedStop` (with `initialRisk` from `riskFromStop`), and about 60% have a `plannedTarget`. MAE and MFE are synthetic.
- **Journal:**
  - Daily reviews on most trading days, linking that day's trades.
  - Pre-market plans, and a weekly recap for each week.
  - About 40 trade notes: `kind: 'note'`, one linked trade, and that trade's `noteId` pointing back.
  - Folders: 'Daily reviews', 'Plans', 'Weekly recaps', 'Trade notes'.
  - Bodies are Tiptap JSON (`{ type: 'doc', content: [...] }`) built from phrase banks.
- **Determinism:**
  - Every draw comes from `createRandom`. No `Math.random` or `Date.now`.
  - No `Math.sin/cos/log/exp/pow/sqrt`: engines may differ in the last bit. Use `around` = mean + spread × (sum of four `next()` − 2) / 2.
  - Ids are `sample-…` counters.

- [ ] **Step 1: Write the failing tests.** `random.test.ts`: the same seed gives the same first 1,000 values, all in [0, 1); `int` stays inclusive. `generate.test.ts`, with one generation in `beforeAll` for `endDate: '2026-11-19'`:

```ts
const NY = 'America/New_York';
test('deterministic in seed and end date', () => {
  expect(generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' })).toEqual(s);
  expect(generateSampleWorkspace({ seed: 7, endDate: '2026-11-19' }).trades).not.toEqual(s.trades);
});
test('sampleEndDate is the last weekday before today in New York', () => {
  expect(sampleEndDate('2026-11-20T15:00:00.000Z')).toBe('2026-11-19');
  expect(sampleEndDate('2026-11-23T15:00:00.000Z')).toBe('2026-11-20');
  expect(sampleEndDate('2026-11-22T03:00:00.000Z')).toBe('2026-11-20');
});
test('three accounts; the prop evaluation has rules and is not breached', () => {
  expect(s.accounts.map((a) => [a.id, a.type])).toEqual([['sample-futures', 'live'], ['sample-forex-prop', 'prop-evaluation'], ['sample-multi', 'live']]);
  const prop = s.accounts[1]!;
  expect(evaluateProp({ startingBalance: prop.startingBalance, rules: prop.propRules!, timeZone: NY, now: '2026-11-19T22:00:00.000Z',
    trades: s.trades.filter((t) => t.accountId === prop.id) }).overall).not.toBe('breached');
});
test('about 1,200 trades over about six months, across five asset classes', () => {
  expect(s.trades.length).toBeGreaterThanOrEqual(1100);
  expect(s.trades.length).toBeLessThanOrEqual(1300);
  expect(differenceInCalendarDays(parseISO('2026-11-19'), parseISO(localDate(s.trades[0]!.openedAt, NY)))).toBeGreaterThanOrEqual(170);
  expect(new Set(s.trades.map((t) => t.instrument.assetClass))).toEqual(new Set(['future', 'forex', 'stock', 'option', 'crypto']));
  expect(s.trades.map((t) => t.serial)).toEqual(s.trades.map((_, i) => i + 1));
  expect(s.trades.every((t) => t.pnlCurrency === 'USD' && t.fees > 0 && t.workspaceId === 'sample')).toBe(true);
});
test('partial exits, scale-ins, open positions and an expired option', () => {
  const sides = (t: Trade) => t.executions.map((e) => e.side);
  expect(s.trades.filter((t) => t.executions.length > 2).length).toBeGreaterThanOrEqual(150);
  expect(s.trades.some((t) => sides(t)[0] === sides(t)[1])).toBe(true);
  expect(s.trades.filter((t) => t.status === 'open').length).toBeGreaterThanOrEqual(2);
  expect(s.trades.some((t) => t.executions.some((e) => e.id.endsWith(':expiry')) && t.avgExit === 0)).toBe(true);
});
test('every reference resolves', () => { /* strategyId, tagIds, ruleChecks[].ruleId (of the trade's strategy), noteId, linkedTradeIds; four strategies with all four rule groups; all four tag categories; all four journal kinds; ≥ 20 weekly recaps */ });
test('MAE and MFE bracket the result', () => {
  const closed = s.trades.filter((t) => t.status === 'closed');
  expect(closed.filter((t) => t.mae !== undefined).length / closed.length).toBeGreaterThanOrEqual(0.9);
  for (const t of closed) if (t.mae !== undefined) expect(t.mae <= Math.min(0, t.gross) && t.mfe! >= Math.max(0, t.gross)).toBe(true);
});
test('looks like a real trader: a modest edge and real losing days', () => {
  const ctx = defaultMetricContext(NY);
  const sum = summarize(s.trades, ctx);
  expect(sum.winRate!).toBeGreaterThan(0.42); expect(sum.winRate!).toBeLessThan(0.62);
  expect(sum.profitFactor!).toBeGreaterThan(1.05); expect(sum.profitFactor!).toBeLessThan(2.5);
  expect(sum.netPnl).toBeGreaterThan(0);
  expect(sum.ruleAdherence!).toBeGreaterThan(0.7); expect(sum.ruleAdherence!).toBeLessThan(0.9);
  const days = dailyPnl(s.trades, ctx);
  expect(days.filter((d) => d.net < 0).length / days.length).toBeGreaterThanOrEqual(0.25);
});
```

- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/seed`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Plan the round trips first, then emit their fills.
  - Run `settleExpiredOptions`, then `buildTrades` once over all executions with `startSerial: 1`.
  - Then decorate the trades: strategy, tags, rule checks, rating, stop/target/risk, MAE/MFE.
  - Then write the journal.
  - If a realism bound fails, tune the parameters; don't widen the bounds.
- [ ] **Step 4: Verify:** `npm test -- src/data && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): deterministic sample workspace generator`.

---

### Task 9: Metrics per P&L currency (E3)

**Files:** Create `src/data/metrics.ts`, Test: `src/data/metrics.test.ts`

**Interfaces:**
- Consumes: `partitionByCurrency`, `summarize`, `dailyPnl`, `daySummary`, `equityCurve`, `maxDrawdown`, `tradeStreaks`, `dayStreaks` (`src/domain/**`), `generateSampleWorkspace` (Task 8, test only)
- Produces:
  ```ts
  export function metricContextOf(prefs: UserPrefs): MetricContext; // { timeZone, breakevenRange, pnlBasis }
  export interface CurrencyMetrics { currency: string; trades: Trade[]; startingBalance: Cents; summary: Summary; days: DayStat[];
    daySummary: ReturnType<typeof daySummary>; equity: EquityPoint[]; drawdown: Drawdown; tradeStreaks: StreakResult; dayStreaks: StreakResult }
  export function metricsByCurrency(trades: readonly Trade[], opts: { accounts: readonly Account[] /* the selected accounts */; ctx: MetricContext; baseCurrency: string }): CurrencyMetrics[];
  ```

Rules:
- The base-currency partition comes first and is always present, even when empty. Other currencies follow in code order.
- `startingBalance` is the sum of `opts.accounts` whose `currency` equals the partition's currency (§7: "starting balances add up").

- [ ] **Step 1: Write the failing tests:**
  - Two USD accounts (5,000,000 + 2,500,000) give `startingBalance` 7,500,000.
  - A set with USD trades and one GBP trade gives `['USD', 'GBP']`, each `summary.currencies` of length 1, and GBP `startingBalance` 0.
  - `[]` gives one USD partition with `summary.closedCount === 0` and `winRate === null`.
  - `metricContextOf` maps prefs.
  - **Performance (§10):** on `generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' })` with all three accounts, after one warm-up call, the median of 5 timed runs (`performance.now()`) is `< 50` ms.
- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/metrics`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify:** `npm test -- src/data && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): metrics partitioned by P&L currency (E3)`.

---

### Task 10: Repository contracts and the IndexedDB store

**Files:**
- Create: `src/data/repository.ts`, `src/data/local/db.ts`, `src/data/local/context.ts`, `src/data/local/workspaces.ts`, `src/data/local/prefs.ts`, `src/data/local/local-repository.ts`, `src/data/__fixtures__/sample.ts`
- Test: `src/data/local/store.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `WORKSPACES`, `SAMPLE_WORKSPACE`, `USER_WORKSPACE`, `SampleWorkspace`, `SAMPLE_SEED`, `sampleEndDate`, `generateSampleWorkspace` (Task 8), `isValidTimeZone` (Task 2), `ImportJob` (Task 6), `makeTrade` (`src/domain/__fixtures__/trades.ts`)
- Produces:
  ```ts
  // repository.ts — holds every contract; Tasks 11 and 12 add their members to Repository
  export class NotFoundError extends Error { constructor(readonly entity: string, readonly id: string) }
  export class StorageUnavailableError extends Error {}
  export function defaultPrefs(): UserPrefs; // browser zone (else 'America/New_York'), 'USD', { unit: 'amount', from: 0, to: 0 }, 'net'
  export interface WorkspacesRepo { list(): Promise<Workspace[]>; getActive(): Promise<Workspace>; setActive(id: string): Promise<void>; resetSample(): Promise<void>; clearUser(): Promise<void> }
  export interface PrefsRepo { get(): Promise<UserPrefs>; update(patch: Partial<UserPrefs>): Promise<UserPrefs> }
  export interface Repository { workspaces: WorkspacesRepo; prefs: PrefsRepo }
  // db.ts
  export const DB_NAME = 'keel-data';
  export interface MetaRecord { key: string; value: unknown }
  export interface ImportJobRecord extends ImportJob { fingerprints: string[]; replacedTrades: Trade[] }
  export class KeelDb extends Dexie { /* tables below */ constructor(deps?: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange }) }
  // context.ts
  export interface LocalContext { db(): Promise<KeelDb> /* opened and seeded */; now(): Date; newId(): string }
  // local-repository.ts
  export interface LocalRepositoryOptions { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange; now?: () => Date; newId?: () => string;
    sample?: (now: Date) => Promise<SampleWorkspace>; openTimeoutMs?: number /* default 5000 */ }
  export function createLocalRepository(opts?: LocalRepositoryOptions): Repository;
  // __fixtures__/sample.ts — tiny SampleWorkspace for store and hook tests
  export function fixtureSample(): SampleWorkspace;
  ```

The schema, version 1, exactly:

```ts
this.version(1).stores({
  trades: '[workspaceId+id], workspaceId, [workspaceId+accountId], [workspaceId+importId], [workspaceId+strategyId]',
  accounts: '[workspaceId+id], workspaceId',
  strategies: '[workspaceId+id], workspaceId',
  tags: '[workspaceId+id], workspaceId',
  journal: '[workspaceId+id], workspaceId, *linkedTradeIds',
  imports: '[workspaceId+id], workspaceId, [workspaceId+accountId]',
  meta: 'key',
});
```

Meta keys: `active-workspace`, `prefs`, `seed:sample` (`{ seed, endDate, seededAt }`), and `` `overrides:${ws}` ``.

Behaviour:
- **Construction.** `createLocalRepository` constructs `KeelDb` on the first method call, never at construction.
- **Opening.** `ctx.db()` races `db.open()` against `openTimeoutMs` and rejects with `StorageUnavailableError`.
- **Seeding.**
  - If `seed:sample` is missing, generate the sample through `opts.sample`. The default is `await import('../seed/generate')` with `SAMPLE_SEED` and `sampleEndDate(now().toISOString())`.
  - Generate **outside** any transaction. One rw transaction then re-checks the meta and `bulkPut`s the rows.
  - Memoize the promise, and clear it on failure so the next call retries.
- **Dexie rule:** inside `db.transaction`, await only Dexie calls. Generating, dynamic imports and other promises commit the transaction early.
- **Workspaces:**
  - `getActive` defaults to the sample.
  - `setActive` with an unknown id throws `NotFoundError('workspace', id)`.
  - `resetSample` regenerates outside a transaction, then in one transaction deletes every `sample` row in the six data tables, `bulkPut`s the new rows and rewrites the seed meta.
  - `clearUser` deletes every `mine` row in the six tables and `overrides:mine`.
- **Prefs.** `get` merges the stored value over `defaultPrefs()`. `update` throws `RangeError` for an invalid `timeZone` (`isValidTimeZone`) and for a `breakevenRange` with `from > to`.
- **Fixture.** `fixtureSample()` contains:
  - workspace `sample`
  - accounts `acc-a` (active, USD, 5,000,000) and `acc-b` (archived)
  - one strategy `str-1` with two rules (`r-1`, `r-2`)
  - tags `tag-setup` (setup) and `tag-fomo` (mistake)
  - closed trades `f-1`, `f-2` (`acc-a`) and `f-3` (`acc-b`), built with `makeTrade` and given serials 1–3
  - one note `j-1` linked to `f-1`

- [ ] **Step 1: Install:** `npm install dexie@^4.4.7` and `npm install -D fake-indexeddb@^6.2.8`.
- [ ] **Step 2: Write the failing tests** in `store.test.ts`. Each test uses `new IDBFactory()` and `IDBKeyRange` from `fake-indexeddb`, and `sample: async () => fixtureSample()` unless stated:

```ts
test('constructing touches no storage', () => {
  const open = vi.fn();
  createLocalRepository({ indexedDB: { open } as unknown as IDBFactory });
  expect(open).not.toHaveBeenCalled();
});
test('seeds the sample once, on first use, shared across instances', async () => {
  const indexedDB = new IDBFactory(); const sample = vi.fn(async () => fixtureSample());
  await createLocalRepository({ indexedDB, IDBKeyRange, sample }).workspaces.getActive();
  await createLocalRepository({ indexedDB, IDBKeyRange, sample }).prefs.get();
  expect(sample).toHaveBeenCalledTimes(1);
  expect(await new KeelDb({ indexedDB, IDBKeyRange }).trades.where('workspaceId').equals('sample').count()).toBe(3);
});
test('a stalled database fails with StorageUnavailableError', async () => {
  const stalled = { open: () => ({}) } as unknown as IDBFactory; // a request that never fires
  await expect(createLocalRepository({ indexedDB: stalled, IDBKeyRange, openTimeoutMs: 50 }).prefs.get()).rejects.toBeInstanceOf(StorageUnavailableError);
});
test('the active workspace defaults to the sample and persists', async () => { /* getActive → SAMPLE_WORKSPACE; setActive('mine') → a new instance on the same factory reads USER_WORKSPACE; setActive('x') → NotFoundError */ });
test('reset restores the seed; clear empties only My workspace', async () => {
  /* via KeelDb: change f-1's tagIds, add a 'mine' account and trade; resetSample → f-1 back to the fixture, 'mine' rows untouched;
     clearUser → no 'mine' rows in any table, sample rows intact */
});
test('prefs: defaults, persistence, validation', async () => {
  /* get() equals defaultPrefs(); update({ pnlBasis: 'gross' }) persists across instances;
     update({ timeZone: 'Not/AZone' }) and update({ breakevenRange: { unit: 'amount', from: 5, to: -5 } }) reject RangeError */
});
test('the real generator seeds about 1,200 trades', { timeout: 30_000 }, async () => { // fake-indexeddb is slow at this size
  const indexedDB = new IDBFactory();
  await createLocalRepository({ indexedDB, IDBKeyRange, now: () => new Date('2026-11-20T15:00:00Z') }).workspaces.getActive();
  const n = await new KeelDb({ indexedDB, IDBKeyRange }).trades.count();
  expect(n).toBeGreaterThanOrEqual(1100); expect(n).toBeLessThanOrEqual(1300);
});
```

- [ ] **Step 3: Run and confirm failure:** `npm test -- src/data/local`. Expected: FAIL.
- [ ] **Step 4: Implement** per the behaviour above, with one module per repo (`localWorkspaces(ctx)`, `localPrefs(ctx)`) assembled in `local-repository.ts`.
- [ ] **Step 5: Verify:** `npm test -- src/data && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6: Commit** `package.json`, `package-lock.json` and the new files with `feat(data): IndexedDB store with workspaces, first-visit seed and prefs`.

---

### Task 11: Trades, accounts, strategies, tags and journal

**Files:**
- Create: `src/data/trade-patch.ts`, `src/data/local/trades.ts`, `accounts.ts`, `strategies.ts`, `tags.ts`, `journal.ts`
- Test: `src/data/trade-patch.test.ts`, `src/data/local/entities.test.ts`
- Modify: `src/data/repository.ts`, `src/data/local/local-repository.ts`

**Interfaces:**
- Consumes: `LocalContext`, `KeelDb`, `NotFoundError`, `fixtureSample` (Task 10), `riskFromStop`
- Produces:
  ```ts
  // trade-patch.ts
  export type TradePatch = Partial<Pick<Trade, 'strategyId' | 'tagIds' | 'rating' | 'ruleChecks' | 'plannedStop' | 'plannedTarget' | 'initialRisk' | 'noteId'>>;
  export function applyTradePatch(trade: Trade, patch: TradePatch): Trade;
  // repository.ts — Repository gains trades, accounts, strategies, tags, journal
  export interface TradesRepo { list(ws: string): Promise<Trade[]> /* serial order */; get(ws: string, id: string): Promise<Trade | undefined>;
    update(ws: string, id: string, patch: TradePatch): Promise<Trade>; remove(ws: string, ids: readonly string[]): Promise<void> }
  export type NewAccount = Omit<Account, 'id' | 'workspaceId'>; export type AccountPatch = Partial<NewAccount>;
  export interface AccountsRepo { list(ws: string): Promise<Account[]> /* by name */; create(ws: string, input: NewAccount): Promise<Account>;
    update(ws: string, id: string, patch: AccountPatch): Promise<Account>; remove(ws: string, id: string): Promise<void> }
  export type NewStrategy = Omit<Strategy, 'id' | 'workspaceId' | 'rules'> & { rules: (Omit<Rule, 'id'> & { id?: string })[] };
  export type StrategyPatch = Partial<NewStrategy>;
  export interface StrategiesRepo { list(ws: string): Promise<Strategy[]> /* by name */; get(ws: string, id: string): Promise<Strategy | undefined>;
    create(ws: string, input: NewStrategy): Promise<Strategy>; update(ws: string, id: string, patch: StrategyPatch): Promise<Strategy>; remove(ws: string, id: string): Promise<void> }
  export type NewTag = Omit<Tag, 'id' | 'workspaceId'>; export type TagPatch = Partial<NewTag>;
  export class DuplicateNameError extends Error { constructor(readonly duplicate: string) }
  export interface TagsRepo { list(ws: string): Promise<Tag[]> /* by category, then name */; create(ws: string, input: NewTag): Promise<Tag>;
    update(ws: string, id: string, patch: TagPatch): Promise<Tag>; remove(ws: string, id: string): Promise<void> }
  export type JournalDraft = Omit<JournalEntry, 'id' | 'workspaceId' | 'updatedAt'> & { id?: string };
  export interface JournalRepo { list(ws: string): Promise<JournalEntry[]> /* date desc, undated last, then updatedAt desc */;
    get(ws: string, id: string): Promise<JournalEntry | undefined>; listForTrade(ws: string, tradeId: string): Promise<JournalEntry[]>;
    save(ws: string, draft: JournalDraft): Promise<JournalEntry>; remove(ws: string, id: string): Promise<void> }
  // local/journal.ts — call inside an open rw transaction that includes db.journal
  export function pruneJournalLinks(db: KeelDb, ws: string, tradeIds: readonly string[]): Promise<void>;
  ```

Rules:
- **`applyTradePatch`:**
  - A key present with `undefined` removes the field.
  - A numeric `plannedStop` without `initialRisk` in the patch sets `initialRisk = riskFromStop(trade, stop)`. Clearing `plannedStop` also clears `initialRisk` unless the patch sets it.
  - A changed `strategyId` without `ruleChecks` in the patch resets `ruleChecks` to `[]`.
  - `tagIds` are deduplicated in order.
  - The input is never mutated.
- **Cascades**, each in one rw transaction:
  - `trades.remove` drops the ids from journal `linkedTradeIds`. Missing ids are ignored.
  - `accounts.remove` deletes the account's trades (with their journal links) and its import jobs.
  - `strategies.update` gives new rules ids. When rules change, it drops RuleChecks on that strategy's trades whose `ruleId` no longer exists.
  - `strategies.remove` clears `strategyId` and `ruleChecks` on its trades.
  - `tags.remove` drops the id from every trade's `tagIds`.
  - `journal.remove` clears `noteId` on trades pointing at it.
- **Tags.** Names are trimmed. A case-insensitive duplicate within the same workspace and category throws `DuplicateNameError`.
- **Missing records.** Updating or removing a missing id (except `trades.remove`) throws `NotFoundError`.
- **Ids and times.** Ids come from `ctx.newId()` (default `crypto.randomUUID()`). `journal.save` creates when `id` is absent, otherwise replaces, and sets `updatedAt = ctx.now().toISOString()`.

- [ ] **Step 1: Write the failing tests.** `trade-patch.test.ts`:

```ts
const t = makeTrade({ net: 0, avgEntry: 4500, maxPosition: 2, strategyId: 's1', ruleChecks: [{ ruleId: 'r1', followed: true }] });
test('a stop sets risk from the stop', () => expect(applyTradePatch(t, { plannedStop: 4490 }).initialRisk).toBe(100000));
test('an explicit risk wins', () => expect(applyTradePatch(t, { plannedStop: 4490, initialRisk: 5000 }).initialRisk).toBe(5000));
test('clearing the stop clears its risk', () => {
  const r = applyTradePatch(applyTradePatch(t, { plannedStop: 4490 }), { plannedStop: undefined });
  expect('plannedStop' in r || 'initialRisk' in r).toBe(false);
});
test('a new strategy drops old rule checks; the same one keeps them', () => {
  expect(applyTradePatch(t, { strategyId: 's2' }).ruleChecks).toEqual([]);
  expect(applyTradePatch(t, { strategyId: 's1' }).ruleChecks).toHaveLength(1);
});
test('tags dedupe; input untouched', () => {
  expect(applyTradePatch(t, { tagIds: ['a', 'b', 'a'] }).tagIds).toEqual(['a', 'b']);
  expect(t.tagIds).toEqual([]);
});
```

  `entities.test.ts` (fake-indexeddb, fixture seed) covers:
  - list orders
  - `trades.update` persisting across instances
  - `NotFoundError` on a missing id
  - **workspace isolation:** writing a 'mine' trade with id `f-1` leaves sample `f-1` unchanged, and `list('mine')` never returns sample rows
  - each cascade above, one test each
  - tag `DuplicateNameError` (`'fomo '` vs `'FOMO'`)
  - `journal.save` create-then-update with an injected clock
  - `listForTrade('sample', 'f-1')` returning `j-1`
- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data`. Expected: FAIL.
- [ ] **Step 3: Implement**, one module per repo, using the `LocalContext` from Task 10.
- [ ] **Step 4: Verify:** `npm test -- src/data && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): trade, account, strategy, tag and journal repositories`.

---

### Task 12: Import repository: context, commit, undo

**Files:**
- Create: `src/data/local/imports.ts`, Test: `src/data/local/imports.test.ts`
- Modify: `src/data/repository.ts`, `src/data/local/local-repository.ts`

**Interfaces:**
- Consumes: `ImportPlan`, `ImportContext`, `ImportBlock`, `planImport` (Task 6), `ImportJobRecord`, `KeelDb` (Task 10), `USER_WORKSPACE`, `pruneJournalLinks` (Task 11)
- Produces:
  ```ts
  export class ImportBlockedError extends Error { constructor(readonly reason: ImportBlock) }
  export type UndoResult = { ok: true } | { ok: false; reason: 'later-import-depends'; dependentJobId: string };
  export interface ImportRepo {
    list(ws: string): Promise<ImportJob[]>; // newest first, without fingerprints and replacedTrades
    context(ws: string, accountId: string): Promise<ImportContext>;
    commit(ws: string, plan: ImportPlan): Promise<ImportJob>;
    undo(ws: string, jobId: string): Promise<UndoResult>;
  }
  // Repository gains imports: ImportRepo
  ```

Rules:
- **`context`:**
  - The account must exist (`NotFoundError`).
  - `nextSerial` is the highest serial in the workspace + 1, or 1 if there are none.
  - `openTrades` are the account's open trades.
  - `fingerprints` come from the account's active jobs.
  - `overrides` come from `overrides:${ws}`, or `{}`.
- **`commit`:**
  - Throws `ImportBlockedError` when `plan.blocked` is set.
  - Throws `RangeError` unless `ws === USER_WORKSPACE.id === plan.workspaceId`.
  - In one rw transaction: delete the `replacedTrades` keys, `bulkPut` `plan.trades`, put the job record (`status: 'active'`, with counts from the plan: `skippedCount` = issues and `duplicateCount` = duplicate rows), and merge `plan.mapping.overrides` into `overrides:${ws}`.
- **`undo`:**
  - A missing job throws `NotFoundError`. An already-undone job returns `{ ok: true }`.
  - If another active job's `replacedTrades` holds a trade with `importId === jobId`, return the refusal with that job's id.
  - Otherwise, in one rw transaction: delete the trades with `[workspaceId+importId] = [ws, jobId]` (pruning their journal links), `bulkPut` `job.replacedTrades`, and set `status: 'undone'` and `undoneAt`.

- [ ] **Step 1: Write the failing tests.** Use fake-indexeddb, a 'mine' account created through `accounts.create`, and plans from `planImport` with `ctx = await repo.imports.context('mine', acc.id)`:
  - `context` on an empty workspace gives `nextSerial` 1, no open trades and no fingerprints. A missing account throws `NotFoundError`.
  - `commit` of the landing sample writes 8 trades. `list` returns one job with `status: 'active'`, `rowCount: 16`, `tradeCount: 8` and no `fingerprints` key. A second `context` has 16 fingerprints and `nextSerial` 9.
  - `commit` of a plan with `overrides: { ZC: … }` makes the next `context().overrides` include `ZC`.
  - `commit('sample', plan)` rejects `RangeError`. A blocked plan rejects `ImportBlockedError`.
  - **Review Focus 2:**
    - Import A opens 2 ESZ5 long, and the user tags the trade.
    - Import B closes it: one closed trade with A's id and the tag.
    - `undo(A)` gives `{ ok: false, reason: 'later-import-depends', dependentJobId: B.id }`.
    - `undo(B)` gives `{ ok: true }`, and the stored trade deep-equals A's tagged open trade.
    - Then `undo(A)` gives `{ ok: true }` and the workspace has no trades.
  - `undo` twice is idempotent. After `undo`, `context().fingerprints` no longer holds that job's rows.
- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/local/imports`. Expected: FAIL.
- [ ] **Step 3: Implement** per the rules.
- [ ] **Step 4: Verify:** `npm test -- src/data && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): import history with commit and undo`.

---

### Task 13: Query layer: keys, invalidation, provider and hooks

**Files:**
- Create: `src/data/query/keys.ts`, `src/data/query/cross-tab.ts`, `src/data/query/provider.tsx`, `src/data/query/hooks.ts`, `src/app/(app)/layout.tsx`
- Test: `src/data/query/keys.test.ts`, `src/data/query/cross-tab.test.ts`, `src/data/query/hooks.test.tsx`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `Repository` and every repo type (Tasks 10–12), `createLocalRepository`, `fixtureSample`, `WORKSPACES`, `USER_WORKSPACE`
- Produces:
  ```ts
  // keys.ts — `as const` tuples; W = ['keel', 'ws', ws]
  export const keys = {
    workspaces: () => ['keel', 'workspaces'], activeWorkspace: () => ['keel', 'active-workspace'], prefs: () => ['keel', 'prefs'],
    workspace: (ws: string) => W,
    trades: (ws) => [...W, 'trades'], trade: (ws, id) => [...W, 'trades', id],
    accounts: (ws) => [...W, 'accounts'], strategies: (ws) => [...W, 'strategies'], strategy: (ws, id) => [...W, 'strategies', id],
    tags: (ws) => [...W, 'tags'],
    journal: (ws) => [...W, 'journal'], journalEntry: (ws, id) => [...W, 'journal', 'entry', id], journalForTrade: (ws, tradeId) => [...W, 'journal', 'trade', tradeId],
    imports: (ws) => [...W, 'imports'], importContext: (ws, accountId) => [...W, 'imports', 'context', accountId],
  };
  export type WriteKind = 'workspaces.setActive' | 'workspaces.resetSample' | 'workspaces.clearUser' | 'prefs.update'
    | 'trades.update' | 'trades.remove' | 'accounts.create' | 'accounts.update' | 'accounts.remove'
    | 'strategies.create' | 'strategies.update' | 'strategies.remove' | 'tags.create' | 'tags.update' | 'tags.remove'
    | 'journal.save' | 'journal.remove' | 'imports.commit' | 'imports.undo';
  export function invalidationsFor(write: WriteKind, ws: string): QueryKey[];
  // cross-tab.ts
  export const CROSS_TAB_CHANNEL = 'keel-data';
  export function invalidate(qc: QueryClient, queryKeys: readonly QueryKey[], channel: BroadcastChannel | null): Promise<void>;
  export function listenCrossTab(qc: QueryClient, channel: BroadcastChannel): () => void;
  // provider.tsx ('use client')
  export function createQueryClient(): QueryClient; // queries: { staleTime: Infinity, retry: 1, refetchOnWindowFocus: false }
  export function DataProvider(props: { children: React.ReactNode; repository?: Repository; queryClient?: QueryClient }): React.JSX.Element;
  export function useRepository(): Repository;
  export function useInvalidate(): (write: WriteKind, ws: string) => Promise<void>;
  // hooks.ts — reads return UseQueryResult<T>; writes return UseMutationResult<TData, Error, TVars>
  useWorkspaces(): Workspace[]   useActiveWorkspace(): Workspace   useSetActiveWorkspace(): <void, string>
  useResetSampleWorkspace(), useClearUserWorkspace(): <void, void>
  usePrefs(): UserPrefs   useUpdatePrefs(): <UserPrefs, Partial<UserPrefs>>
  useAccounts(): Account[]   useCreateAccount(): <Account, NewAccount>   useUpdateAccount(): <Account, { id: string; patch: AccountPatch }>   useRemoveAccount(): <void, string>
  useTrades(): Trade[]   useTrade(id: string): Trade | null   useUpdateTrade(): <Trade, { id: string; patch: TradePatch }>   useRemoveTrades(): <void, readonly string[]>
  useStrategies(): Strategy[]   useStrategy(id: string): Strategy | null   useCreateStrategy(): <Strategy, NewStrategy>   useUpdateStrategy(): <Strategy, { id: string; patch: StrategyPatch }>   useRemoveStrategy(): <void, string>
  useTags(): Tag[]   useCreateTag(): <Tag, NewTag>   useUpdateTag(): <Tag, { id: string; patch: TagPatch }>   useRemoveTag(): <void, string>
  useJournal(): JournalEntry[]   useJournalEntry(id: string): JournalEntry | null   useJournalForTrade(tradeId: string): JournalEntry[]
  useSaveJournalEntry(): <JournalEntry, JournalDraft>   useRemoveJournalEntry(): <void, string>
  useImportHistory(): ImportJob[]   useImportContext(accountId: string | undefined): ImportContext   useCommitImport(): <ImportJob, ImportPlan>   useUndoImport(): <UndoResult, string>
  ```

The invalidation table (`ws` is the write's workspace):

| Write | Invalidates |
|---|---|
| `workspaces.setActive` | `activeWorkspace()` |
| `workspaces.resetSample` / `clearUser` | `workspace('sample')` / `workspace('mine')` |
| `prefs.update` | `prefs()` |
| `trades.update` | `trades` |
| `trades.remove`, `journal.remove`, `imports.undo` | `trades`, `journal` (+ `imports` for undo) |
| `accounts.create` / `update` | `accounts` |
| `accounts.remove` | `accounts`, `trades`, `journal`, `imports` |
| `strategies.create` | `strategies` |
| `strategies.update` / `remove` | `strategies`, `trades` |
| `tags.create` / `update` | `tags` |
| `tags.remove` | `tags`, `trades` |
| `journal.save` | `journal` |
| `imports.commit` | `imports`, `trades` |

Rules:
- **Reads:**
  - Workspace-scoped reads use the active workspace's id and stay `enabled: false` until it loads.
  - Import reads (`useImportHistory`, `useImportContext`) always use `USER_WORKSPACE.id`. `useImportContext` has `staleTime: 0`.
  - Single-item reads map `undefined` to `null`, because TanStack Query rejects `undefined` data.
- **Writes:**
  - Each write captures `ws` when called and, on success, runs `invalidate(qc, invalidationsFor(kind, ws), channel)`.
  - `useCommitImport` also sets the active workspace to `mine` and invalidates `activeWorkspace()`.
- **Provider:**
  - Keeps one `QueryClient` (`useState`) and the repository. The default is `createLocalRepository()`, which is side-effect free.
  - Opens `new BroadcastChannel(CROSS_TAB_CHANNEL)` in an effect when it exists, `listenCrossTab`s, and closes it on unmount.
  - Prefetches `activeWorkspace()` in an effect, so the first visit to any `/app` route seeds the sample.
  - `invalidate` posts `{ keys }` on the channel after invalidating locally. The listener invalidates the keys it receives without re-posting them.
- **Layout.** `src/app/(app)/layout.tsx` is a server component: `export default function AppGroupLayout({ children }: { children: React.ReactNode }) { return <DataProvider>{children}</DataProvider>; }`. It has no markup, classes or metadata.

- [ ] **Step 1: Install:** `npm install @tanstack/react-query@^5.108.2` and `npm install -D @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2 happy-dom@^21.0.4`.
- [ ] **Step 2: Write the failing tests.** `keys.test.ts` (node):

```ts
test('the invalidation table', () => {
  expect(invalidationsFor('trades.update', 'sample')).toEqual([keys.trades('sample')]);
  expect(invalidationsFor('tags.remove', 'mine')).toEqual([keys.tags('mine'), keys.trades('mine')]);
  expect(invalidationsFor('imports.commit', 'mine')).toEqual([keys.imports('mine'), keys.trades('mine')]);
  expect(invalidationsFor('workspaces.resetSample', 'sample')).toEqual([keys.workspace('sample')]);
});
test('a list key covers its details and nothing in another workspace or entity', async () => {
  const qc = new QueryClient();
  for (const k of [keys.trade('sample', 't1'), keys.trades('mine'), keys.journal('sample')]) qc.setQueryData(k, 1);
  await qc.invalidateQueries({ queryKey: keys.trades('sample') });
  expect(qc.getQueryState(keys.trade('sample', 't1'))!.isInvalidated).toBe(true);
  expect(qc.getQueryState(keys.trades('mine'))!.isInvalidated).toBe(false);
  expect(qc.getQueryState(keys.journal('sample'))!.isInvalidated).toBe(false);
});
```

  `cross-tab.test.ts` (node): two QueryClients, each with its own `BroadcastChannel('keel-test')`.
  - `invalidate(a, [keys.tags('sample')], chA)` makes B's `keys.tags('sample')` invalidated (`vi.waitFor`).
  - B doesn't re-post.
  - Close both channels in `afterEach`.

  `hooks.test.tsx`, starting `// @vitest-environment happy-dom`:
  - Use `renderHook` and `waitFor` from `@testing-library/react`, with `afterEach(cleanup)`.
  - The wrapper is `<DataProvider repository={createLocalRepository({ indexedDB: new IDBFactory(), IDBKeyRange, sample: async () => fixtureSample() })} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })}>`.
  - `useTrades()` resolves to 3 trades.
  - `useUpdateTrade().mutateAsync({ id: 'f-1', patch: { tagIds: ['tag-setup'] } })`, inside `act`, makes `useTrades()` show the tag.
  - `useSetActiveWorkspace().mutateAsync('mine')` makes `useActiveWorkspace().data` USER_WORKSPACE and `useTrades().data` `[]`.
  - `useTrade('nope').data` is `null`.
- [ ] **Step 3: Run and confirm failure:** `npm test -- src/data/query`. Expected: FAIL.
- [ ] **Step 4: Implement** per the table and rules.
- [ ] **Step 5: Verify:** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: all pass, and the build still prerenders `/app/import`.
- [ ] **Step 6: Commit** with `feat(data): query hooks, invalidation and the app data provider`.

---

### Task 14: Filters in the URL, trade set, metrics and import-plan hooks

**Files:**
- Create: `src/data/query/derived.ts`, `src/lib/import/read-file.ts`
- Test: `src/data/query/derived.test.tsx`, `src/lib/import/read-file.test.ts`

**Interfaces:**
- Consumes: `parseFilters`, `mergeFilterParams`, `sanitizeFilters`, `applyFilters`, `selectedAccounts`, `serializeFilters` (Task 7); `metricsByCurrency`, `metricContextOf` (Task 9); `planImport`, `ImportPlan` (Task 6); `ParsedCsv`, `ImportMapping`; the hooks from Task 13; `localDate`; `useSearchParams`, `usePathname` (`next/navigation`)
- Produces:
  ```ts
  // derived.ts
  export interface Derived<T> { status: 'pending' | 'error' | 'success'; error: Error | null; data: T | undefined }
  export function useGlobalFilters(): { filters: GlobalFilters; setFilters(next: GlobalFilters): void };
  export interface TradeSet { filters: GlobalFilters /* sanitised */; trades: Trade[]; accounts: Account[] /* selected */ }
  export function useTradeSet(filters: GlobalFilters): Derived<TradeSet>;
  export function useMetrics(filters: GlobalFilters): Derived<CurrencyMetrics[]>;
  export interface ImportInput { parsed: ParsedCsv; mapping: ImportMapping; accountId: string; fileName: string }
  export function useImportPlan(input: ImportInput | null): Derived<ImportPlan>;
  // read-file.ts
  export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
  export class ImportFileError extends Error { constructor(readonly reason: 'unsupported' | 'too-large') }
  export function readImportFile(file: File): Promise<string>;
  ```

Rules:
- **`useGlobalFilters`:**
  - Reads `useSearchParams()`.
  - `setFilters` writes `window.history.replaceState(null, '', pathname + (qs ? '?' + qs : ''))`, where `qs = mergeFilterParams(new URLSearchParams(window.location.search), next)`. Next syncs this into `useSearchParams` (Native History API).
  - Its JSDoc says callers sit inside `<Suspense>` (Plan 4).
- **`useTradeSet`:**
  - Waits for trades, accounts, strategies, tags and prefs, then sanitises the filters against the workspace's ids.
  - Applies them with `today = localDate(new Date().toISOString(), prefs.timeZone)`.
  - Memoized on query data identity + `serializeFilters(filters).toString()` + today.
  - Any failing query makes it `status: 'error'`.
- **`useMetrics`:** `metricsByCurrency(set.trades, { accounts: set.accounts, ctx: metricContextOf(prefs), baseCurrency: prefs.baseCurrency })`.
- **`useImportPlan`:**
  - Uses `useImportContext(input?.accountId)`.
  - `importId` (`crypto.randomUUID()`) and `now` are fixed per `input` object (`useMemo` on `input`).
- **`readImportFile`:**
  - Files other than `.csv`/`.txt` (the same test as `preview-file.ts`) reject `'unsupported'`.
  - Files with `size > MAX_IMPORT_BYTES` reject `'too-large'`.
  - Otherwise it returns `file.text()`.

- [ ] **Step 1: Write the failing tests.** `derived.test.tsx` (happy-dom; `vi.mock('next/navigation', …)` returning `useSearchParams: () => new URLSearchParams(window.location.search)` and `usePathname: () => '/app/dashboard'`; the provider wrapper from Task 13):
  - **`useGlobalFilters`.** After `window.history.replaceState(null, '', '/app/dashboard?by=hour&side=long')`:
    - `filters.side` is `'long'`.
    - `setFilters({ ...EMPTY_FILTERS, symbols: ['ES'] })` leaves `window.location.search` as `'?by=hour&symbol=ES'`.
  - **Review Focus 5.** `useTradeSet({ ...EMPTY_FILTERS, accountIds: ['ghost'] })`:
    - `data.filters.accountIds` is `[]`.
    - `data.trades` ids are `['f-1', 'f-2']` (archived `acc-b`'s `f-3` excluded).
  - **`useMetrics(EMPTY_FILTERS)`:** `data[0].currency` is `'USD'` and `data[0].summary.closedCount` is 2.
  - **`useImportPlan`** with the landing CSV, its guessed mapping and a 'mine' account created first:
    - `data.trades` has length 8.
    - `data.importId` is unchanged after `rerender` with the same input object.

  `read-file.test.ts` (node):
  - A `.csv` File returns its text.
  - `new File(['x'], 'a.xlsx')` rejects `{ reason: 'unsupported' }`.
  - `new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'big.csv')` rejects `{ reason: 'too-large' }`.
- [ ] **Step 2: Run and confirm failure:** `npm test -- src/data/query/derived src/lib/import`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify:** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(data): URL filters, trade-set, metrics and import-plan hooks`.

---

### Task 15: Import end to end, first-visit seed in Chrome, backlog

**Files:**
- Create: `src/data/import-flow.test.ts`, `e2e/data-layer.spec.ts`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: everything above. No new exports.

- [ ] **Step 1: Write the integration test** `import-flow.test.ts` (node, fake-indexeddb, the default generator, `now` fixed at `2026-11-20T15:00:00Z`):

```ts
test('the fixture CSV imports into My workspace with correct totals, dedupes, and undoes', { timeout: 30_000 }, async () => {
  const repo = createLocalRepository({ indexedDB: new IDBFactory(), IDBKeyRange, now: () => new Date('2026-11-20T15:00:00Z') });
  const text = await readImportFile(new File([readFileSync('e2e/fixtures/sample-fills.csv')], 'sample-fills.csv'));
  const parsed = parseCsv(text);
  const mapping = guessMapping(parsed, { sourceTimeZone: 'America/New_York' });
  const acc = await repo.accounts.create('mine', { name: 'Imported', broker: '', type: 'live', currency: 'USD', startingBalance: 5_000_000, status: 'active' });
  const meta = (id: string) => ({ importId: id, fileName: 'sample-fills.csv', now: '2026-11-20T15:00:00.000Z' });
  const job = await repo.imports.commit('mine', planImport(parsed, mapping, await repo.imports.context('mine', acc.id), meta('i1')));
  const trades = await repo.trades.list('mine');
  expect(trades[0]!.openedAt).toBe('2026-11-16T14:41:00.000Z');
  const [usd] = metricsByCurrency(trades, { accounts: [acc], ctx: defaultMetricContext('America/New_York'), baseCurrency: 'USD' });
  expect(usd!.summary).toMatchObject({ closedCount: 8, netPnl: 127250, wins: 4, losses: 3, breakevens: 1 });
  expect(usd!.days.map((d) => [d.date, d.net])).toEqual([['2026-11-16', 20500], ['2026-11-17', 28750], ['2026-11-18', 67500], ['2026-11-19', -27000], ['2026-11-20', 37500]]);
  expect(usd!.drawdown.amount).toBe(27000);
  expect((await repo.trades.list('sample')).length).toBeGreaterThan(1000); // sample untouched
  const again = planImport(parsed, mapping, await repo.imports.context('mine', acc.id), meta('i2'));
  expect(again.blocked).toBe('nothing-new');
  expect(await repo.imports.undo('mine', job.id)).toEqual({ ok: true });
  expect(await repo.trades.list('mine')).toEqual([]);
  expect((await repo.imports.list('mine'))[0]!.status).toBe('undone');
});
```

- [ ] **Step 2: Write the Playwright check** `e2e/data-layer.spec.ts`:

```ts
async function countTrades(): Promise<number> {
  if (!(await indexedDB.databases()).some((d) => d.name === 'keel-data')) return 0;
  return new Promise((resolve) => {
    const req = indexedDB.open('keel-data');
    req.onerror = () => resolve(0);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trades')) { db.close(); resolve(0); return; }
      const c = db.transaction('trades').objectStore('trades').count();
      c.onsuccess = () => { db.close(); resolve(c.result); };
    };
  });
}
test('the sample workspace seeds on the first app visit, once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
  await page.goto('/app/import');
  await expect.poll(() => page.evaluate(countTrades), { timeout: 15000 }).toBeGreaterThan(1100);
  const first = await page.evaluate(countTrades);
  await page.reload();
  await expect.poll(() => page.evaluate(countTrades)).toBe(first);
});
```

- [ ] **Step 3: Run:** `npm test -- src/data/import-flow` and then `npm run e2e`. Expected: PASS on desktop and mobile projects, including every existing spec.
- [ ] **Step 4: Update `docs/BACKLOG.md`** in the "Engineering follow-ups" table:
  - Strike through E1, E2, E3, E11, E14 and E18 in the existing style (`~~text~~. Done in Plan 2`), with owner `Done`.
  - **E6** becomes: "`canonicalSymbol` strips a leading `/`, and Plan 2 pins slash, case and space variants as one position. Confirm against real broker exports, including exchange suffixes (`/ESZ5:XCME`) and MetaTrader broker suffixes (`EURUSD.m`)". Owner: "With #11 (sample exports)".
  - Add these rows:

  | # | Item | Owner plan |
  |---|---|---|
  | E25 | Excel (.xlsx) import. Spec §7 says CSV/Excel, but the §5 stack has no spreadsheet parser; users save as CSV meanwhile | Plan 5 decision |
  | E26 | Options that expire after their last import stay open until the next import into that account settles them; settle at app start or in a server job | Milestone 2 (#1) |
  | E27 | Import maps one fees and one commission column; swap/financing and extra fee columns aren't summed | With #11 |
- [ ] **Step 5: Final verification:** `npm run lint && npm run typecheck && npm test && npm run e2e`. Expected: every command exits 0.
- [ ] **Step 6: Commit** with `test(data): fixture import end to end and first-visit seed; backlog for Plan 2`.
