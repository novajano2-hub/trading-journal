---
version: 1
slug: "src-app-app-app-dashboard-page-tsx"
primary_target: "src/app/(app)/app/dashboard/page.tsx"
related_targets: ["src/app/(app)/layout.tsx"]
---

# App shell and Dashboard

**Mode:** Operate.

**Audience and job:** Retail and prop-firm traders doing their post-session review on a laptop, often end of day, next to their trading platform. The job is to see whether they traded their own plan, what breaking it cost, and where to look next.

**Proof and content:**
- Sample workspace (Plan 2), labelled as sample.
- The user's imported trades once they exist.
- All figures come from `src/domain` via the Plan 2 hooks.

**Constraints:**
- Global filters (date range, account, symbol, side, strategy, tags) live in the URL and scope every number.
- Desktop-first, usable at 390px.
- Gross/Net toggle.
- Every metric carries its definition.

**Chosen layout:** "Plan vs actual". The user picked it on 2026-11-20 from six sketches at `.impeccable/mocks/decision-app/`. The approved sketch is `rules-scorecard.html` (render: `6-plan-vs-actual.png`). The user also asked for "cool and banger icons and other UI elements from horizon or other references".

**Unresolved:** none blocking. The mobile collapse of the sidebar and the rules table is the builder's call within this contract.

## Direction contract

THESIS: The trader's own plan is the yardstick. The Dashboard opens on how well they kept their rules and what breaking them cost in dollars, with performance second. It refuses the category default of a P&L hero and a wall of KPI tiles.

OWN-WORLD: The shipped light pro-trading system in DESIGN.md:
- cool neutral ground, white cards
- one cobalt accent
- gain and loss always signed
- Geist, with Geist Mono for every number
- radius rule 6/10/16

Additions for the app:
- **Icons:** Phosphor icons in the duotone weight, set in 32px tinted tiles (accent-soft, or gain-soft/loss-soft where state applies). One family, no mixing.
- **HorizonX components, restyled to tokens:**
  - Signal Tooltip for metric definitions
  - Morph Dialog for rule drill-down
  - Expanding Search for the ⌘K search
  - Task Checkbox for review checklists
  - the existing number ticker, button press and sliding tabs
- **Avoid:** eyebrows, em and en dashes, decorative dots, and colour without a sign or label.

STORY: The trader opens Keel after the close and sees at once that they kept 91% of their rule checks, but that a moved stop cost $1,140. They open that rule, see the nine trades that broke it, tag what is missing, and leave knowing tomorrow's one fix.

FIRST VIEWPORT:
- **Left sidebar, 220px:** wordmark, account switcher, labelled modules with duotone icons, a quieter "Not live yet" group, and Settings.
- **Top bar, 56px:** title, the URL-driven filter chips, an expanding search, Gross/Net, and Import.
- **Row 1, "Your plan":**
  - The adherence percentage, ticking up, plus the cost of broken rules.
  - A rules table sorted by cost: kept count, adherence track, percentage, and cost when broken. The costliest rule is flagged.
- **Row 2:** three cards.
  - Mistakes by cost
  - Goals
  - Performance, with KPIs and an equity sparkline
- **Row 3:** recent trades with a Rules column.
- **Signature move:** every rule row and every mistake opens, through the morph dialog, the exact trades behind its number.

FORM: Surface-scope roll, structure chosen by the user from a re-rolled hand (dealt structure, option 2). seed:127e5b0155212d4c

FINISH: Unreviewed and undocumented means unfinished. The build ends with:
- the detector run
- the finish review against this contract and the approved sketch
- captures at 1440 and 390, in both themes
- a DESIGN.md update for the app components added
