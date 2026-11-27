from base import *
import random

# ---------- sample figures (Sample workspace, all accounts, all time) ----------
NET = 17010.80
WINS, BES, LOSSES = 597, 0, 629
GREEN, RED, FLAT = 74, 53, 0
AVG_W, AVG_L = 213.80, -175.88
GP, GL = 127639.37, -110628.57
SUBS = [('Win rate', 81.2), ('Profit factor', 38.3), ('Win to loss', 40.7), ('Recovery', 100), ('Drawdown', 69.7), ('Consistency', 98.9)]
SCORE = 63.73

r = random.Random(7)
DAYS = 127
daily = []
for i in range(DAYS):
    v = r.gauss(134, 520)
    daily.append(round(v, 2))
adj = (NET - sum(daily)) / DAYS
daily = [round(d + adj, 2) for d in daily]
CUM = cum(daily)
MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']

def kpi_net():
    return f'''<section class="card kw" aria-labelledby="k1">
  <div class="hd" style="min-height:22px">{lbl('<span id="k1">Net P&amp;L</span>', 'Realized net P&L of the closed trades in your filters, after fees.')}<span class="chip" style="margin-left:auto">1,226 trades</span></div>
  <span class="fig gain">+$17,010.80</span>
</section>'''

def kpi_win():
    return f'''<section class="card kw" aria-labelledby="k2">
  <div class="hd" style="min-height:22px">{lbl('<span id="k2">Trade win rate</span>', 'Winning trades over all closed trades.')}</div>
  <span class="fig">48.7%</span>
  {split([(WINS,'g'),(BES or 0,'n'),(LOSSES,'l')])}
  <span class="sub">597 won, 0 breakeven, 629 lost</span>
</section>'''

def kpi_pf():
    return f'''<section class="card kw" aria-labelledby="k3">
  <div class="hd" style="min-height:22px">{lbl('<span id="k3">Profit factor</span>', 'Gross profit over gross loss, after fees.')}</div>
  <span class="fig">1.15</span>
  {split([(GP,'g'),(-GL,'l')])}
</section>'''

def kpi_day():
    return f'''<section class="card kw" aria-labelledby="k4">
  <div class="hd" style="min-height:22px">{lbl('<span id="k4">Day win rate</span>', 'Green days over trading days.')}</div>
  <span class="fig">58.3%</span>
  {split([(GREEN,'g'),(RED,'l')])}
  <span class="sub">74 green, 0 flat, 53 red</span>
</section>'''

def kpi_ratio():
    return f'''<section class="card kw" aria-labelledby="k5">
  <div class="hd" style="min-height:22px">{lbl('<span id="k5">Average win to loss</span>', 'The average winning trade over the average losing trade.')}</div>
  <span class="fig">1.22</span>
  {split([(213.8,'g'),(175.88,'l')])}
  <span class="sub"><span class="gain">+$213.80</span> / <span class="loss">−$175.88</span></span>
</section>'''

def score_widget(hid='sc'):
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Edge score', hid, 'All time', tip='One score from 0 to 100 for six parts of your trading: win rate, profit factor, average win to loss, recovery, drawdown and consistency.')}
  <div class="score-body">
    {radar(SUBS, 250, hid)}
    <table class="sr"><caption>Edge score parts, each out of 100</caption><tbody>{''.join(f'<tr><th>{l}</th><td>{v:.1f}</td></tr>' for l, v in SUBS)}</tbody></table>
    <div class="sc-row">
      <div><span class="fig">63.73</span><span class="band">Building</span></div>
      <div class="sc-trk"><div class="t" role="img" aria-label="63.73 of 100, in the building band (40 to 70)"><i style="width:63.73%"></i><s style="left:40%"></s><s style="left:70%"></s><b style="left:63.73%"></b></div>
        <div class="sc-scale"><span>0</span><span>Weak</span><span>40</span><span>Building</span><span>70</span><span>Strong</span><span>100</span></div></div>
    </div>
  </div>
