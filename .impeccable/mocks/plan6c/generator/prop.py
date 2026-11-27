from base import *

PROP_CSS = '''
.phead { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.phead .ptabs { flex: 1; min-width: 0; }
.phead .acts { display: flex; gap: 8px; padding-bottom: 6px; }
.roi-hd { display: flex; align-items: center; gap: 10px; }
.pgrid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.pgrid3 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.kc { padding: 16px 18px 14px; }
.kc .fig { margin-top: 4px; }
.reason { display: grid; grid-template-columns: minmax(0, 1fr) 120px 44px; gap: 12px; align-items: center; min-height: 40px; border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); font-size: 13px; }
.reason:first-child { border-top: 0; }
.reason .rk { font-weight: 500; }
.reason .rk small { color: var(--faint); font-weight: 400; margin-left: 6px; }
.reason .trk { height: 6px; }
.reason b { text-align: right; font-weight: 600; }
.pr .pass { font-size: 12.5px; color: var(--muted); }
.filtbtn .ct { margin-left: 2px; }
.empty-line { color: var(--muted); font-size: 13.5px; padding: 10px 0 4px; }
@media (max-width: 1279.98px) { .kcards { grid-template-columns: repeat(3, minmax(0,1fr)); } .pgrid { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 639.98px) { .phead .acts { width: 100%; } .phead .acts .btn { flex: 1; } .pgrid3 { grid-template-columns: minmax(0,1fr); } .reason { grid-template-columns: minmax(0,1fr) 70px 40px; } }
'''

def prop_head(active, acts=True):
    tabs = [('Dashboard', ''), ('Accounts', ''), ('Transactions', '')]
    t = ''.join(f'<a href="#" class="{"on" if n == active else ""}"{" aria-current=\"page\"" if n == active else ""}>{n}{f"<span class=ct>{c}</span>" if c else ""}</a>' for n, c in tabs)
    a = (f'<div class="acts"><button class="btn">{icon("HandCoins")}Log payout</button>'
         f'<button class="btn pri">{icon("Plus-bold")}New challenge</button></div>') if acts else ''
    return f'<div class="phead"><nav class="ptabs" aria-label="Prop firms">{t}</nav>{a}</div>'

def prop_top(extra=''):
    c = icon('CaretDown-bold')
    chips = (f'<div class="fchips"><button class="fchip">{icon("CalendarBlank", "i lead")}All time{c}</button>'
             f'<button class="fchip filtbtn">{icon("Funnel", "i lead")}Filters{c}</button>{extra}</div>')
    return (f'<header class="top"><h1>Prop firms</h1>{chips}<div class="tools">'
            f'<button class="ibtn" aria-label="Search">{icon("MagnifyingGlass")}</button><span class="sample">Sample data</span>'
            f'<button class="btn pri">{icon("UploadSimple")}Import</button></div></header>')

def prop_ptop(title='Prop firms'):
    return (f'<header class="ptop"><h1>{title}</h1><span class="badge">Sample</span><div class="end">'
            f'<button class="pbtn" aria-label="Filters">{icon("Funnel")}</button>'
            f'<button class="pbtn" aria-label="Search">{icon("MagnifyingGlass")}</button></div></header>')

def kcard(hid, label, tip, fig, sub, cls=''):
    return f'''<section class="card kc" aria-labelledby="{hid}"><div class="hd" style="min-height:22px">{lbl(f'<span id="{hid}">{label}</span>', tip)}</div>
  <span class="fig {cls}">{fig}</span><span class="sub">{sub}</span></section>'''

def hbar_rows(rows, mx):
    out = ''
    for nm, sub, sp, er in rows:
        net = er - sp
        out += (f'<div class="hbar"><span class="nm">{nm}<small>{sub}</small></span><span class="bars">'
                f'<i class="sp" style="width:{100*sp/mx:.1f}%" title="Spent {money(-sp)}"></i>'
                f'<i class="er" style="width:{max(0.5,100*er/mx):.1f}%" title="Earned {money(er)}"></i></span>'
                f'<b class="v {tone(net)}">{money(net)}</b></div>')
    return out

