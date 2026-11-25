from base import *
from dash import adv_calendar, daily, CUM, MONTHS
import random

SET_NAV = [('Profile', 'User', 1), ('Accounts', 'Bank', 2), ('Trading', 'SlidersHorizontal', 2), ('Tags', 'Tag', 2), ('Logs', 'ClockCounterClockwise', 2)]

def settings_nav(active, collapsed=False):
    out, grp = [], None
    for l, ic, g in SET_NAV:
        if grp is not None and g != grp:
            out.append('<li class="sdiv" aria-hidden="true"></li>')
        grp = g
        on = l == active
        lab = f'<span class="sr">{l}</span>' if collapsed else f'<span>{l}</span>'
        tip = f' title="{l}"' if collapsed else ''
        out.append(f'<li><a class="snv{" on" if on else ""}" href="#"{" aria-current=page" if on else ""}{tip}>{icon(ic)}{lab}</a></li>')
    return f'<nav class="card setnav{" col" if collapsed else ""}" aria-label="Settings"><ul>{"".join(out)}</ul></nav>'

SET_CSS = '''
.setlay { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; align-items: start; }
.setlay.col { grid-template-columns: 60px minmax(0, 1fr); }
.setnav { padding: 8px; }
.setnav ul { list-style: none; display: flex; flex-direction: column; gap: 2px; }
.snv { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 9px; color: var(--muted); font-weight: 500; }
.snv:hover { background: var(--sunken); color: var(--text); }
.snv.on { background: var(--sunken); color: var(--text); font-weight: 600; } .snv.on svg.i { color: var(--accent-ink); }
.sdiv { height: 1px; background: var(--line); margin: 6px 6px; }
.setnav.col .snv { justify-content: center; padding: 0; width: 42px; }
.acct td { height: 46px; }
@media (max-width: 1023.98px) { .setlay { grid-template-columns: minmax(0, 1fr); } .setnav { padding: 6px; overflow-x: auto; } .setnav ul { flex-direction: row; } .sdiv { width: 1px; height: 22px; margin: 7px 4px; } }
'''

ACCTS = [('Forex evaluation', 'Sample prop firm', 'Prop evaluation', 103394.44, 'FIFO', 'Set'), ('Futures 100K evaluation', 'Sample prop firm', 'Prop evaluation', 95763.25, 'FIFO', 'Set'),
         ('Futures 50K evaluation', 'Sample prop firm', 'Prop evaluation', 53109.85, 'FIFO', 'Set'), ('Futures 50K funded', 'Sample prop firm', 'Prop funded', 52132.60, 'FIFO', 'Set'),
         ('Futures live', 'Sample futures broker', 'Live', 60860.55, 'LIFO', 'Does not apply'), ('Stocks & options', 'Sample multi-asset broker', 'Live', 27225.56, 'Average', 'Does not apply')]