</section>'''

def tracker_widget(hid='pt'):
    rr = random.Random(3)
    cells = ''
    for w in range(18):
        for d in range(7):
            if d in (0, 6):
                cells += '<i aria-hidden="true"></i>'
            else:
                lv = rr.choice([2, 3, 3, 4, 4, 4, 1, 0])
                cells += f'<i class="l{lv}"></i>'
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Progress tracker', hid, end='<a class="lnk" href="#">Open tracker '+icon('ArrowRight')+'</a>', tip='Each square is a trading day, shaded by the share of rules you met.')}
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:10px">
    <div><span class="lbl">Today</span><span class="fig" style="font-size:20px">5 <span class="of">of</span> 8 <small>rules met</small></span></div>
    <button class="btn sm">{icon('ListChecks')}Today's checklist</button>
  </div>
  <div class="trk" style="margin-top:10px"><i style="width:62.5%"></i></div>
  <div style="margin-top:16px" class="hg-wrap"><div class="hg-body"><div class="hg-wd" style="--c:11px;--g:3px" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
  <div class="hg" style="--c:11px;--g:3px" role="img" aria-label="Rules met each scored day, 18 weeks to Tue 24 Nov">{cells}</div></div></div>
  <div class="wfoot" style="justify-content:space-between"><span>Rules met each trading day</span><span class="legend" aria-hidden="true">Less<i style="background:var(--hg0)"></i><i style="background:var(--hg1)"></i><i style="background:var(--hg2)"></i><i style="background:var(--hg3)"></i><i style="background:var(--hg4)"></i>More</span></div>
</section>'''

def cum_widget(hid='cu'):
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Cumulative net P&amp;L', hid, 'By trading day', tip='Your running net P&L at the close of each trading day.')}
  <div class="plot">{area_chart(CUM, 340, 200, hid, MONTHS)}</div>
</section>'''

def daily_widget(hid='dl'):
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Net daily P&amp;L', hid, 'By trading day', tip="Each trading day's net P&L, after fees.")}
  <div class="plot">{bar_chart(daily, 340, 200, MONTHS)}</div>
</section>'''

RECENT = [('24 Nov', '15:21', 'MNQ', 'Dec 26', 93.60), ('24 Nov', '14:12', 'GBPUSD', '', -70.00), ('24 Nov', '13:36', 'EURUSD', '', 130.50),
          ('24 Nov', '11:14', 'TSLA', '385 Call', -145.30), ('24 Nov', '10:22', 'MES', 'Dec 26', 119.80), ('23 Nov', '15:48', 'ES', 'Dec 26', 288.75)]

def recent_widget(hid='rt'):
    rows = ''.join(f'<tr><td class="tm">{d} <b>{t}</b></td><td class="sym"><b>{s}</b> <span>{c}</span></td><td class="n f {tone(p)}">{money(p)}</td></tr>' for d, t, s, c, p in RECENT)
    prow = ''.join(f'<li><a href="#"><span class="l1"><span class="sym"><b>{s}</b> <span>{c}</span></span><b class="{tone(p)}">{money(p)}</b></span><span class="l2">{d} {t}</span></a></li>' for d, t, s, c, p in RECENT[:5])
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Recent trades', hid, tip='Your latest closed trades, and the positions still open.')}
  <div class="seg rt-tabs" role="tablist"><button class="on" role="tab" aria-selected="true">Closed</button><button role="tab" aria-selected="false">Open positions</button></div>
  <table class="rt only-desk" style="margin-top:8px"><colgroup><col style="width:42%"><col><col style="width:30%"></colgroup><thead><tr><th>Closed</th><th>Instrument</th><th class="n">Net P&amp;L</th></tr></thead><tbody>{rows}</tbody></table>
  <ul class="prows only-phone" style="margin-top:6px">{prow}</ul>
</section>'''

def balance_widget(hid='bl'):
    bal = [375000 + c for c in CUM]
    bal = [b - (2500 if i > 96 else 0) for i, b in enumerate(bal)]
    flows = [0 if i <= 96 else -2500 for i in range(DAYS)]
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Account balance', hid, tip='Starting balance plus the closed trades\' net P&L, with deposits and withdrawals on their dates.')}
  <div class="plot">{dual_chart(bal, flows, 340, 200, MONTHS)}</div>
  <div class="wfoot"><span class="k"><i class="ln" style="background:var(--accent)"></i>Balance, left scale</span><span class="k"><i class="ln" style="background:var(--muted)"></i>Deposits and withdrawals, net, right scale</span></div>
</section>'''

