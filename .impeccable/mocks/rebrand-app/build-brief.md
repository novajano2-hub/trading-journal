# App rebrand build brief: Direction C "Daylight premium"

The user hated the Plan 4 app look ("too plain and grey… looks like AI slop") and picked comp C. Your job is to make the real app match it. This is a **reskin**: behaviour, data, copy, routes, accessibility and tests stay; the look changes.

## Binding references
- **Composition and every visual value:** `.impeccable/mocks/rebrand-app/c-daylight-premium.html` (read its `<style>` and markup) and `c-daylight-premium.png`. Match it closely. Where the real app has something the comp lacks (popovers, drawer, empty/loading/error states, drill-down dialog, goals form, mobile), extend the comp's language: same radii, shadows, type, tile and chip treatments.
- **Bar:** Kraken Pro, Coinbase Advanced, Gemini ActiveTrader, Public. Premium, precise, alive. No AI slop: no glows, no gradient text, no glass everywhere, no mesh, no emoji, no decorative dots, no eyebrows (small uppercase tracked labels), no em or en dashes in copy.
- **Real data wins over the comp's numbers.** The comp used mock figures; render whatever the app computes.

## Foundation (already committed; do not edit these files)
`src/styles/theme.css`, `src/app/globals.css`, `src/app/(app)/layout.tsx`. If you need a token that does not exist, use the closest one and say so in your report.

- App pages render inside `[data-surface="app"]`; theme.css swaps the CSS variables on `<html>` via `:has()`, so Radix portals follow too. Marketing keeps its old tokens.
- Font: `font-sans` and `font-mono` are both Instrument Sans in the app (variable, `wdth` axis available: `font-stretch` 75-100%). Numbers use tabular figures (`tnum` class or `font-mono`). The comp's hero numeral uses `font-stretch: 88%`.
- Tailwind colour names: `bg` (canvas #ECEEF8), `surface-1` (cards), `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent` (Keel Ultramarine #2B35AF), `accent-hover`, `accent-soft`, `accent-ink`, `accent-fg`, `accent-deep` (#1F278C), `accent-tint`, `on-accent-muted` (secondary text on the hero), `on-accent-loss` (loss figure on the hero), `gain`, `gain-fill`, `gain-soft`, `loss`, `loss-fill`, `loss-soft`, `warn`, `warn-fill`, `warn-soft` (marigold: mistakes), `info`, `info-fill`, `info-soft` (cyan: goal progress).
- Shadows (project convention is `shadow-[var(--x)]`): `--shadow-card` (cards), `--shadow-chip` (controls, active pills, popovers), `--shadow-hero` (the ultramarine card), `--shadow` (floating dialogs).
- `IconTile` tones: `accent | neutral | faint | warn | info | gain | loss | on-accent`. `Chip` tones: `neutral | accent | gain | loss | warn | info`. Keep these APIs.
- Dark mode (`data-theme="dark"` on `<html>`) has a full dark token set (deep navy). Every surface must look designed in dark too, not just inverted. The hero card stays ultramarine in dark.

## Rules
- **Shared components that marketing also uses** (`chip`, `segmented`, `button`, `button-styles`, `theme-toggle`): colour changes come free through the tokens. Any structural change (radius, height, weight, padding) must not change marketing: scope it with Tailwind's `in-data-[surface=app]:` variant, or add an opt-in prop. Portaled content sits outside `[data-surface]`, so `in-data-*` does not match there; style portaled content directly (it is app-only anyway).
- Keep every test id, role, label, accessible name, focus order, keyboard path, `<Suspense>` boundary, reduced-motion handling and 44px coarse-pointer target. Update a unit test only when it asserts a purely visual detail you changed (class name, colour), and say which in your report.
- Motion: `motion/react` only in `'use client'` leaves; use the existing `--ease-glide`/`--ease-enter` tokens; respect reduced motion. A little life is wanted (the comp draws the equity line, hover states glide), not spectacle.
- Phosphor icons: components from `@phosphor-icons/react/dist/ssr`, the `Icon` type from the root.
- Mobile (390px) and the sidebar drawer below `lg` must stay clean.
- Commit only your own files with `git add <paths>` (never `git add -A` or `.`); another implementer is committing in the same working tree at the same time. If `.git/index.lock` exists, wait a few seconds and retry. Message style: `feat(app): …` or `style(app): …`, with the trailer for your model (e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Checking your work
- Dev server already running: http://localhost:3100 (do not start another; do not stop it).
- Captures: from the repo root run `node scripts/.appshot.tmp.mjs <out-prefix> [route]` (default `/app/dashboard`). It writes `<prefix>-desktop.png` (1440 light), `-desktop-dark.png`, `-mobile.png` (390, full page). Write captures under `/private/tmp/claude-501/-Users-mac-Projects-trading-journal/b2c95a1c-b3d9-4649-8191-5bfbaf5974dd/scratchpad/shots/`. Look at them next to the comp PNG and fix what differs. Batch your fixes; don't capture after every tweak. Never commit that script.
- Tests: `npx vitest run src/components/app src/components/ui` (focused) and `npx tsc --noEmit -p .` before committing. Don't run the e2e suite; the controller runs the full gate.
