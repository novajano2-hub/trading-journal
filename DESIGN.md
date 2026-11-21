---
name: Keel
description: A light, precise, pro-trading journal. One cobalt accent, Geist type, Geist Mono for every number.
colors:
  bg: '#f6f7f9'
  surface: '#ffffff'
  sunken: '#eff1f4'
  line: '#e3e6eb'
  line-strong: '#d3d8df'
  text: '#0f1218'
  muted: '#4f5865'
  faint: '#687080'
  cobalt: '#2550e0'
  cobalt-hover: '#1e44c4'
  cobalt-soft: '#eaf0fe'
  cobalt-ink: '#1b3fb8'
  on-cobalt: '#ffffff'
  gain: '#087a54'
  gain-soft: '#e6f4ee'
  loss: '#c8283a'
  loss-soft: '#fbebed'
  dark-bg: '#0e1014'
  dark-surface: '#15181e'
  dark-sunken: '#1b1f26'
  dark-line: '#262b33'
  dark-line-strong: '#323843'
  dark-text: '#eceef2'
  dark-muted: '#a3aab6'
  dark-faint: '#8e95a1'
  dark-cobalt: '#3866e6'
  dark-cobalt-hover: '#2f5bd8'
  dark-cobalt-soft: '#1a2440'
  dark-cobalt-ink: '#9db6ff'
  dark-gain: '#3fc08e'
  dark-gain-soft: '#14281f'
  dark-loss: '#f06a78'
  dark-loss-soft: '#2e161a'
  veil: 'rgba(15, 18, 24, 0.32)'
  dark-veil: 'rgba(0, 0, 0, 0.6)'
typography:
  display-hero:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: 'clamp(40px, calc(3.125vw + 18px), 58px)'
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: '-0.04em'
  display-page:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: 'clamp(36px, calc(2.6vw + 16px), 52px)'
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '42px'
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: '-0.035em'
  headline-sub:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.03em'
  title:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  lead:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.55
  body-reading:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '16.5px'
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '15.5px'
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 500
  ui-small:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 500
  label:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 400
  ui-14:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
  axis:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
    fontFeature: 'tnum'
  figure-kpi:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '22px'
    fontWeight: 500
    letterSpacing: '-0.02em'
    fontFeature: 'tnum'
  figure-row:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '12.5px'
    fontWeight: 400
    fontFeature: 'tnum'
  figure-hero:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '40px'
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: '-0.02em'
    fontFeature: 'tnum'
  card-title:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.375
  app-title:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.02em'
rounded:
  chip: '6px'
  control: '10px'
  card: '16px'
spacing:
  page-gutter-mobile: '20px'
  page-gutter: '40px'
  container: '1280px'
  header: '64px'
  row-x: '14px'
  app-sidebar: '220px'
  app-top-bar: '56px'
  app-card-padding: '20px 16px'
components:
  button-primary:
    backgroundColor: '{colors.cobalt}'
    textColor: '{colors.on-cobalt}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '0 18px'
  button-primary-hover:
    backgroundColor: '{colors.cobalt-hover}'
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
    rounded: '{rounded.chip}'
    height: '22px'
    padding: '0 8px'
  chip-accent:
    backgroundColor: '{colors.cobalt-soft}'
    textColor: '{colors.cobalt-ink}'
    rounded: '{rounded.chip}'
    height: '22px'
  chip-gain:
    backgroundColor: '{colors.gain-soft}'
    textColor: '{colors.gain}'
    rounded: '{rounded.chip}'
    height: '22px'
  chip-loss:
    backgroundColor: '{colors.loss-soft}'
    textColor: '{colors.loss}'
    rounded: '{rounded.chip}'
    height: '22px'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
  segmented:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.muted}'
    padding: '2px'
  segmented-active:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
  icon-tile:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.muted}'
    rounded: '{rounded.chip}'
    size: '32px'
  icon-tile-accent:
    backgroundColor: '{colors.cobalt-soft}'
    textColor: '{colors.cobalt-ink}'
  filter-chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.muted}'
    rounded: '{rounded.chip}'
    height: '30px'
    padding: '0 9px'
  filter-chip-active:
    backgroundColor: '{colors.cobalt-soft}'
    textColor: '{colors.cobalt-ink}'
  filter-chip-unavailable:
    textColor: '{colors.faint}'
  kpi-tile:
    backgroundColor: '{colors.sunken}'
    rounded: '{rounded.control}'
    padding: '8px 12px'
  morph-dialog:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    width: '720px'