NOV = {2: (-388.03, 13), 3: (641.71, 15), 4: (1005.55, 16), 5: (925.15, 14), 6: (2017.27, 14), 9: (-29.53, 16), 10: (-0.59, 12), 11: (-363.83, 11),
       12: (1334.03, 14), 13: (241.23, 14), 16: (-507.46, 12), 17: (86.25, 10), 18: (631.87, 12), 19: (-81.50, 3)}
NOTES = {3, 4, 6, 12, 18}
WIN = {2: 46, 3: 60, 4: 63, 5: 57, 6: 71, 9: 44, 10: 42, 11: 36, 12: 57, 13: 50, 16: 33, 17: 60, 18: 58, 19: 33}

def adv_calendar(hid='mc', snap_on=False):
    head = ''.join(f'<span class="wd">{d}</span>' for d in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) + '<span class="wd wkh">Week</span>'
    cells = ''
    day = 1
    weeks = [[1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14], [15, 16, 17, 18, 19, 20, 21], [22, 23, 24, 25, 26, 27, 28], [29, 30, -1, -2, -3, -4, -5]]
    wk_tot = []
    for wi, w in enumerate(weeks):
        tot, n = 0, 0
        for d in w:
            if d < 0:
                cells += f'<div class="c o"><span class="d">{-d}</span></div>'
                continue
            nt = icon('NotePencil', 'i nt', 'Journal entry') if d in NOTES else ''
            td = ' today' if d == 24 else ''
            if d in NOV:
                v, t = NOV[d]
                tot += v; n += 1
                cells += f'<div class="c {"g" if v > 0 else "l"}{td}"><span class="d">{d}</span>{nt}<b class="full">{money(v)}</b><b class="cmp" aria-hidden="true">{compact(v)}</b><span class="x">{t} trades</span><span class="x">{WIN[d]}% won</span></div>'
            else:
                cells += f'<div class="c{td}"><span class="d">{d}</span>{"<span class=x style=margin-top:auto;color:var(--accent-ink);font-weight:600>Today</span>" if d == 24 else ""}</div>'
        cells += f'<div class="wk"><span>Week {wi+1}</span><b class="{tone(tot)}">{money(tot)}</b><span>{n} days</span></div>'
    return f'''<section class="card" aria-labelledby="{hid}">
  <div class="calhd"><h2 id="{hid}">November 2026</h2><button class="tip" type="button" aria-label="Each day's net P&L and the stats you choose; the whole month shows, whatever the date range." title="Each day's net P&L and the stats you choose.">{icon('Info')}</button>
    <button class="ibtn sm" aria-label="Previous month">{icon('CaretLeft-bold')}</button><button class="ibtn sm" aria-label="Next month">{icon('CaretRight-bold')}</button>
    <button class="btn sm">This month</button>
    <div class="end"><span class="mstat">Month <b class="gain">+$5,512.12</b>, 14 days</span>
      <button class="btn sm" aria-label="Stats shown">{icon('SlidersHorizontal')}<span class="bt">Stats shown</span></button>
      <button class="btn sm{' on' if snap_on else ''}" aria-haspopup="dialog" aria-label="Snapshot">{icon('Camera')}<span class="bt">Snapshot</span></button></div></div>
  <div class="mcal">{head}{cells}</div>
  <div class="wfoot"><span class="k"><i style="background:var(--gain-soft);border:1px solid var(--gain-fill)"></i>Green day</span><span class="k"><i style="background:var(--loss-soft);border:1px solid var(--loss-fill)"></i>Red day</span><span class="k">{icon('NotePencil')}Journal entry</span><span>The whole month shows, whatever the date range.</span></div>
</section>'''

def drawdown_widget(hid='dd'):
    peak, dd = -1e9, []
    for c in CUM:
        peak = max(peak, c)
        dd.append(min(0, c - peak))
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Drawdown', hid, 'By trading day', tip='How far your cumulative net P&L sat below its highest close, each trading day.')}
  <div class="plot">{area_chart(dd, 340, 170, hid, MONTHS, color='var(--loss-fill)', zero=False)}</div>
