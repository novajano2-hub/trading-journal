# Keel app layout sketches: shared brief

Keel is a trading journal: traders import fills, review trades against their own rules, and track prop-firm accounts. You are sketching the **first viewport of the app's Dashboard** (`/app/dashboard`) for a layout decision. The visual world is fixed and already approved: a light, precise pro-trading look in the spirit of Kraken Pro, Coinbase Advanced and Gemini, with no decoration. Only the layout varies between sketches.

## Hard rules for the file
- One self-contained HTML file, **under 200 lines**, inline `<style>`, **no JavaScript**, nothing fetched except Google Fonts.
- Exactly 1440 x 900: `html,body{width:1440px;height:900px;overflow:hidden;margin:0}`.
- Fonts: `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">`. Use Geist for text and Geist Mono for **every** number.
- Icons: no SVG icon drawings. Use a 16px square with radius 4px in `--sunken` as an icon placeholder, or no icon.
- No em dashes or en dashes anywhere. Use "-" in ranges like "1-20 Nov 2026" and the minus sign "−" for losses.
- Profit and loss always carry a sign (+ or −) as well as colour.

## Tokens (light)
```
--bg:#F6F7F9; --surface:#FFFFFF; --sunken:#EFF1F4; --line:#E3E6EB; --line-2:#D3D8DF;
--text:#0F1218; --muted:#4F5865; --faint:#687080;
--accent:#2550E0; --accent-soft:#EAF0FE; --accent-ink:#1B3FB8;
--gain:#087A54; --gain-soft:#E6F4EE; --loss:#C8283A; --loss-soft:#FBEBED; --warn:#B25E09; --warn-soft:#FDF1E4;
shadow for floating panels: 0 1px 2px rgba(15,18,24,.06), 0 8px 24px rgba(37,80,224,.06)
```

Radius rule:
- chips 6px
- buttons, inputs and inner panels 10px
- cards 16px
- segmented tracks 7px, with a 5px active chip

Type sizes:

| Use | Size |
|---|---|
| Body | 13-14px |
| Labels | 12px in `--faint` |
| Table rows | 12.5px mono |
| KPI figures | 22px mono, weight 500 |
| Page title | 22px, weight 600, tracking -0.02em |
| One hero number, if the layout has one | 34-40px mono |

Active segmented or tab chip: white, with `0 1px 2px rgba(15,18,24,.08)`. Selection uses `--accent-soft` with `--accent-ink` text. Borders are 1px `--line` hairlines. Depth is mostly borders, not shadows.

## Real content (sample workspace)
- **Product name:** Keel. **User badge:** initials "MK".
- **Accounts:**
  - "Futures (live)", balance $27,410.00, P&L +$3,086.00
  - "Prop eval 50K", balance $51,860.00, P&L +$1,860.00
    - profit target $3,000.00, 62% reached
    - trailing drawdown $2,500.00, $1,640.00 left
    - daily loss limit $1,000.00, $780.00 lost today, which is the warning state
    - trading days 7 of 10
  - "Stocks (cash)", balance $18,204.50, P&L −$133.50
- **Period:** 1-20 Nov 2026.
- **Filters:** Date range, Account, Symbol, Side, Strategy, Tags. A Gross / Net segmented switch, with Net active.
- **KPIs (all accounts):**

  | Metric | Value |
  |---|---|
  | Net P&L | +$4,812.50 |
  | Win rate | 54.2% (52 of 96) |
  | Profit factor | 1.86 |
  | Expectancy | +$50.13 |
  | Avg win / avg loss | $212.40 / −$134.10 |
  | Max drawdown | −$1,240.00 |

- **Daily net P&L, trading days:**

  | Date | P&L |
  |---|---|
  | 2 Nov | +$420 |
  | 3 Nov | −$180 |
  | 4 Nov | +$610 |
  | 5 Nov | +$95 |
  | 6 Nov | −$340 |
  | 9 Nov | +$880 |
  | 10 Nov | +$215 |
  | 11 Nov | −$505 |
  | 12 Nov | +$730 |
  | 13 Nov | +$160 |
  | 16 Nov | +$1,020 |
  | 17 Nov | −$275 |
  | 18 Nov | +$540 |
  | 19 Nov | +$1,236 |
  | 20 Nov | +$206.50 |

