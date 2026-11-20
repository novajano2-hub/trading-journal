---
name: Keel
description: A light, precise, pro-trading journal. One cobalt accent, Geist type, Geist Mono for every number.
colors:
  bg: "#f6f7f9"
  surface: "#ffffff"
  sunken: "#eff1f4"
  line: "#e3e6eb"
  line-strong: "#d3d8df"
  text: "#0f1218"
  muted: "#4f5865"
  faint: "#687080"
  cobalt: "#2550e0"
  cobalt-hover: "#1e44c4"
  cobalt-soft: "#eaf0fe"
  cobalt-ink: "#1b3fb8"
  on-cobalt: "#ffffff"
  gain: "#087a54"
  gain-soft: "#e6f4ee"
  loss: "#c8283a"
  loss-soft: "#fbebed"
  dark-bg: "#0e1014"
  dark-surface: "#15181e"
  dark-sunken: "#1b1f26"
  dark-line: "#262b33"
  dark-line-strong: "#323843"
  dark-text: "#eceef2"
  dark-muted: "#a3aab6"
  dark-faint: "#8e95a1"
  dark-cobalt: "#3866e6"
  dark-cobalt-hover: "#2f5bd8"
  dark-cobalt-soft: "#1a2440"
  dark-cobalt-ink: "#9db6ff"
  dark-gain: "#3fc08e"
  dark-gain-soft: "#14281f"
  dark-loss: "#f06a78"
  dark-loss-soft: "#2e161a"
