---
name: Keel
description: A daylight, premium trading journal. Keel Ultramarine on a periwinkle canvas, white cards with brand-tinted shadows, Instrument Sans with tabular figures for every word and number.
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
  on-ultramarine-muted: '#c9ccf5'
  on-ultramarine-loss: '#ffb3b8'
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
  dark-bg: '#0c0e1c'
  dark-surface: '#151831'
  dark-sunken: '#1b1f3b'
  dark-line: '#262a4a'
  dark-line-strong: '#323760'
  dark-text: '#eceefb'
  dark-muted: '#aeb2d2'
  dark-faint: '#9095bb'
  dark-ultramarine: '#4c57dc'
  dark-ultramarine-hover: '#5c66e6'
  dark-ultramarine-soft: '#22285a'
  dark-ultramarine-ink: '#aeb4ff'
  dark-ultramarine-tint: '#2c336e'
  dark-gain: '#3fc08e'
  dark-gain-fill: '#2fb27f'
  dark-gain-soft: '#10291f'
  dark-loss: '#f06a78'
  dark-loss-soft: '#2e1620'
  dark-warn: '#f0b44a'
  dark-warn-soft: '#2d2210'
  dark-info: '#4db8e0'
  dark-info-soft: '#0e2533'
  veil: 'rgba(18, 22, 51, 0.36)'
  dark-veil: 'rgba(4, 5, 14, 0.66)'
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
  hero-surface:
    backgroundColor: '{colors.ultramarine}'
    textColor: '{colors.on-ultramarine}'
    rounded: '{rounded.card}'
  segmented:
    backgroundColor: '{colors.ultramarine-soft}'
    textColor: '{colors.muted}'
    rounded: '11px'
    padding: '3px'
  segmented-active:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '8px'
  icon-tile:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.text}'
    rounded: '8px'
    size: '28px'
  icon-tile-accent:
    backgroundColor: '{colors.ultramarine-soft}'
    textColor: '{colors.ultramarine-ink}'
  icon-tile-warn:
    backgroundColor: '{colors.warn-soft}'
    textColor: '{colors.warn}'
  icon-tile-info:
    backgroundColor: '{colors.info-soft}'
    textColor: '{colors.info}'
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

**Creative North Star: "Daylight Premium"** names a register, not a metaphor world. Keel looks like a premium product used in daylight: a periwinkle canvas, white cards that lift on brand-tinted shadows, one deep brand hue (Keel Ultramarine), and one family, Instrument Sans, whose tabular figures set every number. The trader's plan is the one coloured surface: an ultramarine "Your plan" hero. The product itself is the illustration: real-looking app windows made of the app's own cards, with labelled sample data, carry the marketing pages.

The whole product wears one world. The app (`/app/*`) and the marketing site share the same tokens, face, cards and product-shot components; the approved comp is `.impeccable/mocks/rebrand-app/c-daylight-premium.html`. The `:root` tokens and the app-scoped (`:has([data-surface='app'])`) tokens in `src/styles/theme.css` hold the same values, so a Radix portal or page background follows the app while one is mounted.

Light is the default regardless of OS. Dark is an explicit toggle (`data-theme="dark"` on `<html>`, saved as `keel-theme`, applied before first paint). It is a designed deep navy, not an inversion: its own surfaces, lifted accent, brighter data hues and neutral shadows, with the hero surface staying ultramarine.

Rejected, and recorded so they are not rebuilt: metaphor worlds (the earlier trading-floor tickets and stamps), dark mesh hero clichés, editorial serif display type, the earlier flat grey-and-cobalt Geist look (replaced by this system; do not bring it back), and anything that reads as AI-generated.

**Key Characteristics:**

- Periwinkle canvas, white cards, brand-tinted shadows; depth comes from the card shadow and a hairline.
- One brand hue: Keel Ultramarine. Data hues have fixed jobs: marigold for mistakes, cyan for goal progress, green and red for signed money and kept or broken.
- Instrument Sans for everything, with tabular figures wherever a number is read.
- Tight negative tracking on large type, generous leading on body.
- Motion is short and decelerating; it announces arrival and selection, then stops.
- The app (`/app`) is the same system at working density: a labelled sidebar on the canvas, a top bar, a "Plan vs actual" Dashboard led by the ultramarine "Your plan" hero. Its direction is the trader's own plan as the yardstick: adherence and the cost of broken rules lead, performance follows.

## Colors

