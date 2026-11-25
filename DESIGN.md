---
name: Keel
description: A premium trading journal in daylight and graphite. Keel Ultramarine spent sparingly on a periwinkle canvas (or a neutral graphite one in dark), white cards with brand-tinted shadows, no icon tiles, Instrument Sans with tabular figures for every word and number.
colors:
  bg: '#eceef8'
  surface: '#ffffff'
  sunken: '#f0f1f8'
  line: '#e7e9f3'
  line-strong: '#d5d8ea'
  text: '#121633'
  muted: '#4b5175'
  faint: '#636889'
  ultramarine: '#2b35af'
  ultramarine-hover: '#1f278c'
  ultramarine-soft: '#eeeffc'
  ultramarine-ink: '#2b35af'
  ultramarine-deep: '#1f278c'
  ultramarine-tint: '#dcdff8'
  on-ultramarine: '#ffffff'
  track: 'color-mix(in srgb, #2b35af 8%, transparent)'
  gain: '#0a7a52'
  gain-fill: '#19a672'
  gain-soft: '#ddf3e8'
  loss: '#c22e3a'
  loss-fill: '#e5484d'
  loss-soft: '#fceced'
  warn: '#9a5700'
  warn-fill: '#e9a21a'
  warn-soft: '#fcf1dc'
  info: '#0a6f94'
  info-fill: '#1693be'
  info-soft: '#e0f1f8'
  dark-bg: '#0b0b0b'
  dark-surface: '#141414'
  dark-sunken: '#1b1b1b'
  dark-line: '#252525'
  dark-line-strong: '#313131'
  dark-text: '#ededed'
  dark-muted: '#a3a3a3'
  dark-faint: '#878787'
  dark-ultramarine: '#4c57dc'
  dark-ultramarine-hover: '#5c66e6'
  dark-ultramarine-soft: '#1c1d2e'
  dark-ultramarine-ink: '#aeb4ff'
  dark-ultramarine-tint: '#2a2f5e'
  dark-gain: '#3fc08e'
  dark-gain-fill: '#2fb27f'
  dark-gain-soft: '#10261c'
  dark-loss: '#f06a78'
  dark-loss-soft: '#2b1517'
  dark-warn: '#f0b44a'
  dark-warn-soft: '#2a2010'
  dark-info: '#4db8e0'
  dark-info-soft: '#0d2330'
  dark-track: 'rgb(255 255 255 / 0.05)'
  veil: 'rgba(18, 22, 51, 0.36)'
  dark-veil: 'rgba(0, 0, 0, 0.62)'
typography:
  display-hero:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: 'clamp(40px, calc(3.125vw + 18px), 58px)'
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: '-0.032em'
  display-page:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: 'clamp(36px, calc(2.6vw + 16px), 52px)'
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: '-0.032em'
  section-heading:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: 'clamp(2rem, 1.6rem + 1.6vw, 2.625rem)'
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: '-0.028em'
  headline-sub:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.03em'
  lead:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 400
    lineHeight: 1.6
  body-reading:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '16.5px'
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '15.5px'
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 500
  ui-small:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '13.5px'
    fontWeight: 500
  label:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 400
  axis:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '11px'
    fontWeight: 400
    fontFeature: 'tnum'
  figure-kpi:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '22px'
    fontWeight: 600
    letterSpacing: '-0.03em'
    fontFeature: 'tnum'
  figure-row:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 550
    fontFeature: 'tnum'
  figure-hero:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '104px'
    fontWeight: 600
    lineHeight: 0.82
    letterSpacing: '-0.05em'
    fontFeature: 'tnum'
  figure-pnl:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '31px'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.04em'
    fontFeature: 'tnum'
  card-title:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: '-0.015em'
  app-title:
    fontFamily: 'Instrument Sans, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: '-0.035em'
rounded:
  chip: '6px'
  control: '10px'
  card: '16px'
spacing:
  page-gutter-mobile: '20px'
  page-gutter: '40px'
  container: '1280px'
  header: '64px'
  app-sidebar: '220px'
  app-top-bar: '56px'
  app-tab-bar: '56px'
  auth-column: '400px'
  app-card-padding: '18px 20px 16px'
components:
  button-primary:
    backgroundColor: '{colors.ultramarine}'
    textColor: '{colors.on-ultramarine}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '0 18px'
  button-primary-hover:
    backgroundColor: '{colors.ultramarine-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '0 18px'
  button-ghost:
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    height: '44px'
  button-ghost-hover:
    backgroundColor: '{colors.sunken}'
  chip-neutral:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.muted}'
    rounded: '999px'
    height: '22px'
    padding: '0 8px'
  chip-accent:
    backgroundColor: '{colors.ultramarine-soft}'
    textColor: '{colors.ultramarine-ink}'
    rounded: '999px'
    height: '22px'
  chip-gain:
    backgroundColor: '{colors.gain-soft}'
    textColor: '{colors.gain}'
    rounded: '999px'
    height: '22px'
  chip-loss:
    backgroundColor: '{colors.loss-soft}'
    textColor: '{colors.loss}'
    rounded: '999px'
    height: '22px'
  chip-warn:
    backgroundColor: '{colors.warn-soft}'
    textColor: '{colors.warn}'
    rounded: '999px'
    height: '22px'
  chip-info:
    backgroundColor: '{colors.info-soft}'
    textColor: '{colors.info}'
    rounded: '999px'
    height: '22px'
  side-chip:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.muted}'
    rounded: '7px'
    height: '22px'
    padding: '0 9px'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
  plan-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
  segmented:
    backgroundColor: '{colors.track}'
    textColor: '{colors.muted}'
    rounded: '11px'
    padding: '3px'
  segmented-active:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '8px'
  state-glyph:
    textColor: '{colors.faint}'
    size: '28px'
  tab-bar:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.faint}'
    height: '56px'
  tab-bar-current:
    textColor: '{colors.ultramarine-ink}'
  filter-chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    height: '32px'
    padding: '0 10px 0 12px'
  filter-chip-unavailable:
    textColor: '{colors.faint}'
  kpi-tile:
    rounded: '{rounded.control}'
    padding: '10px 14px 0'
  morph-dialog:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    width: '760px'
---

# Design System: Keel

## Overview

**Creative North Star: "Daylight Premium"** names a register, not a metaphor world. Keel looks like a premium product used in daylight: a periwinkle canvas, white cards that lift on brand-tinted shadows, one deep brand hue (Keel Ultramarine) spent sparingly, and one family, Instrument Sans, whose tabular figures set every number. Every card is a neutral surface, the "Your plan" card included; the accent marks only what acts or is chosen. The product itself is the illustration: real-looking app windows made of the app's own cards, with labelled sample data, carry the marketing pages. The bar is the pro trading platforms (Kraken Pro, Coinbase Advanced, Gemini ActiveTrader, Public): no icon tiles, no boxed hamburger, no generated-looking theme.

The whole product wears one world. The app (`/app/*`) and the marketing site share the same tokens, face, cards and product-shot components. The tokens live once, on `:root`, in `src/styles/theme.css`.

**Appearance** is a setting: System (the default), Light or Dark, saved in the prefs (`UserPrefs.appearance`) and chosen in Settings, Profile, in the workspace menu on desktop and in the More sheet on a phone. A script in `<head>` resolves it before first paint from a mirrored copy (`keel-appearance` in localStorage), sets `data-appearance` (the choice) and `data-theme` (light or dark) on `<html>`, and keeps System in step with `prefers-color-scheme`. Once the prefs load, they win. Dark is a neutral **graphite**, the family pro terminals use: near-black canvas, surfaces lifted a step at a time, hairline borders, grey text, every grey with equal red, green and blue so nothing reads blue. There is no sun or moon toggle anywhere.

Rejected, and recorded so they are not rebuilt: metaphor worlds (the earlier trading-floor tickets and stamps), dark mesh hero clichés, editorial serif display type, the earlier flat grey-and-cobalt Geist look, the navy-tinted dark palette, the ultramarine "Your plan" hero, coloured icon tiles, the phone drawer behind a boxed hamburger, and anything that reads as AI-generated.

**Key Characteristics:**

