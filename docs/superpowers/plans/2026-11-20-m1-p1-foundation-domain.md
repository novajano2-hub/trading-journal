# Milestone 1 · Plan 1: Foundation and trading domain, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js project and build Keel's pure trading domain:
- types and money rules
- the instrument registry
- the fills→trades builder
- every milestone-1 metric
- prop-firm rule evaluation

All of it is test-first, and every later plan depends on it.

**Architecture:** One Next.js App Router app (spec §4, approach A). This plan adds only `src/domain` and `src/lib`, as pure TypeScript with no React, browser APIs or I/O, so the data layer, marketing site and app can all build on it. Money is integer cents. Times are UTC ISO strings, bucketed in the user's timezone.

**Tech Stack:** Next.js (App Router), TypeScript strict, npm, Vitest, date-fns v4 + @date-fns/tz, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md` (approved). Product truth: `PRODUCT.md`. Deferred work: `docs/BACKLOG.md`.

**Milestone 1 plan sequence.** Each plan is written when its predecessor lands:

| Plan | Scope | Depends on |
|---|---|---|
| **1 (this)** | Scaffold, domain types, instruments, trade builder, metrics, prop evaluation | — |
| 2 | Data layer: repositories, workspaces, seeded sample workspace, IndexedDB, query hooks, URL filters, CSV import pipeline | 1 |
| 3 | Marketing site: tokens and fonts, landing per its direction contract, feature/pricing/brokers/changelog/auth/legal pages, Playwright, Impeccable finish review, DESIGN.md | 1 (Task 1 only) |
| 4 | App shell + Dashboard, after the user signs off the layout on the Impeccable decision page | 2, 3 |
| 5 | Trades, Calendar, Reports, Strategies, Notebook, Import UI, Prop firms, Settings, structure-only pages | 4 |

## Global Constraints

- Node.js 22 LTS or newer; npm; Next.js App Router; TypeScript `strict: true` and `noUncheckedIndexedAccess: true`.
- `src/domain/**` is pure: no imports from `react`, `next`, browser globals or network/file I/O.
- Money is stored as integer minor units (`Cents`). It is rounded **half-even**, once, at the trade level. Values within 1e-6 of an integer or a .5 tie count as that integer or tie.
- Times are stored as UTC ISO 8601 strings. Day, weekday and hour bucketing uses the user's IANA timezone via `@date-fns/tz`. Sessions always use `America/New_York`.
- Every P&L string carries a sign: `+` for gains and `−` (U+2212) for losses; zero is unsigned.
- Breakeven: |net| ≤ `breakevenThreshold` (default `0`). It is excluded from win rate, average win, average loss and win/loss counts. It adds nothing to profit factor and neither extends nor breaks a streak.
- Metrics count only `status === 'closed'` trades.
- No licensed libraries: no Highcharts, no TradingView Charting Library.
- Test files are type-checked by `npm run typecheck`. Under `noUncheckedIndexedAccess`, tests use non-null assertions on indexed access (`trades[0]!`). The snippets below omit them for brevity.

## Review Focus

1. **Fills sharing one timestamp** (common in fast markets) must be processed in input order. A buy then a sell at the same second is one long round trip, not a short. Pinned in Task 4.
2. **Fractional-tick prices** (CL at 0.01, forex at 5 decimals) must produce exact cents despite float subtraction error. Pinned in Task 4.
3. **Day bucketing across DST and late-evening closes.** A 21:00 New York close stored as next-day UTC belongs to the New York day, including the week DST starts. Pinned in Task 6.
4. **Empty or open-only selections** (a filter that matches nothing) return `null` metrics, never `NaN` or `Infinity`. Pinned in Task 5.
5. **A breached prop account stays breached** after equity recovers. Pinned in Task 8.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create (via scaffold): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/**`, `postcss.config.mjs`
- Create: `vitest.config.ts`, `.prettierrc.json`, `src/domain/sanity.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev | build | lint | typecheck | test | test:watch | format`. The import alias `@/*` maps to `src/*` in both Next and Vitest.

- [ ] **Step 1: Initialise git and commit the existing docs on `main`**

```bash
git init -b main
git add PRODUCT.md docs .impeccable/surfaces .impeccable/config.json .impeccable/mocks/decision
git commit -m "docs: product record, M1 design spec, backlog, landing direction"
git switch -c m1-foundation
```

- [ ] **Step 2: Scaffold Next.js in a temporary directory and copy it in.** The repo root isn't empty, so create-next-app would refuse it.

Run: `npx create-next-app@latest <tmpdir>/keel-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`
Then copy everything except `.git` and `node_modules` into the repo root, and run `npm install`.
Expected: `npm run dev` serves the default page on :3000.

- [ ] **Step 3: Tighten TypeScript and add tooling.**
  - Set `"noUncheckedIndexedAccess": true` in `tsconfig.json`.
  - Add dev deps `vitest`, `vite-tsconfig-paths` and `prettier`.
  - Add scripts: `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"format": "prettier --write ."`.
  - Create `vitest.config.ts` with `plugins: [tsconfigPaths()]` and `test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] }`.
  - Add `.superpowers/`, `.impeccable/config.local.json` and `.impeccable/review/` to `.gitignore`.

- [ ] **Step 4: Write a sanity test** `src/domain/sanity.test.ts` asserting `expect(1 + 1).toBe(2)`.

- [ ] **Step 5: Verify the toolchain**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all exit 0; Vitest reports 1 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with strict TS, Vitest, Prettier"
```

---

### Task 2: Domain types, money rounding and P&L formatting

**Files:**
- Create: `src/domain/types.ts`, `src/domain/money.ts`, `src/lib/format.ts`
- Test: `src/domain/money.test.ts`, `src/lib/format.test.ts`
- Delete: `src/domain/sanity.test.ts`

**Interfaces:**
- Produces: every type below, used as written by all later tasks and plans, plus:
  - `toCents(amount: number): Cents` (major units to cents, half-even)
  - `roundHalfEven(x: number): number` (to the nearest integer)
  - `formatPnl(cents: Cents, currency?: string): string`
  - `formatMoney(cents: Cents, currency?: string): string`

- [ ] **Step 1: Create `src/domain/types.ts`.** It is the cross-plan contract, so it's exact:

```ts
export type Cents = number; // integer minor units of the P&L currency
export type AssetClass = 'stock' | 'option' | 'future' | 'forex' | 'crypto' | 'cfd';
export type Side = 'buy' | 'sell';
export type Direction = 'long' | 'short';

export interface Instrument {
  symbol: string; root: string; assetClass: AssetClass;
  pointValue: number; tickSize: number; quoteCurrency: string; baseCurrency?: string;
  underlying?: string; expiry?: string /* YYYY-MM-DD */; strike?: number; right?: 'call' | 'put';
}
export interface Execution {
  id: string; accountId: string; symbol: string; side: Side; qty: number /* > 0 */;
  price: number; time: string /* UTC ISO */; fees: Cents; commission: Cents; orderId?: string;
}
export interface RuleCheck { ruleId: string; followed: boolean | null }
export interface Trade {
  id: string; serial: number; workspaceId: string; accountId: string; instrument: Instrument;
  direction: Direction; status: 'open' | 'closed'; openedAt: string; closedAt?: string;
  executions: Execution[]; avgEntry: number; avgExit?: number; maxPosition: number;
  pnlCurrency: string; gross: Cents; fees: Cents /* fees + commission */; net: Cents;
  plannedStop?: number; plannedTarget?: number; initialRisk?: Cents;
  mae?: Cents; mfe?: Cents; strategyId?: string; tagIds: string[];
  rating?: 1 | 2 | 3 | 4 | 5; ruleChecks: RuleCheck[]; noteId?: string;
}
export type DrawdownType = 'static' | 'trailing' | 'eod-trailing';
export interface PropRuleSet {
  firm: string; phase: 'evaluation' | 'funded'; profitTarget: Cents; dailyLossLimit: Cents;
  maxDrawdown: Cents; drawdownType: DrawdownType; minTradingDays: number; consistencyPct?: number /* 0..1 */;
}
export type AccountType = 'live' | 'demo' | 'prop-evaluation' | 'prop-funded';
export interface Account {
  id: string; workspaceId: string; name: string; broker: string; type: AccountType;
  currency: string; startingBalance: Cents; status: 'active' | 'archived'; propRules?: PropRuleSet;
}
export type TagCategory = 'setup' | 'mistake' | 'emotion' | 'custom';
export interface Tag { id: string; workspaceId: string; name: string; category: TagCategory }
export type RuleGroup = 'entry' | 'exit' | 'risk' | 'management';
export interface Rule { id: string; text: string; group: RuleGroup }
export interface Strategy {
  id: string; workspaceId: string; name: string; description: string; assetClasses: AssetClass[];
  rules: Rule[]; checklist: string[]; status: 'active' | 'archived';
}
export type JournalKind = 'daily-review' | 'pre-market' | 'weekly-recap' | 'note';
export interface JournalEntry {
  id: string; workspaceId: string; kind: JournalKind; date?: string /* YYYY-MM-DD */;
  title: string; body: unknown /* Tiptap JSON */; linkedTradeIds: string[]; folder?: string;
  updatedAt: string;
}
export interface Workspace { id: string; name: string; kind: 'sample' | 'user' }
export interface UserPrefs { timeZone: string; baseCurrency: string; breakevenThreshold: Cents }
```

- [ ] **Step 2: Write the failing tests** in `src/domain/money.test.ts`:

```ts
test('toCents rounds half-even with float tolerance', () => {
  expect(toCents(175)).toBe(17500);
  expect(toCents(1.005)).toBe(100);   // 100.4999… is a tie → even
  expect(toCents(2.675)).toBe(268);   // 267.4999… is a tie → even
  expect(toCents(-0.125)).toBe(-12);
  expect(toCents(0.1 + 0.2)).toBe(30);
  expect(toCents(129.99999999999545)).toBe(13000);
});
test('roundHalfEven', () => {
  expect(roundHalfEven(100.5)).toBe(100);
  expect(roundHalfEven(101.5)).toBe(102);
  expect(roundHalfEven(200.67)).toBe(201);
  expect(roundHalfEven(-2.5)).toBe(-2);
});
```

And in `src/lib/format.test.ts`:

```ts
test('formatPnl always signs gains and losses', () => {
  expect(formatPnl(421850)).toBe('+$4,218.50');
  expect(formatPnl(-31840)).toBe('−$318.40');
  expect(formatPnl(0)).toBe('$0.00');
  expect(formatPnl(100, 'EUR')).toBe('+€1.00');
});
test('formatMoney is unsigned for balances', () => {
  expect(formatMoney(5000000)).toBe('$50,000.00');
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm test -- src/domain/money.test.ts src/lib/format.test.ts`
Expected: FAIL. `toCents`, `roundHalfEven`, `formatPnl` and `formatMoney` are not defined.

- [ ] **Step 4: Implement them.**
  - `roundHalfEven(x)`: snap to the integer when within 1e-6. Treat |frac| within 1e-6 of 0.5 as a tie and round to even. Otherwise use `Math.round`.
  - `toCents(a) = roundHalfEven(a * 100)`.
  - `formatPnl` and `formatMoney` use `Intl.NumberFormat('en-US', { style: 'currency', currency })` on `cents / 100` with the absolute value. `formatPnl` prefixes `+` or `−` (U+2212) by sign.

- [ ] **Step 5: Run `npm test && npm run typecheck`.** Expected: PASS.

- [ ] **Step 6: Commit** with `git commit -m "feat(domain): core types, half-even cents, signed P&L formatting"`.

---

### Task 3: Instrument registry and symbol resolution

**Files:**
- Create: `src/domain/instruments.ts`
- Test: `src/domain/instruments.test.ts`

**Interfaces:**
- Consumes: `Instrument`, `AssetClass` (Task 2)
- Produces:
  ```ts
  export interface ResolveOptions {
    forexQtyUnit?: 'lots' | 'units'; // default 'lots'
    overrides?: Record<string, { pointValue: number; tickSize: number; assetClass?: AssetClass }>; // keyed by root
  }
  export function resolveInstrument(symbol: string, opts?: ResolveOptions): Instrument | null;
  ```

Registry values, all **futures** (root → pointValue / tickSize):

| Root | Point value | Tick size |
|---|---|---|
| ES | 50 | 0.25 |
| MES | 5 | 0.25 |
| NQ | 20 | 0.25 |
| MNQ | 2 | 0.25 |
| YM | 5 | 1 |
| MYM | 0.5 | 1 |
| RTY | 50 | 0.1 |
| M2K | 5 | 0.1 |
| CL | 1000 | 0.01 |
| MCL | 100 | 0.01 |
| GC | 100 | 0.1 |
| MGC | 10 | 0.1 |
| SI | 5000 | 0.005 |
| NG | 10000 | 0.001 |
| ZB | 1000 | 0.03125 |
| ZN | 1000 | 0.015625 |
| 6E | 125000 | 0.00005 |

Parsing rules:
- **Futures** match `^/?(ROOT)([FGHJKMNQUVXZ])(\d{1,2})$`. An unknown root that matches the pattern resolves only through `overrides`, otherwise `null`.
- **Option** (OCC format): `^([A-Z]{1,6})\s*(\d{6})([CP])(\d{8})$`, pointValue 100, strike = last 8 digits ÷ 1000.
- **Forex**: two ISO codes from {USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD, SEK, NOK, SGD, HKD, MXN, ZAR}, with an optional `/`.
  - pointValue 100000 (lots) or 1 (units).
  - tickSize 0.001 for JPY-quoted pairs, else 0.00001.
- **Crypto**: base in {BTC, ETH, SOL, XRP, ADA, DOGE, LTC, AVAX, LINK, DOT}, quote in {USD, USDT, USDC}, separator `-`, `/` or none. pointValue 1, tickSize 0.01.
- **Stock**: `^[A-Z]{1,5}(\.[A-Z])?$`, pointValue 1, tickSize 0.01, quoteCurrency USD.
- Everything else resolves to `null`.

- [ ] **Step 1: Write the failing tests**

```ts
test('futures roots with month code and year', () => {
  expect(resolveInstrument('ESZ5')).toMatchObject({ root: 'ES', assetClass: 'future', pointValue: 50, tickSize: 0.25 });
  expect(resolveInstrument('MNQH26')).toMatchObject({ root: 'MNQ', pointValue: 2 });
  expect(resolveInstrument('/CLF6')).toMatchObject({ root: 'CL', pointValue: 1000, tickSize: 0.01 });
});
test('plain tickers are stocks, even when they look like a futures root', () => {
  expect(resolveInstrument('ES')).toMatchObject({ assetClass: 'stock', pointValue: 1 });
  expect(resolveInstrument('AAPL')).toMatchObject({ assetClass: 'stock', pointValue: 1, tickSize: 0.01 });
});
test('OCC option symbols', () => {
  expect(resolveInstrument('AAPL  251219C00200000')).toMatchObject({
    assetClass: 'option', underlying: 'AAPL', expiry: '2025-12-19', strike: 200, right: 'call', pointValue: 100 });
});
test('forex pairs, lots vs units, quote currency', () => {
  expect(resolveInstrument('EUR/USD')).toMatchObject({ assetClass: 'forex', baseCurrency: 'EUR', quoteCurrency: 'USD', pointValue: 100000, tickSize: 0.00001 });
  expect(resolveInstrument('EURUSD', { forexQtyUnit: 'units' })?.pointValue).toBe(1);
  expect(resolveInstrument('USDJPY')).toMatchObject({ quoteCurrency: 'JPY', tickSize: 0.001 });
});
test('crypto pairs', () => {
  for (const s of ['BTCUSD', 'BTC-USD', 'ETH/USDT']) expect(resolveInstrument(s)?.assetClass).toBe('crypto');
});
test('unknown futures root needs an override', () => {
  expect(resolveInstrument('XYZZ5')).toBeNull();
  expect(resolveInstrument('XYZZ5', { overrides: { XYZ: { pointValue: 10, tickSize: 0.1 } } }))
    .toMatchObject({ root: 'XYZ', assetClass: 'future', pointValue: 10 });
});
```

- [ ] **Step 2: Run `npm test -- src/domain/instruments.test.ts`.** Expected: FAIL (not defined).
- [ ] **Step 3: Implement `resolveInstrument`** in `src/domain/instruments.ts`, using the registry and rules above. Try the patterns in order: option, futures, forex, crypto, stock.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): instrument registry and symbol resolution"`.

---

### Task 4: Fills → trades builder (FIFO)

**Files:**
- Create: `src/domain/trade-builder.ts`
- Test: `src/domain/trade-builder.test.ts`

**Interfaces:**
- Consumes: `Execution`, `Trade`, `Instrument` (Task 2), `toCents`, `roundHalfEven` (Task 2), `resolveInstrument` (Task 3, passed in by the caller)
- Produces:
  ```ts
  export interface BuildOptions {
    workspaceId: string; startSerial: number;
    resolve: (symbol: string) => Instrument | null;
    accountCurrency: (accountId: string) => string;
  }
  export interface BuildResult { trades: Trade[]; unresolvedSymbols: string[] }
  export function buildTrades(executions: readonly Execution[], opts: BuildOptions): BuildResult;
  ```

Rules:
- **Grouping and order.** Group by `accountId + symbol`. Sort each group by `time` with a stable sort, so equal times keep input order.
- **Matching.** Track the signed position with FIFO lots. A trade opens when the position leaves 0 and closes when it returns to 0.
- **Reversals.** A fill that crosses through 0 is split into `${id}:a` (closes) and `${id}:b` (opens the next trade). Its fees and commission are split pro rata by quantity: the opening part gets `roundHalfEven(total × openQty / qty)` and the closing part gets the remainder.
- **Gross P&L.**
  1. Sum `(exit − entry) × matchedQty × pointValue × (long ? 1 : −1)` over FIFO matches, in the quote currency.
  2. If `quoteCurrency !== accountCurrency` and `baseCurrency === accountCurrency`, divide by `avgExit`.
  3. Otherwise, if the currencies still differ, keep the quote currency and set `pnlCurrency` to it.
  4. Apply `toCents` once.
- **Fees and net.** `fees` = Σ(fees + commission) of the trade's executions; `net = gross − fees`.
- **Averages.** `avgEntry` and `avgExit` are quantity-weighted over opening and closing fills.
- **Size and timing.** `maxPosition` = max |position|. `openedAt` = first fill time; `closedAt` = the time of the fill that returns the position to 0.
- **Open trades.** Data that ends in a non-zero position gives `status: 'open'`, with realised gross only.
- **Serials.** `serial` is assigned in `openedAt` order across all groups, from `startSerial`.
- **IDs.** `id = ${accountId}:${symbol}:${firstExecutionId}`.
- **Unresolvable symbols.** Their fills are skipped and the symbol is listed once in `unresolvedSymbols`.
- **Defaults.** `tagIds: []`, `ruleChecks: []`.

- [ ] **Step 1: Write the failing tests.** Local helpers:
  - `fill(id, side, qty, price, time, commission = 0)`: account `a1`, fees 0.
  - `build(fills, symbol)`: sets `symbol` on every fill and calls `buildTrades` with `{ workspaceId: 'w', startSerial: 1, resolve: s => resolveInstrument(s), accountCurrency: () => 'USD' }`.
  - `ex(accountId, symbol, side, time)`: qty 1, price 100, id `${accountId}-${symbol}-${time}`.
  - `T1`…`T4`: `'2026-03-02T15:00:00Z'` plus 0–3 minutes.

```ts
test('long round trip with commissions', () => {
  const { trades } = build([fill('f1','buy',2,4510.50,T1,124), fill('f2','sell',2,4512.25,T2,124)], 'ESZ5');
  expect(trades[0]).toMatchObject({ direction:'long', status:'closed', avgEntry:4510.5, avgExit:4512.25,
    maxPosition:2, gross:17500, fees:248, net:17252, serial:1 });
});
test('short round trip', () => {
  const { trades } = build([fill('f1','sell',1,4520,T1), fill('f2','buy',1,4515.75,T2)], 'ESZ5');
  expect(trades[0]).toMatchObject({ direction:'short', gross:21250 });
});
test('scale-in and partial exits are one FIFO trade', () => {   // AAPL, pointValue 1
  const { trades } = build([fill('f1','buy',100,150,T1), fill('f2','buy',100,151,T2),
    fill('f3','sell',50,152,T3), fill('f4','sell',150,149.5,T4)], 'AAPL');
  expect(trades).toHaveLength(1);
  expect(trades[0]).toMatchObject({ gross:-7500, avgEntry:150.5, avgExit:150.125, maxPosition:200 });
});
test('reversal splits the crossing fill and its costs', () => {
  const { trades } = build([fill('f1','buy',2,4500,T1,200), fill('f2','sell',3,4502,T2,300),
    fill('f3','buy',1,4501,T3,100)], 'ESZ5');
  expect(trades.map(t => [t.direction, t.gross, t.fees, t.net, t.serial])).toEqual([
    ['long', 20000, 400, 19600, 1], ['short', 5000, 200, 4800, 2]]);
  expect(trades[0].executions.at(-1)).toMatchObject({ id:'f2:a', qty:2, commission:200 });
  expect(trades[1].executions[0]).toMatchObject({ id:'f2:b', qty:1, commission:100 });
});
test('reversal cost split keeps the rounding remainder on the closing part', () => {
  const { trades } = build([fill('f1','buy',2,4500,T1), fill('f2','sell',3,4502,T2,301), fill('f3','buy',1,4501,T3)], 'ESZ5');
  expect(trades[0].fees).toBe(201); expect(trades[1].fees).toBe(100);
});
test('position still open at end of data', () => {
  const { trades } = build([fill('f1','buy',2,4500,T1), fill('f2','sell',1,4504,T2)], 'ESZ5');
  expect(trades[0]).toMatchObject({ status:'open', gross:20000, maxPosition:2 });
  expect(trades[0].closedAt).toBeUndefined();
});
test('same-timestamp fills keep input order', () => {           // Review Focus 1
  const { trades } = build([fill('f1','buy',1,4500,T1), fill('f2','sell',1,4501,T1)], 'ESZ5');
  expect(trades).toHaveLength(1);
  expect(trades[0]).toMatchObject({ direction:'long', status:'closed', gross:5000 });
});
test('fractional ticks give exact cents', () => {               // Review Focus 2
  expect(build([fill('f1','buy',1,71.42,T1), fill('f2','sell',1,71.55,T2)], 'CLZ5').trades[0].gross).toBe(13000);
  expect(build([fill('f1','buy',1,1.08512,T1), fill('f2','sell',1,1.08537,T2)], 'EURUSD').trades[0].gross).toBe(2500);
});
test('forex P&L converts by exit rate when USD is the base; crosses stay unconverted', () => {
  const jpy = build([fill('f1','buy',1,154.21,T1), fill('f2','sell',1,154.33,T2)], 'USDJPY').trades[0];
  expect(jpy).toMatchObject({ pnlCurrency:'USD', gross:7776 });
  const gbp = build([fill('f1','buy',1,0.8525,T1), fill('f2','sell',1,0.8531,T2)], 'EURGBP').trades[0];
  expect(gbp).toMatchObject({ pnlCurrency:'GBP', gross:6000 });
});
test('accounts never mix, serials follow openedAt, unknown symbols are reported', () => {
  const r = buildTrades([ex('a2','ESZ5','buy',T2), ex('a1','ESZ5','sell',T1), ex('a1','XYZZ5','buy',T1)],
    { workspaceId:'w', startSerial:10, resolve: s => resolveInstrument(s), accountCurrency: () => 'USD' });
  expect(r.trades.map(t => [t.accountId, t.serial])).toEqual([['a1', 10], ['a2', 11]]);
  expect(r.unresolvedSymbols).toEqual(['XYZZ5']);
});
```

- [ ] **Step 2: Run `npm test -- src/domain/trade-builder.test.ts`.** Expected: FAIL (`buildTrades` not defined).
- [ ] **Step 3: Implement `buildTrades`** in `src/domain/trade-builder.ts` per the rules above. Keep a FIFO lot queue of `{ qty, price }` per group, and accumulate quote-currency P&L as a float until the single `toCents`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): FIFO trade builder with reversals, cost split, FX conversion"`.

---

### Task 5: Summary metrics, R and rule adherence

**Files:**
- Create: `src/domain/metrics/summary.ts`, `src/domain/__fixtures__/trades.ts`
- Test: `src/domain/metrics/summary.test.ts`

**Interfaces:**
- Consumes: `Trade`, `Cents`, `roundHalfEven` (Task 2)
- Produces:
  ```ts
  export interface Summary {
    closedCount: number; openCount: number; wins: number; losses: number; breakevens: number;
    netPnl: Cents; grossPnl: Cents; fees: Cents;
    winRate: number | null; profitFactor: number | null;
    avgWin: Cents | null; avgLoss: Cents | null; winLossRatio: number | null;
    expectancy: Cents | null; expectancyR: number | null; rTradeCount: number; noRiskCount: number;
    largestWin: Cents | null; largestLoss: Cents | null; ruleAdherence: number | null;
  }
  export function summarize(trades: readonly Trade[], opts: { breakevenThreshold: Cents }): Summary;
  export function rOf(trade: Trade): number | undefined;        // net / initialRisk when initialRisk > 0
  export function riskFromStop(trade: Trade, stop: number): Cents; // |avgEntry − stop| × maxPosition × pointValue
  // fixtures, reused by Tasks 6–8 and later plans' tests:
  export function makeTrade(p: Partial<Trade> & { net: Cents }): Trade; // closed ES long, gross = net, fees 0
  ```

Definitions:
- **Win / loss / breakeven.** A win has `net > threshold`; a loss has `net < −threshold`; anything else is breakeven.
- `winRate = wins / (wins + losses)`.
- `profitFactor = Σwin nets / |Σloss nets|`, or `null` when there are no losses.
- **Averages.** `avgWin` and `avgLoss` are means of win and loss nets, rounded half-even. `winLossRatio` uses the *unrounded* means.
- `expectancy = netPnl / closedCount`, rounded half-even.
- `expectancyR` = mean of `rOf` over trades that have an R.
- `ruleAdherence = followed / (followed + broken)` over all non-null checks.
- **Empty selections.** Any ratio with a zero denominator is `null`.

- [ ] **Step 1: Write the failing tests**

```ts
const nets = [10000, -5000, 0, 2500, -2500, 7500].map(net => makeTrade({ net }));
test('core summary at threshold 0', () => {
  expect(summarize(nets, { breakevenThreshold: 0 })).toMatchObject({
    closedCount:6, wins:3, losses:2, breakevens:1, netPnl:12500, winRate:0.6,
    avgWin:6667, avgLoss:-3750, expectancy:2083, largestWin:10000, largestLoss:-5000 });
  const s = summarize(nets, { breakevenThreshold: 0 });
  expect(s.profitFactor).toBeCloseTo(2.6667, 4); expect(s.winLossRatio).toBeCloseTo(1.7778, 4);
});
test('breakeven threshold moves small trades out of wins and losses', () => {
  const s = summarize(nets, { breakevenThreshold: 2500 });
  expect(s).toMatchObject({ wins:2, losses:1, breakevens:3, profitFactor:3.5, avgWin:8750, avgLoss:-5000 });
  expect(s.winRate).toBeCloseTo(0.6667, 4);
});
test('empty and open-only selections return nulls, never NaN', () => {   // Review Focus 4
  for (const set of [[], [makeTrade({ net: -1000, status: 'open' })]]) {
    const s = summarize(set, { breakevenThreshold: 0 });
    expect(s).toMatchObject({ closedCount:0, netPnl:0, winRate:null, profitFactor:null, avgWin:null,
      avgLoss:null, winLossRatio:null, expectancy:null, expectancyR:null, largestWin:null, largestLoss:null, ruleAdherence:null });
  }
});
test('no losses gives a null profit factor', () => {
  expect(summarize([makeTrade({ net: 5000 }), makeTrade({ net: 3000 })], { breakevenThreshold: 0 }))
    .toMatchObject({ profitFactor: null, winRate: 1 });
});
test('R metrics and risk from stop', () => {
  const t = [makeTrade({ net: 10000, initialRisk: 5000 }), makeTrade({ net: -5000, initialRisk: 5000 }), makeTrade({ net: 2500 })];
  expect(summarize(t, { breakevenThreshold: 0 })).toMatchObject({ expectancyR: 0.5, rTradeCount: 2, noRiskCount: 1 });
  expect(riskFromStop(makeTrade({ net: 0, avgEntry: 4510.5, maxPosition: 2 }), 4508.5)).toBe(20000);
});
test('rule adherence ignores unanswered checks', () => {
  const t = makeTrade({ net: 0, ruleChecks: [true, true, false, null].map((f, i) => ({ ruleId: `r${i}`, followed: f })) });
  expect(summarize([t], { breakevenThreshold: 0 }).ruleAdherence).toBeCloseTo(0.6667, 4);
});
```

- [ ] **Step 2: Run `npm test -- src/domain/metrics/summary.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** `makeTrade` (defaults: ES `Instrument` from `resolveInstrument('ESZ5')`, `status: 'closed'`, `openedAt: '2026-03-02T15:00:00Z'`, `closedAt: '2026-03-02T15:05:00Z'`, `pnlCurrency: 'USD'`), plus `summarize`, `rOf` and `riskFromStop`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): summary metrics, R, rule adherence"`.

---

### Task 6: Equity curve, drawdown, streaks and daily P&L

**Files:**
- Create: `src/domain/metrics/equity.ts`, `src/domain/metrics/streaks.ts`, `src/domain/metrics/days.ts`
- Test: `src/domain/metrics/equity.test.ts`, `src/domain/metrics/streaks.test.ts`, `src/domain/metrics/days.test.ts`
- Modify: `package.json` (add `date-fns`, `@date-fns/tz`)

**Interfaces:**
- Consumes: `Trade`, `Cents` (Task 2), `makeTrade` (Task 5)
- Produces:
  ```ts
  export interface EquityPoint { time: string; equity: Cents; tradeId: string }
  export function equityCurve(trades: readonly Trade[], startingBalance: Cents): EquityPoint[]; // closed only, by closedAt then serial
  export interface Drawdown { amount: Cents; pct: number | null; peakAt?: string; troughAt?: string }
  export function maxDrawdown(trades: readonly Trade[], startingBalance: Cents): Drawdown;
  export interface StreakResult { maxWin: number; maxLoss: number; current: { kind: 'win' | 'loss' | null; length: number } }
  export function tradeStreaks(trades: readonly Trade[], breakevenThreshold: Cents): StreakResult;
  export interface DayStat { date: string; net: Cents; tradeCount: number; wins: number; losses: number }
  export function dailyPnl(trades: readonly Trade[], timeZone: string, breakevenThreshold: Cents): DayStat[]; // by closedAt local date, ascending
  export function daySummary(days: readonly DayStat[]): { greenDays: number; redDays: number; flatDays: number; greenPct: number | null; best: DayStat | null; worst: DayStat | null };
  export function dayStreaks(days: readonly DayStat[]): StreakResult; // green/red; flat days neither extend nor break
  ```

Definitions:
- **Drawdown.** The peak starts at `startingBalance`. `amount` = max(peak − equity). `pct` = max((peak − equity) / peak), or `null` while peak ≤ 0. `amount` and `pct` are maximised independently; `peakAt` and `troughAt` belong to the `amount` maximum.
- **Green percentage.** `greenPct = greenDays / tradingDays`.

- [ ] **Step 1: Write the failing tests**

```ts
test('equity and max drawdown', () => {
  const t = [100000, -300000, 50000, -100000, 400000].map((net, i) => makeTrade({ net, serial: i + 1, closedAt: `2026-03-0${i + 2}T15:00:00Z` }));
  expect(equityCurve(t, 5000000).map(p => p.equity)).toEqual([5100000, 4800000, 4850000, 4750000, 5150000]);
  const dd = maxDrawdown(t, 5000000);
  expect(dd.amount).toBe(350000); expect(dd.pct).toBeCloseTo(0.0686, 4);
  expect([dd.peakAt, dd.troughAt]).toEqual(['2026-03-02T15:00:00Z', '2026-03-05T15:00:00Z']);
  expect(maxDrawdown([], 5000000)).toMatchObject({ amount: 0, pct: 0 });
  expect(maxDrawdown([makeTrade({ net: 1000 }), makeTrade({ net: -500, serial: 2 })], 0).pct).toBeCloseTo(0.5, 4);
  expect(maxDrawdown([makeTrade({ net: -500 })], 0)).toMatchObject({ amount: 500, pct: null });
});
test('trade streaks skip breakevens', () => {
  const t = [1, 1, 0, 1, -1, -1, 0, -1, 1].map((s, i) => makeTrade({ net: s * 1000, serial: i + 1 }));
  expect(tradeStreaks(t, 0)).toEqual({ maxWin: 3, maxLoss: 3, current: { kind: 'win', length: 1 } });
});
test('daily P&L buckets by local close date across DST', () => {   // Review Focus 3
  const t = [
    makeTrade({ net: 5000,  closedAt: '2026-03-06T20:30:00Z' }), // 15:30 EST Fri 6th
    makeTrade({ net: -1000, closedAt: '2026-03-07T02:00:00Z' }), // 21:00 EST Fri 6th
    makeTrade({ net: -2000, closedAt: '2026-03-09T13:45:00Z' }), // 09:45 EDT Mon 9th (after DST starts 8th)
    makeTrade({ net: 0,     closedAt: '2026-03-10T03:30:00Z' }), // 23:30 EDT Mon 9th
  ];
  const days = dailyPnl(t, 'America/New_York', 0);
  expect(days).toEqual([
    { date: '2026-03-06', net: 4000, tradeCount: 2, wins: 1, losses: 1 },
    { date: '2026-03-09', net: -2000, tradeCount: 2, wins: 0, losses: 1 }]);
  expect(daySummary(days)).toMatchObject({ greenDays: 1, redDays: 1, flatDays: 0, greenPct: 0.5,
    best: { date: '2026-03-06' }, worst: { date: '2026-03-09' } });
  expect(dayStreaks(days)).toMatchObject({ maxWin: 1, maxLoss: 1 });
});
```

- [ ] **Step 2: Run `npm test -- src/domain/metrics`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the three modules. Local dates use `TZDate` from `@date-fns/tz` with `format(…, 'yyyy-MM-dd')`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): equity, drawdown, streaks, timezone-correct daily P&L"`.