</section>'''

def time_widget(hid='tt', which='Entry'):
    rr = random.Random(11)
    pts = []
    for _ in range(320):
        h = rr.choice([rr.gauss(.18, .08), rr.gauss(.42, .1), rr.gauss(.7, .12)])
        pts.append((min(.99, max(.01, h)), rr.gauss(20, 190)))
    xt = [(i / 6, f'{4 + 2*i:02d}:00') for i in range(7)]
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Trade time performance', hid, end='<div class="seg" role="group" aria-label="Time of"><button class="'+('on' if which=='Entry' else '')+'">Entry</button><button class="'+('on' if which=='Exit' else '')+'">Exit</button></div>', tip='Each closed trade by the time of day it was entered, or exited, and its net P&L.')}
  <div class="plot">{scatter(pts, 340, 210, xt)}</div>
  <div class="wfoot"><span class="k"><i class="dot"></i>Win</span><span class="k"><i class="ring"></i>Loss</span><span>Times in New York</span></div>
</section>'''

def duration_widget(hid='du'):
    rr = random.Random(19)
    ticks = ['4m', '8m', '15m', '30m', '1h', '2h', '4h', '7h', '14h', '1d', '2d', '4d']
    pts = []
    for _ in range(300):
        x = min(.99, max(.01, rr.gauss(.38, .17)))
        pts.append((x, rr.gauss(15, 180 + 120 * x)))
    xt = [(i / (len(ticks) - 1), t) for i, t in enumerate(ticks)]
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Trade duration performance', hid, 'Log scale', tip='Each closed trade by how long it was held, and its net P&L.')}
  <div class="plot">{scatter(pts, 340, 210, xt)}</div>
  <div class="wfoot"><span class="k"><i class="dot"></i>Win</span><span class="k"><i class="ring"></i>Loss</span></div>
</section>'''

DASH_CSS = '''
.dhead { display: flex; align-items: center; gap: 10px; }
.dhead .cap { font-size: 12.5px; color: var(--faint); }
.pop.menu { display: none; right: 120px; top: 58px; }
[data-state='menu'] .pop.menu { display: block; }
@media (max-width: 1279.98px) { .upper { grid-template-columns: repeat(3, minmax(0,1fr)); } .lower { grid-template-columns: repeat(2, minmax(0,1fr)); } .lower > .w2 { grid-column: span 2; } }
@media (max-width: 639.98px) { .pop.menu { right: 8px; left: 8px; top: 52px; } }
'''

def tpl_button(name='Main'):
    return f'<button class="ibtn tpl" aria-haspopup="menu" aria-label="Dashboard template: {name}" title="Dashboard template: {name}">{icon("Layout")}</button>'

def tpl_menu():
    ck = icon('Check-bold')
    ed = icon('PencilSimple')
    return f'''<div class="pop menu" role="menu" aria-label="Dashboard templates">
  <p class="ph">Templates</p>
  <div class="row" role="menuitemradio" aria-checked="true"><span class="ck">{ck}</span><span class="nm">Main</span><button class="ed" aria-label="Edit Main">{ed}</button></div>
  <div class="row" role="menuitemradio" aria-checked="false"><span class="ck"></span><span class="nm">Review</span><button class="ed" aria-label="Edit Review">{ed}</button></div>
  <hr>
  <div class="row act" role="menuitem">{icon('Plus-bold')}<span class="nm">New template</span></div>
</div>'''

def build_01():
    upper = kpi_net() + kpi_win() + kpi_pf() + kpi_day() + kpi_ratio()
    lower = (score_widget() + tracker_widget() + cum_widget() + daily_widget() + recent_widget() + balance_widget()
             + f'<div class="w2">{adv_calendar()}</div><div class="rcol">{drawdown_widget()}{time_widget()}</div>' + duration_widget())
    main = f'''<div class="upper" aria-label="Figures">{upper}</div>
