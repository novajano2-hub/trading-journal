# Keel app rebrand: shared brief for the three direction comps

## The problem
The user's verdict on the current app (light grey ground, white cards, grey icon tiles, one cobalt accent):
"it looks too plain and grey. it lacks that top platform feel, it looks like AI slop... I just want to add that premium top platform creative feel."

The bar is set by Kraken Pro, Coinbase Advanced, Robinhood Legend, Fey, Origin and Copilot Money. These products share:
- dark-first, layered near-black surfaces with real depth
- colour that does work: P&L, state, data series
- rich data viz: an area chart with a gradient fill and glow-free luminance, a sparkline in every KPI, heat strips
- big, confident tabular numbers
- crisp 1px hairlines and dense but calm tables
- tasteful motion

None of them is grey-on-grey. None uses AI clichés.

The current app is in the repo if you want to see it: `.impeccable/review/app/desktop-light-dashboard.png`.

## What to make
One self-contained HTML file per direction, showing the **Dashboard first viewport at 1440×900**.
- Inline CSS; at most a few lines of JS for hover states. No external JS.
- Google Fonts are allowed. Geist and Geist Mono are the current faces, and you may keep or change them with a reason.
- Fixed `html, body { width: 1440px; height: 900px; overflow: hidden; }`.
- Real content only (below). No lorem, no placeholder tiles.
- Under 450 lines.

**Keep the product structure.** The user chose "Plan vs actual", so the layout follows it:
- Left sidebar: Keel wordmark, workspace switcher, modules, a "Not live yet" group, Settings.
- Top bar: title, filter chips, search icon, Gross/Net, Import.
- Row 1, "Your plan": an adherence hero next to a rules table ranked by cost.
- Row 2: Mistakes by cost, Goals, Performance (KPIs plus equity).
- Row 3: Recent trades with a Rules column.

You may restyle everything. You may also re-compose within those areas if it reads more premium, for example a sparkline per KPI or a mini-calendar heat strip. Keep every area.

## Real content (sample workspace, Net basis, all time)
- **Workspace:** "Sample workspace · All accounts". User initials MK.
- **Modules:** Dashboard (active), Trades, Calendar, Reports, Strategies, Notebook, Import, Prop firms. Not live yet: Backtesting, Replay, Mentors, Assistant. Settings.
- **Filters:** All time, Symbol, Side, Strategy, Tags. Gross / Net, with Net active. "Sample data" label.
- **Your plan:**
  - 87% of rule checks kept.
  - Broken rules cost −$8,581.08.
  - Rules table (kept, adherence, cost when broken):

    | Rule | Kept | Adherence | Cost when broken |
    |---|---|---|---|
    | Trend is intact on the 1-hour chart (Costliest) | 301 of 348 | 86% | −$4,077.63 |
    | Pullback holds the 20-period average | 314 of 361 | 87% | −$3,529.53 |
    | Exit if the trend structure breaks | 313 of 365 | 86% | −$3,270.42 |
    | Wait for the 15-minute range to complete | 222 of 244 | 91% | −$2,125.91 |
    | Maximum two attempts per level | 253 of 285 | 89% | −$1,921.51 |

    The footer link reads "Show all 23 rules".
- **Mistakes by cost:**

  | Mistake | Trades | Cost |
  |---|---|---|
  | FOMO entry | 64 | −$4,924.13 |
  | Oversized | 51 | −$4,639.55 |
  | Moved stop | 49 | −$3,894.96 |
  | Early exit | 51 | −$3,769.33 |
  | Revenge trade | 53 | −$1,732.57 |

- **Goals:**
  - Weekly net goal $500.00: +$129.19 this week, 16-20 Nov, 26% of goal.
  - Daily loss limit $600.00: kept 115 of 127 days. Last broken Thu 12 Nov at −$616.58.
- **Performance:** Net P&L +$16,126.81, Win rate 48.8%, Profit factor 1.16, Expectancy +$13.15. Equity runs from $175,000.00 to $191,126.81: an upward line with drawdowns, about 120 points.
- **Recent trades:**

  | Time | Instrument | Side | Strategy | Mistake | Net | Rules |
  |---|---|---|---|---|---|---|
  | 20 Nov 20:49 | TSLA 370 Put | Long | Opening range breakout | | −$189.30 | 6 of 6 kept |
  | 20 Nov 18:48 | TSLA 385 Call | Long | Trend pullback | Moved stop | +$228.70 | Broke: Pullback holds the 20-period average |
  | 20 Nov 18:24 | ES Dec 26 | Long | Level reversal | | +$294.80 | 6 of 6 kept |
  | 20 Nov 18:21 | AAPL | Short | Opening range breakout | FOMO entry | +$203.72 | Broke: Stop inside the opposite side of the range |
  | 20 Nov 14:36 | EURUSD | Short | Level reversal | | −$200.60 | 6 of 6 kept |

## Non-negotiables (anti-slop)
- **Banned:**
  - purple or blue neon glows and glow halos
  - gradient text
  - glassmorphism on everything
  - mesh-gradient backgrounds
  - emoji
  - decorative dots
  - eyebrows: tiny uppercase tracked labels above headings, with one exception: a table header row may be small caps if justified
  - em and en dashes in copy (use "-" for ranges and "−" (U+2212) for negatives)
  - three identical cards with icons
- **Number semantics:** green and red mean signed money and kept/broken only, and always carry a sign or a word.
- **Accent:** one brand accent. Data series may use a small, purposeful palette.
- **Icons:** draw with real Phosphor glyph paths only if you can reproduce them faithfully. Otherwise use simple 16px rounded-square placeholders in the tile's colour. Never hand-draw fake icons.
- **Quality bar:** it must read instantly as a world-class trading product, more distinctive than the category standard, with crisp alignment, a real type scale and consistent spacing.

## Before you design
Load these skills and apply them:
- `frontend-design:frontend-design`
- `design-taste-frontend:design-taste-frontend`
- `ui-ux-pro-max:ui-ux-pro-max`, for palette and type pairing for a fintech/trading dashboard

Also read Impeccable's craft floor: /Users/mac/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/reference/craft-floor.md