- Periwinkle canvas, white cards, brand-tinted shadows; depth comes from the card shadow and a hairline. In graphite dark, depth is the surface lift and the hairline.
- One brand hue: Keel Ultramarine, spent on primary actions, the active state, focus and series 1 only. Data hues have fixed jobs: marigold for mistakes, green and red for signed money and kept or broken. Cyan has no standing job since the Goals card went.
- Instrument Sans for everything, with tabular figures wherever a number is read.
- Tight negative tracking on large type, generous leading on body.
- Motion is short and decelerating; it announces arrival and selection, then stops.
- No icon tiles. A card's header is its title; a glyph appears only where it carries meaning, plain and at text size.
- The app (`/app`) is the same system at working density: a labelled sidebar on the canvas (a tab bar at a phone's foot), a top bar, a "Plan vs actual" Dashboard led by the "Your plan" card. Its direction is the trader's own plan as the yardstick: adherence and the cost of broken rules lead, performance follows.

## Colors

A periwinkle-tinted neutral field (graphite in dark), one ultramarine voice used sparingly, three data hues with fixed jobs, and a green/red pair for money. Tokens live in `src/styles/theme.css` as CSS variables and are exposed to Tailwind in `src/app/globals.css` as `bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`, `warn*`, `info*`, `track`, `veil`. Frontmatter names above are the descriptive aliases (`surface` = `--surface-1`, `line-strong` = `--line-2`, `ultramarine` = `--accent`, `ultramarine-tint` = `--accent-tint`).

### Primary

- **Keel Ultramarine** (#2b35af light, #4c57dc dark; `--accent`): the primary button, selection and caret, focus ring, the current tab and nav glyph, adherence bars, the plan's kept bar, series 1 (the equity line) and the brand tile. The brand's hue, which the money palette never uses.
- **Ultramarine Hover** (#1f278c light, #5c66e6 dark): primary button hover.
- **Ultramarine Soft** (#eeeffc light, #1c1d2e dark): accent chip fill, a selected row, adherence rail, hover wash on text actions. Never a panel.
- **Ultramarine Ink** (#2b35af light, #aeb4ff dark): text and glyphs on ultramarine-soft, links in cards, the current nav glyph and the current tab.
- **Ultramarine Deep** (#1f278c both): the dark end of brand gradients.
- **Ultramarine Tint** (#dcdff8 light, #2a2f5e dark): text selection.
- **On Ultramarine** (#ffffff): text on a primary button.
- **Track** (`--track`: the accent at 8% in light, white at 5% in dark): the recessed track under Segmented and Tabs.

### Neutral

Light is periwinkle-tinted; dark is graphite, every grey with equal red, green and blue.

- **Canvas** (#eceef8 / #0b0b0b): the page, the sidebar, the top bar and the tab bar, scrollbar track.
- **Surface** (#ffffff / #141414): cards, the app window's controls, secondary buttons, popovers, sheets, the chosen segment.
- **Sunken** (#f0f1f8 / #1b1b1b): neutral chips, ghost hover, the plan card's cost band, the current settings row, the search key hint.
- **Line** (#e7e9f3 / #252525): hairline borders and row dividers, the progress bar's track rail in dark, the phone bar's rule.
- **Line Strong** (#d5d8ea / #313131): control borders, scrollbar thumb, the dark chosen-segment fill.
- **Text** (#121633 / #ededed): headings and primary copy.
- **Muted** (#4b5175 / #a3a3a3): body copy, labels, inactive nav, plain glyphs.
- **Faint** (#636889 / #878787): timestamps, captions, table headers, empty values, the "Not live yet" group, inactive tabs, state glyphs. In dark it holds 5.1:1 on a card, 4.8:1 on sunken.
- **Veil** (rgba(18,22,51,0.36) light, rgba(0,0,0,0.62) dark; `bg-veil`): the scrim behind sheets, the drawer and the Morph dialog. Nothing else.

### Data hues

Each has a text token, a `-fill` for bars and marks, and a `-soft` for chip fills and calendar day tones.

- **Gain** (#0a7a52 / #3fc08e, fill #19a672 / #2fb27f, soft #ddf3e8 / #10261c): positive P&L, kept rules. On a graphite card the text holds 8.0:1.
- **Loss** (#c22e3a / #f06a78, fill #e5484d, soft #fceced / #2b1517): negative P&L, broken rules and the days that broke the daily loss limit. On a graphite card the text holds 6.2:1.
- **Marigold, warn** (#9a5700 / #f0b44a, fill #e9a21a, soft #fcf1dc / #2a2010): mistakes: mistake chips, the "Costliest" chip.
- **Cyan, info** (#0a6f94 / #4db8e0, fill #1693be, soft #e0f1f8 / #0d2330): held in reserve: no surface uses it now that the Goals card is gone.

### Named Rules

**The One Brand Hue Rule.** Ultramarine is the only brand colour. Never use it for money, and never add another hue for brand, emphasis or decoration.
**The Accent Restraint Rule.** The accent marks what acts or is chosen: primary actions, the active state (current tab, nav glyph, selected segment), focus, and series 1 in a chart. It never fills a panel or a card, in either theme; the "Your plan" card is a neutral surface with the accent on its kept bar alone.
**The Neutral Graphite Rule.** Dark greys carry no hue: canvas, surfaces, lines and text each have equal red, green and blue.
**The Fixed Jobs Rule.** Marigold means a mistake, green and red mean signed money or kept and broken. A hue never takes a second job. Zero is uncoloured.
**The Neutral Error Rule.** Failures to load or save (storage unavailable, dashboard could not load, "Couldn't save") are neutral: sunken or faint, with a Warning or ArrowClockwise glyph in muted ink. Loss red is money and broken rules, never an error state, and marigold is mistakes, never a warning state.
**The Never Colour Alone Rule.** Sign and state also carry text or an icon (a leading sign in the figure, "Kept" and "Broken" for screen readers and the plan card's Kept and Broken labels, "Broke:" in a trade's rules cell). Long and Short are neutral words, never a result colour.

## Typography

**Face:** Instrument Sans (via `next/font/google`, `--font-keel`, `wdth` axis loaded, fallback system-ui, sans-serif). `font-sans` and `font-mono` both resolve to it, so `.font-mono` keeps its job (tabular figures, the number's role) in the same face. `tabular-nums` is applied to `.font-mono`, `.tnum` and every figure so columns align. The hero numeral also condenses to `font-stretch: 88%`.

**Character:** One humanist grotesque for words and data. Weight does the hierarchy (400, 500, 550, 600, 650) with negative tracking on display and figure sizes. No uppercase labels, no letter-spaced small caps.

### Hierarchy

The ramp as shipped. Half-pixel sizes are deliberate steps between 15 and 17, not accidents; use only values in this table.

| Role            | Size                                       | Weight | Leading          | Tracking | Use                                                          |
| --------------- | ------------------------------------------ | ------ | ---------------- | -------- | ------------------------------------------------------------ |
| Hero display    | clamp(40px, 3.125vw + 18px, 58px)          | 600    | 1.04             | -0.032em | Landing hero                                                 |
| Page display    | clamp(36px, 2.6vw + 16px, 52px)            | 600    | 1.06             | -0.032em | Page h1                                                      |
| Closing display | clamp(38px, 5vw, 52px)                     | 600    | 1.04             | -0.032em | Closing section                                              |
| Section heading | clamp(2rem, 1.6rem + 1.6vw, 2.625rem)      | 600    | 1.08             | -0.028em | Landing section heading                                      |
| Sub-headline    | 26px                                       | 600    | 1.15             | -0.03em  | Legal and read-page section h2, the auth h1                  |
| Hero numeral    | 88px, 104px from sm                        | 600    | 0.82             | -0.05em  | Adherence percentage on the Your plan card (stretch 88%)     |
| P&L figure      | 31px                                       | 600    | 1.15             | -0.04em  | Performance card net P&L                                     |
| App title       | 24px (20px on phones)                      | 650    | 1.2              | -0.035em | Top bar page title                                           |
| Cost figure     | 21px                                       | 600    | default          | -0.02em  | Cost band on the plan card                                   |
| Tracker figure  | 22px                                       | 600    | 1.25             | -0.03em  | Today's "x of y rules met" on the Progress tracker card      |
| KPI figure      | 22px marketing; 20px app, shrinking to fit | 600    | 1.25             | -0.03em  | Marketing KPI strip; app rolling KPIs via NumberTicker       |
| Card title      | 15px                                       | 600    | 1.375 (snug)     | -0.015em | Every dashboard and product card heading                     |
| Brand           | 19px                                       | 650    | default          | -0.03em  | Brand mark                                                   |
| Dialog title    | 17px                                       | 600    | snug             | -0.015em | Morph dialog title                                           |
| Accordion       | 17px                                       | 500    | default          | 0        | Accordion headings                                           |
| Lead            | 17px                                       | 400    | 1.6              | 0        | Section subhead (56ch)                                       |
| Reading body    | 16.5px                                     | 400    | 1.7              | 0        | Legal and changelog prose (68ch)                             |
| Body            | 15.5px                                     | 400    | 1.65             | 0        | Feature and pricing descriptions                             |
| UI              | 15px                                       | 500    | 1.6 in accordion | 0        | Buttons, accordion body, state body                          |
| Nav             | 14.5px                                     | 500    | default          | 0        | Header and menu links                                        |
| Row             | 13.5px                                     | 500    | default          | 0        | Sidebar rows, filter chips, rule text, tables, detail        |
| Control         | 13.5px                                     | 500    | default          | 0        | Segmented and tab labels                                     |
| Figure          | 13px                                       | 550    | default          | 0        | Row figures in the Rules table, tabular                      |
| Caption         | 12.5px                                     | 400    | default          | 0        | Card ranges, app window bar, metric tip text, row captions   |
| Label           | 12px (`text-xs`)                           | 400    | default          | 0        | KPI labels, chips (550), captions, table headers             |
| Side chip       | 12px                                       | 600    | default          | 0        | Long and Short                                               |
| Axis            | 11px (12px from sm)                        | 400    | 1rem             | 0        | Chart labels, search key hint, tab labels (500, 600 current) |

Also in use: 24px (`text-2xl`) for mobile menu links, 16px (`text-base`) default body and the large CTA, 14px (`text-sm`) for small CTAs and rule list rows, 11.5px for the "+n" chip. KPI figures in the app shrink with their tile: `min(20px, max(12px, (100cqi - trend) / chars / 0.56))`, so a long P&L never spills. Marketing KPIs use `clamp(15px, 3.6cqi, 22px)` in a wide strip.

### Named Rules

**The Tabular Numbers Rule.** Every number a trader reads uses tabular figures (`tnum` or `font-mono`, both the same face). Never set a figure with proportional digits where it sits in a column or beside another figure.
**The Figure Ramp Rule.** Big figures take their own sizes (88/104 hero numeral, 31 P&L, 21 cost, 22 tracker card, 20 KPI); everything else in `/app` is a row above. Do not mint a size for one surface.
**The Measure Rule.** Display headings cap at 11 to 20ch, ledes at 40 to 60ch, reading prose at 68ch.

## Layout

A single 1280px container (`max-w-[1280px]`) centred, with 20px gutters on phones and 40px from `sm`. The header is 64px. The landing hero is a two-column grid at `lg` (5fr text, 7fr product shot) with a floating trade detail card overlapping the window's lower left; on phones it stacks and the card sits in flow. Sections breathe with large vertical padding; inside product cards density is high.

The marketing KPI strip is container-query driven (`@container`): two by two when narrow, one row of four from `@md`, so figures scale with the strip, not the viewport. Touch targets are 44px: buttons are 44px high (38px for `sm`); on a phone the site header's menu button is a plain 44px glyph.

### Auth pages

Log in and Sign up live in their own route group (`src/app/(auth)`) with no site header nav and no site footer. The Keel mark sits centred at the top (80px row, 96px from `sm`); under it one centred column, 400px at most (the gutters on a phone), holds a white card: the title centred (26px/600), the one-line note centred (14px muted), the fields, the primary button and "Open the sample workspace" as a full-width secondary. The switch link ("New to Keel? Sign up") is centred under the card. The foot is one quiet line, Privacy and Terms, in faint. It reads the same at 390 and 1440, in light and dark.

### App shell

The app is a labelled **220px sidebar** (sticky, full height, no fill and no divider: it sits on the canvas) beside a column holding the **top bar** and the page. From `sm` to `lg` the sidebar is a 280px drawer from the left (Radix Dialog, veil, focus trap, closes on Escape, veil, link, route change or workspace switch, focus returns to the trigger) opened from a plain 44px menu glyph that leads the bar. Below `sm` there is no drawer and no menu button: the **tab bar** navigates (see Tab bar and More sheet). A skip link, "Skip to content", is the first tab stop: visually hidden until focused, then a fixed surface chip at top-left targeting `#content` (`main`, `tabIndex -1`).

- **Top bar:** sticky, canvas fill (no border from `sm`, no white strip), 20px side padding. Order from the left: menu, title (24px/650), the phone's sample badge, chips, then search, sample label, the Display menu and Import. There is no theme toggle. The source keeps that order at every width and nothing is reordered by CSS, so Tab reads the bar as the eye does. One row while the chips fit beside the title; where they do not (measured, not guessed) the chips lead a second row with the controls after them at its end.
- **Filter row:** leaves the title's row only when it overflows. Where even the second row is short, the chips scroll sideways inside their own scroller with an edge fade at whichever side has more past it. "Clear filters" (shown only while a filter is set) sits outside the scroller so it never fades or scrolls away.
- **Below `sm`:** one 56px row pinned to the top with a hairline beneath it. The title (20px/650) on the left with a quiet "Sample" badge beside it in the sample workspace (a 20px neutral pill, 11.5px/550); on the right, plain 44px icon buttons with no box: Filters (where the page has filters; a funnel, filled in accent ink with a count on its shoulder while any filter is set), search (it opens over the row, from the left gutter to the Display button) and Display (the unit's mark: "$", "%", "R", "ticks", "pips", "pts", or a crossed eye for Privacy). Import is in More and in the empty states. The page keeps clear of the tab bar at the foot: `main` pads by `--tab-bar` (56px plus `env(safe-area-inset-bottom)`, zero from `sm`), the trade log's bulk bar floats 16px above it, and on a phone `scroll-padding` keeps focus clear of both bars.
- **Dashboard grid:** page padding 20px, 16px gaps. Row 1 is the plan: the plan card (340px column from `xl`, 400px from 1440) beside the Rules card, stacked below. Row 2 is three cards (one column, two from `md` with Performance spanning, three from `xl`): Performance, Mistakes, Progress tracker. Row 3 is the recent trades card.
- **Plain pages** (module placeholders, error and empty states): a centred 520px column with an optional plain glyph (the state glyph), a 17px/600 title, 15px muted body and one action.

## Elevation & Depth

White cards on a tinted canvas, lifted by brand-tinted shadows. A hairline `line` border stays on every card so it holds its edge when the shadow is faint. In graphite dark a shadow barely reads, so depth is the surface lift (canvas #0b0b0b, card #141414, sunken #1b1b1b) and the hairline; the shadows that remain are plain black.

### Shadow Vocabulary

- **Card** (`--shadow-card`: `0 1px 2px rgba(18,22,51,0.05), 0 4px 10px -6px rgba(34,42,150,0.1), 0 18px 34px -22px rgba(34,42,150,0.38)` light; `0 1px 2px rgba(0,0,0,0.4)` dark): every dashboard card, the plan card, product card and the accordion.
- **Shadow** (`--shadow`: `0 1px 2px rgba(18,22,51,0.06), 0 24px 48px -20px rgba(34,42,150,0.28)` light; `0 1px 2px rgba(0,0,0,0.5), 0 24px 48px -20px rgba(0,0,0,0.75)` dark): the app window, the trade detail card, and the floating layers: popovers, the account menu, metric tooltips, search results, the Morph dialog.
- **Chip** (`--shadow-chip`: `0 1px 2px rgba(18,22,51,0.06), 0 2px 6px -2px rgba(34,42,150,0.1)` light; `0 1px 2px rgba(0,0,0,0.45)` dark): the chosen segment or tab, the current nav row, the account box, secondary site CTAs, the task checkbox.
- **Raised primary:** an inset 1px white highlight at 20%, `0 1px 2px rgba(31,39,140,0.4)` and `0 6px 14px -6px rgba(43,53,175,0.6)`; in dark the outer shadows go neutral black.
- **Controls:** a 1px `0 1px 1px rgba(18,22,51,0.04)` rest shadow on white controls (filter chips, app window controls, Pill). Recessed tracks (segmented, tabs) take an inset `0 1px 2px rgba(18,22,51,0.07)` (black at 0.35 in dark).

### Named Rules

**The Tinted Lift Rule.** Shadows are soft, diffuse and brand-tinted (neutral black in dark, where the lift does the work). Hard offset shadows never.

## Shapes

Three radii, by role: **chips 6px**, **buttons, inputs and inner panels 10px**, **cards and the app window 16px**. Documented exceptions, each by role and not to be extended: status and tag chips are pills (full radius), the brand tile is 8px, the side chip 7px, nav rows 9px, the recessed segmented and tab track 11px with an 8px chosen pill, popovers, menus and the account box 12px with 8px items. Circles are the button press ripple, the status pill dot, the checkbox ripple and the 24px hover disc behind the Kept mark; tracks are 3px-ended bars. Borders are 1px `line` (or `line-strong` on controls). Focus is a 2px ultramarine outline with 3px offset on every focusable element. Exceptions in the app, all 2px: offset 0 for text and date fields inside popovers (the 3px offset would meet the popover's edge; marked important to beat the global rule), offset 2 for table-row buttons, the metric tip and the checkbox, offset 1 for the Kept mark. The filter scroller is padded so rings are never clipped.

## Components

### Buttons

- **Shape:** 10px radius, 44px high (38px `sm`), 18px horizontal padding, 15px/500 label, 8px icon gap.
- **Primary (raised):** the accent lit from its top edge: a vertical gradient from the accent mixed 7% toward white down to the accent, an inner top highlight and a brand shadow beneath (see Elevation). Hover swaps the gradient outright for one a step deeper (accent to accent-hover); it presses 1px. Site link-buttons use the same material (`RAISED`, `CTA_PRIMARY`).
- **Secondary:** surface fill, text colour, 1px line-strong border; hover darkens the border to faint. Site secondary CTAs add the chip shadow and an accent border at 40% on hover.
- **Ghost:** transparent; hover sunken.
- **Press:** scales to 0.97 (down 180ms, up 120ms, out easing) and a 160px ripple at the pointer. Disabled at 50% opacity. Reduced motion removes both.
- **Site CTA sizes:** 38px in the header, 44px for page actions, 50px for the closing.

### Chips

- **Style:** 22px high, pill radius, 8px padding, 12px/550 text, 5px gap. Tones: neutral (sunken/muted), accent (accent-soft/accent-ink), gain, loss, warn (marigold), info (cyan). `mono` marks numbers and symbols (the same face, tabular).
- **Side chip:** 22px high, 7px radius, 12px/600, always neutral. Gain and loss colours are kept for money and for kept or broken, so a side never reads as a result.
- **Pill (site):** a white pill with a hairline and a 1px shadow for symbols, codes and times set on the canvas or a sunken panel, where a sunken chip would vanish. 22px (12px text) or 28px (13px text).
- **Status pill:** a chip with a 6px leading dot. The dot is a status marker, the only dot allowed.

### Segmented control and Tabs

Both share one look: a recessed track (accent at 8% over what it sits on, inner top shadow, 3px padding, 11px radius) holding 13.5px/500 labels. The chosen item is a white (surface) pill, 8px radius, one step bolder, with the chip shadow; in dark it fills `line-strong`. An invisible bold twin holds each option's width so choosing never nudges neighbours. Segmented is a radio group (state flips, no travel). Tabs are a roving-focus tablist whose single white fill slides and resizes to the chosen tab over 320ms on the glide curve. Arrow keys wrap, Home and End jump, selection follows focus.

### Cards

White (`surface`), 16px radius, 1px `line` border, `--shadow-card`. App cards pad 18px above, 20px at the sides, 16px below. The header (`CardHeader`) is a 28px row: a 15px/600 title, an optional 12.5px faint caption beside it, then a link, figure or controls at the far right. No glyph and no tile. `ProductCard` is the marketing copy of this card for product shots: title, optional quiet meta, and the title is a label, not a heading, so a shot never adds to the page outline.

### No icon tiles

There is no icon-inside-a-tinted-square anywhere: not in card headers, the drop zone, empty states, the account switcher, strategies, menus or the marketing site. The tile component is gone. What stays: the Keel logo tile, avatars, status pills and chips (they carry state), and the outcome, tag and mistake chips.

- **Card headers:** the title, with an optional muted caption.
- **A glyph that carries meaning** (a file's type, a strategy's own mark, a menu entry, a warning beside its words) is plain: `text-muted`, at text size, inline, nothing behind it.
- **State glyph** (`StateGlyph`): the one glyph an empty, error or drop state may carry, 28px, regular weight, faint, above the words.
- **Import drop zone:** a dashed `line-2` outline with no fill (accent outline and a faint accent wash while a file is over it), the state glyph, the headline, the line under it and the button.

### App window (the product shot)

The marketing illustration: a piece of the app on its canvas. 16px radius, 1px `line-strong` border at 80%, canvas fill, inset top highlight and `--shadow`. A bar (min 52px, wraps on phones) holds white controls (30px, 10px radius, hairline and rest shadow): an account select, a date range with a calendar glyph, optional meta at the right (the "Sample data" label goes here), and a recessed Gross/Net switch. Below sit the app's own white cards (`ProductCard`) fed by the typed sample dataset.

### Product shot components

- **ProductCard / CARD:** the card above for shots; `CARD` is the surface alone.
- **PLAN_SURFACE and CostBand:** the Your plan card for marketing, a white card like the rest. `CostBand` is the foot band naming what broken rules cost (sunken at 60%, a `line` hairline above, the figure in loss), with `bleed` set to the card's side padding.
- **TradeDetailCard:** a white card, 16px radius, `--shadow`, 16px padding: symbol and time, a two-column grid of values (13.5px/600), then a rules checklist with CheckCircle in `gain-fill` and XCircle in `loss-fill`.
- **RuleList:** rows on hairline dividers, 14px, with kept and broken marks as above; `bare` sets the rows straight on a card instead of in their own panel.
- **Pill, KpiStrip, TradeRows, equity chart, BreakdownChart:** see below.

### The plan card ("Your plan")

A neutral card like every other (surface, 16px radius, hairline, `--shadow-card`), in both themes. Contents on the Dashboard: a 28px header ("Your plan" at 15px/600, the range at 12.5px faint on the right); the adherence numeral at 88px (104 from `sm`), 600, tracking -0.05em, stretch 88%, in text ink, with a small raised "%" at 0.42em in faint, captioned by a metric tip ("of rule checks kept") in muted; a split bar of kept (the accent, the card's one accent touch) and broken (`loss-fill`) with "Kept" and "Broken" in faint under it; and a foot cost band (sunken at 60%, a `line` hairline above, bleeding to the card's edge, min 54px) with the "Broken rules cost" label in muted and the signed cost at 21px/600 in sign colour. The numeral counts up once in view; screen readers get the final string once; reduced motion and no-JS show the final figure.

### KPI strip (marketing)

Four figures (Net P&L, Win rate, Profit factor, Expectancy): 12px faint label over a 22px/600 figure counted up by NumberTicker, with hairline dividers between columns. A missing value reads "None yet" in faint.

### Trade rows

A tabular list on hairline dividers: muted time, symbol (600, tracking 0.01em), a neutral side chip, up to a few tags (mistakes first, warn tone), right-aligned signed net P&L (gain or loss text, 500). Grid `96px 64px 60px 1fr 92px` from `sm`; tags hide on phones.

### P&L sign colouring

Positive is gain, negative is loss, zero stays text colour. Applies to ticker figures, row nets and chart bars (`gain-fill` and `loss-fill`). Rule rows and trade checklists use CheckCircle in `gain-fill` and XCircle in `loss-fill`.

### Charts

- **Equity area (marketing and Performance card):** an accent line (2px on the marketing chart, 1.75px in the Performance card, rounded joins, non-scaling stroke), an accent area gradient (30% at the top, 11% at 55%, 0 at the foot), a dashed `line-strong` hairline at the starting value ("2 4" dash), and a ringed end dot (surface fill, accent stroke; HTML in the card so a stretched viewBox never makes it an oval). The line draws in (`draw`) and the area and dot fade after it; reduced motion shows them finished. The equity line is accent because it shows the account, not a sign.
- **Rolling KPI sparkline:** `Sparkline variant="line"`: the line alone, 1.5px accent at 85% opacity, 56 by 24 viewBox, `h-6 w-12` beside each app KPI figure (win rate, profit factor, expectancy). Each point is a rolling window of the last 20 closed trades (or an eighth of the range, if more), at up to 24 evenly spaced points; a range with no more closed trades than one window has no line. Labelled for assistive tech ("Rolling n-trade win rate, from x to y") and as its hover title. Hidden in a narrow tile (container under 7rem), where the figure takes the room.
- **Breakdown bars:** `BreakdownChart` is a 220px area with a `line-strong` baseline; each slot holds a bar that slides up from the baseline (transform only), 6px top radius, max 56px wide, `gain-fill` or `loss-fill`, with a signed value above (11px, 12px from `sm`) and an axis label under. Bars reveal in order on first view; finished without JS or under reduced motion.
- **Cost bars (Mistakes card):** a 4px bar anchored at the right foot of each row, gradient from the fill to 18% transparent (`loss-fill` for negative cost, `gain-fill` for positive), 80% opacity, 100% on row hover.
- **Adherence track:** 6px, 3px ends, an accent-soft rail under a left-to-right accent gradient (accent mixed 78% with white up to accent).
- **Progress bars:** 6px on an `accent-soft` track (`line` in dark), 3px ends, filled with an accent gradient (accent mixed 78% with white up to accent). One component serves the tracker's tiles, rules table and dashboard card.
- **Heat grid (Progress tracker):** one square per scored day, five accent steps (`--hg0` to `--hg4`) by the share of rules met, blank for days that aren't scored. 22px squares 5px apart on a wide card, 14 and 4 narrow, 11 and 3 on the dashboard card. A keyboard grid with one tab stop; arrow keys page past the edge of the window. Each square's label reads "Tue 24 Nov, 4 of 8 rules met".

### Accordion

A card (surface, 16px radius, hairline, `--shadow-card`, 20px side padding, 24px from `sm`). One open at a time. Heading button 17px/500, 56px minimum, Phosphor Plus rotating 45deg when open and turning accent-ink, hover accent-ink. Panel animates `grid-template-rows` 0fr to 1fr; body 15px muted at 1.6 leading.

### Icons

Phosphor (`@phosphor-icons/react`), `aria-hidden`, always bare: nothing behind a glyph. No unicode or emoji icons.

**One weight:** regular, everywhere. Duotone is retired. **Fill** is for state only: CheckCircle in `gain-fill` and XCircle in `loss-fill` (rule rows, the Kept mark, a trade's broken-rule line), the current tab's glyph and the Filters funnel while a filter is set. **Bold** only for marks at 13px and under (carets, a chip's close X).

**One size scale:**

| Size       | Use                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 12 to 14px | Carets, a chip's close X, marks inside 13px text                                                                                        |
| 16px       | Buttons, menu items, inline with 13.5 to 15px text, the settings nav                                                                    |
| 18px       | The sidebar, the top bar's controls, plain meaning glyphs in a row (a file's type, a strategy's mark beside a 17px name), close buttons |
| 20px       | Phone icon buttons (Filters, search), More sheet rows, the marketing menu sheet's rows                                                  |
| 22px       | The tab bar, the marketing phone menu button                                                                                            |
| 28px       | The state glyph (empty, error and drop states)                                                                                          |

Colour: `muted` for a plain glyph, `faint` for a state glyph or a not-live module, `accent-ink` for the current nav row and tab.

### App components

The app restyles the shipped primitives for density and adds the pieces below. All state is URL, token or Radix driven; none adds a hue outside the data jobs above.

#### Sidebar rows

Rows are 34px (44px coarse), 9px radius, 13.5px label, 11px gap, 10px side padding, 2px between rows, no tiles. Three looks:

- **Current** (`aria-current="page"`): a white (surface) pill with the chip shadow, 600 text, and an accent-ink glyph (regular weight).
- **Other modules:** no fill, 500 muted text and a regular muted glyph; hover takes surface at 60% and text colour.
- **"Not live yet":** faint 500 text, glyph at 70% opacity, hover to muted. These sit under a faint 12.5px/500 "Not live yet" group label. Settings sits at the foot of the column.

#### Filter chips and popovers

A chip is 32px high (44px coarse), 10px radius, 13.5px text, 12px left and 10px right padding, 1px border, a 1px rest shadow, max 208px with truncation, a 13px CaretDown. Idle: surface fill, `line` border, muted text; hover or open takes an accent border at 35% and text colour. Active (a filter is set): the leading glyph shows in accent-ink. **No trades in the workspace:** the chip keeps its tab stop but is dashed, faint, transparent, `aria-disabled`, and opens nothing; a note is attached by `aria-describedby`. While the page loads the same chip is inert and disabled.

Popovers are Radix Popover: 256px (300px for the date pair), 12px radius, `line` border, `--shadow`, opening with a 240ms drop (`pop-in`) and leaving as the tooltip does. Enter or Space opens, Escape closes, focus returns to the chip. A footer holds a ghost "Clear" action in accent-ink 13px/600, disabled while nothing is set. Single choices are native radio rows, multiple choices native checkbox rows (36px, 44px coarse, accent-coloured control, 8px radius). Text and date fields are 36px with an 8px radius; focus inside a popover sits at offset 0.

#### Account switcher

A 52px box on the canvas: surface fill, `line` border, 12px radius, chip shadow, 12px left padding, the workspace name 13.5px/600 over an account summary 12px faint, and a 14px CaretUpDown. No glyph: the words are the identity. It opens a Radix menu the width of the trigger (min 240px, 12px radius, `--shadow`): a "Workspace" radio group (picking one switches and clears account, strategy and tag filters), then "Accounts" check items ("All accounts" first, then live accounts, then an "Archived" group), "Manage accounts", and on desktop an **"Appearance"** radio group (System, Light, Dark; the menu stays open so the switch is seen). Accounts toggle in place and the menu stays open. A Check indicator in accent-ink marks the selection. If storage fails to open, the box becomes a neutral button reading "Workspace unavailable" over "Try again" with a plain 16px ArrowClockwise at its end; it reloads the page.

#### Tab bar and More sheet

Below `sm` the app navigates from a bar fixed to the bottom edge (`TabBar`, `nav` named "Main"): canvas fill, a `line` hairline above, and `env(safe-area-inset-bottom)` padding under it. Five equal tabs: Dashboard, Trades, Calendar, Reports, More. A tab is a plain 22px glyph over an 11px label, 56px tall, no pill, box or shadow behind it; inactive tabs are `faint` (500), the current one `accent-ink` (600) with its glyph filled. Links carry the global filters as the sidebar's do. **More** is a button (current when the page is one it holds) that opens a sheet from the bottom edge (surface, `max-h-[88dvh]`, 16px top corners, `line` top border, `--shadow`, over the veil; focus lands on its "More" title and returns to the tab on close; it closes on Escape, the veil, a link, a route change or a workspace switch). The sheet holds the workspace and account switcher (without its Appearance group), then 48px rows with a plain 20px muted glyph: Strategies, Notebook, Import, Prop firms, Settings; a faint "Not live yet" group of the four modules that are not live; and an Appearance row with the segmented System, Light and Dark.

#### Appearance setting

System, Light and Dark, System by default, saved as `UserPrefs.appearance` (no migration: unset reads as System). Shown as a Segmented control in Settings, Profile (after Base currency, with "System follows your device's setting." under it) and in the More sheet, and as a radio group at the foot of the desktop workspace menu. A choice applies at once (`data-appearance` and `data-theme` on `<html>`, mirrored to `keel-appearance`) before the save lands. The marketing site follows the same mirrored choice, or the device.

#### Gross/Net segmented control

The shared Segmented radio group, with two app props: `coarseTargets` makes each option at least 44px high on coarse pointers (otherwise it stays 28px), and `disabled` (no trades) shows the control faint, keeps it in the tab order, marks it `aria-disabled` and changes nothing. Gross and Net are a user preference, saved; a pending change shows at once. The progress tracker ignores it and is always net.

#### Expanding search (HorizonX)

At rest a 34px icon button (40px below `sm`; 44px coarse): surface fill, 1px `line`, 10px radius, 18px magnifier. On focus the field grows over `--dur-glide` (320ms, glide curve) as an overlay, so the bar never reflows: leftward from `sm`, anchored right; below `sm`, where it starts its row, rightward across the whole row inside the gutters; reduced motion keeps it still. Hover and focus take an accent border at 35%, focus adds the chip shadow. An ARIA combobox with a listbox of results (36px rows, 8px radius, sunken on the active row, 13.5px text, 12px faint detail on the right; panel 12px radius, `--shadow`); a faint `kbd` hint shows the shortcut (⌘K on Mac, Ctrl K elsewhere, which focuses the field) while empty and focused. Arrow keys move, Enter picks, Escape clears and returns focus.

#### Metric tip (HorizonX Signal Tooltip)

Every metric label is a button with a dotted underline that is transparent at rest and shows `faint` on hover and focus, `cursor: help`. Hover, focus and tap open its definition in a Radix tooltip (max 280px, 12.5px/500 muted, 10px radius, `line` border, `--shadow`) that rises 6px while scaling from 0.92 over 240ms; Escape closes. On the hero the label is white and its underline and focus ring go white. On coarse pointers the hit area is 44px high and extends 8px each side; keep at least 8px between a tip and any adjacent control so the areas never overlap. Never place one inside another button.

#### Morph dialog (HorizonX)

The rule and mistake drill-down. A Radix Dialog whose panel grows from the row that opened it (FLIP from the opener's rect over `glide`, closes back over `exit`; opacity only under reduced motion). 760px max, 80dvh max, 16px radius, 1px `line`, `--shadow`, over the veil. Header: 17px/600 title, 13px muted description, 44px close button; body scrolls. Focus is trapped and returns to the `returnFocus` element, which is the opener or, if it is gone, the card's fallback focus target. The trade list is the snapshot taken at opening, so a regraded trade stays put while the figures behind it update.

In a rule's drill-down the first column is **Kept**: a native checkbox visually hidden over a 24px disc holding a gain CheckCircle (kept) or a loss XCircle (broken) that cross-fade and scale over 240ms. Space or a click regrades the trade; it flips at once and reverts with a neutral "Couldn't save. Try again." notice (sunken, 10px radius) if the save fails. The sr-only text says Kept or Broken.

#### Task checkbox (HorizonX)

Built and tested, not yet used. Reserved for Plan 5 review checklists. A visually hidden native checkbox in its label; an 18px box, 6px radius, `line-strong` border and chip shadow that fills `gain-fill` over 240ms on the glide curve (no overshoot) with a drawn white check; a soft gain disc that grows and fades on false-to-true only. 44px target on coarse pointers.

#### Dashboard cards

Every card follows Cards above: a plain title, no tile.

- **Plan.** Two columns from `xl` (340px plan card, 400px from 1440): the plan card (see The plan card) beside the **Rules card**, a white card holding a table with 36px rows on hairline dividers that stop at the content edge while the hover fill reaches 8px past it; columns Rule, Kept, Adherence (with the percentage) and Cost when broken, sorted by cost with an accent arrow. Rule text is 13.5px/500; Kept reads "x of y" at 13px/550, tabular, with a faint "of". Adherence is the 6px accent track beside the percentage, which never displays 100% or 0% unless exact (it gains one decimal short of it). Cost is signed, gain or loss text; "none" in faint when nothing broke. The costliest broken rule, first in cost order and negative, carries a warn "Costliest" chip. A rule that was broken opens its trades; the whole row is the target, the left button is the keyboard's way in. Five rules show, with "Show all n rules" in accent-ink. Column widths: Kept 92px (100 from 1440), Adherence 150px (180 from 1440; 52px, percentage only, below `sm`), Cost 128px (140 from 1440; 100px below `sm`); below `sm` Kept hides and the track moves under the rule text. With no graded trades the plan is one card: its header, "No graded trades in this range." and a muted line.
- **Mistakes.** Rows 35px: a warn-toned mistake name, "n trades" in faint, signed cost, costliest first, each with a cost bar at its foot (see Charts); each row opens its trades.
- **Progress tracker card.** The history grid, today's score as "x of y rules met" (0 of 0 on a non-trading day) over a progress bar, an "Open tracker" link that keeps the account selection and range, and a "Today's checklist" button to the day page. No caption line; while loading it shows a skeleton and no figures. The tracker is **always net**, in the base currency.
- **Performance.** The P&L at 31px/600 counted up by the ticker with its metric tip, the equity area (see Charts) from the starting balance through each trading day's close, then a three-column strip under a hairline: win rate, profit factor, expectancy, each a 12px faint metric-tip label over a 20px/600 figure with its rolling sparkline, columns divided by hairlines; missing values read "None yet". The header shows the start and end balance in faint, tabular.
- **Recent trades.** A table of the newest closed trades with columns Time, Symbol, Side, Strategy, P&L, Rules at 13.5px, rows on `line` at 70% that lift to sunken at 60% on hover. The instrument is written in words: "TSLA 370 Put" with the root in 600 and the contract muted, its expiry faint beside it ("20 Nov"), futures as "ES Dec 26"; the title keeps the traded symbol. Time shows the date muted and the clock time in 600. Where the table folds the time under the symbol (below `md`) the expiry is hidden so two dates never stack. Side uses the neutral side chip. Widths: Time 96px (112 from `xl`), Symbol 100px (128 from `md`, 176 from `xl`), Side 78px, Strategy 128px (144 from `lg`, 180 from `xl`, 272 from 1440), P&L 92px (104 from `sm`); **Rules flexes** and from `xl` every row is one 34px line. Strategy cells carry a warn chip for the first mistake and a neutral "+n" chip for the rest. Rules cell: "n of m kept" muted with a `gain-fill` mark, "Not graded" in faint, or a 14px `loss-fill` XCircle with a loss "Broke:" and the rule text, plus a "+n" loss chip. The "+n" chip sits inline after the rule text from `xl`, and under the text below it, where the rule text clamps to two lines (one line, truncated, from `xl`). Below `sm` Side and Strategy hide.

#### Plan 5 components

Recorded from the shipped code in `src/components/app/**` and `src/components/ui/**`. Token names here are the Tailwind names from `src/app/globals.css`: `surface-1` (the white card fill, "surface" above), `line` and `line-2` (the strong hairline, "line-strong" above), `sunken`, `faint`, `accent-ink`, `accent-soft`, `gain-fill`, `loss-fill`, `warn-soft`, `info-fill`, `veil`. Radii are `rounded-chip` 6px, `rounded-control` 10px, `rounded-card` 16px, with the role exceptions in Shapes.

##### Filter bar, active chips, More filters, unit notice

- **Bar chips** are the filter chips above. Filters the top bar has no chip for (weekday, time, duration, size, R, outcome, rating and the like) appear as **active-filter chips** in a row above the log (`ActiveFilters`, `aria-label="Other filters in use"`): 32px high (44px coarse), `rounded-control`, `line` border, `surface-1` fill, 13.5px/600 text with a 1px rest shadow, the label truncating, then a 28px close button (44px coarse) with a 13px bold X, `aria-label="Clear <label>"`, muted, sunken on hover. A link from a report arrives with these set, so they show where its count comes from.
- **More filters** is a button at the end of the filter row (a SlidersHorizontal glyph, "More filters", a count chip when any advanced filter is set). From `md` it opens a Radix popover; below `md` it opens a bottom sheet. Inside, choices are pill toggles over native checkboxes (32px, 44px coarse, `line` border, full radius; checked takes `accent-soft` fill, `accent-ink` 13px/600 text and an accent border at 35%) and single choices are a Segmented control with an "Any" option under a 12px faint legend. Ranges are number or date pairs with a ghost "Clear" in `accent-ink`.
- **Phone:** below `sm` the chips collapse into one "Filters (n)" button (44px, funnel glyph, count chip). It opens a sheet from the bottom edge: `fixed inset-x-0 bottom-0`, `max-h-[88dvh]`, top corners 16px, `line` top border, `--shadow`, over the `veil`. The header holds a 15px/600 title and a 44px close; the body scrolls. Each filter is a row at least 48px high showing its name (72px column, 14px/600) and what it is set to (13.5px, `text` and 600 when set, `faint` when not) with a caret; a row opens in place, a choice applies at once, and a "Clear <name>" ghost sits under a set row. More filters is the last row. Focus returns to the button on close.
- **Unit notice:** one quiet line under the top bar of every page the global filters drive (Dashboard, Trades, Calendar, Reports, Compare). It is a polite live region, silent under Dollar, Percentage and Privacy and when the unit keeps every trade. Otherwise one 12.5px `faint` sentence, "Ticks counts futures trades only, so 12 trades are left out.", with an `accent-ink` 600 "Switch to Dollar" button beside it (44px coarse). The number carries a thousands separator.

##### Summary strip

The Trades page's `SummaryStrip`: a card (see Cards) with 20px side padding and 16px vertical padding, holding a grid of figures over the closed trades in the filters: closed count, P&L (with a 32 by 16 running sparkline beside the label), win rate, profit factor, expectancy.

- **Figure:** a 12.5px `faint` MetricTip label, a 22px/600 figure with -0.02em tracking, tabular, never wrapping, then a **secondary line** at 12.5px `faint`. P&L reads "after $1,204.00 fees" (or "before" under Gross); trades reads "closed" or "closed, 3 still open"; win rate reads "12 won, 2 breakeven, 5 lost" with each count keeping its word; profit factor reads "Avg win/loss 1.42" over a second line "$310.00 / -$218.00". Only P&L and expectancy take sign colour. An absent figure is "None" at 15px/500 `faint`.
- **Columns:** two on phones, three from `sm`, five from `lg`; from 1360px the note column sits at the end as a sixth, 236px, behind a hairline. Figures are divided by a `line` hairline from `lg`.
- **Phone 2 by 2:** below `sm` the strip shows four figures in two rows, in the order P&L, win rate, profit factor, closed trades. Expectancy is left out. Net leads because it is the first thing read.
- **Note:** "Figures cover the closed trades in your filters, 1-20 Nov." plus, when it applies, how many trades in other currencies are left out, then an `accent-ink` "Hide summary" button. The strip is the only place this sentence lives.

##### Two-line phone rows

Below `sm` (the `usePhone` hook, 640px) a list that is a table on desktop becomes a list of **two-line rows**. A row is at least 60px high, with a `line` at 70% hairline above every row but the first.

- **Line one:** the instrument (14px, root in 600) and the time (12.5px muted) on the left, the signed net (14px, tabular, sign colour) on the right, baseline aligned.
- **Line two:** 12.5px muted facts at 12px gaps: side as a plain word, R, the rules cell, and a tag count chip when the trade has tags.
- **Row:** one link to the detail, `active:bg-sunken/60`, focus ring inset by 2px. A selected row takes `accent-soft` at 70%. Where rows are selectable the checkbox sits beside the link, not inside it.
- **Used by:** the trade log (`PhoneRows`), the Dashboard's open positions (`sm:hidden` list beside the `max-sm:hidden` table) and Settings, Accounts (name and balance on line one, status chips and counts on line two).
- **The rule:** no stacked desktop tables on phone. A table is never squeezed, scrolled sideways or folded into stacked cells below `sm`; it is replaced by two-line rows that carry the same facts, with the same link and the same figures.

##### Report cards

Every report section is a card (see Cards) with a 28px header: a 15px/600 title, a 12.5px `faint` caption ("By week, 1-20 Nov"), and controls at the right. No tile.

- **Chart card header:** the **Expand** action sits at the right of the header, in a slot (`useExpandSlot`) the chart portals into. It is a 28px ghost button (44px coarse), `rounded-control`, 12.5px/500 muted, an ArrowsOut glyph at 14px, `aria-haspopup="dialog"`, `aria-label="Expand chart"`. Where a chart has no header slot, Expand sits above the plot.
- **Expanded-chart dialog:** a `MorphDialog` with `size="full"` (inset 12px, 24px from `sm`, `rounded-card`, `line` border, `--shadow`, over the `veil`) that grows from the Expand button and returns focus to it. The plot is 1.8 times the card's height and re-fits to the dialog; a chart with several bands scrolls inside. Under reduced motion the plot's own transitions are off so the fit measures the final size.
- **Chart series treatment:** series 1 is `accent`, series 2 is `muted` (ink), series 3 is the accent mixed 55% into `surface-1` and **drawn dashed** (`5 4`) so it reads apart without colour. A bar series that is signed money keeps `gain-fill` and `loss-fill`. Chart series never take cyan or marigold. The legend swatch matches the series.
- **"+ Metric" popover** (Performance report): a trigger chip (30px, 9px radius, `line-2` inset ring, muted 13px/500, a bold Plus at 14px, "Metric"; 44px coarse) opening a Radix popover, `min(100vw - 24px, 640px)` wide, `max-h-[min(72dvh,30rem)]`, `rounded-control`, `--shadow`. A fixed search field sits on top (36px, a 15px magnifier, "Search metrics"), then a scrolling body of **groups**: each a 12.5px/600 muted heading and a two-column grid from `sm` of rows (40px, 44px coarse) holding a checkbox in `accent` and the metric's MetricTip label. A metric past the limit of three is disabled and faint, and says why through `aria-describedby`. No match reads `No metric matches "x"` in a status line.
- **Two chart slots (Performance):** two report cards side by side from `lg` up (equal halves, a 16px gap), stacked below. Each is its own `section` named "Chart 1" or "Chart 2" and holds up to three metrics (the cap is per slot), its own Group by, Expand (header right) and a ghost "Remove" beside it. A removed slot leaves a dashed `line-2` placeholder with an "Add chart" button in its place; the last slot has no Remove. The period table under them follows the first slot left and is titled "By week, chart 1". On Overview the cumulative and daily P&L cards sit side by side from `xl` up, 280px plots, stacked below.
- **Chosen-metric chips:** each chosen metric is a row in a bordered list (`rounded-control`, `line` border, dividers at 60%): the metric name at 13.5px/500, a **Bar/Line** Segmented, a **Period/Running** Segmented (absent for a metric that is already a running total), and a 28px remove button with a 13px bold X. The Breakdown reports use the compact form (`MetricChips`): a 30px chip, 9px radius, with a chart-type mark in `accent`, the name, and a remove button; pressing the chip flips bars and line.
- **Column chooser:** a "Columns" trigger (30px, `rounded-control`, `line` border, hairline shadow, Columns glyph in `faint`) opening a 240px popover (12px radius, `--shadow`, `pop-in`): a checkbox list at 36px rows (44px coarse, 8px radius, sunken on hover; an unchecked name is muted) and a footer under a hairline with "Reset to default" in `accent-ink` 13px/600. It changes nothing but the table's visible columns, and the choice is saved.
- **Highlights list:** under a breakdown, past a hairline, a `ul` named "Highlights" of 13px lines: a `faint` label ("Most active", "Best win rate"), the bucket in 600 text, and a muted tabular fact ("62% won, 18 trades"). A highlight with nothing to show reads "None".
- **Report bucket links:** a bucket's name (a symbol, a weekday, a strategy, a month) is a link to its trades in the log, with the report's filters carried and `prefetch` off. It is plain text with a hover underline, `aria-label="<name>, open 14 trades in the trade log"`, a 44px target on coarse pointers. A bucket with no link (no value to bucket by) is plain text. The link is never a button and never coloured as a link.
- **Choose figures dialog:** the Overview's figure choice is a `MorphDialog` with a **scroller and a fixed footer**. The body (`min-h-0 flex-1 overflow-y-auto`, 20px side padding) holds fieldsets in two columns from `sm`, each with a 13px/600 legend and tick rows that show the figure's value now ("None" when empty). The footer (`flex-none`, `line` top border, `surface-1`) holds "Show all" as a left ghost, then "Cancel" (secondary) and "Save" (primary). A failed save shows a loss-toned alert line above the buttons.

##### Calendar

- **Month grid:** seven columns and, from 600px of card width (a container query on the card, not the viewport), an eighth week-total column (76 to 112px). A cell is `rounded-[10px]`, 58px high (92px from 600px), 6px padding, filled by day tone: gain-soft with a gain-fill hairline at 28%, loss-soft with loss-fill at 26%, `accent-soft` for a flat day, `surface-1` with a `line` hairline for none. A 3px bar at the foot carries the tone. Today has a 1.5px accent ring at 45%; the selected day a 2px accent ring and the chip shadow. Hover lifts 1px (not under reduced motion). Weeks start on Sunday unless Settings > Trading says Monday (the column heads, the rows, the week totals, the week presets, the weekday reports and the Notebook's weekly recap, which is titled and keyed on the week's first day and found again under either setting, all follow it), so November 2026 has five rows, or six with Monday weeks. The month shows every one of its days: the page's date range does not clip it, so there is no muted out-of-range cell and no range note, and month navigation is free. The other filters still apply.
- **Figures in a cell:** the day number at 12.5px/600 top left, the first chosen stat at 12 to 14.5px/600 tabular in the tone's ink, the rest at 11.5 to 12px muted. There is no cap: the Stats shown menu ticks any number of the eight stats, and a cell stacks every chosen line in the order chosen, growing taller (the lines under the first wrap rather than truncate) while the grid row follows its tallest cell. Below 600px a cell shows **one compact figure** only: "+1.1k" in dollars, "+64t" in ticks, "+12.5p" in pips, "+3.5pt" in points, "+1.25R" in R, a percentage to one decimal. The suffix is part of the figure and never spaced.
- **Day panel:** at `xl` (1280px) and up it sits beside the grid; below that it is a bottom sheet that never opens by itself. A 15px/600 heading (no tile), the day's net at 30px/600 in tone, a three-column definition list under a hairline (12px faint terms, 15px/600 values; it lists every figure of the day, so every stat the cells can show), a by-exit-time strip, then the day's trades. A day with none says so in 14px muted.
- **Month KPI strip:** under the header, `border-y` `line`, two columns on phones and a wrapping row from `sm`, columns divided by hairlines: a 12.5px `faint` MetricTip label, a 19px/600 tabular figure, a 12px muted second line (truncating) and, where useful, a link. Figures are in the display unit; an absent one is "None".

##### Segmented controls, outcome chip, tag count chip

- **Segmented** is the shared control above. Every filter choice, report switch (Bar/Line, Period/Running, Day/Week/Month, Gross/Net) and settings choice uses it; none builds its own. Pass `coarseTargets` wherever it sits in a page's body so options reach 44px on touch.
- **Outcome chip** (`StatusChip`): the neutral chip reads Win, Loss or Breakeven, because they name a result and gain and loss ink belongs to the amounts. **Open** is the accent chip, the one state that is live.
- **Tag count chip** (`TagCountCell`): "3 tags" in a pill with tabular figures, **neutral** while the trade has only tags and **warn (marigold)** when any of them is a mistake. The names are in text for screen readers ("Tags, with a mistake: Early exit, FOMO"); a trade with none reads "None". A mistakes cell instead shows the first mistake in a warn chip (88px max, truncating) and a "+n" chip for the rest.

##### Number and copy formatting

- **Thousands separators everywhere:** counts and amounts alike ("1,204 trades", "$12,480.00"), set through `formatCount` and the display formatter, never raw `toString`.
- **Unit suffixes** go with the figure, unspaced: `%`, `R`, `t` (ticks), `p` (pips), `pt` (points). Money is signed with a leading `+` or `-` where sign matters; the minus on a chart axis is the true minus sign.
- **Empty values:** "None", per Empty values below, in `faint` at the figure's size.
- **Privacy:** hides every money figure and the ratios built from money amounts (profit factor, average win to loss, average daily win to loss), the way TradeZella hides its profit factor. A hidden amount reads `$•••` (sign kept); a hidden ratio reads `•••` with an sr-only "hidden ratio" (`RatioText`, `Display.ratio`), in the summary strip, Overview, the Dashboard card, strategies, report columns and matrices, Compare, the calendar day panel and the Performance series (readout, axis ticks and table). Counts, percentages, R, ticks, pips and points stay visible, and CSV files keep real values.
- **Numeric ranges are written "a to b":** "$100 to $500", "5 to 10 trades", "1m to 5m", "26 to 100". No hyphen, en dash or em dash between the ends. **Date ranges keep the hyphen:** "1-20 Nov", "16-20 Nov", "10-15 Nov 2026" (ruling E122), in the range caption and the filter chip.
- **Copy has no em or en dashes**, anywhere in the app.

#### Empty and error states

- **No trades** (empty workspace): a ghosted "Your plan" preview (rule rows with empty tracks and no numbers, the last row fading out) captioned "Your rules and what breaking them costs will show here.", then the title, one line of body, Import and "Open the sample workspace". Chips are dashed and inert.
- **No matches** (trades exist, the filters leave none): the state glyph, "No trades match these filters." and a single "Clear filters" button. Chips stay live.
- **No closed trades:** the state glyph, "No closed trades yet." and a short line saying open positions count once they close. When filters are set and hold only open trades, the title is "No closed trades in these filters yet." with a single "Clear filters" button.
- **Errors:** the state glyph (Warning), neutral copy, a secondary "Try again". Never loss red.
- **Loading:** a skeleton of row 1 and the three row-2 cards in sunken bars; no figures.

#### Sample label

While the sample workspace is active quiet words reading "Sample data" sit among the top bar's controls from `sm`; on a phone a small neutral "Sample" badge sits beside the title. Screen readers get "Sample data. Not a real account." from either.

#### HorizonX attribution

Commercial licence; each is rebuilt in Keel tokens, never copied wholesale.

- **Signal Tooltip** (MetricTip): kept the reveal (rise 6px, scale up from 0.92). Dropped the button cluster, tones and signal mark. The trigger is the metric's own label.
- **Morph Dialog** (drill-down): kept the shared-element morph from opener to panel and back. Dropped the looks, images, eyebrow, blur and spring. Rebuilt as a FLIP on Radix Dialog.
- **Expanding Search** (top bar search): kept the field that grows as it takes focus. Dropped the gradient, drop shadow and hover width. Added the ARIA combobox and listbox.
- **Task Checkbox** (reserved): kept the self-drawing check, the growing fill and the ripple (a soft disc). Dropped the fill's overshoot (it eases on the glide curve), the strike-through, gradient fill, drop shadow and foreign palette.
- **Number ticker, button press, Beacon Tabs glide, animated accordion:** as listed under Motion.

### Motion

Tokens in `src/lib/motion.ts`, mirrored as CSS variables. Several patterns are adapted from HorizonX (commercial licence): button press, number ticker, Beacon Tabs glide, animated accordion timing, and in the app signal tooltip, morph dialog, expanding search and task checkbox (see HorizonX attribution).

- **Enter** 240ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; **Exit** 160ms `cubic-bezier(0.4, 0, 1, 1)`; **Glide** 320ms `cubic-bezier(0.23, 1, 0.32, 1)` (`--dur-glide`, `--ease-glide`; also `--dur-enter` 240ms, `--dur-exit` 160ms); **Press** 0.97 scale, 180ms down, 120ms up. Colour, border and shadow transitions on controls run 200ms on the glide curve.
- **Hero entrance** (CSS, plays from first paint): `rise` 8px over 240ms; `rise-window` 12px over 400ms; `slide-in` from -16px over 320ms (opaque by 40%); marketing line `draw` and area `fade` 900ms. The Performance sparkline draws over 1.3s from 150ms and its area and dot fade in at 700ms.
- **App overlays:** `tip-in` (6px rise, scale from 0.92, 240ms enter curve) and `tip-out` (160ms) for tooltips; `pop-in` (4px drop, scale from 0.98, 240ms) for popovers and menus; the drawer slides from -100% over enter and out over exit; the Filters, More and day sheets rise from the foot the same way (opacity only under reduced motion); `check-ripple` 360ms.
- **Number ticker** counts 0 to value in 900ms once in view; screen readers get only the final string. The hero numeral counts on its own frames so its "%" can sit small beside it.
- **Breakdown bars** slide up from the baseline over 560ms, 50ms apart, once on first view.
- **TickIn rows** reveal with 110ms stagger, 8px rise, once on first view.
- **Reduced motion:** all animation and transition durations collapse to 0.01ms; ticker shows the final value; tabs, button, draws and bars skip movement; smooth in-page scroll is off. Without JS everything shows in its final state.

## Do's and Don'ts

### Do:

- **Do** use Keel Ultramarine (#2b35af) as the one brand hue, sparingly: primary action, the active state, focus, adherence bars and series 1.
- **Do** give each data hue its one job: marigold for mistakes, green and red for signed money and kept or broken.
- **Do** set every number with tabular figures, and colour only signed P&L green or red.
- **Do** use the three radii: 6 chips, 10 buttons and inner panels, 16 cards, and only the documented role exceptions beside them.
- **Do** put cards on the canvas as white surfaces with the card shadow and a hairline, the "Your plan" card included.
- **Do** show the product as a real app window built from live components, and label it "Sample data. Not a real account." wherever invented figures appear.
- **Do** write copy with commas, periods and colons. Use hyphens only inside words and in date ranges ("1-20 Nov").
- **Do** use Phosphor icons at 18px, with Motion durations and curves from `src/lib/motion.ts`.
- **Do** default Appearance to System, and design dark as the neutral graphite palette with its own tokens.
- **Do** head a card with its title alone; set a meaningful glyph plain, muted and at text size; give a state block at most the 28px faint state glyph.
- **Do** navigate a phone from the bottom tab bar (Dashboard, Trades, Calendar, Reports, More) and keep every page clear of it.
- **Do** centre the auth pages: the mark on top, one 400px column, the switch link under it, no site navigation.
- **Do** give every metric a MetricTip definition, keep 8px between a tip and adjacent controls, and keep the progress tracker net and in the base currency.
- **Do** open a rule's or a mistake's exact trades through the Morph dialog, and return focus to the opener.
- **Do** show loading failures neutrally, and show Long and Short as neutral words.
- **Do** keep every adherence figure honest: never 100% or 0% unless exact.
- **Do** give chart series one job each: series 1 accent, series 2 ink (`muted`), series 3 the accent tint, dashed. Marigold stays with mistakes, so a chart never takes it.
- **Do** replace a desktop table with two-line rows below `sm`, carrying the same facts, link and figures.
- **Do** keep a dialog's body in a scroller and its actions in a fixed footer (Choose figures, the expanded chart).
- **Do** set every number with a thousands separator and its unit suffix, write an absent value as "None", and write numeric ranges as "a to b" (date ranges keep the hyphen).
- **Do** keep the outcome chip neutral (Open is the accent) and the tag count chip neutral until a mistake is among the tags, then marigold.

### Don't:

- **Don't** add eyebrows, kickers or small-caps labels above headings.
- **Don't** use em or en dashes in copy.
- **Don't** add decorative dots, orbs, mesh or gradient backgrounds. The gradients that ship are materials, not decoration: the hero surface, the raised primary, the brand tile, bar and area fills. The status pill dot is a status, not decoration.
- **Don't** present sample data unlabelled, or invent real-sounding user names and figures.
- **Don't** build metaphor worlds (floors, tickets, stamps, ledgers, cockpits) or editorial serif display type.
- **Don't** add a second brand hue, spend ultramarine on money, or use green and red for anything but signed money and kept or broken.
- **Don't** use hard offset shadows, glassmorphism or side-stripe borders.
- **Don't** introduce font sizes outside the ramp above, or bring back Geist, Geist Mono or the cobalt (#2550e0) look.
- **Don't** use loss red for an error state, marigold for a warning state, or colour a side (Long or Short) as a result.
- **Don't** tint a "not live yet" module; its glyph stays faint.
- **Don't** put an icon in a tinted rounded square, anywhere. Logo tile, avatars and chips are the only filled marks.
- **Don't** fill a panel or card with the accent, in either theme.
- **Don't** give dark greys a hue: no navy or blue cast in canvas, surfaces, lines or text.
- **Don't** add a sun or moon toggle, a boxed hamburger, a phone drawer, or a stack of bordered controls in a phone header.
- **Don't** reach for a library tooltip, modal or search box that bypasses the HorizonX-adapted ones.
- **Don't** stack a desktop table's columns into cells on a phone, or scroll it sideways there.
- **Don't** give a chart series cyan or marigold, or tell series apart by colour alone: the third is dashed.
- **Don't** write a numeric range with a hyphen or dash ("$100-$500", "2-3"); write "$100 to $500", "2 to 3". A date range keeps its hyphen ("1-20 Nov").

## Empty values

One rule for a value that is not there, in every table, tile and chip. Never a dash, never a blank.

- **"None"**: a count or figure that is absent: no strategy on a trade, no rating, no profit factor because nothing lost, no net ROI, no realized R because no stop was set, an open trade's exit, a rule the plan does not have. Faint ink, the same size as the figures around it.
- **"Not set"**: a field the user left empty, as a placeholder or a read-only echo of one ("Not set" in the planned stop and target inputs).
- **"Not graded"**: a rule check that has no verdict yet. Only rule checks use it.

Two variants are retired: "None yet" (a figure that is absent says "None") and the stand-in hyphen "-". Words that explain what would fill the value go beside it, in the small line under it ("add a target for planned R"), not in the value.

### Hue jobs in tag and strategy colour

The tag-category palette is twelve named swatches (Marigold, Clay, Rose, Orchid, Plum, Olive, Bronze, Umber, Mauve, Slate, Graphite, Sand). It leaves out the four hues that have jobs, gain green, loss red, the ultramarine accent and info cyan, and the blends that sit beside them. Mistakes stays marigold. The picker names the colour, the hex is a secondary hint. Strategies carry no colour of their own: a strategy is its name, with its own glyph plain and muted beside it (the stored `tone` is kept for old data and ignored).

### Focus ring

`--focus-width`, `--focus-offset` and `--focus-radius` (2px, 3px, the 6px chip radius) theme `:focus-visible` everywhere: the ring is the accent colour, and an element with no radius of its own takes the 6px one so the ring is never a hard rectangle. An element with its own radius keeps it.

### Buttons

One `md` size app-wide, the top bar's Import: 34px high, 13.5px at weight 600, 44px on a coarse pointer. `sm` (30px) is for a button inside a card's row. A page shows one primary; "Add trade" beside Import is a secondary.