---

### Task 7: Breakdowns and R-distribution

**Files:**
- Create: `src/domain/metrics/breakdowns.ts`
- Test: `src/domain/metrics/breakdowns.test.ts`

**Interfaces:**
- Consumes: `summarize`, `Summary`, `makeTrade` (Task 5), `rOf` (Task 5)
- Produces:
  ```ts
  export type BreakdownKey = 'weekday' | 'hour' | 'session' | 'duration' | 'side' | 'symbol' | 'strategy' | 'tag';
  export interface BreakdownContext { timeZone: string; breakevenThreshold: Cents; strategyNames?: Record<string, string>; tagNames?: Record<string, string> }
  export interface BreakdownRow { key: string; label: string; summary: Summary }
  export function breakdown(trades: readonly Trade[], by: BreakdownKey, ctx: BreakdownContext): BreakdownRow[];
  export interface RBin { from: number; to: number; count: number }
  export function rDistribution(trades: readonly Trade[], binWidth?: number /* default 0.5 */): RBin[];
  ```

Bucket rules:
- **Timing.** weekday, hour and session use `openedAt`. weekday and hour are in `ctx.timeZone`.
- **Sessions** are always in `America/New_York`, with these keys and ranges:

| Key | Range |
|---|---|
| `asia` | [18:00, 03:00) |
| `london` | [03:00, 09:30) |
| `new-york` | [09:30, 16:00) |
| `after-hours` | [16:00, 18:00) |