---

# Design System: Keel

## Overview

**Creative North Star: "Precise and Plain"** names a register, not a metaphor world. Keel looks like a modern pro trading product: light, exact, quiet. The surface is pale cool grey with white panels, hairline borders, one cobalt accent, and green and red reserved for money. Every figure is set in Geist Mono and lines up in columns. The product itself is the illustration: a real-looking app window with labelled sample data carries the marketing pages.

Light is the default regardless of OS. Dark is an explicit toggle (`data-theme="dark"` on `<html>`, saved as `keel-theme`, applied before first paint). It is the same system with the same roles, not a second design.

Rejected, and recorded so they are not rebuilt: metaphor worlds (the earlier trading-floor tickets and stamps), dark mesh hero clichés, editorial serif display type, and anything that reads as AI-generated.

**Key Characteristics:**

- Cool off-white page, white panels, hairline borders; depth from border first, shadow only on the product shot.
- One accent: cobalt. Gain green and loss red mean money and nothing else.
- Geist for words, Geist Mono with tabular figures for every number.
- Tight negative tracking on large headings, generous leading on body.
- Motion is short and decelerating; it announces arrival and selection, then stops.
- The app (`/app`) is the same system at working density: labelled sidebar, 56px top bar, "Plan vs actual" Dashboard. Its direction is the trader's own plan as the yardstick: adherence and the cost of broken rules lead, performance follows.

## Colors

A cool neutral field, a single cobalt voice, and a green/red pair that carries trading sign. Tokens live in `src/styles/theme.css` as CSS variables and are exposed to Tailwind as `bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`. Frontmatter names above are the descriptive aliases (`surface` = `--surface-1`, `line-strong` = `--line-2`, `cobalt` = `--accent`).

### Primary