def build_04():
    cards = (kcard('k1', 'Funded', 'The balance of your active funded accounts.', '$52,132.60', '1 active funded account')
             + kcard('k2', 'Evaluation', 'The balance of your active evaluation accounts.', '$199,157.69', '2 active evaluation accounts')
             + kcard('k3', 'Total spent', 'Every cost in your transactions, not ignored, plus challenge fees with no transaction of their own.', '−$1,852.00', 'fees and resets', 'loss')
             + kcard('k4', 'Total earned', 'Every income in your transactions, not ignored: payouts, refunds and affiliate income.', '+$4,500.00', '2 payouts', 'gain')
             + kcard('k5', 'Net', 'Earned minus spent. Return is the net over what you spent.', '+$2,648.00', 'Return on spend 143.0%', 'gain'))
    # ROI progression
    inc = [0]*20 + [0]*30 + [1800]*14 + [4500]*20
    exp = [-165]*12 + [-415]*8 + [-500]*10 + [-740]*10 + [-839]*10 + [-1379]*10 + [-1574]*4 + [-1823]*10 + [-1852]*10
    n = min(len(inc), len(exp))
    inc, exp = inc[:n], exp[:n]
    net = [a + b for a, b in zip(inc, exp)]
    roi = f'''<section class="card" aria-labelledby="ro">
  <div class="roi-hd"><h2 id="ro" style="font-size:15px;font-weight:600">Return over time</h2><button class="tip" aria-label="Cumulative income, cumulative costs and the running net, over the period chosen." title="Cumulative income, cumulative costs and the running net.">{icon('Info')}</button>
  <div class="seg" style="margin-left:auto" role="group" aria-label="Period"><button>1W</button><button>1M</button><button class="on">1Y</button></div></div>
  <div class="plot">{lines_chart([inc, exp, net], 560, 210, ['Sep', 'Oct', 'Nov'], styles=[('var(--gain-fill)', ''), ('var(--loss-fill)', ''), ('var(--accent)', '')])}</div>
  <div class="wfoot"><span class="k"><i class="ln" style="background:var(--gain-fill)"></i>Income</span><span class="k"><i class="ln" style="background:var(--loss-fill)"></i>Costs</span><span class="k"><i class="ln" style="background:var(--accent)"></i>Net</span></div>
</section>'''
    fin_rows = [('Sample firm A', '3 challenges', 938, 4500), ('Sample firm B', '2 challenges', 885, 0), ('Sample firm C', 'No challenge', 29, 0)]
    fin = f'''<section class="card" aria-labelledby="fb">
  {hd('Where the money went', 'fb', end='<div class="seg" role="group" aria-label="Break down by"><button class="on">Firm</button><button>Type</button><button>Size</button><button>Fee</button></div>', tip='Spent, earned and net, by firm, account type, account size, or costs by fee type.')}
  <div style="margin-top:10px">{hbar_rows(fin_rows, 4500)}</div>
  <div class="wfoot"><span class="k"><i style="background:color-mix(in srgb,var(--loss-fill) 75%,var(--surface-1))"></i>Spent</span><span class="k"><i style="background:color-mix(in srgb,var(--gain-fill) 80%,var(--surface-1))"></i>Earned</span><span style="margin-left:auto">Net at the right</span></div>
</section>'''
    pr_rows = [('Sample firm A', 1, 2), ('Sample firm B', 0, 1)]
    prl = ''.join(f'<div class="reason pr"><span class="rk">{nm}<small>passed {p} of {a}</small></span><span class="trk"><i style="width:{100*p/a:.0f}%"></i></span><b>{100*p/a:.0f}%</b></div>' for nm, p, a in pr_rows)
    passing = f'''<section class="card" aria-labelledby="pa">
  {hd('Pass rate', 'pa', end='<div class="seg" role="group" aria-label="Pass rate by"><button class="on">Firm</button><button>Type</button><button>Size</button><button>Strategy</button></div>', tip='Evaluations passed over evaluations that passed or were breached. Active ones are not counted yet.')}
  <div style="display:flex;align-items:baseline;gap:10px;margin:8px 0 6px"><span class="fig">33.3%</span><span class="sub" style="margin:0">1 of 3 evaluations passed</span></div>
  {prl}
</section>'''
    reasons = [('Broke the max drawdown', 1, 50), ('Overtrading or forcing trades', 1, 50)]
    rl = ''.join(f'<div class="reason"><span class="rk">{n}<small>{c} breach</small></span><span class="trk"><i style="width:{p}%"></i></span><b>{p}%</b></div>' for n, c, p in reasons)
    breach = f'''<section class="card" aria-labelledby="br">
  {hd('Why accounts broke', 'br', end='<div class="seg" role="group" aria-label="Breaches in"><button class="on">Evaluation</button><button>Funded</button></div>', tip='The reasons you gave when marking a challenge breached, most common first.')}
  <div style="margin-top:8px">{rl}</div>
  <div class="facts">
    <div>{lbl('Average days before a breach', 'From the phase start to the breach.')}<b>13 days</b></div>
    <div>{lbl('Average P&amp;L before a breach', "The breached phase's net P&L from its start to the breach.")}<b class="loss">−$2,246.25</b></div>
    <div>{lbl('Most common size', 'The account size breached most often.')}<b>$50,000</b></div>
    <div>{lbl('Most common firm', 'The firm with the most breaches; a tie goes to the latest breach.')}<b>Sample firm B</b></div>
  </div>
</section>'''
    main = f'''{prop_head('Dashboard')}
<div class="kcards">{cards}</div>
<div class="pgrid">{roi}{fin}</div>
<div class="pgrid3">{passing}{breach}</div>'''
    page('04-prop-dashboard.html', 'Prop firms, dashboard', 'Prop firms', prop_top(), prop_ptop(), main, PROP_CSS)