<div class="lower">{lower}</div>'''
    extra = f'<button class="btn" type="button" aria-haspopup="dialog">{icon("CalendarCheck")}Plan the day</button>{tpl_button()}'
    top = topbar('Dashboard', extra=extra).replace('</header>', tpl_menu() + '</header>')
    pt = ptop('Dashboard', extra=f'<button class="pbtn" aria-label="Dashboard template: Main">{icon("Layout")}</button>')
    page('01-dashboard.html', 'Dashboard', 'Dashboard', top, pt, main, DASH_CSS, tab='Dashboard',
         note='?state=menu opens the template menu.')

# ---------- 02 edit mode ----------
def ew(title, ghost='', cls=''):
    g = ghost or '<div class="ghost w6"></div><div class="ghost w4"></div>'
    return f'''<section class="card ew {cls}" aria-label="{title}">
  <div class="ebar"><span class="grip" title="Drag to move">{icon('DotsSixVertical-bold')}</span><b>{title}</b>
    <button aria-label="Move {title} earlier" title="Move earlier">{icon('ArrowLeft')}</button><button aria-label="Move {title} later" title="Move later">{icon('ArrowRight')}</button>
    <button class="rm" aria-label="Remove {title}" title="Remove">{icon('X')}</button></div>
  <div class="ebody">{g}</div>
</section>'''

def slot(text='Add a widget', small=''):
    s = f'<small>{small}</small>' if small else ''
    return f'<button class="slot" type="button" aria-haspopup="dialog">{icon("Plus-bold")}{text}{s}</button>'

UPPER_CAT = [('Net P&L', 'Realized net P&L of the closed trades, with the trade count.', True),
             ('Account balance and P&L', "The balance at the range's end, with the closed net P&L in the range.", False),
             ('Trade win rate', 'Winning trades over closed trades, with won, breakeven and lost.', True),
             ('Profit factor', 'Gross profit over gross loss, after fees.', False),
             ('Day win rate', 'Green days over trading days.', True),
             ('Average win to loss', 'The average win over the average loss, with both amounts.', False),
             ('Trade expectancy', 'What an average closed trade made or lost.', False),
             ('Day streak', 'Winning days in a row, up to your last trading day.', False),
             ('Trade streak', 'Winning trades in a row, up to your last trade.', False),
             ('Streaks', 'The day and trade streaks side by side.', False),
             ('Max drawdown', 'The deepest fall from a high, in dollars and percent, with its date.', False),
             ('Average drawdown', "The average daily drawdown in the range; today's drawdown when no range is set.", False)]

def build_02():
    ghost_big = '<div class="ghost tall"></div>'
    upper = ew('Net P&L') + ew('Trade win rate') + ew('Profit factor') + ew('Day win rate') + ew('Average win to loss')
    lower = (ew('Edge score', ghost_big) + ew('Progress tracker', ghost_big) + ew('Cumulative net P&L', ghost_big, 'dragging')
             + ew('Net daily P&L', ghost_big) + ew('Recent trades', ghost_big) + ew('Account balance', ghost_big)
             + f'<div class="w2">{ew("Calendar, with stats", ghost_big)}</div><div class="rcol">{ew("Drawdown", ghost_big)}{ew("Trade time performance", ghost_big)}</div>'
             + ew('Trade duration performance', ghost_big) + slot('Add a widget', 'Lower section'))
    edit = f'''<header class="editbar" aria-label="Editing a dashboard template">
  <div class="nmf"><label for="tn">Template name</label><input id="tn" class="inp" value="Main"></div>
  <span class="edhint">Drag a widget, or use its arrows, to move it.</span>
  <div class="end"><button class="btn ghost">{icon('Trash')}Delete template</button>
  <button class="btn">Cancel</button><button class="btn pri">Save template</button></div>
</header>'''
    lower_missing = [('Win rate, average win and average loss', 'The three, running through the day, by the time each trade closed.'),
                     ('Daily and cumulative net P&L', "Each day's net P&L as a bar, with the running total as a line."),
                     ('Calendar', 'The month, each day tinted by its net.'), ('Challenge', "One prop challenge's progress against its rules."),
                     ('Calendar mini', 'A small month; a day opens its Day view.'), ('Report', 'A chart of up to three Performance metrics.'),
                     ('Yearly calendar', 'The year, month by month; a month opens Calendar.')]
    pick = ''.join(f'<li><div class="pt"><b>{n}</b><small>{d}</small></div><button class="btn sm">' + icon('Plus-bold') + 'Add</button></li>' for n, d in lower_missing)
    dialog = f'''<div class="veil picker-v" aria-hidden="true"></div>