def build_08():
    rows = ''
    for n, b, t, bal, cm, pr in ACCTS:
        prc = f'<span class="b6" style="display:inline-flex;gap:6px;align-items:center">{icon("CheckCircle-fill")}Set</span>' if pr == 'Set' else '<span class="muted">Does not apply</span>'
        rows += (f'<tr><td class="b6">{n}</td><td class="muted">{b}</td><td><span class="chip{" ac" if "Prop" in t else ""}">{t}</span></td><td>USD</td>'
                 f'<td class="n f">{money(bal, sign=False)}</td><td><span class="chip">{cm}</span></td><td class="muted">Yours</td><td><span class="status">Active</span></td><td>{prc}</td>'
                 f'<td class="n"><button class="ibtn sm" aria-label="Actions for {n}">{icon("DotsThree-bold")}</button></td></tr>')
    table = f'''<table class="acct only-desk" style="margin-top:8px"><colgroup><col style="width:19%"><col style="width:16%"><col style="width:13%"><col style="width:7%"><col style="width:12%"><col style="width:10%"><col style="width:7%"><col style="width:8%"><col><col style="width:46px"></colgroup>
<thead><tr><th>Name</th><th>Broker</th><th>Type</th><th>Currency</th><th class="n">Balance today</th><th>{lbl('Cost method', 'Which lots an exit closes first: the oldest (FIFO), the newest (LIFO), or all at their average cost.')}</th><th>Time zone</th><th>Status</th><th>Prop rules</th><th><span class="sr">Actions</span></th></tr></thead><tbody>{rows}</tbody></table>'''
    prow = ''.join(f'<li><a href="#"><span class="l1"><b style="margin-left:0;font-weight:600">{n}</b><b>{money(bal, sign=False)}</b></span><span class="l2"><span class="chip{" ac" if "Prop" in t else ""}">{t}</span><span>{cm}</span><span>USD</span></span></a></li>' for n, b, t, bal, cm, pr in ACCTS)
    dialog = f'''<div class="veil dg-v" aria-hidden="true"></div>
<div class="dlg dg-d" role="dialog" aria-modal="true" aria-labelledby="ea" style="width:min(560px,calc(100vw - 48px))">
  <div class="dlg-hd"><div><h2 id="ea">Edit Futures live</h2><p>Live account, Sample futures broker</p></div><button class="xbtn" aria-label="Close">{icon("X")}</button></div>
  <div class="dlg-bd" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="fld" style="grid-column:1/-1"><label>Name</label><span class="inp">Futures live</span></div>
    <div class="fld"><label>Broker</label><span class="inp">Sample futures broker</span></div>
    <div class="fld"><label>Type</label><span class="inp">Live{icon("CaretDown-bold","i sel")}</span></div>
    <div class="fld"><label>Currency</label><span class="inp">USD{icon("CaretDown-bold","i sel")}</span></div>
    <div class="fld"><label>Starting balance</label><span class="inp">$ 50,000.00</span></div>
    <div class="fld" style="grid-column:1/-1"><label>Cost method</label>
      <div class="radio" role="radiogroup" aria-label="Cost method">
        <label><span class="rd"></span><span>FIFO, first in first out<small>An exit closes the oldest open lot first. The default.</small></span></label>
        <label class="on"><span class="rd"></span><span>LIFO, last in first out<small>An exit closes the newest open lot first.</small></span></label>
        <label><span class="rd"></span><span>Weighted average<small>An exit closes at the average cost of every lot held.</small></span></label></div></div>
  </div>
  <div class="dlg-ft"><div class="end"><button class="btn">Cancel</button><button class="btn pri">Save account</button></div></div>
</div>
<div class="veil cf-v" aria-hidden="true"></div>
<div class="dlg cf-d" role="alertdialog" aria-modal="true" aria-labelledby="cf" style="width:min(480px,calc(100vw - 48px));height:auto">
  <div class="dlg-hd"><div><h2 id="cf">Switch Futures live to LIFO?</h2></div></div>
  <div class="dlg-bd"><p class="hint" style="font-size:13.5px">Every trade in this account is worked out again from its fills. What can change:</p>
  <ul class="hint" style="margin:8px 0 0 18px;font-size:13.5px;line-height:1.6"><li>which day books each partial exit;</li><li>the realized part of an open trade;</li><li>the total of a pair converted at each exit's rate, such as USDJPY.</li></ul>
  <p class="hint" style="font-size:13.5px;margin-top:8px">A trade's fills, notes, tags, strategies and ratings stay as they are.</p></div>
  <div class="dlg-ft"><div class="end"><button class="btn">Cancel</button><button class="btn pri">Switch to LIFO</button></div></div>
</div>'''
    main = f'''<div class="setlay">{settings_nav('Accounts')}
<section class="card" aria-labelledby="ac">{hd('Accounts', 'ac', 'Sample workspace, 6 accounts', end='<button class="btn pri">'+icon('Plus-bold')+'New account</button>')}
{table}<ul class="prows only-phone">{prow}</ul></section></div>'''
    css = SET_CSS + '''
.dg-v, .dg-d, .cf-v, .cf-d { display: none; }
[data-state='dialog'] .dg-v, [data-state='confirm'] .cf-v { display: block; }
[data-state='dialog'] .dg-d, [data-state='confirm'] .cf-d { display: flex; }
@media (max-width: 639.98px) { .dg-d .dlg-bd { grid-template-columns: 1fr !important; } .dg-d .fld { grid-column: 1/-1; } .cf-d { height: auto !important; } }
'''
    top = topbar('Settings', filters=False)
    page('08-settings-accounts.html', 'Settings, accounts', 'Settings', top, ptop('Settings'), main, css, after=dialog,
         note='?state=dialog opens the account dialog; ?state=confirm the cost method confirmation.')