CH = [('Futures 100K', 'Sample firm A', '2-step', '$100,000', 'Step 1', 'Active', 95763.25, '1 Oct 2026', 'ac'),
      ('Forex 100K', 'Sample firm B', '2-step', '$100,000', 'Step 1', 'Active', 103394.44, '3 Nov 2026', 'ac'),
      ('Futures 50K', 'Sample firm A', '1-step', '$50,000', 'Funded', 'Funded', 52132.60, '14 Sep 2026', 'ok'),
      ('Futures 50K, September', 'Sample firm A', '1-step', '$50,000', 'Step 1', 'Breached', 47487.60, '2 Sep 2026', 'br'),
      ('Forex 50K', 'Sample firm B', '1-step', '$50,000', 'Step 1', 'Breached', 48019.90, '5 Oct 2026', 'br')]

def build_05():
    sub = '<div class="seg" role="tablist" aria-label="Challenges"><button class="on" role="tab" aria-selected="true">Evaluations <span class="ct">2</span></button><button role="tab">Funded <span class="ct">1</span></button><button role="tab">Breached <span class="ct">2</span></button></div>'
    lay = f'<div class="seg" role="group" aria-label="Layout" style="margin-left:auto"><button class="on lst" aria-pressed="true">{icon("ListBullets")}List</button><button class="grd">{icon("SquaresFour")}Grid</button></div>'
    rows = ''
    for nm, firm, typ, size, ph, st, bal, start, sc in CH[:2]:
        rows += (f'<tr><td><a class="b6" href="#">{nm}</a></td><td class="muted">{firm}</td><td class="muted">{ACCT[nm]}</td><td>{typ}</td><td class="n">{size}</td><td>{ph}</td>'
                 f'<td><span class="status {sc}">{st}</span></td><td class="n f">{money(bal, sign=False)}</td><td class="muted">{start}</td>'
                 f'<td class="n"><button class="ibtn sm rowmenu" aria-label="Actions for {nm}" aria-haspopup="menu">{icon("DotsThree-bold")}</button></td></tr>')
    table = f'''<table class="only-desk lst-v"><colgroup><col style="width:14%"><col style="width:12%"><col style="width:17%"><col style="width:7%"><col style="width:10%"><col style="width:7%"><col style="width:9%"><col style="width:12%"><col style="width:10%"><col style="width:52px"></colgroup>
<thead><tr><th>Challenge</th><th>Firm</th><th>Trading account</th><th>Type</th><th class="n">Size</th><th>Phase</th><th>Status</th><th class="n">Balance</th><th>Started</th><th><span class="sr">Actions</span></th></tr></thead><tbody>{rows}</tbody></table>'''
    prow = ''.join(f'<li><a href="#"><span class="l1"><b style="margin-left:0;font-weight:600">{nm}</b><b>{money(bal, sign=False)}</b></span><span class="l2">{ACCT[nm]}<span>started {start}</span><span class="status {sc}">{st}</span></span></a></li>' for nm, firm, typ, size, ph, st, bal, start, sc in CH[:2])
    def gcard(c):
        nm, firm, typ, size, ph, st, bal, start, sc = c
        rules = RULES[nm]
        rl = ''.join(f'<div class="rule-ln"><span class="nm">{n}</span><span class="v">{v}</span><div class="trk"><i style="width:{p}%"></i></div></div>' for n, v, p in rules)
        return f'''<section class="card" aria-label="{nm}"><div class="hd"><h2>{nm}</h2><span class="cap">{firm}, {ph.lower()}</span><div class="end"><span class="status {sc}">{st}</span><button class="ibtn sm" aria-label="Actions for {nm}">{icon("DotsThree-bold")}</button></div></div>
  <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 4px"><span class="fig">{money(bal, sign=False)}</span><span class="sub" style="margin:0">from {size}, {typ}</span></div>
  <p class="sub" style="margin:0 0 6px">{ACCT[nm]}, started {start}</p>{rl}</section>'''
    grid = f'<div class="grd-v" style="display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">{gcard(CH[0])}{gcard(CH[1])}</div>'
    menu = f'''<div class="rmenu menu-v" role="menu" aria-label="Futures 100K" style="display:none;right:44px;top:212px">
  <a role="menuitem" href="#">{icon("ArrowSquareOut")}View details</a>
  <button role="menuitem">{icon("ArrowUpRight-bold")}Move to funded</button>
  <button role="menuitem">{icon("Prohibit")}Mark as breached</button>
  <button role="menuitem">{icon("PencilSimple")}Edit</button>
  <hr><button role="menuitem">{icon("Trash")}Delete</button></div>'''
    reasons = [('Broke the max drawdown', '', False), ('Overtrading or forcing trades', '', False), ('Time pressure', '', False), ('Lack of risk management', '', False), ('Other', 'In your own words.', False)]
    rr = ''.join(f'<label class="{"on" if on else ""}"><span class="rd"></span><span>{n}{f"<small>{d}</small>" if d else ""}</span></label>' for n, d, on in reasons)
    dialog = f'''<div class="veil br-v" aria-hidden="true"></div>
<div class="dlg br-d" role="dialog" aria-modal="true" aria-labelledby="mb" style="width:min(520px,calc(100vw - 48px))">
  <div class="dlg-hd"><div><h2 id="mb">Mark Futures 100K as breached</h2><p>Step 1, Sample firm A</p></div><button class="xbtn" aria-label="Close">{icon("X")}</button></div>
  <div class="dlg-bd"><p class="flabel" style="font-weight:500;margin-bottom:8px">Why did it break?</p><div class="radio" role="radiogroup">{rr}</div>
  <div class="note" style="margin-top:14px">{icon("Info")}<span>A breach is final. The challenge moves to Breached, stays in your history and in the breach insights, and can't return to evaluation or funded.</span></div></div>
  <div class="dlg-ft"><div class="end"><button class="btn">Cancel</button><button class="btn pri" aria-disabled="true">Mark as breached</button></div></div>
</div>
<div class="veil fd-v" aria-hidden="true"></div>
<div class="dlg fd-d" role="alertdialog" aria-modal="true" aria-labelledby="mf" style="width:min(460px,calc(100vw - 48px));height:auto">
  <div class="dlg-hd"><div><h2 id="mf">Move Futures 100K to funded?</h2><p>Step 1 passes and its results stay viewable. The funded phase starts today.</p></div></div>
  <div class="dlg-ft"><div class="end"><button class="btn">Cancel</button><button class="btn pri">Move to funded</button></div></div>
</div>'''
    main = f'''{prop_head('Accounts')}
{menu}
<section class="card" aria-label="Challenges">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">{sub}{lay}</div>
  <div style="margin-top:12px">{table}<ul class="prows only-phone lst-v">{prow}</ul></div>
</section>
{grid}'''
    css = PROP_CSS + '''
.rmenu { display: none; }
[data-state='grid'] .lst-v { display: none !important; } [data-state='grid'] .grd-v { display: grid !important; }
[data-state='grid'] .seg .lst { background: transparent; box-shadow: none; font-weight: 500; color: var(--muted); } [data-state='grid'] .seg .grd { background: var(--surface-1); color: var(--text); font-weight: 600; box-shadow: var(--shadow-chip); }
[data-state='menu'] .menu-v { display: block !important; }
.br-v, .br-d, .fd-v, .fd-d { display: none; } [data-state='breach'] .br-v, [data-state='fund'] .fd-v { display: block; } [data-state='breach'] .br-d, [data-state='fund'] .fd-d { display: flex; }
main { position: relative; }
@media (max-width: 639.98px) { [data-state='grid'] .grd-v { grid-template-columns: minmax(0,1fr) !important; } [data-state='menu'] .menu-v { right: 20px !important; top: 230px !important; } }
'''
    page('05-prop-accounts.html', 'Prop firms, accounts', 'Prop firms', prop_top(), prop_ptop(), main, css, after=dialog,
         note='?state=grid shows the grid; ?state=menu opens a row menu; ?state=breach opens Mark as breached; ?state=fund asks to move to funded.')

