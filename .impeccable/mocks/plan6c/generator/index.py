import os
from base import OUT
os.chdir(OUT)
comps = sorted(f for f in os.listdir('.') if f[:2].isdigit() and f.endswith('.html'))
states = {'01-dashboard': ['menu'], '02-dashboard-edit': ['picker'], '05-prop-accounts': ['grid', 'menu', 'breach', 'fund'], '07-prop-transactions': ['payout'],
          '08-settings-accounts': ['dialog', 'confirm'], '12-performance-pdf': ['print'], '13-prop-first-run': ['txns', 'totals', 'accounts']}
titles = {'01-dashboard':'Dashboard, Main template (#46, #23)','02-dashboard-edit':'Edit a template, add a widget (#46)','03-dashboard-review':'A second template with the other widgets (#46)',
 '04-prop-dashboard':'Prop dashboard (#45)','05-prop-accounts':'Prop accounts tab, mark as breached, move to funded (#45, D3)','06-prop-details':'Challenge details (#45, D3)','07-prop-transactions':'Transactions, log a payout (#45)',
 '08-settings-accounts':'Cost method per account (#49)','09-calendar-snapshot':'Calendar image (#49)','10-shell-collapsed':'Collapsed sidebar (#50)','11-settings-collapsed':'Collapsed Settings menu (#50)','12-performance-pdf':'Export PDF on Performance (#51)',
 '13-prop-first-run':'Prop first run (#45, C71)'}
nav = ''.join(f'<a href="#{c[:-5]}">{c[:2]}</a>' for c in comps)
body = ''
for c in comps:
    b = c[:-5]
    body += f'<h2 id="{b}">{titles[b]} <a href="{c}">open</a> <a href="{c}?theme=dark">dark</a></h2>'
    for v in [None] + states.get(b, []):
        tag = f'-{v}' if v else ''
        if v: body += f'<h3>?state={v} <a href="{c}?state={v}">open</a></h3>'
        sizes = ['1440-light','1440-dark','390'] if not v else ['1440-light','390']
        cols = ''.join(f'<a href="{c}{"?state="+v if v else ""}"><img loading="lazy" src="captures/{b}{tag}-{s}.png" alt="{titles[b]}{", "+v if v else ""}, {s}"></a>' for s in sizes)
        body += f'<div class="row{" two" if v else ""}">{cols}</div>'
css = """body{margin:0;background:#ECEEF8;color:#121633;font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:#fff;padding:14px 20px;box-shadow:0 1px 2px rgba(18,22,51,.08)} header b{font-size:16px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px} nav a{color:#2B35AF;text-decoration:none;background:#EEEFFC;border-radius:999px;padding:3px 10px;font-size:12.5px}
main{padding:4px 20px 60px;max-width:1800px;margin:0 auto} h2{font-size:17px;margin:28px 0 8px} h3{font-size:14px;margin:14px 0 8px;color:#4B5175}
h2 a,h3 a{font-size:12.5px;font-weight:500;color:#2B35AF;margin-left:8px}
.row{display:grid;grid-template-columns:1fr 1fr 220px;gap:12px;align-items:start} .row.two{grid-template-columns:1fr 220px}
img{width:100%;display:block;border-radius:10px;box-shadow:0 1px 2px rgba(18,22,51,.06),0 14px 30px -18px rgba(34,42,150,.4)}"""
html = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan 6C designs</title><style>{css}</style></head>'
        f'<body><header><b>Plan 6C screen designs</b> &nbsp;Reports, dashboard and polish: {len(comps)} comps at 1440 light, 1440 dark and 390. Click a capture to open the live comp; add ?theme=dark for graphite. '
        "The record wins over a comp on behaviour. The comps show TradeZella's features and behaviour in Keel's own design: layout, look, wording and icons are Keel's, never TradeZella's. "
        f'Checked against the record by an independent parity audit (P6C-01 to P6C-26), every finding fixed.<nav>{nav}</nav></header><main>{body}</main></body></html>')
open('index.html', 'w').write(html)
print(len(comps))
