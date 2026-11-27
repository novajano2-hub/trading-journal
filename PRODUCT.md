# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive web: the marketing site and the app both work on phones. Native mobile apps are out of scope for now.

## Stack

Next.js (the user's choice). Supporting choices were delegated, so these are my calls:

- TypeScript, Tailwind CSS and Radix primitives, styled in-house
- TradingView Lightweight Charts (Apache-2.0) for price and replay charts
- a permissively licensed library for analytics charts

For reference, TradeZella's app is a Vite + React single-page app hosted on Heroku. It uses the licensed TradingView Charting Library and Highcharts. MyTradingJourney's app is Next.js on Vercel.

## Users

Retail traders of stocks, options, futures, forex and crypto, at every stage:

- losing money and looking for why
- developing and trying to become consistent
- profitable and protecting their edge
- prop-firm traders working through evaluations and managing funded accounts
- mentors and trading communities who review other traders' work

The job: find out what is and isn't working in their trading, then change their behaviour so the same mistakes stop repeating.

## Product Purpose

One platform that does the jobs of TradeZella and MyTradingJourney together:

- trades journaled automatically from broker sync or file import
- analysed in depth
- measured against the trader's own strategies and rules
- replayed and backtested
- tracked against prop-firm rules
- shared with a mentor

Success: traders stop paying for several tools, and their review habit sticks because the logging is done for them.

## Positioning

Delegated to me; this is my call from category practice. Everything in one place, organised as one improvement loop: **trade → journal → review against your rules → test the fix → trade again**. Neither source product covers the whole loop:

- TradeZella has no trade copier and gates replay and AI behind higher tiers.
- MyTradingJourney has no playbooks, rule tracking or psychology tooling.

The claim we can make truthfully is the complete loop under one subscription.

## Operating Context

- **Main use:** post-session review on a desktop or laptop. Often end of day, often next to the trader's trading platform.
- **Other moments:**
  - pre-market planning (checklist, game plan)
  - quick P&L and rule checks on a phone
  - weekly and monthly recaps
  - mentor review sessions
- **Data density:** one trader can have thousands of trades across several accounts and brokers.
- **Vocabulary:** P&L (gross and net of fees), R-multiple, win rate, profit factor, expectancy, max drawdown, MAE/MFE, setups/playbooks, mistakes, sessions, evaluation vs funded account, daily loss limit, trailing drawdown.

## Capabilities and Constraints

- **First milestone:** frontend only. App shell, marketing landing page and core app pages, driven by typed sample data shaped like the real domain model (accounts → trades → executions, tags, strategies, notes).
- **Built in full in milestone 1:** Dashboard, Trades (log and detail), Calendar, Reports, Strategies, Notebook.
- **Structure only in milestone 1:** Backtesting, Replay, Prop firms, Mentor & Spaces, AI assistant. They need market data, AI and multi-user backends later.
- **Deferred and tracked in the backlog:** trade copier (MT4/MT5 add-on), education/University, real broker auto-sync, licensed market data.
- **Sources:** we rebuild the systems of TradeZella and MyTradingJourney, never their UI, copy or branding.

## Brand Commitments

- Working name: **Keel**. It's a placeholder; the real name comes later.
- **Visual direction (user-pinned, 2026-11-20).** A light, precise, pro-trading look built from the user's references: Kraken Pro, Coinbase Advanced, Gemini ActiveTrader and Public, plus Mobbin and HorizonX references.
  - The approved mock was `.impeccable/mocks/rebrand/landing-v3.html` (its layout still stands; its look was replaced by the app direction below).
  - Appearance is a setting (System by default, Light, Dark); there is no theme toggle. Dark is a neutral graphite, as pro terminals use (user's word, 2026-11-24).
- **App direction (user-picked, 2026-11-21): "Daylight premium".** The user rejected the Plan 4 app look as "too plain and grey… looks like AI slop" and chose comp C of three hi-fi comps: `.impeccable/mocks/rebrand-app/c-daylight-premium.html`.
  - Keel Ultramarine #2B35AF, the one hue the money palette never uses, carries the brand, spent sparingly (primary actions, the active state, focus, series 1).
  - Periwinkle-tinted canvas, white cards with brand-tinted shadows, Instrument Sans with tabular figures.
  - **2026-11-24, the user's word, reversing parts of comp C:** no icon tiles anywhere ("AI slop"); the "Your plan" hero is a neutral card (that card, and the "Plan vs actual" Dashboard it led, were retired in Plan 6C for the widget Dashboard, 2026-11-25); a phone navigates from a bottom tab bar, not a hamburger drawer; the auth pages are centred.
  - The whole product follows it: on 2026-11-21 the user asked that the landing "adapt to the new changes", so the marketing site moved to the same tokens, face and product-shot treatment, replacing the landing-v3 Geist and cobalt system.
- **Rejected:** metaphor worlds (the earlier "Trading Floor" tickets and stamps), dark-mesh hero clichés, editorial serif display type, and anything that reads as AI-generated. The user's words: "no AI slop".
- **Quality bars:** the design-taste-frontend and Impeccable skills. HorizonX coded components may be used directly under their commercial licence.
- No look or copy is taken from TradeZella or MyTradingJourney.

## Evidence on Hand

None yet. There are no customers, testimonials, user counts, trade counts, broker counts, ratings, press or prices. These must not be invented. Product screenshots and demo data can be authored, labelled as sample data. Pricing tiers stay as placeholders until decided.

## Product Principles

1. **Exact numbers.** P&L includes fees and commissions. Nothing is rounded or framed to look better than it was.
2. **Review in minutes.** Automation does the logging, so the trader's time goes to reflection and decisions.
3. **The trader's own rules are the yardstick.** Progress is measured against their plan, not a generic score alone. Rules are measured on the Progress tracker and the Strategies pages; a composite score, the Edge score, is one widget on the Dashboard beside them and never in their place.
4. **One loop, no tool-hopping.** Every module links back to the trades it came from.
5. **Never fake capability.** A module that isn't live yet says so plainly.

## Accessibility & Inclusion

- Profit and loss are never shown by red/green colour alone. A sign, label or shape always carries the meaning, for colour-blind traders. (My call.)
- Dense tables and charts stay keyboard-navigable.