def build_06():
    rr = random.Random(41)
    bal = cum([rr.gauss(60, 380) for _ in range(48)])
    bal = [50000 + b for b in bal]
    rules = [('Daily loss', 'Worst day used $812.40 of $1,100.00', 74, ''), ('Max drawdown, trailing', '$1,240.00 of $2,000.00 at the deepest', 62, ''),
             ('Trading days', '34 of 5', 100, ''), ('Best day', '31% of profit, limit 50%', 62, '')]
    rl = ''.join(f'<div class="rule-ln"><span class="nm">{n}</span><span class="v">{v}</span><div class="trk"><i style="width:{p}%"></i></div></div>' for n, v, p, _ in rules)
    stats = [('Win rate', '52.4%', ''), ('Average win', '+$268.10', 'gain'), ('Average loss', '−$221.75', 'loss'), ('Best day', '+$1,412.50', 'gain'), ('Worst day', '−$812.40', 'loss')]
    st = ''.join(f'<div>{lbl(n, n)}<span class="fig {c}" style="font-size:19px">{v}</span></div>' for n, v, c in stats)
    trades = [('29 Sep', '15:02', 'ES', 'Dec 26', 'Long', 412.50), ('29 Sep', '11:31', 'NQ', 'Dec 26', 'Short', -188.20), ('28 Sep', '14:47', 'ES', 'Dec 26', 'Long', 236.00),
              ('28 Sep', '10:05', 'MES', 'Dec 26', 'Short', -61.25), ('25 Sep', '13:20', 'ES', 'Dec 26', 'Long', 588.75)]
    tr = ''.join(f'<tr><td class="tm">{d} <b>{t}</b></td><td class="sym"><b>{s}</b> <span>{c}</span></td><td><span class="sd">{sd}</span></td><td class="n f {tone(p)}">{money(p)}</td></tr>' for d, t, s, c, sd, p in trades)
    pr = ''.join(f'<li><a href="#"><span class="l1"><span class="sym"><b>{s}</b> <span>{c}</span></span><b class="{tone(p)}">{money(p)}</b></span><span class="l2">{d} {t}<span>{sd}</span></span></a></li>' for d, t, s, c, sd, p in trades)
    main = f'''<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
  <a class="lnk" href="#">{icon("CaretLeft-bold")}Accounts</a></div>
<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
  <h2 style="font-size:22px;font-weight:650;letter-spacing:-.03em">Futures 50K</h2><span class="status ok">Funded</span>
  <span class="muted">Sample firm A, 1-step, $50,000, started 14 Sep 2026</span>
  <div style="margin-left:auto;display:flex;gap:8px"><button class="btn">{icon("PencilSimple")}Edit</button><button class="btn">{icon("Trash")}Delete</button></div></div>
<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap"><nav class="ptabs" aria-label="Phases" style="flex:1"><a href="#">Step 1 <span class="ct">Passed</span></a><a href="#" class="on" aria-current="page">Funded <span class="ct">Active</span></a></nav>
  <div style="padding-bottom:6px"><button class="btn">{icon("Prohibit")}Mark as breached</button></div></div>
<div class="pgrid">
  <section class="card" aria-labelledby="bo">{hd('Balance', 'bo', 'Funded account, Futures 50K funded', end='<div class="seg" role="group" aria-label="Points"><button class="on">Day</button><button>Hour</button><button>Trade</button></div>')}
    <div class="plot">{area_chart(bal, 560, 220, 'bo', ['14 Sep', '21 Sep', '29 Sep'], zero=False)}</div></section>
  <section class="card" aria-labelledby="pf">{hd('Funded rules', 'pf', 'Since 30 Sep')}<div style="margin-top:8px">{rl}</div></section>
</div>
<section class="card" aria-label="Funded phase figures"><div class="strip" style="grid-template-columns:repeat(5,minmax(0,1fr))">{st}</div></section>
<div class="pgrid">
  <section class="card" aria-labelledby="tr">{hd('Trades', 'tr', 'Funded phase, 21 trades', end='<button class="btn sm">'+icon('UploadSimple')+'Import into this account</button>')}
    <table class="only-desk" style="margin-top:8px"><colgroup><col style="width:30%"><col><col style="width:16%"><col style="width:22%"></colgroup><thead><tr><th>Closed</th><th>Instrument</th><th>Side</th><th class="n">Net P&amp;L</th></tr></thead><tbody>{tr}</tbody></table>
    <ul class="prows only-phone">{pr}</ul><a class="lnk" href="#" style="margin-top:10px">All 21 trades in Trades</a></section>
  <section class="card" aria-labelledby="sg">{hd('Strategies', 'sg', end='<button class="btn sm">'+icon('Plus-bold')+'Attach</button>', tip='Strategies attached to this challenge. They feed the pass rate by strategy and the strategy filter.')}
    <ul class="rlist" style="list-style:none;margin-top:6px"><li class="rrow"><div class="rt"><b>Opening range breakout</b></div><button class="ibtn sm" aria-label="Detach Opening range breakout">{icon("X")}</button></li></ul></section>
</div>'''
    css = PROP_CSS + '''
@media (max-width: 639.98px) { .strip { grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 12px 0; } .strip > div:nth-child(odd) { padding-left: 0; border-left: 0; } }
'''
    page('06-prop-details.html', 'Prop firms, challenge details', 'Prop firms', prop_top(), prop_ptop('Futures 50K'), main, css)

