---
version: 1
slug: "src-app-marketing-page-tsx"
primary_target: "src/app/(marketing)/page.tsx"
related_targets: []
---

# Landing page (marketing home)

Mode: Persuade. Audience, job and evidence rules are in PRODUCT.md.
- **Primary action:** "Get started". The secondary is "See how it works", which scrolls to the flow section.
- **No file upload on the landing page:** CSV import lives in the app.
- **Proof:** live product components fed by the trading engine's sample week, labelled as sample. There are no customer counts, ratings or prices.

## Direction contract

THESIS: The product itself is the hero. Real Keel components show a real sample week, so a trader recognises their own review loop within seconds. This page refuses the dark-mesh centred hero and the metaphor-world landing.

OWN-WORLD: Light pro-trading.
- **Colour:**
  - ground #F6F7F9, white surfaces, hairlines #E3E6EB
  - ink #0F1218, muted #4F5865
  - a single cobalt accent #2550E0
  - gain #087A54 and loss #C8283A, always paired with a sign or label
- **Type:** Geist for all text, Geist Mono for every number.
- **Shape:** chips 6px; buttons and inner panels 10px; cards and windows 16px.
- **Icons and depth:** Phosphor icons; soft blue-tinted window shadows.
- **Avoid:** eyebrows, em dashes and decorative dots.

STORY: The visitor sees their own kind of week in a dashboard, understands that Keel logs and grades every trade, sees reports that answer "why", and clicks Get started.

FIRST VIEWPORT:
- 64-68px nav.
- **Split hero.** The left 5/12 holds the headline "Find out what's working in your trading." at about 58px over two to three lines, an 18-word subtext, and the Get started and See how it works buttons.
- **Right 7/12:** a light dashboard window that bleeds right where there's room. It shows Net P&L, win rate, profit factor and expectancy ticking up, an equity line drawing in, and three trade rows. A trade-detail card overlaps the bottom left, showing one rule kept and one broken.
- **Signature interaction:** the report tabs (Hour, Session, Setup, Symbol, Mistake) re-chart real engine breakdowns with a sliding active tab.

FORM: User-pinned familiar direction built from Kraken Pro, Coinbase Advanced, Gemini ActiveTrader and Public, with no concept roll. seed: none (user-pinned direction, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