A periwinkle-tinted neutral field, one ultramarine voice, three data hues with fixed jobs, and a green/red pair for money. Tokens live in `src/styles/theme.css` as CSS variables and are exposed to Tailwind in `src/app/globals.css` as `bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`, `warn*`, `info*`, `on-accent-*`, `veil`. Frontmatter names above are the descriptive aliases (`surface` = `--surface-1`, `line-strong` = `--line-2`, `ultramarine` = `--accent`, `ultramarine-tint` = `--accent-tint`).

### Primary

- **Keel Ultramarine** (#2b35af light, #4c57dc dark; `--accent`): the primary button, selection and caret, focus ring, adherence bars, the equity line, the brand tile and the hero surface. The brand's hue, which the money palette never uses.
- **Ultramarine Hover** (#1f278c light, #5c66e6 dark): primary button hover.
- **Ultramarine Soft** (#eeeffc light, #22285a dark): accent chip and accent tile fill, adherence rail, the segmented track's tint, hover wash on text actions.
- **Ultramarine Ink** (#2b35af light, #aeb4ff dark): text and glyphs on ultramarine-soft, links in cards, the current nav glyph.
- **Ultramarine Deep** (#1f278c both): the dark end of brand gradients.
- **Ultramarine Tint** (#dcdff8 light, #2c336e dark): text selection.
- **On Ultramarine** (#ffffff), **On Ultramarine Muted** (#c9ccf5) and **On Ultramarine Loss** (#ffb3b8): white, secondary text and the loss figure on the hero surface. The same in both themes, because the hero is.

### Neutral

- **Canvas** (#eceef8 / #0c0e1c): the page, the sidebar and the top bar, scrollbar track.
- **Surface** (#ffffff / #151831): cards, the app window's controls, secondary buttons, popovers, the chosen segment.
- **Sunken** (#f0f1f8 / #1b1f3b): neutral chips and tiles, ghost hover, the search key hint.
- **Line** (#e7e9f3 / #262a4a): hairline borders and row dividers, the goal track rail.
- **Line Strong** (#d5d8ea / #323760): control borders, scrollbar thumb, the dark chosen-segment fill.
- **Text** (#121633 / #eceefb): headings and primary copy.
- **Muted** (#4b5175 / #aeb2d2): body copy, labels, inactive nav and tabs.
- **Faint** (#636889 / #9095bb): timestamps, captions, table headers, empty values, the "Not live yet" group.
- **Veil** (rgba(18,22,51,0.36) light, rgba(4,5,14,0.66) dark; `bg-veil`): the scrim behind the mobile drawer and the Morph dialog. Nothing else.

### Data hues

Each has a text token, a `-fill` for bars and marks, and a `-soft` for chip and tile fills.

- **Gain** (#0a7a52 / #3fc08e, fill #19a672 / #2fb27f, soft #ddf3e8 / #10291f): positive P&L, kept rules, a reached goal.
- **Loss** (#c22e3a / #f06a78, fill #e5484d, soft #fceced / #2e1620): negative P&L, broken rules and the days that broke the daily loss limit.
- **Marigold, warn** (#9a5700 / #f0b44a, fill #e9a21a, soft #fcf1dc / #2d2210): mistakes: mistake chips, the Mistakes tile, the "Costliest" chip.
- **Cyan, info** (#0a6f94 / #4db8e0, fill #1693be, soft #e0f1f8 / #0e2533): goal progress: the weekly goal track and its percentage, the Goals tile.

### Named Rules

**The One Brand Hue Rule.** Ultramarine is the only brand colour. Never use it for money, and never add another hue for brand, emphasis or decoration.
**The Fixed Jobs Rule.** Marigold means a mistake, cyan means goal progress, green and red mean signed money or kept and broken. A hue never takes a second job. Zero is uncoloured.
**The Neutral Error Rule.** Failures to load or save (storage unavailable, dashboard could not load, "Couldn't save") are neutral: sunken or faint, with a Warning or ArrowClockwise glyph in muted ink. Loss red is money and broken rules, never an error state, and marigold is mistakes, never a warning state.
**The Never Colour Alone Rule.** Sign and state also carry text or an icon (a leading sign in the figure, "Kept" and "Broken" for screen readers and the hero's Kept and Broken labels, "Broke:" in a trade's rules cell). Long and Short are neutral words, never a result colour.

## Typography

**Face:** Instrument Sans (via `next/font/google`, `--font-keel`, `wdth` axis loaded, fallback system-ui, sans-serif). `font-sans` and `font-mono` both resolve to it, so `.font-mono` keeps its job (tabular figures, the number's role) in the same face. `tabular-nums` is applied to `.font-mono`, `.tnum` and every figure so columns align. The hero numeral also condenses to `font-stretch: 88%`.

**Character:** One humanist grotesque for words and data. Weight does the hierarchy (400, 500, 550, 600, 650) with negative tracking on display and figure sizes. No uppercase labels, no letter-spaced small caps.

### Hierarchy

The ramp as shipped. Half-pixel sizes are deliberate steps between 15 and 17, not accidents; use only values in this table.

| Role            | Size                                                  | Weight | Leading         | Tracking | Use                                                       |
| --------------- | ----------------------------------------------------- | ------ | --------------- | -------- | --------------------------------------------------------- |
| Hero display    | clamp(40px, 3.125vw + 18px, 58px)                     | 600    | 1.04            | -0.032em | Landing hero                                              |
| Page display    | clamp(36px, 2.6vw + 16px, 52px)                       | 600    | 1.06            | -0.032em | Page and auth h1                                          |
| Closing display | clamp(38px, 5vw, 52px)                                | 600    | 1.04            | -0.032em | Closing section                                           |
| Section heading | clamp(2rem, 1.6rem + 1.6vw, 2.625rem)                 | 600    | 1.08            | -0.028em | Landing section heading                                   |
| Sub-headline    | 26px                                                  | 600    | 1.15            | -0.03em  | Legal and read-page section h2                            |
| Hero numeral    | 88px, 104px from sm                                   | 600    | 0.82            | -0.05em  | Adherence percentage on the Your plan hero (stretch 88%)  |
| P&L figure      | 31px                                                  | 600    | 1.15            | -0.04em  | Performance card net P&L                                  |
| App title       | 24px (20px on phones)                                 | 650    | 1.2             | -0.035em | Top bar page title                                        |
| Cost figure     | 21px                                                  | 600    | default         | -0.02em  | Cost band on the hero                                     |
| Goal figure     | 22px                                                  | 600    | 1.25            | -0.03em  | Weekly net on the Goals card                              |
| KPI figure      | 22px marketing; 20px app, shrinking to fit            | 600    | 1.25            | -0.03em  | Marketing KPI strip; app rolling KPIs via NumberTicker    |
| Card title      | 15px                                                  | 600    | 1.375 (snug)    | -0.015em | Every dashboard and product card heading                  |
| Brand           | 19px                                                  | 650    | default         | -0.03em  | Brand mark                                                |
| Dialog title    | 17px                                                  | 600    | snug            | -0.015em | Morph dialog title                                        |
| Accordion       | 17px                                                  | 500    | default         | 0        | Accordion headings                                        |
| Lead            | 17px                                                  | 400    | 1.6             | 0        | Section subhead (56ch)                                    |
| Reading body    | 16.5px                                                | 400    | 1.7             | 0        | Legal and changelog prose (68ch)                          |
| Body            | 15.5px                                                | 400    | 1.65            | 0        | Feature and pricing descriptions                          |
| UI              | 15px                                                  | 500    | 1.6 in accordion | 0       | Buttons, accordion body, state body                       |
| Nav             | 14.5px                                                | 500    | default         | 0        | Header and menu links                                     |
| Row             | 13.5px                                                | 500    | default         | 0        | Sidebar rows, filter chips, rule text, tables, detail     |
| Control         | 13.5px                                                | 500    | default         | 0        | Segmented and tab labels                                  |
| Figure          | 13px                                                  | 550    | default         | 0        | Row figures in the Rules table, tabular                   |
| Caption         | 12.5px                                                | 400    | default         | 0        | Card ranges, app window bar, metric tip text, row captions |
| Label           | 12px (`text-xs`)                                      | 400    | default         | 0        | KPI labels, chips (550), captions, table headers          |
| Side chip       | 12px                                                  | 600    | default         | 0        | Long and Short                                            |
| Axis            | 11px (12px from sm)                                   | 400    | 1rem            | 0        | Chart labels, search key hint                             |

Also in use: 24px (`text-2xl`) for mobile menu links, 16px (`text-base`) default body and the large CTA, 14px (`text-sm`) for small CTAs and rule list rows, 11.5px for the "+n" chip. KPI figures in the app shrink with their tile: `min(20px, max(12px, (100cqi - trend) / chars / 0.56))`, so a long P&L never spills. Marketing KPIs use `clamp(15px, 3.6cqi, 22px)` in a wide strip.

### Named Rules

**The Tabular Numbers Rule.** Every number a trader reads uses tabular figures (`tnum` or `font-mono`, both the same face). Never set a figure with proportional digits where it sits in a column or beside another figure.
**The Figure Ramp Rule.** Big figures take their own sizes (88/104 hero numeral, 31 P&L, 21 cost, 22 goal, 20 KPI); everything else in `/app` is a row above. Do not mint a size for one surface.
**The Measure Rule.** Display headings cap at 11 to 20ch, ledes at 40 to 60ch, reading prose at 68ch.

## Layout

A single 1280px container (`max-w-[1280px]`) centred, with 20px gutters on phones and 40px from `sm`. The header is 64px. The landing hero is a two-column grid at `lg` (5fr text, 7fr product shot) with a floating trade detail card overlapping the window's lower left; on phones it stacks and the card sits in flow. Sections breathe with large vertical padding; inside product cards density is high.

The marketing KPI strip is container-query driven (`@container`): two by two when narrow, one row of four from `@md`, so figures scale with the strip, not the viewport. Touch targets are 44px: buttons are 44px high (38px for `sm`), the theme toggle goes from 34px to 44px on coarse pointers.

### App shell

The app is a labelled **220px sidebar** (sticky, full height, no fill and no divider: it sits on the canvas) beside a column holding the **top bar** and the page. Below `lg` the sidebar is a 280px drawer from the left (Radix Dialog, veil, focus trap, closes on Escape, veil, link, route change or workspace switch, focus returns to the trigger) opened from a 44px menu button that leads the bar. A skip link, "Skip to content", is the first tab stop: visually hidden until focused, then a fixed surface chip at top-left targeting `#content` (`main`, `tabIndex -1`).

- **Top bar:** sticky from `sm`, canvas fill (no border, no white strip), 20px side padding. Order from the left: menu, title (24px/650), chips, then search, sample label, Gross/Net, Import, theme. The source keeps that order at every width and nothing is reordered by CSS, so Tab reads the bar as the eye does. One row while the chips fit beside the title; where they do not (measured, not guessed) the chips lead a second row with the controls after them at its end.
- **Filter row:** leaves the title's row only when it overflows. Where even the second row is short, the chips scroll sideways inside their own scroller with an edge fade at whichever side has more past it. "Clear filters" (shown only while a filter is set) sits outside the scroller so it never fades or scrolls away.
- **Below `sm`:** three rows. The first (menu and title) is pinned to the top with a hairline beneath it; the chips, then a row of search, the sample label, Gross/Net, Import as an icon and the theme scroll away under it.
- **Dashboard grid:** page padding 20px, 16px gaps. Row 1 is the plan: the ultramarine hero (340px column from `xl`, 400px from 1440) beside the Rules card, stacked below. Row 2 is three cards (one column, two from `md` with Performance spanning, three from `xl`): Performance, Mistakes, Goals. Row 3 is the recent trades card.
- **Plain pages** (module placeholders, error and empty states): a centred 520px column with an icon tile, 16px/500 title, 15px muted body and one action.

## Elevation & Depth

White cards on a tinted canvas, lifted by brand-tinted shadows. A hairline `line` border stays on every card so it holds its edge when the shadow is faint. In dark the shadows go to plain black, because a blue shadow on a dark ground reads as a glow.

### Shadow Vocabulary

- **Card** (`--shadow-card`: `0 1px 2px rgba(18,22,51,0.05), 0 4px 10px -6px rgba(34,42,150,0.1), 0 18px 34px -22px rgba(34,42,150,0.38)` light; `0 1px 2px rgba(0,0,0,0.45), 0 18px 34px -22px rgba(0,0,0,0.8)` dark): every dashboard card, product card and the accordion.
- **Shadow** (`--shadow`: `0 1px 2px rgba(18,22,51,0.06), 0 24px 48px -20px rgba(34,42,150,0.28)` light; `0 1px 2px rgba(0,0,0,0.5), 0 24px 48px -20px rgba(0,0,0,0.75)` dark): the app window, the trade detail card, and the floating layers: popovers, the account menu, metric tooltips, search results, the Morph dialog.
- **Chip** (`--shadow-chip`: `0 1px 2px rgba(18,22,51,0.06), 0 2px 6px -2px rgba(34,42,150,0.1)` light; `0 1px 2px rgba(0,0,0,0.45)` dark): the chosen segment or tab, the current nav row, the account box, secondary site CTAs, the task checkbox.
- **Hero** (`--shadow-hero`: `0 2px 4px rgba(31,39,140,0.18), 0 22px 40px -18px rgba(31,39,140,0.55)` light; `0 2px 4px rgba(0,0,0,0.4), 0 22px 40px -18px rgba(43,53,175,0.55)` dark), plus an inset 1px white highlight at 18%: the ultramarine hero surface.
- **Raised primary:** an inset 1px white highlight at 20%, `0 1px 2px rgba(31,39,140,0.4)` and `0 6px 14px -6px rgba(43,53,175,0.6)`; in dark the outer shadows go neutral black.
- **Controls:** a 1px `0 1px 1px rgba(18,22,51,0.04)` rest shadow on white controls (filter chips, theme toggle, app window controls, Pill). Recessed tracks (segmented, tabs) take an inset `0 1px 2px rgba(18,22,51,0.07)` (black at 0.35 in dark).

### Named Rules

**The Tinted Lift Rule.** Shadows are soft, diffuse and brand-tinted (neutral black in dark). Hard offset shadows never.

## Shapes

Three radii, by role: **chips 6px**, **buttons, inputs and inner panels 10px**, **cards and the app window 16px**. Documented exceptions, each by role and not to be extended: status and tag chips are pills (full radius), icon tiles and the brand tile are 8px, the side chip 7px, nav rows 9px, the recessed segmented and tab track 11px with an 8px chosen pill, popovers, menus and the account box 12px with 8px items. Circles are the button press ripple, the status pill dot, the checkbox ripple and the 24px hover disc behind the Kept mark; tracks are 3px-ended bars. Borders are 1px `line` (or `line-strong` on controls). Focus is a 2px ultramarine outline with 3px offset on every focusable element. Exceptions in the app, all 2px: offset 0 for text and date fields inside popovers (the 3px offset would meet the popover's edge; marked important to beat the global rule), offset 2 for table-row buttons, the metric tip and the checkbox, offset 1 for the Kept mark. The filter scroller is padded so rings are never clipped.

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

White (`surface`), 16px radius, 1px `line` border, `--shadow-card`. App cards pad 18px above, 20px at the sides, 16px below. The header is a 28px row: an icon tile, a 15px/600 title, then the range or a link at the far right in 12.5px. `ProductCard` is the marketing copy of this card for product shots: tile, title, optional quiet meta, and the title is a label, not a heading, so a shot never adds to the page outline.

### Icon tiles

`IconTile`: a 28px square, 8px radius, one 17px duotone Phosphor glyph, decorative (`aria-hidden`). The glyph is one ink and its duotone layer is the same ink at 20%, so a tile reads as one hue in two strengths. Tones and jobs:

- `accent`: accent-soft fill, accent-ink glyph. Performance, plan, account, active product-menu entries.
- `warn`: warn-soft, warn. Mistakes.
- `info`: info-soft, info. Goals.
- `neutral`: sunken, text. Default, state blocks.
- `gain` and `loss`: soft fills, for signed or kept and broken marks only.
- `faint`: sunken, faint, duotone layer 0 (outline only). A module that is not live yet.
- `on-accent`: a translucent white tile (white at 14% with an inset white ring) on the ultramarine hero.

`bare` drops the fill. The tile recolours the glyph's `[opacity]` path.

### App window (the product shot)

The marketing illustration: a piece of the app on its canvas. 16px radius, 1px `line-strong` border at 80%, canvas fill, inset top highlight and `--shadow`. A bar (min 52px, wraps on phones) holds white controls (30px, 10px radius, hairline and rest shadow): an account select, a date range with a calendar glyph, optional meta at the right (the "Sample data" label goes here), and a recessed Gross/Net switch. Below sit the app's own white cards (`ProductCard`) fed by the typed sample dataset.

### Product shot components

- **ProductCard / CARD:** the card above for shots; `CARD` is the surface alone.
- **PLAN_SURFACE and CostBand:** the ultramarine hero for marketing. `PLAN_SURFACE` is the Your plan surface (below); `CostBand` is the foot band naming what broken rules cost, with `bleed` set to the surface's side padding.
- **TradeDetailCard:** a white card, 16px radius, `--shadow`, 16px padding: symbol and time, a two-column grid of values (13.5px/600), then a rules checklist with CheckCircle in `gain-fill` and XCircle in `loss-fill`.
- **RuleList:** rows on hairline dividers, 14px, with kept and broken marks as above; on the hero it reads white with `on-accent-loss`.
- **Pill, KpiStrip, TradeRows, equity chart, BreakdownChart:** see below.

### The hero surface ("Your plan")

The one coloured surface. `linear-gradient(155deg, #3440c2, #2b35af 45%, #232b98)`, 16px radius, white text, an inset top highlight and `--shadow-hero`. It is ultramarine in both themes, so its colours are literal brand values, not theme tokens. Contents on the Dashboard: a 28px header (an `on-accent` tile, "Your plan" at 15px/600, the range at 12.5px in `on-ultramarine-muted`); the adherence numeral at 88px (104 from `sm`), 600, tracking -0.05em, stretch 88%, with a small raised "%" at 0.42em, captioned by a metric tip ("of rule checks kept") in white at 85%; a split bar of kept (white at 92%) and broken (`on-ultramarine-loss`) with "Kept" and "Broken" under it; and a foot cost band (`rgb(10 14 70 / 0.22)`, top hairline white at 10%, bleeding to the surface edge, min 54px) with the "Broken rules cost" label and the signed cost at 21px/600, `on-ultramarine-loss` when negative. The numeral counts up once in view; screen readers get the final string once; reduced motion and no-JS show the final figure.

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
- **Goal tracks:** 6px on a `line` rail, 3px ends. The weekly net goal fills with a cyan gradient (info-fill mixed 70% with white up to info-fill) and turns solid `gain-fill` once reached.
- **Day grid (Goals card):** the daily loss limit as 32 columns of square cells, 2px gap, 1.5px radius: a kept day is `gain-fill` at 35%, a day that broke the limit is solid `loss-fill`, each with a title ("19 Nov, -$480.00, broke the limit"). The grid has an accessible label and the card's sentence says the same in words.

### Accordion

A card (surface, 16px radius, hairline, `--shadow-card`, 20px side padding, 24px from `sm`). One open at a time. Heading button 17px/500, 56px minimum, Phosphor Plus rotating 45deg when open and turning accent-ink, hover accent-ink. Panel animates `grid-template-rows` 0fr to 1fr; body 15px muted at 1.6 leading.

### Icons

Phosphor (`@phosphor-icons/react`), 18px typically, 13px for small carets, `aria-hidden`. No glyph or emoji icons.

- **Marketing:** regular weight, except fill for CheckCircle and XCircle; card headers use duotone tiles.
- **App:** duotone glyphs set in 28px tiles for card headers, state blocks and the account switcher. The sidebar sets 18px glyphs bare, regular weight, duotone only on the current row. Fill weight stays for state marks: CheckCircle in `gain-fill` and XCircle in `loss-fill` (rule rows, Kept mark, a trade's broken-rule line). Plain regular carets and close marks (CaretUpDown 14px, Check 16px, X 20px, List 20px) are allowed bare.

### App components

The app restyles the shipped primitives for density and adds the pieces below. All state is URL, token or Radix driven; none adds a hue outside the data jobs above.

#### Sidebar rows

Rows are 34px (44px coarse), 9px radius, 13.5px label, 11px gap, 10px side padding, 2px between rows, no tiles. Three looks:

- **Current** (`aria-current="page"`): a white (surface) pill with the chip shadow, 600 text, and a duotone accent-ink glyph.
- **Other modules:** no fill, 500 muted text and a regular muted glyph; hover takes surface at 60% and text colour.
- **"Not live yet":** faint 500 text, glyph at 70% opacity, hover to muted. These sit under a faint 12.5px/500 "Not live yet" group label. Settings sits at the foot of the column.

#### Filter chips and popovers

A chip is 32px high (44px coarse), 10px radius, 13.5px text, 12px left and 10px right padding, 1px border, a 1px rest shadow, max 208px with truncation, a 13px CaretDown. Idle: surface fill, `line` border, muted text; hover or open takes an accent border at 35% and text colour. Active (a filter is set): the leading glyph shows in accent-ink. **No trades in the workspace:** the chip keeps its tab stop but is dashed, faint, transparent, `aria-disabled`, and opens nothing; a note is attached by `aria-describedby`. While the page loads the same chip is inert and disabled.

Popovers are Radix Popover: 256px (300px for the date pair), 12px radius, `line` border, `--shadow`, opening with a 240ms drop (`pop-in`) and leaving as the tooltip does. Enter or Space opens, Escape closes, focus returns to the chip. A footer holds a ghost "Clear" action in accent-ink 13px/600, disabled while nothing is set. Single choices are native radio rows, multiple choices native checkbox rows (36px, 44px coarse, accent-coloured control, 8px radius). Text and date fields are 36px with an 8px radius; focus inside a popover sits at offset 0.

#### Account switcher

A 52px box on the canvas: surface fill, `line` border, 12px radius, chip shadow, an accent Wallet tile, workspace name 13.5px/600 over an account summary 12px faint, and a 14px CaretUpDown. It opens a Radix menu the width of the trigger (min 240px, 12px radius, `--shadow`): a "Workspace" radio group (picking one switches and clears account, strategy and tag filters), then "Accounts" check items ("All accounts" first, then live accounts, then an "Archived" group); accounts toggle in place and the menu stays open. A Check indicator in accent-ink marks the selection. If storage fails to open, the box becomes a neutral button with an ArrowClockwise tile reading "Workspace unavailable" over "Try again"; it reloads the page.

#### Gross/Net segmented control

The shared Segmented radio group, with two app props: `coarseTargets` makes each option at least 44px high on coarse pointers (otherwise it stays 28px), and `disabled` (no trades) shows the control faint, keeps it in the tab order, marks it `aria-disabled` and changes nothing. Gross and Net are a user preference, saved; a pending change shows at once. Goals ignore it and are always net.

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

Every card follows Cards above, with a tile in its tone.

- **Plan.** Two columns from `xl` (340px hero, 400px from 1440): the hero surface (see The hero surface) beside the **Rules card**, a white card holding a table with 36px rows on hairline dividers that stop at the content edge while the hover fill reaches 8px past it; columns Rule, Kept, Adherence (with the percentage) and Cost when broken, sorted by cost with an accent arrow. Rule text is 13.5px/500; Kept reads "x of y" at 13px/550, tabular, with a faint "of". Adherence is the 6px accent track beside the percentage, which never displays 100% or 0% unless exact (it gains one decimal short of it). Cost is signed, gain or loss text; "none" in faint when nothing broke. The costliest broken rule, first in cost order and negative, carries a warn "Costliest" chip. A rule that was broken opens its trades; the whole row is the target, the left button is the keyboard's way in. Five rules show, with "Show all n rules" in accent-ink. Column widths: Kept 92px (100 from 1440), Adherence 150px (180 from 1440; 52px, percentage only, below `sm`), Cost 128px (140 from 1440; 100px below `sm`); below `sm` Kept hides and the track moves under the rule text. With no graded trades the plan is one card: an accent tile, "No graded trades in this range." and a muted line.
- **Mistakes** (marigold tile). Rows 35px: a warn-toned mistake name, "n trades" in faint, signed cost, costliest first, each with a cost bar at its foot (see Charts); each row opens its trades.
- **Goals** (cyan tile). Goals are **always net** and shown only in the base currency, whatever Gross/Net says. Weekly net goal: label with metric tip and amount, "n% of goal" (floored in integer cents, so never 100% short of it) in info text or a gain "Reached" chip, the week's signed net at 22px/600, a 6px goal track (cyan, gain once reached). Daily loss limit: the same label, "Kept n of m days" with a gain "Kept", the day grid, and a sentence naming the latest broken day. "Edit goals" (or "Set goals", an accent-ink header link) turns the card into a form in place (Save and Cancel); **Escape cancels** (not while a save is in flight), and focus returns to the Edit button.
- **Performance** (accent tile). The P&L at 31px/600 counted up by the ticker with its metric tip, the equity area (see Charts) from the starting balance through each trading day's close, then a three-column strip under a hairline: win rate, profit factor, expectancy, each a 12px faint metric-tip label over a 20px/600 figure with its rolling sparkline, columns divided by hairlines; missing values read "None yet". The header shows the start and end balance in faint, tabular.
- **Recent trades.** A table of the newest closed trades with columns Time, Symbol, Side, Strategy, P&L, Rules at 13.5px, rows on `line` at 70% that lift to sunken at 60% on hover. The instrument is written in words: "TSLA 370 Put" with the root in 600 and the contract muted, its expiry faint beside it ("20 Nov"), futures as "ES Dec 26"; the title keeps the traded symbol. Time shows the date muted and the clock time in 600. Where the table folds the time under the symbol (below `md`) the expiry is hidden so two dates never stack. Side uses the neutral side chip. Widths: Time 96px (112 from `xl`), Symbol 100px (128 from `md`, 176 from `xl`), Side 78px, Strategy 128px (144 from `lg`, 180 from `xl`, 272 from 1440), P&L 92px (104 from `sm`); **Rules flexes** and from `xl` every row is one 34px line. Strategy cells carry a warn chip for the first mistake and a neutral "+n" chip for the rest. Rules cell: "n of m kept" muted with a `gain-fill` mark, "Not graded" in faint, or a 14px `loss-fill` XCircle with a loss "Broke:" and the rule text, plus a "+n" loss chip. The "+n" chip sits inline after the rule text from `xl`, and under the text below it, where the rule text clamps to two lines (one line, truncated, from `xl`). Below `sm` Side and Strategy hide.

#### Empty and error states

- **No trades** (empty workspace): a ghosted "Your plan" preview (rule rows with empty tracks and no numbers, the last row fading out) captioned "Your rules and what breaking them costs will show here.", then the title, one line of body, Import and "Open the sample workspace". Chips are dashed and inert.
- **No matches** (trades exist, the filters leave none): an icon tile, "No trades match these filters." and a single "Clear filters" button. Chips stay live.
- **No closed trades:** an icon tile, "No closed trades yet." and a short line saying open positions count once they close. When filters are set and hold only open trades, the title is "No closed trades in these filters yet." with a single "Clear filters" button.
- **Errors:** neutral tile (Warning), neutral copy, a secondary "Try again". Never loss red.
- **Loading:** a skeleton of row 1 and the three row-2 cards in sunken bars; no figures.

#### Sample label

While the sample workspace is active a neutral chip reading "Sample data" sits in the top bar (screen readers get "Sample data. Not a real account.").

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
- **App overlays:** `tip-in` (6px rise, scale from 0.92, 240ms enter curve) and `tip-out` (160ms) for tooltips; `pop-in` (4px drop, scale from 0.98, 240ms) for popovers and menus; the drawer slides from -100% over enter and out over exit; `check-ripple` 360ms.
- **Number ticker** counts 0 to value in 900ms once in view; screen readers get only the final string. The hero numeral counts on its own frames so its "%" can sit small beside it.
- **Breakdown bars** slide up from the baseline over 560ms, 50ms apart, once on first view.
- **TickIn rows** reveal with 110ms stagger, 8px rise, once on first view.
- **Reduced motion:** all animation and transition durations collapse to 0.01ms; ticker shows the final value; tabs, button, draws and bars skip movement; smooth in-page scroll is off. Without JS everything shows in its final state.

## Do's and Don'ts

### Do:

- **Do** use Keel Ultramarine (#2b35af) as the one brand hue, for primary action, selection, focus, adherence, the account's own line and the hero surface.
- **Do** give each data hue its one job: marigold for mistakes, cyan for goal progress, green and red for signed money and kept or broken.
- **Do** set every number with tabular figures, and colour only signed P&L green or red.
- **Do** use the three radii: 6 chips, 10 buttons and inner panels, 16 cards, and only the documented role exceptions beside them.
- **Do** put cards on the canvas as white surfaces with the card shadow and a hairline; keep the "Your plan" hero the only coloured surface.
- **Do** show the product as a real app window built from live components, and label it "Sample data. Not a real account." wherever invented figures appear.
- **Do** write copy with commas, periods and colons. Use hyphens only inside words.
- **Do** use Phosphor icons at 18px, with Motion durations and curves from `src/lib/motion.ts`.
- **Do** keep light as the default and design dark as the navy palette with its own tokens, the hero staying ultramarine.
- **Do** put card-header icons in 28px duotone tiles toned to the card's job: accent, marigold or cyan; outline-only faint when the module is not live.
- **Do** give every metric a MetricTip definition, keep 8px between a tip and adjacent controls, and keep goals net and in the base currency.
- **Do** open a rule's or a mistake's exact trades through the Morph dialog, and return focus to the opener.
- **Do** show loading failures neutrally, and show Long and Short as neutral words.
- **Do** keep every adherence figure honest: never 100% or 0% unless exact.

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
- **Don't** tint a "not live yet" module; its glyph stays an outline.
- **Don't** reach for a library tooltip, modal or search box that bypasses the HorizonX-adapted ones.