ACCT = {'Futures 100K': 'Futures 100K evaluation', 'Forex 100K': 'Forex evaluation', 'Futures 50K': 'Futures 50K funded',
        'Futures 50K, September': 'Futures 50K evaluation', 'Forex 50K': 'Forex 50K evaluation'}
RULES = {'Futures 100K': [('Profit target', '−$4,236.75 of +$6,000.00', 0), ('Daily loss', '$0.00 of $2,000.00 used today', 0), ('Max drawdown, trailing', '$4,236.75 of $5,000.00 used', 85), ('Trading days', '12 of 5', 100)],
         'Forex 100K': [('Profit target', '+$3,394.44 of +$10,000.00', 34), ('Daily loss', '$412.50 of $5,000.00 used today', 8), ('Max drawdown, static', '$1,120.00 of $10,000.00 used', 11), ('Trading days', '9 of 4', 100)]}

TX = [('18 Nov', 'Card refund, duplicate charge', 'Sample firm A', 'Futures 100K', 'Uncategorized', 165.00, 'ignored'),
      ('16 Nov', 'Payout', 'Sample firm A', 'Futures 50K', 'Payout', 2700.00, 'not'),
      ('10 Nov', 'Market data fee', 'Sample firm C', 'None', 'Uncategorized', -29.00, 'not'),
      ('3 Nov', 'Evaluation, Forex 100K', 'Sample firm B', 'Forex 100K', 'Evaluation fee', -540.00, 'rev'),
      ('2 Nov', 'Payout', 'Sample firm A', 'Futures 50K', 'Payout', 1800.00, 'rev'),
      ('28 Oct', 'Reset', 'Sample firm A', 'Futures 100K', 'Reset fee', -99.00, 'rev'),
      ('7 Oct', 'Reset', 'Sample firm A', 'Futures 100K', 'Reset fee', -99.00, 'not'),
      ('5 Oct', 'Evaluation, Forex 50K', 'Sample firm B', 'Forex 50K', 'Evaluation fee', -345.00, 'rev'),
      ('1 Oct', 'Evaluation, Futures 100K', 'Sample firm A', 'Futures 100K', 'Evaluation fee', -325.00, 'rev')]