<div class="dlg picker" role="dialog" aria-modal="true" aria-labelledby="pk" style="width:min(560px,calc(100vw - 48px))">
  <div class="dlg-hd"><div><h2 id="pk">Add a widget</h2><p>For the lower section. Widgets already on this template aren't listed.</p></div><button class="xbtn" aria-label="Close">{icon('X')}</button></div>
  <div class="dlg-bd"><ul class="picklist">{pick}</ul></div>
</div>'''
    phone = f'''<div class="only-phone"><div class="card" style="padding:14px 16px">
  <div class="fld"><label for="tn2">Template name</label><input id="tn2" class="inp" value="Main"></div></div></div>'''
    main = f'''{phone}<div class="sect-h"><h2>Upper section</h2><span>Up to 5 figures; this one is full</span></div>
<div class="upper">{upper}</div>
<div class="sect-h"><h2>Lower section</h2><span>Charts, lists and calendars</span></div>
<div class="lower">{lower}</div>
<div class="only-phone" style="display:flex;flex-direction:column;gap:8px"><button class="btn pri wide lg">Save template</button><button class="btn wide lg">Cancel</button><button class="btn ghost wide">Delete template</button></div>'''
    css = DASH_CSS + '''
.picker, .picker-v { display: none; }
[data-state='picker'] .picker, [data-state='picker'] .picker-v { display: flex; }
[data-state='picker'] .picker-v { display: block; }
.upper .slot { min-height: 128px; }
.lower .slot { min-height: 150px; }
.lower .ew .ebody { min-height: 120px; }
@media (max-width: 639.98px) { .ew .ebar button[title='Move earlier'] svg, .ew .ebar button[title='Move later'] svg { transform: rotate(90deg); } .ew .ebody { display: none; } .upper .slot { min-height: 64px; } }
'''
    pt = f'<header class="ptop"><h1>Edit template</h1><div class="end"><button class="pbtn" aria-label="Close">{icon("X")}</button></div></header>'
    page('02-dashboard-edit.html', 'Edit a dashboard template', 'Dashboard', edit, pt, main, css, after=dialog, tab='Dashboard',
         note='?state=picker opens the add-a-widget picker.')

# ---------- 03 the second template: help-only widgets ----------
def kpi_simple(hid, label, tip, fig, sub, cls=''):
    return f'''<section class="card kw" aria-labelledby="{hid}">
  <div class="hd" style="min-height:22px">{lbl(f'<span id="{hid}">{label}</span>', tip)}</div>
  <span class="fig {cls}">{fig}</span>
  <span class="sub">{sub}</span>
</section>'''

def streaks_kpi():
    return f'''<section class="card kw" aria-labelledby="ks">
  <div class="hd" style="min-height:22px">{lbl('<span id="ks">Streaks</span>', 'Winning days in a row up to your last trading day, and winning trades in a row up to your last trade.')}</div>
  <div class="grid2" style="margin-top:4px;gap:10px"><div><span class="fig">3 <small>days</small></span><span class="sub">winning days in a row</span></div>
  <div><span class="fig">0 <small>trades</small></span><span class="sub">winning trades in a row</span></div></div>
</section>'''

def wal_widget(hid='wa'):
    rr = random.Random(23)
    n = 80
    wr = [48 + 7 * math.exp(-i / 18) * math.cos(i / 6) + rr.gauss(0, .4) for i in range(n)]
    aw = [205 + 18 * math.exp(-i / 25) + rr.gauss(0, 2) for i in range(n)]
    al = [-170 - 12 * math.exp(-i / 20) + rr.gauss(0, 2) for i in range(n)]
    xl = ['04:00', '08:00', '12:00', '16:00']
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Win rate, average win and average loss', hid, 'Through the day', tip='Your closed trades in order of the time of day they closed, with the running win rate, average win and average loss after each.')}
  <div class="plot">{lines_chart([wr], 340, 96, (), kind='pct', zero=False)}</div>
  <div>{lines_chart([aw, al], 340, 130, xl)}</div>
  <div class="wfoot"><span class="k"><i class="ln" style="background:var(--accent)"></i>Win rate</span><span class="k"><i class="ln" style="background:var(--muted)"></i>Average win and average loss</span><span>Time of day in New York</span></div>
</section>'''

