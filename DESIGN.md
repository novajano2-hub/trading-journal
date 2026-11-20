---
name: Keel
description: A trading journal that files every trade as a ticket, in the world of open-outcry pit ephemera.
colors:
  jacket-gold: "#f2b705"
  floor-navy: "#151a2d"
  ticket-stock: "#f4f6f8"
  buy-blue: "#2350c8"
  sell-red: "#d2352a"
  time-clock-purple: "#6b3fa0"
  card-rule: "#c9d1db"
typography:
  display-hero:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "7.375rem"
    fontWeight: 900
  display-section:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.005em"
  display-nav:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    letterSpacing: "0.06em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.6
  lede:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.2em"
  clock:
    fontFamily: "DotGothic16, monospace"
    fontSize: "17px"
    fontWeight: 400
    letterSpacing: "0.06em"
rounded:
  focus: "2px"
  ticket: "3px"
  button: "4px"
  mouth: "5px"
  slot: "6px"
  badge: "8px"
  mark: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "56px"
  header-height: "88px"
  hero-gap: "48px"
  field-pad: "12px"
  card-pad: "24px"
components:
  button-header-primary:
    backgroundColor: "{colors.floor-navy}"
    textColor: "{colors.jacket-gold}"
    typography: "{typography.display-nav}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-slot-go:
    backgroundColor: "{colors.jacket-gold}"
    textColor: "{colors.floor-navy}"
    rounded: "{rounded.button}"
    padding: "12px 20px"
    height: "48px"
  button-closed:
    backgroundColor: "{colors.ticket-stock}"
    textColor: "{colors.floor-navy}"
    rounded: "{rounded.button}"
    padding: "12px 24px"
    height: "56px"
  ticket:
    backgroundColor: "{colors.ticket-stock}"
    textColor: "{colors.floor-navy}"
    rounded: "{rounded.ticket}"
    padding: "16px 18px"
    height: "236px"
  ticket-slot:
    backgroundColor: "{colors.floor-navy}"
    textColor: "{colors.ticket-stock}"
    rounded: "{rounded.slot}"
    padding: "22px 24px"
  input-field:
    backgroundColor: "{colors.ticket-stock}"
    textColor: "{colors.floor-navy}"
    rounded: "{rounded.ticket}"
    padding: "0 12px"
    height: "48px"
  badge-logo:
    backgroundColor: "{colors.ticket-stock}"
    textColor: "{colors.floor-navy}"
    rounded: "{rounded.badge}"
    size: "118px"
    height: "64px"
  footer:
    backgroundColor: "{colors.floor-navy}"
    textColor: "{colors.ticket-stock}"
    padding: "48px 56px"
---

# Design System: Keel

## Overview

**Creative North Star: "The Trading Floor"**

Keel is open-outcry pit ephemera: a jacket-gold field, floor-navy ink, and ticket card stock that trades are filed on. Every trade is a ticket that gets filed, stamped and reviewed, and the interface is built from the objects of that ritual: order tickets with ruled field grids, rubber stamps, a navy ticket slot, a trader badge, a punched recap sheet, a rack of cards standing in pockets.

The marketing site is loud and flat. Gold floods the page ground, navy carries every word, and condensed uppercase display type does the shouting. Surfaces are physical paper and metal, so depth is a contact shadow under a card, never a glow. Motion is rare and mechanical: a ticket printing into the stack, a card lifting out of its pocket.

**Key Characteristics:**
- Gold ground, navy ink, stock surfaces; the three never trade roles on the marketing site.
- Condensed black uppercase display face against a plain humanist text face.
- Buy and sell are always a circled letter, never colour alone; losses print hatched, gains solid.
- States are stamps (RULE BROKEN, A+ SETUP) and dashed rules for anything not yet open.
- Timestamps are set in a dot-matrix face, in purple, and nowhere else.

## Colors

A three-colour field (gold, navy, stock) with two directional inks and one clock ink; everything else is a tint of navy.