- **Duration** (closedAt − openedAt), with keys: `lt-1m` [0, 60s), `1-5m`, `5-15m`, `15-60m`, `1-4h`, `4h-1d`, `gt-1d` (≥ 24h).
- **Fixed-key breakdowns** return every bucket in fixed order, including empty ones: weekday `mon…sun`, hour `0…23`, session in the order above, duration in the order above, side `long, short`.
- **Dynamic breakdowns** return only present keys, sorted by `netPnl` descending. Ties keep first-appearance order, and `__none__` always comes last:
  - symbol groups by `instrument.root`
  - strategy, with `__none__` labelled "No strategy"
  - tag: a trade counts under each of its tags; `__none__` is labelled "Untagged"
- **R bins** span floor(min/w)·w to the bin containing max, contiguous, including empty bins. Each bin is `[from, to)`. With no R values, the result is `[]`.

- [ ] **Step 1: Write the failing tests**

```ts
const ctx = { timeZone: 'America/New_York', breakevenThreshold: 0 };
const at = (openedAt: string, extra = {}) => makeTrade({ net: 1000, openedAt, closedAt: openedAt, ...extra });
test('weekday and hour respect the user timezone', () => {
  const rows = breakdown([at('2026-03-09T13:45:00Z')], 'weekday', ctx);
  expect(rows.map(r => r.key)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  expect(rows.find(r => r.key === 'mon')!.summary.closedCount).toBe(1);
  expect(breakdown([at('2026-03-09T16:00:00Z')], 'weekday', { ...ctx, timeZone: 'Asia/Tokyo' }).find(r => r.summary.closedCount)!.key).toBe('tue');
  expect(breakdown([at('2026-03-09T13:45:00Z')], 'hour', ctx).find(r => r.summary.closedCount)!.key).toBe('9');
});
test('sessions use New York time regardless of user timezone', () => {
  const key = (iso: string) => breakdown([at(iso)], 'session', { ...ctx, timeZone: 'Asia/Tokyo' }).find(r => r.summary.closedCount)!.key;
  expect(key('2026-03-09T13:45:00Z')).toBe('new-york');
  expect(key('2026-03-09T07:00:00Z')).toBe('london');
  expect(key('2026-03-09T13:29:00Z')).toBe('london');
  expect(key('2026-03-09T20:30:00Z')).toBe('after-hours');
  expect(key('2026-03-09T23:00:00Z')).toBe('asia');
});
test('duration buckets are lower-inclusive', () => {
  const d = (secs: number) => breakdown([makeTrade({ net: 1, openedAt: '2026-03-09T14:00:00Z',
    closedAt: new Date(Date.parse('2026-03-09T14:00:00Z') + secs * 1000).toISOString() })], 'duration', ctx).find(r => r.summary.closedCount)!.key;
  expect([d(59), d(60), d(180)]).toEqual(['lt-1m', '1-5m', '1-5m']);
});
test('dynamic keys: tags multi-count, untagged and no-strategy rows, symbols by root', () => {
  const t = [makeTrade({ net: 3000, tagIds: ['orb', 'fomo'] }), makeTrade({ net: -1000 })];
  const tags = breakdown(t, 'tag', { ...ctx, tagNames: { orb: 'ORB', fomo: 'FOMO' } });
  expect(tags.map(r => [r.key, r.label])).toEqual([['orb', 'ORB'], ['fomo', 'FOMO'], ['__none__', 'Untagged']]);
  expect(breakdown(t, 'strategy', ctx).map(r => r.label)).toContain('No strategy');
  const es = [makeTrade({ net: 1, instrument: resolveInstrument('ESZ5')! }), makeTrade({ net: 1, instrument: resolveInstrument('ESH6')! })];
  expect(breakdown(es, 'symbol', ctx).map(r => r.key)).toEqual(['ES']);
});
test('R distribution has contiguous bins', () => {
  const t = [-1, -0.5, 0.2, 1.4, 2].map(r => makeTrade({ net: r * 1000, initialRisk: 1000 }));
  expect(rDistribution(t).map(b => [b.from, b.count])).toEqual([[-1, 1], [-0.5, 1], [0, 1], [0.5, 0], [1, 1], [1.5, 0], [2, 1]]);
  expect(rDistribution([makeTrade({ net: 100 })])).toEqual([]);
});
```