def daily_cum_widget(hid='dc'):
    sub = daily
    line = cum(sub)
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Daily and cumulative net P&amp;L', hid, 'By trading day', tip='Bars: each day\'s net P&L. Line: the running total.')}
  <div class="plot">{bar_chart(sub, 340, 200, MONTHS, line=line)}</div>
  <div class="wfoot"><span class="k"><i style="background:var(--gain-fill)"></i>Day net</span><span class="k"><i class="ln" style="background:var(--accent)"></i>Running total</span></div>
</section>'''

def report_widget(hid='rp'):
    rr = random.Random(5)
    a = cum([rr.gauss(.2, 1) for _ in range(60)])
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Report', hid, 'By day, 3 metrics', end='<button class="btn sm ghost">'+icon('SlidersHorizontal')+'Metrics</button>', tip='A chart of up to three metrics from the Performance report.')}
  <div class="plot">{lines_chart([[x*120 for x in a], [x*90+300 for x in a[::-1]], [x*60-200 for x in a]], 340, 180, ['Sep', 'Oct', 'Nov'])}</div>
  <div class="wfoot"><span class="k"><i class="ln" style="background:var(--accent)"></i>Net P&amp;L, running</span><span class="k"><i class="ln" style="background:var(--muted)"></i>Profit factor, running</span><span class="k"><i class="ln" style="background:color-mix(in srgb,var(--accent) 55%,var(--surface-1))"></i>Win rate, running, dashed</span></div>
</section>'''

def challenge_widget(hid='ch'):
    rules = [('Profit target', '+$3,394.44 of $6,000.00', 57, ''), ('Daily loss', '$412.50 of $2,000.00 used today', 21, ''),
             ('Max drawdown, trailing', '$1,640.00 of $3,000.00 used', 55, ''), ('Trading days', '18 of 5', 100, ''), ('Best day', '29% of profit, limit 50%', 58, '')]
    rl = ''.join(f'<div class="rule-ln"><span class="nm">{n}</span><span class="v">{v}</span><div class="trk"><i style="width:{p}%"></i></div></div>' for n, v, p, _ in rules)
    return f'''<section class="card" aria-labelledby="{hid}">
  {hd('Forex evaluation', hid, 'Sample prop firm, step 1', end='<span class="status ac">Active</span>', tip='One challenge, as its card on the prop page shows it. Choose which in the widget\'s settings.')}
  <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 6px"><span class="fig">$103,394.44</span><span class="sub" style="margin:0">from $100,000.00</span></div>
  {rl}
</section>'''

def plain_calendar(hid='pc'):
    cells = ''.join(f'<span class="wd">{d}</span>' for d in 'Sun Mon Tue Wed Thu Fri Sat'.split())
    weeks = [[1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14], [15, 16, 17, 18, 19, 20, 21], [22, 23, 24, 25, 26, 27, 28], [29, 30, -1, -2, -3, -4, -5]]
    for w in weeks:
        for d in w:
            if d < 0:
                cells += f'<div class="c o"><span class="d">{-d}</span></div>'
            elif d in NOV:
                v = NOV[d][0]
                cells += f'<div class="c {"g" if v > 0 else "l"}"><span class="d">{d}</span><b>{compact(v)}</b></div>'
            else:
                cells += f'<div class="c{" today" if d == 24 else ""}"><span class="d">{d}</span></div>'
    return f'''<section class="card" aria-labelledby="{hid}">
  <div class="calhd"><h2 id="{hid}">November 2026</h2><div class="end"><button class="ibtn sm" aria-label="Previous month">{icon('CaretLeft-bold')}</button><button class="ibtn sm" aria-label="Next month">{icon('CaretRight-bold')}</button></div></div>
  <div class="mcal" style="grid-template-columns:repeat(7,minmax(0,1fr))">{cells}</div>
</section>'''