- **Recent trades:** time, symbol, side, setup tag, net P&L, R.

  | Time | Symbol | Side | Setup tag | Net P&L | R |
  |---|---|---|---|---|---|
  | 20 Nov 10:42 | NQZ5 | Long | Opening range break | +$370.00 | +1.8R |
  | 20 Nov 09:51 | ESZ5 | Short | Moved stop (mistake tag, loss-soft chip) | −$275.00 | −1.4R |
  | 19 Nov 14:05 | AAPL | Long | Pullback | +$142.00 | +0.9R |
  | 19 Nov 11:20 | MNQZ5 | Short | Fade | +$88.50 | +0.6R |
  | 19 Nov 09:38 | CLZ5 | Long | Breakout | −$210.00 | −1.0R |

- **Review queue for today:** 3 trades untagged; 1 rule broken ("Stop stays where it was placed"); daily review note not written.
- **Navigation modules:**
  - Dashboard (active), Trades, Calendar, Reports, Strategies, Notebook, Import, Prop firms
  - A quieter group titled "Not live yet": Backtesting, Replay, Mentors, Assistant
  - Settings at the bottom
- **The one alert worth seeing:** Prop eval 50K is at 78% of its daily loss limit. Show it as a warn-soft banner or a warn chip on that account, with words, not colour alone.

## Charts
Draw them with plain HTML/CSS:
- **Bars:** divs with heights.
- **Equity line:** an inline `<svg>` polyline. That is a data path, which is allowed; icons are not.

Use cumulative values from the daily list for the equity line.

## Quality bar
- It must read as a real working trading product at a glance: aligned grid, consistent spacing, real hierarchy.
- No decorative dots, no eyebrows (small uppercase tracked labels above headings), no gradients except a faint area fill under the equity line, no emoji.

---

## Round 2 content (use with everything above)

**Keep the week consistent.** Daily totals stay exactly as in the list above.

### Trades for 16-20 Nov
Each trade gives entry time (ET), symbol, side, setup tag and net P&L. Every day's trades sum to that day's total.

| Day | Total | Trades |
|---|---|---|
| Mon 16 Nov | +$1,020.00 | 09:34 NQZ5 Long ORB +$560.00; 09:52 ESZ5 Long Pullback +$310.00; 10:40 MNQZ5 Short Fade +$150.00 |
| Tue 17 Nov | −$275.00 | 09:45 NQZ5 Short Breakout −$180.00; 13:10 CLZ5 Long Breakout −$95.00 |
| Wed 18 Nov | +$540.00 | 09:36 NQZ5 Long ORB +$420.00; 11:05 AAPL Long Pullback +$120.00 |
| Thu 19 Nov | +$1,236.00 | 09:38 CLZ5 Long Breakout −$210.00; 09:47 NQZ5 Long ORB +$1,215.50; 11:20 MNQZ5 Short Fade +$88.50; 14:05 AAPL Long Pullback +$142.00 |
| Fri 20 Nov | +$206.50 | 09:51 ESZ5 Short "Moved stop" −$275.00; 10:42 NQZ5 Long ORB +$370.00; 13:30 AAPL Long Pullback +$111.50 |

- The session runs 09:30-16:00 ET.
- Week total: +$2,727.50.

### Totals for 1-20 Nov

| Item | Value |
|---|---|
| Gross P&L | +$5,380.00 |
| Fees | −$567.50 |
| Net P&L | +$4,812.50 |
| Trades | 96 |
| Best day | +$1,236.00 (Thu 19 Nov) |
| Worst day | −$505.00 (Wed 11 Nov) |

### Rules from the trader's own strategy, 1-20 Nov
Each rule gives kept / total and what the broken trades cost.

| Rule | Kept | Broken trades cost |
|---|---|---|
| Entered on the range break | 88 of 96 (92%) | −$598.00 |
| Risk no more than 1R per trade | 90 of 96 (94%) | −$720.00 |
| Stop stays where it was placed | 87 of 96 (91%) | −$1,140.00 |
| No new trade after two losses | 14 of 17 days | −$865.00 |
| Max 6 trades a day | 15 of 15 days | none |

- Overall: 91% of rule checks kept. Broken rules cost −$3,323.00 this period.

### Mistake tags, cost this period

| Tag | Trades | Cost |
|---|---|---|
| Moved stop | 9 | −$1,140.00 |
| Revenge trade | 4 | −$865.00 |
| Oversized | 6 | −$720.00 |
| Chased entry | 8 | −$598.00 |

### Goals

| Goal | Progress |
|---|---|
| Weekly net goal $1,500.00 | +$2,727.50 this week (reached) |
| Daily loss limit $500.00 | kept 14 of 15 days (broken Wed 11 Nov, −$505.00) |