typography:
  display-hero:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(40px, calc(3.125vw + 18px), 58px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  display-page:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(36px, calc(2.6vw + 16px), 52px)"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "42px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline-sub:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  body-reading:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  ui-small:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  ui-14:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  axis:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "tnum"
  figure-kpi:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  figure-row:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  chip: "6px"
  control: "10px"
  card: "16px"
spacing:
  page-gutter-mobile: "20px"
  page-gutter: "40px"
  container: "1280px"
  header: "64px"
  row-x: "14px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-cobalt}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  button-ghost:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.sunken}"
  chip-neutral:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    height: "22px"
    padding: "0 8px"
  chip-accent:
    backgroundColor: "{colors.cobalt-soft}"
    textColor: "{colors.cobalt-ink}"
    rounded: "{rounded.chip}"
    height: "22px"
  chip-gain:
    backgroundColor: "{colors.gain-soft}"
    textColor: "{colors.gain}"
    rounded: "{rounded.chip}"
    height: "22px"
  chip-loss:
    backgroundColor: "{colors.loss-soft}"
    textColor: "{colors.loss}"
    rounded: "{rounded.chip}"
    height: "22px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  segmented:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
    padding: "2px"
  segmented-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
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

## Colors

A cool neutral field, a single cobalt voice, and a green/red pair that carries trading sign. Tokens live in `src/styles/theme.css` as CSS variables and are exposed to Tailwind as `bg`, `surface-1`, `sunken`, `line`, `line-2`, `text`, `muted`, `faint`, `accent*`, `gain*`, `loss*`. Frontmatter names above are the descriptive aliases (`surface` = `--surface-1`, `line-strong` = `--line-2`, `cobalt` = `--accent`).

### Primary
- **Cobalt** (#2550e0 light, #3866e6 dark): primary buttons, selection and caret, focus ring, links on hover. Nothing else is accent-coloured.
- **Cobalt Hover** (#1e44c4 light, #2f5bd8 dark): primary button hover.
- **Cobalt Soft** (#eaf0fe light, #1a2440 dark): accent chip fill.
- **Cobalt Ink** (#1b3fb8 light, #9db6ff dark): text on cobalt-soft, accordion title hover.
- **On Cobalt** (#ffffff): text on cobalt fills and selected text.

### Neutral
- **Page** (#f6f7f9 / #0e1014): page background, scrollbar track.
- **Surface** (#ffffff / #15181e): cards, app window, secondary buttons, active segment.
- **Sunken** (#eff1f4 / #1b1f26): segmented and tab tracks, neutral chips, ghost hover.
- **Line** (#e3e6eb / #262b33): hairline borders and row dividers.
- **Line Strong** (#d3d8df / #323843): control borders, scrollbar thumb.
- **Text** (#0f1218 / #eceef2): headings and primary copy.
- **Muted** (#4f5865 / #a3aab6): body copy, labels, inactive tabs.
- **Faint** (#687080 / #8e95a1): timestamps, captions, chevrons, empty values.

### Signal
- **Gain** (#087a54 / #3fc08e) on **Gain Soft** (#e6f4ee / #14281f): positive P&L, long side, kept rules, equity line.
- **Loss** (#c8283a / #f06a78) on **Loss Soft** (#fbebed / #2e161a): negative P&L, short side, mistake tags, broken rules.

### Named Rules
**The One Accent Rule.** Cobalt is the only brand colour. Never add a second hue for emphasis, category or decoration.
**The Sign Rule.** Green and red appear only where a number is positive or negative, or a rule is kept or broken. Zero is uncoloured. Never use them for status, branding or ornament.
**The Never Colour Alone Rule.** Sign and state also carry text or an icon (a leading sign in the figure, "Kept" / "Broken" for screen readers, Long / Short labels).

## Typography

**Text Font:** Geist (via `next/font/google`, `--font-geist-sans`, fallback system-ui, sans-serif)
**Number Font:** Geist Mono (`--font-geist-mono`, fallback ui-monospace, monospace). Used for every figure: P&L, percentages, ratios, times, symbols, ranges. `tabular-nums` is applied to `.font-mono` and `.tnum` so columns align.

**Character:** Neutral grotesque for words, a matched mono for data. Weight does the hierarchy (400, 500, 600) with heavy negative tracking on display sizes. No uppercase labels, no letter-spaced small caps.

### Hierarchy
The ramp as shipped. Half-pixel sizes are deliberate steps between 15 and 17, not accidents; use only values in this table.

| Role | Size | Weight | Leading | Tracking | Use |
|---|---|---|---|---|---|
| Hero display | clamp(40px, 3.125vw + 18px, 58px) | 600 | 1.04 | -0.04em | Landing hero |
| Page display | clamp(36px, 2.6vw + 16px, 52px) | 600 | 1.06 | -0.04em | Page and auth h1 |
| Closing display | clamp(38px, 5vw, 52px) | 600 | 1.04 | -0.04em | Closing section |
| Section heading | clamp(2rem, 1.6rem + 1.6vw, 2.625rem) | 600 | 1.08 | -0.035em | Landing section heading |
| Headline | 42px | 600 | 1.08 | -0.035em | Reports and how-it-works headings |
| Sub-headline | 26px | 600 | 1.15 | -0.03em | Module and legal section h2 |
| Title | 22px | 600 | 1.2 | -0.025em | Changelog entries; KPI figure (500) |
| Card title | 20px (`text-xl`), 18px (`text-lg`), 18px brand | 600 | default | -0.02em | Bento titles, brand mark |
| Lead | 18px | 400 | 1.55 to 1.6 | 0 | Subhead under display |
| Reading body | 16.5px | 400 | 1.7 | 0 | Legal and changelog prose (68ch) |
| Body 16 | 16px | 400 | snug to default | 0 | Import page copy |
| Body | 15.5px | 400 | 1.65 | 0 | Feature and pricing descriptions |
| UI | 15px | 500 | 1.6 in accordion | 0 | Buttons, accordion body |
| Nav | 14.5px | 500 | default | 0 | Header and menu links |
| UI 14 | 14px (`text-sm`) | 400 | default | 0 | Rule list rows; brand tile glyph |
| Detail | 13.5px | 500 | default | 0 | Trade detail values, column mapping, import chips |
| Control | 13px | 500 | default | 0 | Segmented and tab labels |
| App bar | 12.5px | 400 | default | 0 | App window bar; trade rows (mono) |
| Label | 12px (`text-xs`) | 400 | default | 0 | KPI labels, chips, captions |
| Side chip | 11.5px | 500 | default | 0 | Long/Short chip |
| Axis | 11px (12px from sm) | 400 | 1rem | 0 | Chart labels |
| KPI figure | 22px, scales to clamp(15px, 3.6cqi, 22px) in a wide strip | 500 | default | -0.02em | Mono, via NumberTicker |

Also in use: 24px (`text-2xl`) for mobile menu links, 16px (`text-base`) default body.

### Named Rules
**The Mono Numbers Rule.** Every number a trader reads is Geist Mono with tabular figures. Never set a figure in the text face.
**The Measure Rule.** Display headings cap at 11 to 20ch, ledes at 40 to 60ch, reading prose at 68ch.

## Layout

A single 1280px container (`max-w-[1280px]`) centred, with 20px gutters on phones and 40px from `sm`. The header is 64px. The landing hero is a two-column grid at `lg` (5fr text, 7fr product shot) with a floating trade card overlapping the window's lower left; on phones it stacks and the card sits in flow. Sections breathe with large vertical padding (hero 56px top, 88px bottom); inside product panels density is high: rows are 10px vertical, 14px horizontal padding, 8px gaps.

The KPI strip is container-query driven (`@container`): two by two when narrow, one row of four from `@md`, so figures scale with the strip, not the viewport. Trade rows collapse tag columns below `sm`. Touch targets are 44px: buttons are 44px high (38px for `sm`), the theme toggle goes from 40px to 44px on coarse pointers.

## Elevation & Depth

Flat and bordered. Panels separate from the page by a 1px line and a white-on-grey tonal step. Shadow appears only on the product shot and on the active segment.

### Shadow Vocabulary
- **Product shot** (`--shadow`: `0 1px 2px rgba(15,18,24,0.05), 0 24px 48px -24px rgba(37,80,224,0.18)` light; `0 1px 2px rgba(0,0,0,0.4), 0 24px 48px -24px rgba(0,0,0,0.7)` dark): the app window and hero cards. A faint cobalt cast in light, plain black in dark.
- **Active chip** (`0 1px 2px rgba(15,18,24,0.08)`): the white fill of the selected segment or tab.

### Named Rules
**The Border First Rule.** Depth comes from hairlines and tonal steps. A soft diffuse shadow is allowed on the product shot; hard offset shadows never.

## Shapes

Three radii, by role: **chips 6px**, **buttons, inputs and inner panels 10px**, **cards and the app window 16px**. Circles only for the button press ripple and the status pill dot. Borders are always 1px `line` (or `line-strong` on controls). Focus is a 2px cobalt outline with 3px offset on every focusable element.

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
Phosphor (`@phosphor-icons/react`), 18px typically, 13px for small carets, `aria-hidden`, regular weight except fill for CheckCircle and XCircle. No glyph or emoji icons.

### Motion
Tokens in `src/lib/motion.ts`, mirrored as CSS variables. Several patterns are adapted from HorizonX (commercial licence): button press, number ticker, Beacon Tabs glide, animated accordion timing.
- **Enter** 240ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; **Exit** 160ms `cubic-bezier(0.4, 0, 1, 1)`; **Glide** 320ms `cubic-bezier(0.23, 1, 0.32, 1)`; **Press** 0.97 scale, 180ms down, 120ms up.
- **Hero entrance** (CSS, plays from first paint): `rise` 8px over 240ms; `rise-window` 12px over 400ms; `slide-in` from -16px over 320ms (opaque by 40%); line `draw` and area `fade` 900ms.
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

### Don't:
- **Don't** add eyebrows, kickers or small-caps labels above headings.
- **Don't** use em or en dashes in copy.
- **Don't** add decorative dots, orbs, gradients or mesh backgrounds. The status pill dot is a status, not decoration.
- **Don't** present sample data unlabelled, or invent real-sounding user names and figures.
- **Don't** build metaphor worlds (floors, tickets, stamps, ledgers, cockpits) or editorial serif display type.
- **Don't** add a second accent colour or use green and red for anything but sign and state.
- **Don't** use hard offset shadows, glassmorphism or side-stripe borders.
- **Don't** introduce font sizes outside the ramp above.