def mini_calendar(hid='mi'):
    h = ''.join(f'<span class="h">{d}</span>' for d in 'S M T W T F S'.split())
    cells = '<span></span>' * 0
    for d in range(1, 31):
        cls = ''
        if d in NOV:
            cls = 'ug' if NOV[d][0] > 0 else 'ul'
        if d == 24:
            cls += ' td'
        cells += f'<span class="{cls}">{d}</span>'
    return f'''<section class="card" aria-labelledby="{hid}">
  <div class="calhd"><h2 id="{hid}">November 2026</h2><div class="end"><button class="ibtn sm" aria-label="Previous month">{icon('CaretLeft-bold')}</button><button class="ibtn sm" aria-label="Next month">{icon('CaretRight-bold')}</button></div></div>
  <div class="minical">{h}{cells}</div>
  <div class="wfoot"><span class="k"><i class="ln" style="background:var(--gain-fill)"></i>Green day</span><span class="k"><i class="ln" style="background:var(--loss-fill)"></i>Red day</span><span>A day opens its Day view</span></div>
</section>'''

def year_widget(hid='yr'):
    rr = random.Random(29)
    mons = ''
    for mi, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']):
        dd = '<i class="x"></i>' * ((mi * 3) % 7)
        for d in range(30):
            wd = (d + (mi * 3) % 7) % 7
            if mi < 5 or mi == 11 or wd in (0, 6) or (mi == 10 and d > 22):
                dd += '<i></i>'
            else:
                dd += f'<i class="{rr.choice(["g1","g2","l1","l2","g1",""])}"></i>'
        mons += f'<div class="ym"><b>{m}</b><div class="dd">{dd}</div></div>'
    return f'''<section class="card" aria-labelledby="{hid}">
  <div class="calhd"><h2 id="{hid}">2026</h2><div class="end"><button class="ibtn sm" aria-label="Previous year">{icon('CaretLeft-bold')}</button><button class="ibtn sm" aria-label="Next year">{icon('CaretRight-bold')}</button></div></div>
  <div class="ygrid">{mons}</div>
  <div class="wfoot"><span>A month opens it in Calendar</span></div>
</section>'''

def build_03():
    upper = (kpi_simple('ka', 'Account balance and P&amp;L', "The selected accounts' balance at the range's end, and the closed net P&L in the range.", '$392,010.80', '<span class="gain">+$17,010.80</span> net P&amp;L, all time')
             + kpi_simple('ke', 'Trade expectancy', 'What an average closed trade made or lost, after fees.', '+$13.87', 'per closed trade, 1,226 trades', 'gain')
             + streaks_kpi()
             + kpi_simple('km', 'Max drawdown', 'The deepest fall of cumulative net P&L from a high, by trading day.', '−$4,212.40', '30.3% of the high, on 9 Oct', 'loss')
             + kpi_simple('kv', 'Average drawdown', "The average daily drawdown in the range. With no range set, today's drawdown.", '−$212.80', 'today, from the high; no date range set', 'loss'))
    lower = (wal_widget() + daily_cum_widget() + report_widget() + challenge_widget() + plain_calendar() + mini_calendar()
             + f'<div class="w2">{year_widget()}</div>')
    main = f'''<div class="upper" aria-label="Figures">{upper}</div>
<div class="lower">{lower}</div>'''
    extra = f'<button class="btn" type="button" aria-haspopup="dialog">{icon("CalendarCheck")}Plan the day</button>{tpl_button("Review")}'
    top = topbar('Dashboard', extra=extra)
    pt = ptop('Dashboard', extra=f'<button class="pbtn" aria-label="Dashboard template: Review">{icon("Layout")}</button>')
    page('03-dashboard-review.html', 'Dashboard, Review template', 'Dashboard', top, pt, main, DASH_CSS, tab='Dashboard',
         note='A second template, "Review", made of the widgets the Main template does not use.')

if __name__ == '__main__':
    build_01(); build_02(); build_03()
    print('ok')