ST = {'rev': ('Reviewed', 'ok'), 'not': ('Not reviewed', 'ac'), 'ignored': ('Ignored', 'ig')}

def build_07():
    filt = '<div class="seg" role="group" aria-label="Show"><button class="on">All</button><button>Income</button><button>Costs</button><button>To review</button></div>'
    add = f'''<tr class="addrow"><td><span class="inp sm">25 Nov</span></td><td><span class="inp sm ph">Description</span></td><td><span class="inp sm ph">Firm</span></td><td><span class="inp sm ph">Challenge{icon("CaretDown-bold","i sel")}</span></td>
<td><span class="inp sm">Uncategorized{icon("CaretDown-bold","i sel")}</span></td><td class="n"><span class="inp sm ph" style="justify-content:flex-end">−300 or 3000</span></td><td><span class="inp sm">Not reviewed{icon("CaretDown-bold","i sel")}</span></td>
<td class="n"><button class="ibtn sm" aria-label="Save transaction" style="color:var(--accent-ink)">{icon("Check-bold")}</button></td></tr>'''
    rows = ''.join(f'<tr class="txrow"><td class="muted">{d}</td><td>{ds}</td><td class="muted">{fm}</td><td>{ch if ch != "None" else "<span class=none>None</span>"}</td><td><span style="display:inline-flex;align-items:center;gap:4px">{ca}<button class="ibtn sm" style="width:26px;height:26px;border:0;background:none" aria-label="Edit the category of {ds}">{icon("PencilSimple")}</button></span></td>'
                   f'<td class="n f {tone(a) if s != "ignored" else "faint"}">{money(a)}</td><td><span class="status {ST[s][1]}">{ST[s][0]}</span></td>'
                   f'<td class="n"><button class="ibtn sm" aria-label="Actions for {ds}">{icon("DotsThree-bold")}</button></td></tr>' for d, ds, fm, ch, ca, a, s in TX)
    table = f'''<table class="only-desk" style="margin-top:12px"><colgroup><col style="width:9%"><col style="width:20%"><col style="width:13%"><col style="width:12%"><col style="width:13%"><col style="width:12%"><col style="width:12%"><col style="width:52px"></colgroup>
<thead><tr><th>Date</th><th>Description</th><th>Firm</th><th>Challenge</th><th>Category</th><th class="n">Amount</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead><tbody>{add}{rows}</tbody></table>'''
    prow = ''.join(f'<li><a href="#"><span class="l1"><span>{ds}</span><b class="{tone(a) if s != "ignored" else "faint"}">{money(a)}</b></span><span class="l2">{d}<span>{fm}</span><span>{ca}</span><span class="status {ST[s][1]}">{ST[s][0]}</span></span></a></li>' for d, ds, fm, ch, ca, a, s in TX)
    dialog = f'''<div class="veil po-v" aria-hidden="true"></div>
<div class="dlg po-d" role="dialog" aria-modal="true" aria-labelledby="lp" style="width:min(460px,calc(100vw - 48px))">
  <div class="dlg-hd"><div><h2 id="lp">Log a payout</h2><p>It counts in total earned at once.</p></div><button class="xbtn" aria-label="Close">{icon("X")}</button></div>
  <div class="dlg-bd" style="display:flex;flex-direction:column;gap:14px">
    <div class="fld"><label>Funded account</label><span class="inp">Futures 50K, Sample firm A{icon("CaretDown-bold","i sel")}</span></div>
    <div class="fld"><label>Amount</label><span class="inp">$ 1,500.00</span></div>
    <div class="fld"><label>Date received</label><span class="inp">{icon("CalendarBlank")}25 Nov 2026</span></div>
  </div>
  <div class="dlg-ft"><div class="end"><button class="btn">Cancel</button><button class="btn pri">Add payout</button></div></div>
</div>'''
    main = f'''{prop_head('Transactions')}
<section class="card" aria-label="Transactions">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">{filt}<button class="btn sm" style="margin-left:auto">{icon("Plus-bold")}Add transaction</button></div>
  {table}<ul class="prows only-phone" style="margin-top:8px">{prow}</ul>
  <p class="hint" style="margin-top:12px">A negative amount is a cost and a positive one is income, whatever its category. Ignored rows stay listed and never count.</p>
</section>'''
    css = PROP_CSS + '''
.po-v, .po-d { display: none; } [data-state='payout'] .po-v { display: block; } [data-state='payout'] .po-d { display: flex; }
'''
    page('07-prop-transactions.html', 'Prop firms, transactions', 'Prop firms', prop_top(), prop_ptop(), main, css, after=dialog,
         note='?state=payout opens Log a payout.')