- **Cobalt** (#2550e0 light, #3866e6 dark): primary buttons, selection and caret, focus ring, links on hover. Nothing else is accent-coloured.
- **Cobalt Hover** (#1e44c4 light, #2f5bd8 dark): primary button hover.
- **Cobalt Soft** (#eaf0fe light, #1a2440 dark): accent chip fill.
- **Cobalt Ink** (#1b3fb8 light, #9db6ff dark): text on cobalt-soft, accordion title hover.
- **On Cobalt** (#ffffff): text on cobalt fills and selected text.
- **Cobalt in the app** also fills: the active nav tile and active filter chip (cobalt-soft with cobalt-ink), the 4px rule adherence tracks and goal tracks, the equity sparkline, and the duotone layer of inactive nav glyphs (see Icon tiles).

### Neutral

- **Page** (#f6f7f9 / #0e1014): page background, scrollbar track.
- **Surface** (#ffffff / #15181e): cards, app window, secondary buttons, active segment.
- **Sunken** (#eff1f4 / #1b1f26): segmented and tab tracks, neutral chips, ghost hover.
- **Line** (#e3e6eb / #262b33): hairline borders and row dividers.
- **Line Strong** (#d3d8df / #323843): control borders, scrollbar thumb.
- **Text** (#0f1218 / #eceef2): headings and primary copy.
- **Muted** (#4f5865 / #a3aab6): body copy, labels, inactive tabs.
- **Faint** (#687080 / #8e95a1): timestamps, captions, chevrons, empty values, table headers, the "Not live yet" group.
- **Veil** (rgba(15,18,24,0.32) light, rgba(0,0,0,0.6) dark; `--veil`, Tailwind `bg-veil`): the scrim behind the mobile drawer and the Morph dialog. Nothing else.

### Signal

- **Gain** (#087a54 / #3fc08e) on **Gain Soft** (#e6f4ee / #14281f): positive P&L, long side, kept rules, equity line.
- **Loss** (#c8283a / #f06a78) on **Loss Soft** (#fbebed / #2e161a): negative P&L, short side, mistake tags, broken rules.

### Named Rules

**The One Accent Rule.** Cobalt is the only brand colour. Never add a second hue for emphasis, category or decoration.
**The Sign Rule.** Green and red appear only where a number is positive or negative, or a rule is kept or broken. Zero is uncoloured. Never use them for status, branding or ornament.
**The Neutral Error Rule.** Failures to load or save (storage unavailable, dashboard could not load, "Couldn't save") are neutral: sunken or faint, with a Warning or ArrowClockwise glyph in muted ink. Loss red is money and broken rules, never an error state.
**The Never Colour Alone Rule.** Sign and state also carry text or an icon (a leading sign in the figure, "Kept" / "Broken" for screen readers, Long / Short labels). Long and Short chips use gain and loss soft fills; this is sanctioned because the word always travels with the colour.

## Typography

**Text Font:** Geist (via `next/font/google`, `--font-geist-sans`, fallback system-ui, sans-serif)
**Number Font:** Geist Mono (`--font-geist-mono`, fallback ui-monospace, monospace). Used for every figure: P&L, percentages, ratios, times, symbols, ranges. `tabular-nums` is applied to `.font-mono` and `.tnum` so columns align.

**Character:** Neutral grotesque for words, a matched mono for data. Weight does the hierarchy (400, 500, 600) with heavy negative tracking on display sizes. No uppercase labels, no letter-spaced small caps.

### Hierarchy

The ramp as shipped. Half-pixel sizes are deliberate steps between 15 and 17, not accidents; use only values in this table.

| Role            | Size                                                      | Weight | Leading          | Tracking | Use                                               |
| --------------- | --------------------------------------------------------- | ------ | ---------------- | -------- | ------------------------------------------------- |
| Hero display    | clamp(40px, 3.125vw + 18px, 58px)                         | 600    | 1.04             | -0.04em  | Landing hero                                      |
| Page display    | clamp(36px, 2.6vw + 16px, 52px)                           | 600    | 1.06             | -0.04em  | Page and auth h1                                  |
| Closing display | clamp(38px, 5vw, 52px)                                    | 600    | 1.04             | -0.04em  | Closing section                                   |
| Section heading | clamp(2rem, 1.6rem + 1.6vw, 2.625rem)                     | 600    | 1.08             | -0.035em | Landing section heading                           |
| Headline        | 42px                                                      | 600    | 1.08             | -0.035em | Reports and how-it-works headings                 |
| Sub-headline    | 26px                                                      | 600    | 1.15             | -0.03em  | Module and legal section h2                       |
| Title           | 22px                                                      | 600    | 1.2              | -0.025em | Changelog entries; KPI figure (500)               |
| Card title      | 20px (`text-xl`), 18px (`text-lg`), 18px brand            | 600    | default          | -0.02em  | Bento titles, brand mark                          |
| App card title  | 14px                                                      | 600    | 1.375 (snug)     | 0        | Every Dashboard card heading                      |
| App title       | 22px                                                      | 600    | 1.2              | -0.02em  | Top bar page title                                |
| Hero figure     | 40px Geist Mono                                           | 500    | 1.1              | -0.02em  | The adherence percentage in "Your plan" (ticker)  |
| Dialog title    | 18px                                                      | 600    | snug             | 0        | Morph dialog title                                |
| State title     | 16px                                                      | 500    | snug             | 0        | Empty, error and placeholder titles               |
| Accordion       | 17px                                                      | 500    | default          | 0        | Accordion headings                                |
| Lead            | 18px                                                      | 400    | 1.55 to 1.6      | 0        | Subhead under display                             |
| Reading body    | 16.5px                                                    | 400    | 1.7              | 0        | Legal and changelog prose (68ch)                  |
| Body 16         | 16px                                                      | 400    | snug to default  | 0        | Import page copy                                  |
| Body            | 15.5px                                                    | 400    | 1.65             | 0        | Feature and pricing descriptions                  |
| UI              | 15px                                                      | 500    | 1.6 in accordion | 0        | Buttons, accordion body                           |
| Nav             | 14.5px                                                    | 500    | default          | 0        | Header and menu links, import page detail         |
| Sidebar row     | 13.5px                                                    | 400 (500 current) | default | 0     | Sidebar module labels                             |
| UI 14           | 14px (`text-sm`)                                          | 400    | default          | 0        | Rule list rows; brand tile glyph                  |
| Detail          | 13.5px                                                    | 500    | default          | 0        | Trade detail values, column mapping, import chips |
| Control         | 13px                                                      | 500    | default          | 0        | Segmented and tab labels                          |
| App bar         | 12.5px                                                    | 400    | default          | 0        | App window bar; trade rows (mono)                 |
| Label           | 12px (`text-xs`)                                          | 400    | default          | 0        | KPI labels, chips, captions                       |
| Side chip       | 11.5px                                                    | 500    | default          | 0        | Long/Short chip                                   |
| Axis            | 11px (12px from sm)                                       | 400    | 1rem             | 0        | Chart labels                                      |
| KPI figure      | 22px, scales to clamp(15px, 3.6cqi, 22px) in a wide strip | 500    | default          | -0.02em  | Mono, via NumberTicker                            |

Also in use: 24px (`text-2xl`) for mobile menu links, 16px (`text-base`) default body. App literals, all already in the ramp: 11px (kbd hint), 11.5px (side chip, "+n" chip), 12px (labels, table headers, group labels), 12.5px (mono figures and filter chips), 13px (card body, controls, table text), 13.5px (sidebar rows, cost panel), 14px (menu rows, empty-state lead), 15px (state body, buttons), 16px (state title, import copy), 18px (dialog title), 22px (KPI figure, app title), 40px (hero figure). KPI figures in the app shrink with their tile: `min(22px, max(14px, 100cqi / chars / 0.6))`, so a long P&L never spills.

### Named Rules

**The Mono Numbers Rule.** Every number a trader reads is Geist Mono with tabular figures. Never set a figure in the text face.
**The App Ramp Rule.** The app adds exactly two sizes to the ramp: the 40px mono hero figure and the 14px/600 card title. Anything else in `/app` is a row above. Do not mint a size for one surface.
**The Measure Rule.** Display headings cap at 11 to 20ch, ledes at 40 to 60ch, reading prose at 68ch.

## Layout

A single 1280px container (`max-w-[1280px]`) centred, with 20px gutters on phones and 40px from `sm`. The header is 64px. The landing hero is a two-column grid at `lg` (5fr text, 7fr product shot) with a floating trade card overlapping the window's lower left; on phones it stacks and the card sits in flow. Sections breathe with large vertical padding (hero 56px top, 88px bottom); inside product panels density is high: rows are 10px vertical, 14px horizontal padding, 8px gaps.

The KPI strip is container-query driven (`@container`): two by two when narrow, one row of four from `@md`, so figures scale with the strip, not the viewport. Trade rows collapse tag columns below `sm`. Touch targets are 44px: buttons are 44px high (38px for `sm`), the theme toggle goes from 40px to 44px on coarse pointers.

### App shell

The app is a labelled **220px sidebar** (sticky, full height, 1px right line, surface fill) beside a column holding the **56px top bar** and the page. Below `lg` the sidebar is a 280px drawer from the left (Radix Dialog, veil, focus trap, closes on Escape, veil, link, route change or workspace switch, focus returns to the trigger) opened from a 44px menu button that leads the bar. A skip link, "Skip to content", is the first tab stop: visually hidden until focused, then a fixed surface chip at top-left targeting `#content` (`main`, `tabIndex -1`).

- **Top bar:** sticky, surface fill, 1px bottom line, 20px side padding. Order from the left: menu, title, chips, then search, sample label, Gross/Net, Import, theme. The source keeps that order at every width and nothing is reordered by CSS, so Tab reads the bar as the eye does. One 56px row while the chips fit beside the title; where they do not (measured, not guessed) the title keeps a 48px first row and the chips lead the second, the controls after them at its end.
- **Filter row:** leaves the title's row only when it overflows. Where even the second row is short, the chips scroll sideways inside their own scroller with a 32px edge fade at whichever side has more past it. "Clear filters" (shown only while a filter is set) sits outside the scroller so it never fades or scrolls away.
- **Below `sm`:** three rows. The first (menu and title) is pinned to the top with a hairline beneath it; the chips, then a row of search (at its start), the sample label, Gross/Net, Import as an icon and the theme (at its end) scroll away under it.
- **Dashboard grid:** page padding 20px, 16px gaps. Row 1 is one card: a 290px hero column (percentage, cost panel) beside the rules table from `xl`, stacked below. Row 2 is three cards (one column, two from `md` with Performance spanning, three from `xl`). Row 3 is the recent trades card.
- **Plain pages** (module placeholders, error and empty states): a centred 520px column with a 32px icon tile, 16px/500 title, 15px muted body and one action.

## Elevation & Depth

Flat and bordered. Panels separate from the page by a 1px line and a white-on-grey tonal step. Shadow appears on the product shot, the active segment and floating layers.

### Shadow Vocabulary

- **Product shot** (`--shadow`: `0 1px 2px rgba(15,18,24,0.05), 0 24px 48px -24px rgba(37,80,224,0.18)` light; `0 1px 2px rgba(0,0,0,0.4), 0 24px 48px -24px rgba(0,0,0,0.7)` dark): the app window and hero cards. A faint cobalt cast in light, plain black in dark.
- **Active chip** (`--shadow-chip`: `0 1px 2px rgba(15,18,24,0.08)` light; `0 1px 2px rgba(0,0,0,0.4)` dark): the white fill of the selected segment or tab, and in the app every floating layer: filter popovers, the account menu, metric tooltips, the search results list.
- **Morph dialog** uses `--shadow` (the product-shot value), over the veil.

### Named Rules

**The Border First Rule.** Depth comes from hairlines and tonal steps. A soft diffuse shadow is allowed on the product shot; hard offset shadows never.

## Shapes

Three radii, by role: **chips 6px**, **buttons, inputs and inner panels 10px**, **cards and the app window 16px**. Circles only for the button press ripple, the status pill dot, the checkbox ripple and the 24px hover disc behind the Kept mark; tracks are pill-ended bars. Borders are always 1px `line` (or `line-strong` on controls). Focus is a 2px cobalt outline with 3px offset on every focusable element. Exceptions in the app, all 2px: offset 0 for text and date fields inside popovers (the 3px offset would meet the popover's edge; marked important to beat the global rule), offset 2 for table-row buttons, the metric tip and the checkbox, offset 1 for the Kept mark. The filter scroller is padded 6px so rings are never clipped.

Segmented and tab tracks use 7px outer and 5px inner radius, and the brand tile uses 7px: these sit between the rule's steps; treat them as the one documented exception for nested tracks and do not extend it.

## Components

### Buttons

- **Shape:** 10px radius, 44px high (38px `sm`), 18px horizontal padding, 15px/500 label, 8px icon gap.
- **Primary:** cobalt fill, white text; hover cobalt-hover.
- **Secondary:** surface fill, text colour, 1px line-strong border; hover darkens border to faint.
- **Ghost:** transparent; hover sunken.
- **Press:** scales to 0.97 (down 180ms, up 120ms, out easing) and a 160px ripple at the pointer fades from 16% to 0 over 220ms. Disabled at 50% opacity. Reduced motion removes both.

### Chips

- **Style:** 22px high, 6px radius, 8px padding, 12px text. Tones: neutral (sunken/muted), accent (cobalt-soft/cobalt-ink), gain, loss. `mono` for numbers and symbols.
- **Side chip:** 20px high, 11.5px/500; Long reads gain, Short reads loss.
- **Status pill:** a chip with a 6px leading dot. The dot is a status marker, the only dot allowed.

### Segmented control and Tabs

Both share one look: a sunken track (2px padding, 7px radius) holding 13px labels; the active item is a white (surface) chip with 5px radius, text colour and the active-chip shadow. Segmented is a radio group (state flips, no travel). Tabs are a roving-focus tablist whose single white fill slides and resizes to the chosen tab over 320ms on the glide curve. Arrow keys wrap, Home and End jump, selection follows focus.

### App window (the product shot)

The product pages' hero illustration. 16px radius, 1px line, surface fill, product-shot shadow. A top bar (min 46px) holds an account select, a mono date range, optional meta at the right (the "Sample data" label goes here), and a Gross/Net segmented basis switch. Content below is real components fed by the typed sample dataset: KPI strip, equity chart, trade rows.

### KPI strip

Four figures (Net P&L, Win rate, Profit factor, Expectancy): 12px muted label over a 22px mono figure counted up by NumberTicker. A missing value reads "None yet" in faint mono.

### Trade rows

Mono 12.5px list on hairline dividers: faint time, symbol, side chip, up to a few tags (mistakes first, loss tone), right-aligned signed net P&L. Grid `96px 70px 64px 1fr 92px` from `sm`; tags hide on phones.

### P&L sign colouring

Positive is gain, negative is loss, zero stays text colour. Applies to ticker figures, row nets and chart bars. Rule rows use CheckCircle and XCircle (fill) in gain and loss.

### Equity chart

2px gain-colour line, rounded joins, a gain gradient fill (16% to 0), three `line` gridlines, drawn in an SVG that scales uniformly.

### Accordion

One open at a time. Heading button 17px/500, 56px minimum, Phosphor Plus rotating 45deg when open. Panel animates `grid-template-rows` 0fr to 1fr; body 15px muted at 1.6 leading.

### Icons

Phosphor (`@phosphor-icons/react`), 18px typically, 13px for small carets, `aria-hidden`. No glyph or emoji icons.

- **Marketing:** regular weight, except fill for CheckCircle and XCircle.
- **App:** duotone glyphs set in 32px tiles (Icon tiles, below). Fill weight stays for state marks: CheckCircle in gain and XCircle in loss (rule rows, Kept mark, a trade's broken-rule line), never as navigation. Plain regular carets and close marks (CaretUpDown 14px, Check 16px, X 20px, List 20px) are allowed bare.

### App components

The app restyles the shipped primitives for density and adds the pieces below. All state is URL, token or Radix driven; none adds a colour.

#### Icon tiles and nav rows

`IconTile`: 32px square, 6px radius, one 18px duotone glyph, decorative (`aria-hidden`). Duotone's second layer is the glyph's `[opacity]` path, which the tile recolours. Tones: `accent` (cobalt-soft fill, cobalt-ink glyph), `neutral` (sunken, muted), `faint` (sunken, faint, second layer 0). `bare` drops the fill. Used for the sidebar, the account switcher, state blocks and the plan preview.

Sidebar rows are 40px (44px coarse), 6px radius on the row, 13.5px label, 10px gap, 4px padding. Three looks:

- **Active** (`aria-current="page"`): `accent` tile (accent-soft fill, accent-ink glyph) and an accent-ink label at weight 500. The row itself has no fill.
- **Inactive:** a bare transparent tile with a muted glyph whose duotone layer is cobalt at 0.25 opacity in light and 0.45 in dark (a quarter-strength tint vanishes on a dark ground). On row hover the tile fills sunken and the glyph and label go to text; the row also takes the page tone (`bg`).
- **"Not live yet":** faint glyph, outline only (second layer 0, no cobalt), faint label; hover reaches muted. These sit under a faint 12px "Not live yet" group label. Settings sits at the foot of the column.

#### Filter chips and popovers

A chip is 30px high (44px coarse), 6px radius, 12.5px text, 9px padding, 1px border, max 192px with truncation. Idle: surface fill, `line` border, muted text; hover or open lifts the border to `line-strong` and the text to `text`. Active (a filter is set): cobalt-soft fill and border, cobalt-ink text. **No trades in the workspace:** the chip keeps its tab stop but is dashed, faint, transparent, `aria-disabled`, and opens nothing; a note is attached by `aria-describedby`. While the page loads the same chip is inert and disabled.

Popovers are Radix Popover: 256px (300px for the date pair), 10px radius, `line-strong` border, `--shadow-chip`, opening with a 240ms drop (`pop-in`) and leaving as the tooltip does. Enter or Space opens, Escape closes, focus returns to the chip. A footer holds a ghost "Clear" button, disabled while nothing is set. Single choices are native radio rows, multiple choices native checkbox rows (36px, 44px coarse, accent-coloured control). Focus inside a popover sits at offset 0.

#### Account switcher

A 48px box in the sidebar: an accent tile (Wallet), workspace name 13px/500 over an account summary 12px faint, and a 14px CaretUpDown. It opens a Radix menu the width of the trigger (min 240px): a "Workspace" radio group (picking one switches and clears account, strategy and tag filters), then "Accounts" check items ("All accounts" first, then live accounts, then an "Archived" group); accounts toggle in place and the menu stays open. A Check indicator in cobalt-ink marks the selection. If storage fails to open, the box becomes a neutral button with an ArrowClockwise tile reading "Workspace unavailable" over "Try again"; it reloads the page.

#### Gross/Net segmented control

The shared Segmented radio group, with two app props: `coarseTargets` makes each option at least 44px high on coarse pointers (otherwise it stays 28px), and `disabled` (no trades) shows the control faint, keeps it in the tab order, marks it `aria-disabled` and changes nothing. Gross and Net are a user preference, saved; a pending change shows at once. Goals ignore it and are always net.

#### Expanding search (HorizonX)

At rest a 36px icon button (40px below `sm`, level with that row's controls; 44px coarse): sunken fill, 1px `line`, 10px radius, 18px magnifier. On focus the field grows over `--dur-glide` (320ms, glide curve) as an overlay, so the bar never reflows: from `sm` leftward to 280px (248px from `sm` to `md`), anchored right; below `sm`, where it starts its row, rightward across the whole row inside the gutters; reduced motion keeps it still. An ARIA combobox with a listbox of results (36px rows, sunken on the active row, 12px faint detail on the right); a faint `kbd` hint shows the shortcut (⌘K on Mac, Ctrl K elsewhere, which focuses the field) while empty and focused. Arrow keys move, Enter picks, Escape clears and returns focus. Focus ring: 2px, offset 3px.

#### Metric tip (HorizonX Signal Tooltip)

Every metric label is a button with a dotted `line-strong` underline (4px offset, darkens to faint on hover), `cursor: help`. Hover, focus and tap open its definition in a Radix tooltip (max 280px, 12px/500 muted, 10px radius, `--shadow-chip`) that rises 6px while scaling from 0.92 over 240ms; Escape closes. On coarse pointers the hit area is 44px high and extends 8px each side; keep at least 8px between a tip and any adjacent control so the areas never overlap. Never place one inside another button.

#### Morph dialog (HorizonX)

The rule and mistake drill-down. A Radix Dialog whose panel grows from the row that opened it (FLIP from the opener's rect over `glide`, closes back over `exit`; opacity only under reduced motion). 720px max, 80dvh max, 16px radius, 1px `line`, `--shadow`, over the veil. Header: 18px/600 title, 13px muted description, 44px close button; body scrolls. Focus is trapped and returns to the `returnFocus` element, which is the opener or, if it is gone, the card's fallback focus target. The trade list is the snapshot taken at opening, so a regraded trade stays put while the figures behind it update.

In a rule's drill-down the first column is **Kept**: a native checkbox visually hidden over a 24px disc holding a gain CheckCircle (kept) or a loss XCircle (broken) that cross-fade and scale over 240ms. Space or a click regrades the trade; it flips at once and reverts with a neutral "Couldn't save. Try again." notice if the save fails. The sr-only text says Kept or Broken.

#### Task checkbox (HorizonX)

Built and tested, not yet used. Reserved for Plan 5 review checklists. A visually hidden native checkbox in its label; an 18px box, 6px radius, `line-strong` border that fills gain over 240ms on the glide curve (no overshoot) with a drawn check; a soft gain disc that grows and fades on false-to-true only. 44px target on coarse pointers.

#### Dashboard cards

Every card: surface, 1px line, 16px radius, 20px by 16px padding, a 14px/600 heading (with the range, e.g. "1-20 Nov", at right in 12px faint where useful).

- **Plan card.** A 40px mono adherence figure that ticks up, captioned by a metric tip ("of rule checks kept"), and a cost panel below it: loss-soft with loss text for a negative cost, gain-soft for positive, sunken for zero. Beside it the **Rules table**: 38px rows on hairline dividers that stop at the content edge while the hover fill reaches 8px past it; columns Rule, Kept, Adherence, %, Cost when broken. Kept reads "x of y" in 12.5px mono. Adherence is a **4px cobalt bar on a `line`-coloured rail** (not sunken, so it survives the row's hover fill), pill-ended. The percentage never displays 100% or 0% unless exact (it gains one decimal short of it). Cost is signed mono; "none" in faint sans when nothing broke. The costliest broken rule, first in cost order and negative, carries a loss "Costliest" chip. A rule that was broken opens its trades; the whole row is the target, the left button is the keyboard's way in. Five rules show, with "Show all n rules". Column widths: Kept 88px (96 from 1440), Adherence 100px (22% from 1440), % 52px, Cost 124px (136 from 1440); below `sm` Kept and the column track hide and the track moves under the rule text.
- **Mistakes card.** Mistake chip (loss), "n trades" mono, signed cost, costliest first; each row opens its trades.
- **Goals card.** Goals are **always net** and shown only in the base currency, whatever Gross/Net says. Weekly net goal: label with metric tip and amount, "n% of goal" (floored in integer cents, so never 100% short of it) or a gain "Reached" chip, a **6px track** on `line` (cobalt, gain once reached), the week's signed net. Daily loss limit: the same, with "Kept n of m days" and the latest broken day. "Edit goals" (or "Set goals") turns the card into a form in place (38px mono fields, Save and Cancel); **Escape cancels** (not while a save is in flight), and focus returns to the Edit button.
- **Performance card.** Four KPI tiles in a **2 by 2 grid** (four across from a `@2xl` container): sunken, 10px radius, 12px faint label as a metric tip over a 22px mono 500 figure counted up by the ticker; missing values read "None yet". Below, the equity **sparkline**: a 56px-high, 300 by 56 viewBox, 1.5px cobalt line (non-scaling stroke, drawn once, not under reduced motion) over a 7% cobalt area, starting at the starting balance and passing through each closed trade. Under it, a metric tip and "start to end" in mono. (The marketing equity chart is gain-coloured and 2px; the app sparkline is cobalt because it shows the account, not a sign.)
- **Recent trades.** A table of the newest closed trades with columns Time, Symbol, Side, Strategy, P&L, Rules. The instrument is written in words: "TSLA 370 Put" with its expiry faint beside it ("20 Nov"), futures as "ES Dec 26"; the title keeps the traded symbol. Where the table folds the time under the symbol (below `md`) the expiry is hidden so two dates never stack. Side uses the Side chip, Long gain and Short loss. Widths: Time 96px (104 from `xl`), Symbol 100px (128 from `md`, 176 from `xl`), Side 72px, Strategy 128px (144 from `lg`, **180px from `xl`, 272px from 1440**), P&L 92px (104 from `sm`); **Rules flexes with a 280px floor from `xl`**, where every row is one 32px line. Rules cell: "n of m kept" in faint, "Not graded" in faint, or a 14px loss XCircle with "Broke: rule text" and a "+n" loss chip. The "+n" chip sits **inline after the rule text from 1280**, and **under the text below 1280**, where the rule text is clamped to two lines (one line, truncated, from `xl`). Below `sm` Side and Strategy hide.

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

- **Enter** 240ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; **Exit** 160ms `cubic-bezier(0.4, 0, 1, 1)`; **Glide** 320ms `cubic-bezier(0.23, 1, 0.32, 1)` (`--dur-glide`, `--ease-glide`; also `--dur-enter` 240ms, `--dur-exit` 160ms); **Press** 0.97 scale, 180ms down, 120ms up.
- **Hero entrance** (CSS, plays from first paint): `rise` 8px over 240ms; `rise-window` 12px over 400ms; `slide-in` from -16px over 320ms (opaque by 40%); line `draw` and area `fade` 900ms.
- **App overlays:** `tip-in` (6px rise, scale from 0.92, 240ms enter curve) and `tip-out` (160ms) for tooltips; `pop-in` (4px drop, scale from 0.98, 240ms) for popovers and menus; the drawer slides from -100% over enter and out over exit; `check-ripple` 360ms.
- **Number ticker** counts 0 to value in 900ms once in view; screen readers get only the final string.
- **TickIn rows** reveal with 110ms stagger, 8px rise, once on first view.
- **Reduced motion:** all animation and transition durations collapse to 0.01ms; ticker shows the final value; tabs, button and draws skip movement; smooth in-page scroll is off. Without JS everything shows in its final state.

## Do's and Don'ts

### Do:

- **Do** use cobalt (#2550e0) as the single accent and only for primary action, selection, focus and accent chips.
- **Do** set every number in Geist Mono with tabular figures, and colour only signed P&L green or red.
- **Do** use the three radii: 6 chips, 10 buttons and inner panels, 16 cards.
- **Do** show the product as a real app window built from live components, and label it "Sample data. Not a real account." wherever invented figures appear.
- **Do** write copy with commas, periods and colons. Use hyphens only inside words.
- **Do** use Phosphor icons at 18px, with Motion durations and curves from `src/lib/motion.ts`.
- **Do** keep light as the default and design dark as the same roles on the dark tokens.
- **Do** put app icons in 32px duotone tiles: cobalt-soft when current, bare when inactive, outline-only faint when the module is not live.
- **Do** give every metric a MetricTip definition, keep 8px between a tip and adjacent controls, and keep goals net and in the base currency.
- **Do** open a rule's or a mistake's exact trades through the Morph dialog, and return focus to the opener.
- **Do** show loading failures neutrally, and show Long and Short as words in gain and loss chips.
- **Do** keep every adherence figure honest: never 100% or 0% unless exact.

### Don't:

- **Don't** add eyebrows, kickers or small-caps labels above headings.
- **Don't** use em or en dashes in copy.
- **Don't** add decorative dots, orbs, gradients or mesh backgrounds. The status pill dot is a status, not decoration.
- **Don't** present sample data unlabelled, or invent real-sounding user names and figures.
- **Don't** build metaphor worlds (floors, tickets, stamps, ledgers, cockpits) or editorial serif display type.
- **Don't** add a second accent colour or use green and red for anything but sign and state.
- **Don't** use hard offset shadows, glassmorphism or side-stripe borders.
- **Don't** introduce font sizes outside the ramp above.
- **Don't** use loss red for an error state, or cobalt for anything that is not action, selection, focus or the account's own line.
- **Don't** tint a "not live yet" module with duotone fill; it stays an outline.
- **Don't** reach for a library tooltip, modal or search box that bypasses the HorizonX-adapted ones.