### Primary
- **Jacket Gold** (#f2b705): the marketing page ground and scrollbar track, the ticket slot's "go" button, the fed slot mouth, and the focus ring and selection on navy surfaces.

### Secondary
- **Buy Blue** (#2350c8): buy side only, always inside the circled B.
- **Sell Red** (#d2352a): sell side inside the circled S, and the RULE BROKEN stamp.

### Tertiary
- **Time-Clock Purple** (#6b3fa0): timestamps only, always in the dot-matrix face.

### Neutral
- **Floor Navy** (#151a2d): all text and borders on gold and stock, the slot, footer and primary header button; shadows are navy at low alpha.
- **Ticket Stock** (#f4f6f8): ticket, form card, badge and note surfaces; text on navy.
- **Card Rule** (#c9d1db): field grid lines and the ruled lines on cards.

### Named Rules
**The Circled Letter Rule.** Buy blue and sell red never appear alone. They sit in a circled B or S, or in a stamp, so the meaning survives without colour.
**The Clock Ink Rule.** Purple is for timestamps and nothing else.
**The Ground Rule.** Gold is the ground, navy is the ink. A gold element on gold, or a navy body on navy without the flipped focus ring, is wrong.

### Cross-surface rule (app screens, planned; not yet built)
The app screens will reuse this world with restraint for long working sessions: ticket-stock and navy surfaces; gold reserved for the primary action and the active state; trades as ticket rows; tags and mistakes as stamps; timestamps in the dot-matrix face; dense, keyboard-first tables. This is the direction contract for a later build, not something the current code contains.

## Typography

**Display Font:** Big Shoulders (optical size pinned to 72; Arial Narrow, sans-serif fallback)
**Body Font:** Barlow (400-700; system-ui fallback)
**Label/Mono Font:** DotGothic16, a dot-matrix face (monospace fallback)

**Character:** A pit-board condensed face for shouting and badges, a calm grotesque for reading, and a dot-matrix clock face for the time printed on a ticket. Tabular numerals are on for the whole body.

### Hierarchy
- **Display hero** (900, min(20.5vw, 7.375rem) on phones, up to 118px on desktop, uppercase): the landing headline.
- **Display section** (900, clamp(2.75rem, 5vw + 0.75rem, 4.5rem), 0.9): landing H2s. The closing line runs clamp(3.25rem, 8vw + 0.5rem, 6rem) at 0.88; feature page H1s clamp(2.75rem, 7vw + 0.5rem, 6rem) at 0.9.
- **Nav and buttons** (700-900, 21-26px, 0.05-0.06em tracking, uppercase): navigation, buttons, stamps.
- **Lede** (500, 18px phone, 21px from md, 1.45): under headlines, capped near 34em.
- **Body** (500, 17px, 1.6): reading text, capped at 68ch.
- **Label** (700, 11px, 0.16-0.2em, uppercase): ticket field names and the Filed/Unfiled flag.
- **Clock** (DotGothic16 400, 15-17px, 0.06em, uppercase, purple): ticket timestamps in the format DD MMM HH:MM:SS.

### Named Rules
**The Shout Rule.** Display type is Big Shoulders 900 uppercase, tight leading (0.88-0.9), and used for headlines, buttons, badges and stamps only. Never for running text.

## Layout

Page gutters are 16px on phones and 56px from md. The header is a fixed 88px row. The landing's first viewport is a grid that stacks on phones (intro, drop, note, stack) and from 80rem sits as a 640px text column beside a 620px ticket stack with a 48px gap. Reading pages cap text at 68ch and ledes at 34em. Sections breathe with large vertical padding (up to 144px under reading pages). Cards and tickets are laid out as ruled grids: 1px rule gaps over a rule-coloured background. The day strip changes orientation at 40rem: rows on phones, columns from sm. Tickets scale their figure type with container width.

## Elevation & Depth

Depth is paper and metal, not light. Surfaces are flat colour with a two-part navy shadow: a tight contact shadow plus a soft, negatively spread lift. Inset shadows make recesses (the slot mouth, punched day cells). A stamped element multiplies into the stock beneath it. Cards that are filed get punched holes, with the shadow following them.

### Shadow Vocabulary
- **Ticket stock** (`0 1px 1.5px rgb(21 26 45 / 0.2), 0 16px 26px -14px rgb(21 26 45 / 0.55)`): tickets and form cards.
- **Slot** (`0 2px 3px rgb(21 26 45 / 0.25), 0 14px 30px -18px rgb(21 26 45 / 0.9)`): the navy reader and the closing button.
- **Badge** (`0 2px 3px rgb(21 26 45 / 0.3), 0 12px 22px -10px rgb(21 26 45 / 0.55)`): trader badge.
- **Recess** (`inset 0 2px 3px rgb(0 0 0 / 0.6)`): slot mouth and punched cells.

### Named Rules
**The Contact Shadow Rule.** Every raised thing gets a tight contact shadow plus a soft negative-spread lift, both in navy. No blur-only glows, no hard offset shadows.

## Shapes

Small, firm corners, like die-cut card: 3px on tickets, stamps and fields; 4px on buttons; 6px on the slot; 8px on the badge; circles only for the buy/sell mark. Borders are 2px navy for fields and stamps (stamps add a 1.5px inner outline for a double rule), 1.5px navy under ticket headers, and 1px card-rule between ticket fields. Anything not yet available has a dashed rule. Focus rings are 3px solid, offset 3px, navy (gold on navy surfaces).

## Components

### Buttons
- **Shape:** 4px corners, condensed uppercase labels.
- **Primary in header:** navy fill, gold text, 12px 22px padding.
- **Slot go:** gold fill, navy text, 48px tall; lightens 22% toward white on hover; disabled mixes gold 30% toward navy.
- **Closing go:** navy fill, lightens 14% on hover.
- **Closed:** stock fill, 2px dashed navy border, stamped with when it opens.

### Order ticket
A 220px (236px from md) card on stock: header with ORDER TICKET and a serial, a ruled grid of Side, Symbol, Price, Qty and Net P&L, an optional stamp band, and a purple dot-matrix clock beside a Filed or Unfiled flag. Sample tickets carry P&L and stamps; a visitor's own tickets are unstamped and Unfiled.

### Rubber stamp
Condensed black caps in a double rule, slightly rotated (about -2deg), 0.9 opacity, multiplied into the stock, with a noise mask so the ink misses in places. Sell tone is red; neutral tone is navy. Three sizes (xs, sm, md).

### Side mark
A circled B (buy blue) or S (sell red), Big Shoulders 900. Unknown side is a dashed circle with a dash.

### Ticket slot (file drop)
A navy reader with a recessed mouth that fills gold when a file is dragged over or fed. Dashed 3px navy outline while dragging.

### Inputs / Fields
Stock fill, 2px navy border, 3px corners, 48px minimum height, 17px medium text, bold labels above.

### Navigation
Header: badge logo left, condensed uppercase 21px navy links, Log in plus a navy Get started button right. Phones collapse to a menu. Footer: navy block with stock text in a four-column grid.

### Trader badge
A stock-coloured plate (118x64, 8px corners) with a punched clip slot and a condensed KEL wordmark over KEEL; it is the home link and the account identity.

## Do's and Don'ts

### Do:
- **Do** put gold on the page ground and navy on all ink; keep gold as a button fill only where the surface is navy.
- **Do** pair every buy or sell colour with its circled letter.
- **Do** set every timestamp in the dot-matrix face, purple, in DD MMM HH:MM:SS.
- **Do** show state as a stamp, a hatched loss bar, or a dashed rule.
- **Do** use the two-part navy contact shadow on raised cards.
- **Do** respect reduced motion: the print and pull-from-pocket motions are off, and links underline instead.

### Don't:
- **Don't** put a centred headline over a dark dashboard screenshot; this world refuses that category default.
- **Don't** invent stamps on a visitor's own data: with no rules in the app, tickets print unstamped and Unfiled.
- **Don't** use purple for anything but timestamps.
- **Don't** use blur-only glows or hard offset shadows.
- **Don't** set running text in the display face.