def build_13():
    def steps(n):
        dots = ''.join(f'<i class="{"on" if i < n else ""}"></i>' for i in range(4))
        return f'<div class="fr-steps" aria-label="Step {n} of 4"><span>Step {n} of 4</span><span class="fr-bar" aria-hidden="true">{dots}</span></div>'
    opts = [('Own capital', 'Your own trading accounts. They go in your journal as now.', False), ('Prop firms', 'Evaluation and funded accounts with a prop firm.', True), ('Both', 'Prop accounts here; your own accounts stay in your journal.', False)]
    ol = ''.join(f'<label class="{"on" if on else ""}"><span class="rd"></span><span>{n}<small>{d}</small></span></label>' for n, d, on in opts)
    s1 = f"""<section class="card frun fr-start" aria-labelledby="f1">{steps(1)}
  <h2 id="f1">How do you trade?</h2><p class="hint">This only helps you set up; it changes nothing else.</p>
  <div class="radio" role="radiogroup" style="margin-top:14px">{ol}</div>
  <div class="fr-ft"><button class="btn ghost">Skip</button><button class="btn pri">Continue</button></div></section>"""
    added = [('3 Nov', 'Sample firm A', 'Evaluation fee', -165.00), ('30 Sep', 'Sample firm A', 'Activation fee', -85.00), ('2 Nov', 'Sample firm A', 'Payout', 1800.00)]
    al = ''.join(f'<li><span>{d}</span><span>{f}</span><span>{c}</span><b class="{tone(a)}">{money(a)}</b></li>' for d, f, c, a in added)
    s2 = f"""<section class="card frun fr-txns" aria-labelledby="f2">{steps(2)}
  <h2 id="f2">Add what you've paid and been paid</h2><p class="hint">Fees and resets as a negative amount, payouts as a positive one. You can add more later in Transactions.</p>
  <div class="grid2" style="margin-top:14px">
    <div class="fld"><label>Firm</label><span class="inp ph">Firm name</span></div><div class="fld"><label>Amount</label><span class="inp ph">−300 or 3000</span></div>
    <div class="fld"><label>Date</label><span class="inp">{icon("CalendarBlank")}25 Nov 2026</span></div><div class="fld"><label>Category</label><span class="inp">Uncategorized{icon("CaretDown-bold","i sel")}</span></div>
    <div class="fld"><label>Status</label><span class="inp">Not reviewed{icon("CaretDown-bold","i sel")}</span></div><div class="fld"><label>Description, optional</label><span class="inp ph">For example, a reset</span></div>
  </div>
  <div style="margin-top:12px"><button class="btn" aria-disabled="true">{icon("Plus-bold")}Add transaction</button></div>
  <ul class="fr-list" aria-label="Added">{al}</ul>
  <div class="fr-ft"><button class="btn ghost">Back</button><button class="btn pri">Continue</button></div></section>"""
    s3 = f"""<section class="card frun fr-totals" aria-labelledby="f3">{steps(3)}
  <h2 id="f3">Your prop-firm money so far</h2>
  <div class="strip" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px">
    <div>{lbl('Spent', 'Every cost you added.')}<span class="fig loss">−$250.00</span></div>
    <div>{lbl('Earned', 'Every payout and other income you added.')}<span class="fig gain">+$1,800.00</span></div>
    <div>{lbl('Net', 'Earned minus spent.')}<span class="fig gain">+$1,550.00</span></div></div>
  <div class="fr-ft"><button class="btn ghost">Back</button><button class="btn pri">Continue</button></div></section>"""
    s4 = f"""<section class="card frun fr-accts" aria-labelledby="f4">{steps(4)}
  <h2 id="f4">Track your active accounts</h2><p class="hint">Add each evaluation or funded account as a challenge, with its rules, to follow its progress against them.</p>
  <div class="fr-ft"><button class="btn">Go to the dashboard</button><button class="btn pri">{icon("Plus-bold")}Add active accounts</button></div></section>"""
    main = f'<div class="fr-wrap">{s1}{s2}{s3}{s4}</div>'
    css = PROP_CSS + """
.fr-wrap { display: flex; justify-content: center; padding-top: 8px; }
.frun { width: min(640px, 100%); padding: 22px 24px 18px; }
.frun h2 { font-size: 19px; font-weight: 650; letter-spacing: -.02em; margin-top: 14px; }
.frun .hint { margin-top: 4px; }
.fr-steps { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--faint); }
.fr-bar { display: flex; gap: 4px; } .fr-bar i { width: 28px; height: 4px; border-radius: 2px; background: var(--line); } .fr-bar i.on { background: var(--accent); }
.fr-ft { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--line); }
.fr-ft .ghost { margin-right: auto; }
.fr-list { list-style: none; margin-top: 14px; border-top: 1px solid var(--line); }
.fr-list li { display: grid; grid-template-columns: 70px 1fr 1fr auto; gap: 10px; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); font-size: 13.5px; }
.fr-list li span:first-child { color: var(--muted); }
.fr-txns, .fr-totals, .fr-accts { display: none; }
[data-state='txns'] .fr-start, [data-state='totals'] .fr-start, [data-state='accounts'] .fr-start { display: none; }
[data-state='txns'] .fr-txns, [data-state='totals'] .fr-totals, [data-state='accounts'] .fr-accts { display: block; }
@media (max-width: 639.98px) { .frun { padding: 18px 16px 14px; } .fr-list li { grid-template-columns: 56px 1fr auto; } .fr-list li span:nth-child(3) { display: none; } .strip { grid-template-columns: 1fr !important; gap: 10px; } .strip > div { padding-left: 0; border-left: 0 !important; } }
"""
    page('13-prop-first-run.html', 'Prop firms, first run', 'Prop firms', prop_top(), prop_ptop(), main, css,
         note='?state=txns, ?state=totals and ?state=accounts show steps 2 to 4. Shown once per workspace with no challenge and no transaction (C71).')

if __name__ == '__main__':
    import random
    build_04(); build_05(); build_06(); build_07(); build_13(); print('ok')