def snapshot_svg():
    """The image the snapshot makes: the month as shown, Keel's wordmark at the foot."""
    from dash import NOV, NOTES, WIN
    W, H = 560, 420
    x0, y0, cw, chh = 16, 64, 62, 60
    s = f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Preview of the November 2026 calendar image">'
    s += f'<rect width="{W}" height="{H}" rx="10" fill="var(--surface-1)"/>'
    s += '<text x="16" y="30" font-size="15" font-weight="600" fill="var(--text)">November 2026</text>'
    s += '<text x="16" y="48" font-size="11" fill="var(--muted)">Net P&amp;L <tspan fill="var(--gain)" font-weight="600">+$5,512.12</tspan>, 14 trading days, Sample workspace, all accounts</text>'
    for i, d in enumerate(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']):
        s += f'<text x="{x0+i*(cw+4)+4}" y="{y0}" font-size="9.5" fill="var(--faint)">{d}</text>'
    s += f'<text x="{x0+7*(cw+4)+4}" y="{y0}" font-size="9.5" fill="var(--faint)">Week</text>'
    day = 1
    for w in range(5):
        for i in range(7):
            x, y = x0 + i * (cw + 4), y0 + 8 + w * (chh + 4)
            if day > 30 or (w == 0 and i < 0):
                continue
            v = NOV.get(day)
            fill = 'var(--gain-soft)' if v and v[0] > 0 else ('var(--loss-soft)' if v else 'var(--surface-1)')
            st = 'var(--line)'
            s += f'<rect x="{x}" y="{y}" width="{cw}" height="{chh}" rx="6" fill="{fill}" stroke="{st}"/>'
            s += f'<text x="{x+5}" y="{y+13}" font-size="9.5" font-weight="600" fill="var(--text)">{day}</text>'
            if v:
                col = 'var(--gain)' if v[0] > 0 else 'var(--loss)'
                s += f'<text x="{x+5}" y="{y+29}" font-size="10.5" font-weight="600" fill="{col}">{compact(v[0])}</text>'
                s += f'<text x="{x+5}" y="{y+42}" font-size="8.5" fill="var(--muted)">{v[1]} trades</text>'
                s += f'<text x="{x+5}" y="{y+53}" font-size="8.5" fill="var(--muted)">{WIN[day]}% won</text>'
            if day in NOTES:
                s += f'<rect x="{x+cw-13}" y="{y+5}" width="8" height="9" rx="1.5" fill="none" stroke="var(--muted)" stroke-width="1"/><line x1="{x+cw-11}" x2="{x+cw-7}" y1="{y+8.5}" y2="{y+8.5}" stroke="var(--muted)" stroke-width=".8"/><line x1="{x+cw-11}" x2="{x+cw-7}" y1="{y+11}" y2="{y+11}" stroke="var(--muted)" stroke-width=".8"/>'
            day += 1
        wx = x0 + 7 * (cw + 4)
        wt = [4201.65, 1181.31, 129.16, 0, 0][w]
        wd = [5, 5, 4, 0, 0][w]
        s += f'<rect x="{wx}" y="{y0+8+w*(chh+4)}" width="{W-wx-16}" height="{chh}" rx="6" fill="var(--sunken)"/>'
        s += f'<text x="{wx+6}" y="{y0+21+w*(chh+4)}" font-size="9" fill="var(--muted)">Week {w+1}</text>'
        s += f'<text x="{wx+6}" y="{y0+35+w*(chh+4)}" font-size="10" font-weight="600" fill="{"var(--gain)" if wt > 0 else "var(--text)"}">{compact(wt) if wt else "$0"}</text>'
        s += f'<text x="{wx+6}" y="{y0+48+w*(chh+4)}" font-size="8.5" fill="var(--muted)">{wd} days</text>'
    s += f'<text x="{W-16}" y="{H-12}" font-size="11" font-weight="650" fill="var(--accent-ink)" text-anchor="end">Keel</text>'
    s += '</svg>'
    return s

def build_09():
    panel = f'''<div class="veil sn-v" aria-hidden="true" style="background:transparent"></div>
<section class="snap" role="dialog" aria-labelledby="sn" aria-modal="false">
  <div class="shd"><h2 id="sn">Calendar image</h2><button class="xbtn" aria-label="Close">{icon("X")}</button></div>
  <div class="prev">{snapshot_svg()}</div>
  <p class="shint" style="padding-top:10px">November 2026 as shown: your chosen stats, in dollars. keel-calendar-2026-11.png</p>
  <div class="sft"><button class="btn pri">{icon("DownloadSimple")}Download image</button><button class="btn only-desk">{icon("Copy")}Copy image</button></div>
  <p class="shint only-phone">This browser can't copy images. Download saves or shares the file.</p>
</section>'''
    kpi = '''<div class="strip" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-top:4px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
<div><span class="lbl">Net P&amp;L</span><span class="fig gain" style="font-size:19px">+$5,512.12</span><span class="sub">176 trades</span></div>
<div><span class="lbl">Trading days</span><span class="fig" style="font-size:19px">14</span><span class="sub">8 green, 6 red, 0 flat</span></div>
<div><span class="lbl">Trade win rate</span><span class="fig" style="font-size:19px">50.0%</span><span class="sub">88 winners, 88 losers</span></div>
<div><span class="lbl">Best day</span><span class="fig gain" style="font-size:19px">+$2,017.27</span><span class="sub">Fri 6 Nov</span></div>
<div><span class="lbl">Worst day</span><span class="fig loss" style="font-size:19px">−$507.46</span><span class="sub">Mon 16 Nov</span></div></div>'''
    cal = adv_calendar('cm', snap_on=True).replace('<div class="mcal">', kpi.replace('\n', '') + '<div class="mcal">', 1)
    main = f'<div class="only-desk" style="display:none"></div>{cal}'
    css = '''.btn.on { border-color: var(--accent); color: var(--accent-ink); }
@media (max-width: 639.98px) { .strip { grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 10px 0; } .strip > div:nth-child(odd) { padding-left: 0; border-left: 0; } }'''
    page('09-calendar-snapshot.html', 'Calendar, snapshot', 'Calendar', topbar('Calendar'), ptop('Calendar'), main, css, after=panel, tab='Calendar',
         note='The snapshot panel is open; the same button sits on the dashboard calendar widget.')

TR = [('24 Nov', '15:21', 'MNQ', 'Dec 26', 'Long', 'Session momentum', 93.60), ('24 Nov', '14:12', 'GBPUSD', '', 'Short', 'Level reversal', -70.00),
      ('24 Nov', '13:36', 'EURUSD', '', 'Long', 'Session momentum', 130.50), ('24 Nov', '11:14', 'TSLA', '385 Call', 'Long', 'Trend pullback', -145.30),
      ('24 Nov', '10:22', 'MES', 'Dec 26', 'Short', 'Level reversal', 119.80), ('23 Nov', '15:48', 'ES', 'Dec 26', 'Long', 'Opening range breakout', 288.75),
      ('23 Nov', '13:05', 'NQ', 'Dec 26', 'Short', 'Trend pullback', -214.40), ('23 Nov', '10:41', 'AUDUSD', '', 'Long', 'Level reversal', 66.10)]

def build_10():
    rows = ''.join(f'<tr><td class="tm">{d} <b>{t}</b></td><td class="sym"><b>{s}</b> <span>{c}</span></td><td><span class="sd">{sd}</span></td><td>{st}</td><td class="n f {tone(p)}">{money(p)}</td></tr>' for d, t, s, c, sd, st, p in TR)
    pr = ''.join(f'<li><a href="#"><span class="l1"><span class="sym"><b>{s}</b> <span>{c}</span></span><b class="{tone(p)}">{money(p)}</b></span><span class="l2">{d} {t}<span>{sd}</span><span>{st}</span></span></a></li>' for d, t, s, c, sd, st, p in TR)
    main = f'''<section class="card" aria-labelledby="tl">{hd('Trade log', 'tl', 'All time, 1,226 closed trades')}
<table class="only-desk" style="margin-top:8px"><colgroup><col style="width:16%"><col style="width:22%"><col style="width:10%"><col><col style="width:14%"></colgroup><thead><tr><th>Closed</th><th>Instrument</th><th>Side</th><th>Strategy</th><th class="n">Net P&amp;L</th></tr></thead><tbody>{rows}</tbody></table>
<ul class="prows only-phone">{pr}</ul></section>
<div class="tt railtip" style="left:76px;top:256px" role="tooltip">Reports</div>'''
    css = '.railtip { position: fixed; } @media (max-width: 639.98px) { .railtip { display: none; } }'
    page('10-shell-collapsed.html', 'Trades, sidebar collapsed', 'Trades', topbar('Trades'), ptop('Trades'), main, css, collapsed=True, tab='Trades',
         note='The sidebar collapsed to its rail on a desktop page; phones keep the tab bar.')

def build_11():
    main = f'''<div class="setlay col">{settings_nav('Profile', collapsed=True)}
<section class="card" aria-labelledby="pf">{hd('Profile', 'pf', 'How Keel addresses you, your time zone and currency')}
  <div class="grid2" style="margin-top:14px;max-width:720px">
    <div class="fld"><label>First name</label><span class="inp">Sample</span></div><div class="fld"><label>Last name</label><span class="inp">Trader</span></div>
    <div class="fld"><label>Username</label><span class="inp">sample.trader</span></div><div class="fld"><label>Base currency</label><span class="inp">USD{icon("CaretDown-bold","i sel")}</span></div>
    <div class="fld" style="grid-column:1/-1"><label>Time zone</label><span class="inp">America/New_York{icon("CaretDown-bold","i sel")}</span><span class="hint">Trade times and every day's date follow it.</span></div>
  </div></section></div>
<div class="tt railtip" style="left:150px;top:134px" role="tooltip">Accounts</div>'''
    css = SET_CSS + '.railtip { position: fixed; } @media (max-width: 1023.98px) { .railtip { display: none; } .setlay.col { grid-template-columns: minmax(0,1fr); } .setnav.col .snv { width: auto; padding: 0 10px; } .setnav.col .snv .sr { position: static; width: auto; height: auto; clip: auto; overflow: visible; } }'
    page('11-settings-collapsed.html', 'Settings, collapsed', 'Settings', topbar('Settings', filters=False), ptop('Settings'), main, css, collapsed=True,
         note='The sidebar and the Settings menu collapsed together; below lg the Settings menu stays a labelled row.')

def build_12():
    rr = random.Random(9)
    s1 = CUM
    s2 = [52 + 4 * math.sin(i / 10) + rr.gauss(0, .5) for i in range(len(CUM))]
    tabs = ''.join(f'<a href="#" class="{"on" if t == "Performance" else ""}">{t}</a>' for t in ['Overview', 'Performance', 'Reports', 'Compare', 'Calendar'])
    slot = lambda n, title, chart, legend: f'''<section class="card" aria-labelledby="c{n}">{hd(f'Chart {n}', f'c{n}', title, end='<button class="btn sm ghost">'+icon('ArrowsOut')+'Expand</button>')}
  <div class="plot">{chart}</div><div class="wfoot">{legend}</div></section>'''
    weeks = [('15 Nov', 129.16, 37, '48.6%'), ('8 Nov', 1181.31, 67, '52.2%'), ('1 Nov', 4201.65, 72, '55.6%'), ('25 Oct', -842.10, 58, '44.8%'), ('18 Oct', 1622.40, 61, '54.1%')]
    tr = ''.join(f'<tr><td>Week of {w}</td><td class="n f {tone(v)}">{money(v)}</td><td class="n">{n}</td><td class="n">{p}</td></tr>' for w, v, n, p in weeks)
    table = f'<table style="margin-top:8px"><thead><tr><th>Week</th><th class="n">Net P&amp;L</th><th class="n">Trades</th><th class="n">Win rate</th></tr></thead><tbody>{tr}</tbody></table>'
    c1 = slot(1, 'By week, all time', lines_chart([s1], 560, 210, MONTHS), '<span class="k"><i class="ln" style="background:var(--accent)"></i>Net P&amp;L, running</span>')
    c2 = slot(2, 'By week, all time', lines_chart([s2], 560, 210, MONTHS, kind='pct', zero=False), '<span class="k"><i class="ln" style="background:var(--accent)"></i>Win rate, running</span>')
    app = f'''<nav class="ptabs" aria-label="Reports">{tabs}</nav>
<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div class="seg" role="group" aria-label="P&amp;L"><button>Gross</button><button class="on">Net</button></div>
  <button class="btn">{icon("FilePdf")}Export PDF</button></div>
<div class="pgr">{c1}{c2}</div>
<section class="card" aria-labelledby="bw">{hd('By week, chart 1', 'bw', 'Net P&amp;L, trades and win rate')}{table}</section>'''
    sheet = f'''<div class="printwrap"><article class="sheet" aria-label="Print layout preview">
  <h1>Performance report</h1>
  <p class="meta"><b>Sample workspace</b>, all accounts. All time (12 Jun to 24 Nov 2026). Filters: none. Shown in dollars, net of fees. Made 25 Nov 2026, 17:40.</p>
  <div class="pc"><h2>Chart 1 <span class="cap">Net P&amp;L, running, by week</span></h2>{lines_chart([s1], 690, 210, MONTHS)}</div>
  <div class="pc"><h2>Chart 2 <span class="cap">Win rate, running, by week</span></h2>{lines_chart([s2], 690, 190, MONTHS, kind='pct', zero=False)}</div>
  <div class="pc"><h2>By week, chart 1</h2>{table}</div>
  <div class="pfoot"><span>Keel</span><span>Page 1 of 1</span></div>
</article></div>'''
    main = f'<div class="appv">{app}</div><div class="printv">{sheet}</div>'
    css = '''.pgr { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
.printv { display: none; } [data-state='print'] .printv { display: block; } [data-state='print'] .appv { display: none; }
@media (max-width: 1023.98px) { .pgr { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 639.98px) { .printwrap { padding: 12px; } }
/* What the build ships: the same layout under @media print, with the app chrome hidden. */
@media print { .side, .top, .ptop, .tabbar, .appv { display: none !important; } .printv { display: block !important; } .printwrap { background: none; padding: 0; } .sheet { box-shadow: none; width: auto; } }'''
    page('12-performance-pdf.html', 'Reports, Performance and its PDF', 'Reports', topbar('Reports'), ptop('Reports'), main, css, tab='Reports',
         note='?state=print shows the print layout that Export PDF hands to the print dialog.')

if __name__ == '__main__':
    build_08(); build_09(); build_10(); build_11(); build_12(); print('ok')