- [ ] **Step 2: Run `npm test -- src/domain/metrics/breakdowns.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `breakdown` and `rDistribution`.** Group the trades, then call `summarize` per group.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): breakdowns by time, session, duration, side, symbol, strategy, tag; R distribution"`.

---

### Task 8: Prop-firm rule evaluation

**Files:**
- Create: `src/domain/prop/evaluate.ts`
- Test: `src/domain/prop/evaluate.test.ts`

**Interfaces:**
- Consumes: `PropRuleSet`, `Trade`, `Cents` (Task 2), `equityCurve` and `dailyPnl` (Task 6), `makeTrade` (Task 5)
- Produces:
  ```ts
  export type RuleState = 'clear' | 'near' | 'breached';
  export const NEAR_FRACTION = 0.25; // "near" once remaining ≤ 25 % of the limit
  export interface PropStatus {
    equity: Cents;
    profit: { current: Cents; target: Cents; progress: number };
    dailyLoss: { todayNet: Cents; limit: Cents; remaining: Cents; state: RuleState; breachedOn?: string; worstDay: { date: string; net: Cents } | null };
    drawdown: { type: DrawdownType; floor: Cents; remaining: Cents; state: RuleState; breachedAt?: string };
    tradingDays: { count: number; min: number; met: boolean };
    consistency: { bestDayShare: number | null; limitPct: number; met: boolean } | null;
    overall: 'in-progress' | 'breached' | 'target-reached';
  }
  export function evaluateProp(input: { startingBalance: Cents; rules: PropRuleSet; trades: readonly Trade[]; timeZone: string; now: string }): PropStatus;
  ```

