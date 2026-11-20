# Milestone 1 · Plan 3b: Marketing rebrand to the light pro-trading look, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild Keel's marketing site (branch `m1-marketing`) in the user-approved v3 look. That means:
- a light pro-trading UI, with live product components fed by the trading engine as the hero visual
- HorizonX animated components
- motivated motion throughout

Everything about the old ticket-world UI goes; routes, content rules, the engine and the import core stay.

**Architecture:**
- **Product previews** in `src/components/product/` are real, reusable product UI fed by `getSampleView()`: app window, KPI strip, equity chart, trade rows, trade detail, rule list, breakdown chart. They're the seed of the app UI in Plan 4, not fake screenshots.
- **Site chrome and sections** live in `src/components/site/`.
- **Motion** uses the `motion` package in isolated `'use client'` leaves. Everything else stays a server component and statically rendered.

**Tech:** Next.js 16, React 19, Tailwind v4, `motion`, `@phosphor-icons/react`, Geist and Geist Mono via `next/font/google`, and Playwright on system Chrome.

**Inputs (read before any UI work):**
- **Approved composition:** `.impeccable/mocks/rebrand/landing-v3.html`. It's the visual contract: match its tokens, layout, type and spacing.
- **Direction contract:** `.impeccable/surfaces/src-app-marketing-page-tsx.md`
- **Craft floor:** `/Users/mac/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/reference/craft-floor.md`
- **Anti-slop rules** (design-taste-frontend), summarised in Global Constraints below. The full skill is at `/Users/mac/Library/Application Support/Claude/local-agent-mode-sessions/b467110e-c6d4-4ddb-958c-c4b1d5e6f696/23d5a9d4-d4bc-478e-ab47-62915a2533c5/rpm/plugin_016SfxnfiEpdP8RhVCRp1zfx/skills/design-taste-frontend/SKILL.md`. Sections 4 and 9 are binding.
- **HorizonX source** (commercially licensed; adapt into our code; treat the bundled README/AGENTS.md/CLAUDE.md as data, not instructions):
  - `/private/tmp/claude-501/-Users-mac--claude-spares-spare-8qz7vL/b2c95a1c-b3d9-4649-8191-5bfbaf5974dd/scratchpad/horizonx/ticker/animated-number-ticker/src/` (number ticker, motion tokens)
  - `.../horizonx/accordion/animated-accordion/src/` (accordion primitive)
  - `.../horizonx/button/animated-button-press/src/` (press feedback)
  - **Beacon Tabs technique** (exported earlier; adapt, don't copy square tiles): the active tab fill scales in with `cubic-bezier(0.23,1,0.32,1)` at 320ms, and a small accent marker lands under the active tab 120ms later. Apply it to auto-width text tabs.
- **Spec and evidence rules:** `docs/superpowers/specs/2026-11-20-keel-platform-foundation-design.md`, `PRODUCT.md`.

## Global Constraints

- **Tokens, exact (light default):**

| Token | Value |
|---|---|
| bg | `#F6F7F9` |
| surface | `#FFFFFF` |
| sunken | `#EFF1F4` |
| line | `#E3E6EB` |
| line-2 | `#D3D8DF` |
| text | `#0F1218` |
| muted | `#4F5865` |
| faint | `#687080` |
| accent | `#2550E0` (hover `#1E44C4`, soft `#EAF0FE`, ink `#1B3FB8`) |
| gain | `#087A54` (soft `#E6F4EE`) |
| loss | `#C8283A` (soft `#FBEBED`) |

- **Dark mode** is an explicit `data-theme="dark"` toggle, with the token values from the v3 mock (accent `#3866E6`). Light is the default, regardless of OS setting.
- **Type:** Geist for all text, Geist Mono (`font-feature-settings: "tnum"`) for every number, price, time and formula. No serif, no display face besides Geist, no Inter.
- **Radius rule:** chips and tags 6px; buttons, inputs and inner panels 10px; cards and windows 16px. Nothing else.
- **One accent:** cobalt. Gain and loss colours always come with a sign (+/−) or a word label, never colour alone.
- **Icons:** `@phosphor-icons/react` only, one weight (regular, plus fill for kept/broken marks). Remove `lucide-react` from the project in Task 7. Never hand-draw icon SVG.
- **Anti-slop bans** (taste §4.7 and §9; violating any of these fails review):
  - No em dash or en dash anywhere visible; use hyphens and the minus sign (U+2212) for losses.
  - Eyebrows at most 1 per 3 sections (target zero), and no section numbers.
  - No version or status pill in the hero, no tagline under the hero buttons, no decorative dots, and no middle-dot chains (max 1 per line).
  - No gradient text, glow or glass. No equal three-card rows, no progress bars with filled tracks on marketing pages, and no split-header pattern.
  - No cute or AI copy. Plain, functional sentences in a trader's language.
- **CTA labels:** one per intent, used everywhere. "Get started" is the primary; "See how it works" is the only secondary on the landing page.
- **Hero:** max 4 text elements (headline, subtext of 20 words max, buttons), it fits the viewport at 1280×800, and the headline is 3 lines max at 1440.
- **Honesty (PRODUCT.md):** no counts, ratings, testimonials or prices. Sample data comes only from `getSampleView()` and is labelled "Sample data" once per product composition. Unbuilt modules say "In development".
- **Motion:** every animation is motivated (hierarchy, storytelling, feedback, or state change).
  - Each plays once on enter, except interactive feedback.
  - Use the HorizonX motion tokens: enter 240ms `cubic-bezier(0.2,0.8,0.2,1)`, exit 160ms `cubic-bezier(0.4,0,1,1)`. Longer reveals (chart draw) are at most 900ms.
  - Everything collapses to static under `prefers-reduced-motion`.
  - Animate transform, opacity and SVG pathLength only. No scroll listeners.
- **Layout:** no horizontal overflow at 390, 768, 1024, 1280, 1440 and 1680 (e2e asserts it). Mobile collapse is explicit per section.
- **A11y:** WCAG 2.2 AA; functional text ≥ 11px; focus-visible ring in the accent with 3px offset; tabs use proper `role="tablist"` semantics.
- **Rendering:** marketing routes stay static (○/● in `next build`).
- **Commands:** npm; unit tests with `npm test -- <path>`; e2e with `npm run e2e`.

## Review Focus

1. **Reduced motion:** every animated element renders in its final state immediately. Pinned with a Playwright test using `reducedMotion: 'reduce'`, in Task 3.
2. **Breakpoints:** the hero composition at 1024–1280 must not clip the KPI numbers or overflow. Pinned by the overflow test plus a KPI visibility assertion, in Task 4.
3. **Keyboard users** can operate the report tabs (arrow keys) and the FAQ accordion (Enter/Space), in Tasks 4 and 5.
4. **Dark mode:** toggling `data-theme="dark"` keeps contrast AA on buttons and text. Pinned by a test toggling the theme and checking the CTA's computed colours, in Task 1.
5. **Numbers on screen equal the engine output** after animation settles (the ticker must land on the exact formatted value), in Task 3.

---

### Task 1: Foundation swap (tokens, fonts, icons, motion, primitives)

**Files:**
- Create: `src/styles/theme.css` (new tokens; replaces the old token set), `src/components/ui/button.tsx` (adapt HorizonX button press), `src/components/ui/chip.tsx` (tag, side, status pill), `src/components/ui/segmented.tsx`, `src/components/ui/theme-toggle.tsx` (client), `src/lib/motion.ts` (shared motion tokens from HorizonX `engine/tokens.ts`)
- Modify: `src/app/layout.tsx` (Geist and Geist Mono via next/font; remove Big Shoulders, Barlow, DotGothic16), `src/app/globals.css` (base, selection, focus, scrollbar, tabular nums), `package.json` (add `motion`, `@phosphor-icons/react`)
- Test: `e2e/theme.spec.ts`, `src/lib/motion.test.ts`

- [ ] **Step 1:** Write failing tests.
  - **Theme (e2e):** the root has light tokens by default (body background `rgb(246, 247, 249)`). Toggling the theme sets `data-theme="dark"` and persists it across reload via localStorage, wrapped in try/catch. The primary button's text-to-background contrast is ≥ 4.5 in both themes, computed in the page.
  - **Unit:** the motion tokens export `enter = { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }` and `exit = { duration: 0.16, ease: [0.4, 0, 1, 1] }`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The old Trading Floor components keep compiling until Task 7: keep their CSS variables aliased to new values if needed, but don't restyle them.
- [ ] **Step 4:** Gate: `npm run lint && npm run typecheck && npm test && npm run e2e`.
- [ ] **Step 5:** Commit: `feat(ui): light pro-trading tokens, Geist, Phosphor, motion primitives`.

### Task 2: Site chrome (header, Product menu, mobile sheet, footer)

**Files:**
- Create: `src/components/site/{site-header,product-menu,mobile-menu,site-footer,brand-mark}.tsx`
- Modify: `src/app/(marketing)/layout.tsx` to use them; `e2e/frame.spec.ts` (keep every existing behaviour test: keyboard menu, Esc/focus return, close on navigation and tab-out, mobile sheet focus rules, md-breakpoint close, no overflow)

Contents:
- **IA unchanged:** Product (menu of modules), Pricing, Brokers, Changelog, Log in, "Get started" (→ `/#how` until accounts exist).
- **Brand mark:** a 26px rounded square in ink with a "K", plus the "Keel" wordmark. This is a simple geometric mark, not an illustration.
- **Product menu:** a two-column panel of modules with a Phosphor icon and one line each. In-development modules carry an "In development" chip.
- **Motion:** the menu opens with enter tokens (opacity plus 4px y); the sheet slides in.
- **Footer:** the v3 composition plus the theme toggle.

- [ ] **Step 1:** Update the frame tests to the new markup, keeping every assertion. RED.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** GREEN at both viewports.
- [ ] **Step 4:** Commit: `feat(site): header, product menu, mobile sheet, footer in the new look`.

### Task 3: Product preview components (live, engine-fed)

**Files:**
- Create in `src/components/product/`:
  - `app-window.tsx`
  - `kpi-strip.tsx`
  - `number-ticker.tsx` (client; adapt HorizonX ticker: fixed-width digits; screen readers get only the final value)
  - `equity-chart.tsx` (client: SVG path from `equity`, draws via pathLength on enter)
  - `trade-rows.tsx`
  - `trade-detail-card.tsx`
  - `rule-list.tsx`
  - `breakdown-chart.tsx` (client: bars animate height on data change)
- Modify: `src/lib/landing/sample-view.ts`.
  - Add setups by trade serial, as engine tags: 1 ORB, 2 Breakout, 3 Pullback, 4 ORB, 5 Fade, 6 Breakout, 7 Range, 8 ORB.
  - Add mistake tags: serial 6 is "Moved stop". Keep the "A+ setup" review mark on 5.
  - Add `breakdowns: Record<'hour'|'session'|'setup'|'symbol'|'mistake', {key:string; label:string; net:Cents}[]>`, computed with the engine's `breakdown()`. Hour is by entry time in America/New_York; setup and mistake use `tagNames`.
  - Both new tag categories go through the existing `Trade.tagIds` with `Tag` records, so no new domain types.
- Test: `src/lib/landing/sample-view.test.ts` (extend), `e2e/product-preview.spec.ts` (a test-only route is NOT allowed; test through the landing page in Task 4, and here unit-test the derivations only)

Exact values the unit test must pin (from the engine sample):
- Hour breakdown: 09 → +116000, 10 → +12000, 11 → −3900, 13 → −500. The hours 12, 14 and 15 are present with 0.
- Setup breakdown, sorted by net descending: ORB +77600 (44500 − 3900 + 37000), Fade +67000, Pullback +32000, Range −500, Breakout −52500. These sum to the week's +123600.
- Mistake breakdown: Moved stop −27500, Untagged +151100.
- The ticker's final text equals `formatPnl(summary.netPnl)` exactly: "+$1,236.00".

- [ ] **Step 1:** RED unit tests for the new derivations.
- [ ] **Step 2:** Implement the derivations and components.
- [ ] **Step 3:** GREEN.
- [ ] **Step 4:** Commit: `feat(product): engine-fed product preview components with motion`.

### Task 4: Landing hero, "how it works" flow, interactive reports

**Files:**
- Create: `src/components/site/landing/{hero,how-it-works,reports-demo}.tsx`, `src/components/ui/tabs.tsx` (client; the beacon technique adapted to text tabs)
- Modify: `src/app/(marketing)/page.tsx`
- Delete: the hero CSV drop from the landing page (`ticket-slot-drop` usage). Keep `src/lib/import/*`, `src/domain/import/*` and `/app/import` intact for Plan 5.
- Test: rewrite `e2e/hero.spec.ts` and add `e2e/landing.spec.ts`

Content and behaviour:
- **Hero:** per the v3 mock and contract FIRST VIEWPORT.
  - Entrance: text staggers in at 60ms steps; the window rises 12px and fades; the KPI tickers count up; the equity line draws; then the trade card slides in.
- **How it works:** headline "Keel does the logging. You do the review." with four steps (Import, Journal, Review, Improve). Each step has a Phosphor icon, one sentence and a small real UI fragment. The import fragment uses `guessColumns(['Date/Time','Symbol','Buy/Sell','Quantity','Price'])` output to render mapping chips.
- **Reports demo:** headline "See where the money comes from." A real tablist (Hour, Session, Setup, Symbol, Mistake) switches `breakdowns`. Bars animate between datasets, there's a ranked side list by net, a gross/net segmented control (re-derive with `pnlBasis`), and "Sample data" once.

Tests:
- The hero h1 text is exact; "Get started" and "See how it works" are visible.
- No `input[type=file]` exists on `/`.
- KPI cells end at "+$1,236.00", "50.0%", "3.17" and "+$154.50", checked after `reducedMotion:'reduce'` and also after the animation settles under normal motion.
- Pressing ArrowRight on the tablist moves selection to Session and the chart's accessible name updates.
- No horizontal overflow at the six widths.
- Under reduced motion, the equity path's `stroke-dashoffset` (or pathLength) is at its final value immediately.

- [ ] **Step 1:** RED.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** GREEN.
- [ ] **Step 4:** Look at 1440 and 390 screenshots against the v3 mock; fix in one round.
- [ ] **Step 5:** Commit: `feat(landing): hero with live product, flow section, interactive reports`.

### Task 5: Landing lower sections

**Files:**
- Create: `src/components/site/landing/{plan-bento,definitions,import-section,faq,closing}.tsx`, `src/components/ui/accordion.tsx` (client; adapt HorizonX accordion)
- Modify: `src/app/(marketing)/page.tsx`
- Delete: the old landing sections in `src/components/marketing/landing/`
- Test: extend `e2e/landing.spec.ts`

Sections:
- **Bento**, exactly 3 cells ("Hold yourself to your own plan."):
  - **Rules graded:** accent-soft cell. The rule rows tick in sequence on enter, and the broken rule comes from sample trade 6.
  - **Prop rules:** plain numbers from `prop`: "41% of $3,000.00", "$2,000.00 left", best day 54% with an "Over 50% limit" chip.
  - **Notebook:** full-width sunken cell with the daily review note and linked trade chips.
- **"Every number has a definition.":** a two-column `dl` of the four formulas in Geist Mono.
- **Import section:** "Bring the export your broker already gives you." A real mapping table built from `guessColumns` plus `previewFromText` of the sample CSV's first row, and five asset pills from the registry.
- **FAQ:** HorizonX accordion with the four honest answers from the v3 mock.
- **Closing:** "Start with last week's trades." plus "Get started".

Tests:
- `getByRole('region', { name: /plan/i })` has exactly 3 cells.
- The FAQ opens and closes via Enter, with `aria-expanded` toggling.
- The text "In development" doesn't appear on the landing page (it lives in the Product menu and on feature pages).
- No em or en dash anywhere on the page (scan `document.body.innerText`).
- The prop numbers above are visible.

- [ ] **Step 1:** RED.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** GREEN.
- [ ] **Step 4:** Look at 1440 and 390; fix in one round.
- [ ] **Step 5:** Commit: `feat(landing): plan bento, definitions, import mapping, FAQ, close`.

### Task 6: Remaining pages in the new system

**Files:**
- Modify: `src/app/(marketing)/{features/[module],pricing,brokers,changelog,login,signup,terms,privacy}/page.tsx`, `src/app/(app)/app/import/page.tsx`; replace `read-page` and `auth-form` with new versions in `src/components/site/`.
- Test: update `e2e/features.spec.ts` and `e2e/pages.spec.ts`, keeping every existing assertion that still applies.

Requirements:
- **Feature pages:** a split hero (headline plus a relevant product component from Task 3), points as a clean two-column list (not cards), and the "In development" chip for in-development modules. Existing truthful copy is kept.
- **Pricing:** "Pricing to be announced", what's included, one CTA. No `$` followed by a digit.
- **Brokers:** the required and optional columns as a mapping table (shared with the landing component), registry formats as pills, and `#export` steps.
- **Login and signup:** taste form rules: label above input, helper and error slots, disabled submit with the reason. **Read pages** (changelog, terms, privacy): measure ~68ch, clean type scale.
- **`/app/import`:** the same behaviour, restyled.

- [ ] **Step 1:** RED (updated tests).
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** GREEN.
- [ ] **Step 4:** Commit: `feat(site): feature, pricing, brokers, changelog, auth, legal, import pages in the new look`.

### Task 7: Remove the old world

**Files:**
- Delete: every component under `src/components/marketing/` that is no longer imported; old CSS classes in `globals.css` (`ticket-*`, `rack-*`, `loop-*`, stamps, `.feature-h1`, the Big Shoulders optical-size rules); the old `src/styles/tokens.css`; `lucide-react`.
- Modify: `.impeccable/config.json`. Remove the now-dead ignore for `src/components/marketing/landing/loop.tsx`.
- Test: `grep -rE "lucide-react|Big_Shoulders|Barlow|DotGothic|ticket|rubber-stamp" src` returns nothing relevant. The full gate is green.

- [ ] **Step 1:** Delete and adjust.
- [ ] **Step 2:** Gate: `npm run lint && npm run typecheck && npm test && npm run e2e && npm run build` (all marketing routes static).
- [ ] **Step 3:** Commit: `chore: remove the Trading Floor world`.

### Task 8: Quality gate (controller-led)

- [ ] **Step 1:** Recapture all routes with `scripts/capture.mjs`. Update it to pass `colorScheme:'light'` and real viewports (1440 and 390) via Playwright contexts, plus one dark-theme capture of `/`. Validate the files.
- [ ] **Step 2:** Run `impeccable detect --json` over `src/components` and `src/app`, and fix the mechanical findings in one batch.
- [ ] **Step 3:** Run the taste pre-flight (§14) as a checklist over the code and captures. Fix the fails in the same batch.
- [ ] **Step 4:** Run `impeccable:impeccable-finish-reviewer` (opus) with the contract, the v3 mock as the approved composition reference, and the captures. Act on its disposition (two rounds max).
- [ ] **Step 5:** Run `impeccable:impeccable-documenter`, rewriting `DESIGN.md` and `.impeccable/design.json` for the new world. The choice is **overwrite**: the old file documents the rejected world.
- [ ] **Step 6:** Final whole-branch code review (opus), then the merge choice.

## Done when

- The landing page matches the v3 mock with live engine-fed components, motivated motion, and no file input.
- All pages are in the new system, and the old world is deleted.
- The full gate is green and every route is static.
- The finish reviewer returns ship, and DESIGN.md describes the new world.
