---
version: 1
slug: "src-app-app-app-dashboard-page-tsx"
primary_target: "src/app/(app)/app/dashboard/page.tsx"
related_targets: ["src/app/(app)/layout.tsx", "src/components/app/dashboard/dashboard-view.tsx"]
---

# App shell and Dashboard

**Mode:** Operate.

**What the page is:** the trader's own arrangement of widgets. A template names a list of widgets in two sections: an upper strip of small figures (at most five) and a lower grid of larger charts, lists and calendars. The page draws the template in use over the URL's filters. Keel's own plan, mistakes and performance cards are gone (Plan 6C, decision D2, 2026-11-25); the trader's rules are measured on the Progress tracker and Strategies pages, and the Progress tracker is one of the widgets.

**Audience and job:** Retail and prop-firm traders doing their post-session review on a laptop, often end of day, next to their trading platform. The job is to see the figures they chose at a glance, find the day or trade worth opening, and keep the page arranged to their own habit.

**Proof and content:**
- Sample workspace, labelled as sample.
- The user's imported trades once they exist.
- All figures come from `src/domain` through the data hooks (`useWidgetData` feeds every widget in one pass).
- Templates are saved in the prefs (`UserPrefs.dashboards`): one set per browser, shared by both workspaces.

**Constraints:**
- Global filters (date range, account, symbol, side, strategy, tags) live in the URL and scope every widget. Two exceptions, each by design: the calendars show the whole month or year whatever the date range, and the Edge score ignores the display unit.
- Desktop-first, usable at 390px.
- Gross/Net, the display unit and Privacy reach every figure, chart label, readout and screen-reader name.
- Every widget carries an info tip with its metric's definition.
- One currency at a time, with a switch when more than one has closed trades.
- The upper strip holds at most five widgets, and a widget appears once per template.

**Chosen layout:** the widget dashboard of Plan 6C. The owner decided it on 2026-11-25 (D1, D2, D3 of the Plan 6C spec): the reference journal's behaviour, never its screens, so the default set of widgets and what each does are borrowed and the layout, look, wording and icons are Keel's own. The comps are `.impeccable/mocks/plan6c/01-dashboard.html` (the page), `02-dashboard-edit.html` (edit mode) and `03-dashboard-review.html` (the review states), with captures beside them. It replaces the earlier "Plan vs actual" layout (picked 2026-11-20 from `.impeccable/mocks/decision-app/`, led by the "Your plan" card).

**Look:** "Daylight premium" (comp C, picked 2026-11-21), unchanged: periwinkle canvas, white cards with brand-tinted shadows, graphite dark, Instrument Sans with tabular figures, no icon tiles. DESIGN.md's "Widget dashboard", "Edge score" and Charts sections hold the values.

**Unresolved:** none blocking. Recorded in the backlog: touch drag in edit mode is untested (the arrows are the tested path), browser Back and the search drop an unsaved draft without asking, and the Total swap figure waits for 6B's per-trade swap.

## Direction contract

THESIS: The Dashboard is the trader's own. They choose which figures and charts lead and in what order, and the page keeps that arrangement. It refuses the category default of one fixed wall of KPI tiles, and it refuses to stand in for the rules: adherence lives on the Progress tracker and Strategies pages.

OWN-WORLD: "Daylight premium" (comp C), scoped to /app through `[data-surface='app']` in theme.css:
- periwinkle-tinted canvas #ECEEF8, white cards with brand-tinted soft shadows, a neutral graphite set in dark
- Keel Ultramarine #2B35AF as the one accent: primary actions, the current state, focus, series 1, and the Edge score's radar and marker; it never fills a card
- data hues with fixed jobs: gain and loss only for signed money and kept or broken, always signed; marigold for mistakes
- a share is a thin split bar with its counts in words, never a gauge or a ring; a score is a neutral track with a marker and band words (Weak, Building, Strong), never a red to green gradient
- a scatter dot is filled above zero and hollow below, so sign never rests on colour alone
- Instrument Sans for everything, tabular figures for numbers; figures are 22px (18px on a phone) and shrink to fit their card
- radius rule 6/10/16 for chips, controls and cards

Additions for the app:
- **Icons:** Phosphor, regular weight, bare: no tiles, nothing behind a glyph.
- **HorizonX components, restyled to tokens:**
  - Signal Tooltip for each widget's definition
  - Morph Dialog for Add a widget, the expanded chart and the Edit template sheet
  - Expanding Search for the ⌘K search
  - the existing number ticker, button press and sliding tabs
- **Avoid:** eyebrows, em and en dashes, decorative dots, gauges and rings, and colour without a sign or a label.

STORY: The trader opens Keel after the close. The strip says how the range went: net P&L, the win rate, the profit factor, how many days closed green. The Edge score names a band and its weakest part. A red day shows on the calendar; they open it, then the recent trades, and leave knowing which day to review. On Sunday they make a second template, add a Drawdown widget to it and switch between the two from the template button.

FIRST VIEWPORT:
- **Left sidebar, 220px:** wordmark and a collapse button, account switcher, labelled modules, a quieter "Not live yet" group, and Settings. It folds to a 68px icon rail.
- **Top bar:** title, the URL-driven filter chips, an expanding search, the template button beside Plan the day, Gross/Net and Import.
- **Last import line,** and a currency switch when there is more than one currency.
- **Upper strip, "Main":** Net P&L, Trade win rate, Profit factor, Day win rate, Average win to loss. Five columns from 1280px, three from 768px, two on a phone.
- **Lower grid, "Main":** Edge score, Progress tracker and Cumulative net P&L; Net daily P&L, Recent trades and Account balance; the Calendar with stats (two thirds wide); Drawdown, Trade time performance and Trade duration performance.
- **Signature move:** the page is the trader's: Edit turns every widget into a bar with a grip and arrows over a dimmed body, with dashed places to add, and a template saves the arrangement.

TEMPLATE MENU: A layout glyph in the top bar, named for the template in use. It lists the templates with the one in use checked; picking one switches at once. Each has a pencil that opens edit mode on it. New template asks a name and starts as a copy of the one in use, stored at once. On a phone the menu is a full-width panel under the button.

EDIT MODE: A draft: nothing is stored until Save template. The edit bar replaces the top bar (a name field, a hint, Delete template where there is more than one, Cancel, Save template); the sections show each widget as a bar (grip, Move earlier, Move later, Remove) over a ghost body, and each open place as a dashed "Add a widget" slot that opens a list of the widgets not yet on the template, which stays open after an Add. The keyboard arranges with the arrows, and a status line says where a widget went. On a phone edit mode is a full-height sheet of two lists. Leaving with changes asks first for a link and a closed tab. The last template cannot be deleted.

WIDGET STATES: Each widget has its own. Loading is a skeleton in the widget's shape. No data is the widget's own words ("The Edge score needs at least one closed trade."). Filters that match nothing, an open-only set or a unit that keeps no trade leave every widget on the page, each saying so. Only an empty workspace and all-archived accounts replace the page, with a ghost of the dashboard, Import and "Open the sample workspace" (or Open Accounts). A load failure is neutral with Try again, never loss red.

FORM: Surface-scope roll from Plan 4 (seed:127e5b0155212d4c); Plan 6C changed the structure to the widget grid and kept the look.

FINISH: Unreviewed and undocumented means unfinished. The build ends with:
- the detector run
- the finish review against this contract and the Plan 6C comps
- captures at 1440 and 390, in both themes
- a DESIGN.md update for the components added (done for Plan 6C in Task 20)