Rules (closed-trade equity basis; intraday unrealised P&L needs market data, backlog #14):
- **Cut-off.** Trades with `closedAt > now` are ignored.
- **Floors.**
  - static: floor = start − maxDD.
  - trailing: floor = min(peak − maxDD, start), with the peak updated after each closed trade. The trail stops at the starting balance.
  - eod-trailing: the same, with the peak taken from end-of-day equities only.
- **Drawdown breach.** The first time equity ≤ floor: `breachedAt` is that trade's `closedAt`. **A breach is permanent.**
- **Daily loss.** It is breached on the first day with net ≤ −limit (`breachedOn`). `remaining = limit + min(todayNet, 0)`, where "today" is `now` in `timeZone`.
- **Near.** A rule's state is `near` when it isn't breached and `remaining ≤ NEAR_FRACTION × limit`.
- **Profit.** `progress = max(0, equity − start) / target`.
- **Consistency.** `bestDayShare = bestDayNet / totalProfit`, or `null` when total profit ≤ 0, in which case it's not met. `met` when share ≤ limit.
- **Overall.** `breached` if any breach. Otherwise `target-reached` when profit ≥ target, trading days are met, and consistency is met or absent. Otherwise `in-progress`.

Scenario S: start 5,000,000; maxDD 200,000; daily 100,000; target 300,000; min days 3; consistency 0.4; tz America/New_York.
- Day 1: closes +150,000 at `2026-03-02T15:00Z` and −50,000 at `16:00Z`.
- Day 2: closes −90,000 at `2026-03-03T15:00Z`.
- Day 3: closes +40,000 at `2026-03-04T15:00Z`.
- `now = '2026-03-04T18:00:00Z'`.

- [ ] **Step 1: Write the failing tests**

```ts
test('scenario S across drawdown types', () => {
  const floors = (['static', 'trailing', 'eod-trailing'] as const).map(type => evaluateProp(S({ drawdownType: type })).drawdown);
  expect(floors.map(d => [d.floor, d.remaining, d.state])).toEqual([
    [4800000, 250000, 'clear'], [4950000, 100000, 'clear'], [4900000, 150000, 'clear']]);
  const s = evaluateProp(S());
  expect(s.equity).toBe(5050000);
  expect(s.profit.current).toBe(50000); expect(s.profit.progress).toBeCloseTo(0.1667, 4);
  expect(s.dailyLoss).toMatchObject({ todayNet: 40000, remaining: 100000, state: 'clear', worstDay: { date: '2026-03-03', net: -90000 } });
  expect(s.tradingDays).toEqual({ count: 3, min: 3, met: true });
  expect(s.consistency).toMatchObject({ bestDayShare: 2, met: false });
  expect(s.overall).toBe('in-progress');
});
test('daily loss near and breached', () => {
  expect(evaluateProp(S({ day2: -95000, now: '2026-03-03T20:00:00Z' })).dailyLoss).toMatchObject({ todayNet: -95000, remaining: 5000, state: 'near' });
  const b = evaluateProp(S({ day2: -120000 }));
  expect(b.dailyLoss).toMatchObject({ state: 'breached', breachedOn: '2026-03-03' }); expect(b.overall).toBe('breached');
});
test('trailing breach is permanent even after recovery', () => {   // Review Focus 5
  const s = evaluateProp(S({ drawdownType: 'trailing', day2: -210000, day3: 300000 }));
  expect(s.drawdown).toMatchObject({ state: 'breached', breachedAt: '2026-03-03T15:00:00Z' });
  expect(s.overall).toBe('breached');
});
test('trailing floor locks at the starting balance', () => {
  expect(evaluateProp(S({ drawdownType: 'trailing', day1: [300000], day2: 0, day3: 0 })).drawdown.floor).toBe(5000000);
});
test('target reached', () => {
  expect(evaluateProp(S({ day1: [150000], day2: 100000, day3: 100000, consistencyPct: 0.5 })).overall).toBe('target-reached');
});
```

`S(overrides)` is a local test helper. It builds the scenario above with `makeTrade` and `closedAt` times as listed, and accepts overrides for `drawdownType`, `consistencyPct`, `now`, `day1` (an array of nets), `day2` and `day3` (single nets; a 0 net means no trade that day).

- [ ] **Step 2: Run `npm test -- src/domain/prop/evaluate.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `evaluateProp`**, reusing `equityCurve` and `dailyPnl`.
- [ ] **Step 4: Run the full suite.** Run `npm run lint && npm run typecheck && npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** with `git commit -m "feat(domain): prop-firm rule evaluation with permanent breaches"`.

---

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build` all pass on branch `m1-foundation`.
- `src/domain` has no imports from `react`, `next` or browser APIs. Check with `grep -rE "from '(react|next)" src/domain`, which should print nothing.
- Plans 2 and 3 can start: Plan 2 consumes every Interfaces block above, and Plan 3 needs only Task 1.
- Not in this plan, deliberately: the spec's "<50 ms for 1,200 trades" performance check. It lands in Plan 2, where the seeded sample generator provides a realistic 1,200-trade set.
