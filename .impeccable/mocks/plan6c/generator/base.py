"""Plan 6C comps: shared shell, icons, formatting and chart helpers."""
import glob, math, os, random, re

ROOT = '/Users/mac/Projects/trading-journal/.claude/worktrees/m1-p6c-6dcad9'
OUT = ROOT + '/.impeccable/mocks/plan6c'
PH = ROOT + '/node_modules/@phosphor-icons/react/dist/defs'

# ---------- icons ----------
_SYM = {}
for f in glob.glob(ROOT + '/.impeccable/mocks/plan6a/*.html'):
    for m in re.finditer(r'<symbol id="(i-[A-Za-z]+-[a-z]+)" viewBox="0 0 256 256">(.*?)</symbol>', open(f).read(), re.S):
        _SYM.setdefault(m.group(1), m.group(2))

def _phosphor(name, weight):
    src = open(f'{PH}/{name}.es.js').read()
    blk = re.search(r'\[\s*"' + weight + r'",(.*?)\n  \]', src, re.S).group(1)
    out = []
    for m in re.finditer(r'createElement\(\s*"(\w+)",\s*(\{.*?\})\s*\)', blk, re.S):
        tag, attrs = m.group(1), m.group(2)
        pairs = re.findall(r'(\w+):\s*"([^"]*)"', attrs)
        a = ' '.join(f'{k.replace("strokeWidth","stroke-width")}="{v}"' for k, v in pairs)
        out.append(f'<{tag} {a}/>')
    return ''.join(out)

USED = set()
def icon(spec, cls='i', label=None):
    """spec 'Name' (regular) or 'Name-weight'."""
    name, _, w = spec.partition('-')
    w = w or 'regular'
    sid = f'i-{name}-{w}'
    if sid not in _SYM:
        _SYM[sid] = _phosphor(name, w)
    USED.add(sid)
    aria = f' role="img" aria-label="{label}"' if label else ' aria-hidden="true"'
    return f'<svg class="{cls}"{aria}><use href="#{sid}"/></svg>'

def sprite():
    return ('<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
            + ''.join(f'<symbol id="{s}" viewBox="0 0 256 256">{_SYM[s]}</symbol>' for s in sorted(USED))
            + '</defs></svg>')

# ---------- formatting ----------
MINUS = '−'
def money(v, sign=True, dec=2):
    s = f'{abs(v):,.{dec}f}'
    if not sign:
        return ('−$' if v < 0 else '$') + s
    return ('+$' if v > 0 else (MINUS + '$' if v < 0 else '$')) + s
def tone(v):
    return 'gain' if v > 0 else ('loss' if v < 0 else '')
def compact(v):
    a = abs(v)
    s = f'{a/1000:.1f}k' if a >= 1000 else f'{a:.0f}'
    return ('+' if v > 0 else (MINUS if v < 0 else '')) + '$' + s

# ---------- shell ----------
NAV = [('Home', 'House'), ('Dashboard', 'SquaresFour'), ('Trades', 'ListBullets'), ('Calendar', 'CalendarBlank'),
       ('Reports', 'ChartBar'), ('Progress tracker', 'Gauge'), ('Strategies', 'Strategy'), ('Notebook', 'Notebook'),
       ('Import', 'UploadSimple'), ('Prop firms', 'ShieldCheck')]
NOTLIVE = [('Backtesting', 'ClockCounterClockwise'), ('Replay', 'PlayCircle'), ('Mentors', 'UsersThree'), ('Assistant', 'Sparkle')]

def sidebar(active, collapsed=False):
    def item(label, ic, off=False):
        on = label == active
        cls = 'nv' + (' on' if on else '') + (' off' if off else '')
        cur = ' aria-current="page"' if on else ''
        tip = f' title="{label}"' if collapsed else ''
        lab = f'<span class="sr">{label}</span>' if collapsed else f'<span>{label}</span>'
        return f'<li><a class="{cls}" href="#"{cur}{tip}>{icon(ic)}{lab}</a></li>'
    main = ''.join(item(l, i) for l, i in NAV)
    nl = ''.join(item(l, i, True) for l, i in NOTLIVE)
    if collapsed:
        return f'''<aside class="side rail" aria-label="Sidebar">
  <a class="brand" href="#" aria-label="Keel"><span class="mark">K</span></a>
  <button class="railbtn" type="button" aria-label="Expand the sidebar" aria-expanded="false" title="Expand the sidebar">{icon('SidebarSimple')}</button>
  <a class="nv add" href="#" title="Add trade">{icon('Plus-bold')}<span class="sr">Add trade</span></a>
  <nav aria-label="App" style="flex:1;display:flex;flex-direction:column">
    <ul>{main}</ul>
    <hr class="raildiv" aria-hidden="true"><p class="sr" id="nl">Not live yet</p>
    <ul aria-labelledby="nl">{nl}</ul>
    <ul class="foot">{item('Settings', 'GearSix')}</ul>
  </nav>
</aside>'''
    return f'''<aside class="side" aria-label="Sidebar">
  <div class="brandrow"><a class="brand" href="#"><span class="mark">K</span>Keel</a><button class="railbtn" type="button" aria-label="Collapse the sidebar" aria-expanded="true" title="Collapse the sidebar">{icon('SidebarSimple')}</button></div>
  <button class="ws" type="button"><span><b>Sample workspace</b><small>All accounts</small></span>{icon('CaretUpDown-bold')}</button>
  <nav aria-label="App" style="flex:1;display:flex;flex-direction:column">
    <ul>{main}</ul>
    <p class="grp" id="nl">Not live yet</p>
    <ul aria-labelledby="nl">{nl}</ul>
    <ul class="foot">{item('Settings', 'GearSix')}</ul>
  </nav>
</aside>'''

def chips(date='All time'):
    c = icon('CaretDown-bold')
    return (f'<div class="fchips"><button class="fchip">{icon("CalendarBlank", "i lead")}{date}{c}</button>'
            f'<button class="fchip">Symbol{c}</button><button class="fchip">Side{c}</button>'
            f'<button class="fchip">Strategy{c}</button><button class="fchip">Tags{c}</button>'
            f'<button class="fchip ico" aria-label="More filters">{icon("SlidersHorizontal")}</button></div>')

def topbar(title, filters=True, extra='', date='All time', import_btn=True):
    imp = f'<button class="btn pri">{icon("UploadSimple")}Import</button>' if import_btn else ''
    return (f'<header class="top"><h1>{title}</h1>{chips(date) if filters else ""}<div class="tools">'
            f'<button class="ibtn" aria-label="Search">{icon("MagnifyingGlass")}</button>'
            f'<span class="sample">Sample data</span>'
            f'<button class="disp">Net, $ {icon("CaretDown-bold")}</button>{extra}{imp}</div></header>')

def ptop(title, extra=''):
    return (f'<header class="ptop"><h1>{title}</h1><span class="badge">Sample</span><div class="end">{extra}'
            f'<button class="pbtn" aria-label="Filters">{icon("Funnel")}</button>'
            f'<button class="pbtn" aria-label="Search">{icon("MagnifyingGlass")}</button>'
            f'<button class="pbtn" aria-label="Display: Dollar"><span class="unit">$</span></button></div></header>')

def tabbar(active):
    tabs = [('Dashboard', 'SquaresFour'), ('Trades', 'ListBullets'), ('Calendar', 'CalendarBlank'), ('Reports', 'ChartBar'), ('More', 'DotsThreeOutline')]
    out = []
    for l, i in tabs:
        on = l == active
        out.append(f'<a class="tab{" on" if on else ""}" href="#"{" aria-current=\"page\"" if on else ""}>{icon(i + ("-fill" if on else ""))}<span>{l}</span></a>')
    return '<nav class="tabbar" aria-label="Main">' + ''.join(out) + '</nav>'

def page(fname, title, active, top, ptop_html, main, css='', after='', body_cls='', collapsed=False, tab='More', note=''):
    side = sidebar(active, collapsed)
    head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keel, {title}</title>
<!-- Plan 6C comp. Open with ?theme=dark for graphite; ?state=... where noted. {note} -->
<script>(function(){{var q=new URLSearchParams(location.search),t=q.get('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),d=document.documentElement;d.dataset.theme=t;var s=q.get('state');if(s)d.dataset.state=s;}})();</script>
<link rel="stylesheet" href="shell.css">
<style>
{css}
</style>
</head>
<body class="{body_cls}">
'''
    body = f'''<div class="app{' collapsed' if collapsed else ''}">
{side}
<div class="col">
{top}
{ptop_html}
<main id="content" class="page">
{main}
</main>
</div>
</div>
{tabbar(tab)}
{after}
</body>
</html>
'''
    html = head + sprite() + '\n' + body
    open(os.path.join(OUT, fname), 'w').write(html)
    return fname

# ---------- small parts ----------
def hd(title, hid, cap='', end='', tip=None):
    t = f'<button class="tip" type="button" aria-label="{tip}" title="{tip}">{icon("Info")}</button>' if tip else ''
    c = f'<span class="cap">{cap}</span>' if cap else ''
    e = f'<div class="end">{end}</div>' if end else ''
    return f'<div class="hd"><h2 id="{hid}">{title}</h2>{t}{c}{e}</div>'

def lbl(text, tip):
    return f'<span class="lbl" title="{tip}">{text}</span>'

def split(parts, h=6):
    """parts: [(flex, cls)] cls in g,l,n,a"""
    return '<div class="sbar" aria-hidden="true">' + ''.join(f'<i class="{c}" style="flex:{f}"></i>' for f, c in parts if f > 0) + '</div>'

# ---------- data ----------
def series(n, seed, drift=0.3, vol=1.0):
    r = random.Random(seed)
    out = []
    for _ in range(n):
        out.append(drift + r.gauss(0, vol))
    return out

def cum(xs):
    s, o = 0, []
    for x in xs:
        s += x
        o.append(s)
    return o

# ---------- charts (SVG) ----------
def _scale(vals, lo=None, hi=None):
    lo = min(vals) if lo is None else lo
    hi = max(vals) if hi is None else hi
    if hi == lo:
        hi = lo + 1
    return lo, hi

def nice_ticks(lo, hi, n=4):
    span = hi - lo
    step = 10 ** math.floor(math.log10(span / n))
    for m in (1, 2, 2.5, 5, 10):
        if span / (step * m) <= n:
            step *= m
            break
    t = math.ceil(lo / step) * step
    out = []
    while t <= hi + 1e-9:
        out.append(t)
        t += step
    return out

def fmt_axis(v, kind='money'):
    if kind == 'money':
        a = abs(v)
        s = f'${a/1000:g}k' if a >= 1000 else f'${a:g}'
        return (MINUS if v < 0 else '') + s
    if kind == 'pct':
        return f'{v:g}%'
    return f'{v:g}'

def area_chart(vals, w=520, h=200, uid='a', xlabels=(), kind='money', fill=True, color='var(--accent)', zero=True):
    pad_l, pad_b, pad_t = 40, 20, 8
    lo, hi = _scale(vals + ([0] if zero else []))
    ticks = nice_ticks(lo, hi)
    lo, hi = min(lo, ticks[0]), max(hi, ticks[-1])
    X = lambda i: pad_l + (w - pad_l - 4) * i / max(1, len(vals) - 1)
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    pts = ' '.join(f'{X(i):.1f},{Y(v):.1f}' for i, v in enumerate(vals))
    g = ''.join(f'<line class="gl" x1="{pad_l}" x2="{w}" y1="{Y(t):.1f}" y2="{Y(t):.1f}"/><text class="ax" x="{pad_l-8}" y="{Y(t)+3.5:.1f}" text-anchor="end">{fmt_axis(t, kind)}</text>' for t in ticks)
    xl = ''.join(f'<text class="ax" x="{X(int(i*(len(vals)-1)/max(1,len(xlabels)-1))):.1f}" y="{h-5}" text-anchor="middle">{t}</text>' for i, t in enumerate(xlabels))
    z = f'<line class="zero" x1="{pad_l}" x2="{w}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>' if zero and lo < 0 < hi else ''
    area = ''
    if fill:
        area = (f'<defs><linearGradient id="g{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{color}" stop-opacity=".28"/>'
                f'<stop offset=".6" stop-color="{color}" stop-opacity=".08"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient></defs>'
                f'<polygon fill="url(#g{uid})" points="{X(0):.1f},{Y(max(lo,0) if lo>0 else lo):.1f} {pts} {X(len(vals)-1):.1f},{Y(max(lo,0) if lo>0 else lo):.1f}"/>')
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" aria-hidden="true">{g}{xl}{z}{area}'
            f'<polyline fill="none" stroke="{color}" stroke-width="1.75" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="{pts}"/></svg>')

def bar_chart(vals, w=520, h=200, xlabels=(), kind='money', line=None):
    pad_l, pad_b, pad_t = 40, 20, 8
    lo, hi = _scale(vals + [0] + (line or []))
    ticks = nice_ticks(lo, hi)
    lo, hi = min(lo, ticks[0]), max(hi, ticks[-1])
    n = len(vals)
    bw = (w - pad_l - 4) / n
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    g = ''.join(f'<line class="gl" x1="{pad_l}" x2="{w}" y1="{Y(t):.1f}" y2="{Y(t):.1f}"/><text class="ax" x="{pad_l-8}" y="{Y(t)+3.5:.1f}" text-anchor="end">{fmt_axis(t, kind)}</text>' for t in ticks)
    bars = ''
    for i, v in enumerate(vals):
        x = pad_l + i * bw + bw * .18
        y0, y1 = Y(max(v, 0)), Y(min(v, 0))
        bars += f'<rect class="{"bar-g" if v >= 0 else "bar-l"}" x="{x:.1f}" y="{y0:.1f}" width="{max(1, bw*.64):.1f}" height="{max(.8, y1-y0):.1f}" rx="1.5"/>'
    xl = ''.join(f'<text class="ax" x="{pad_l + (int(i*(n-1)/max(1,len(xlabels)-1))+.5)*bw:.1f}" y="{h-5}" text-anchor="middle">{t}</text>' for i, t in enumerate(xlabels))
    ln = ''
    if line:
        pts = ' '.join(f'{pad_l + (i+.5)*bw:.1f},{Y(v):.1f}' for i, v in enumerate(line))
        ln = f'<polyline fill="none" stroke="var(--accent)" stroke-width="1.75" vector-effect="non-scaling-stroke" points="{pts}"/>'
    return f'<svg class="chart" viewBox="0 0 {w} {h}" aria-hidden="true">{g}<line class="base" x1="{pad_l}" x2="{w}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>{bars}{ln}{xl}</svg>'

def scatter(points, w=520, h=220, xticks=(), log=False):
    """points: [(x in 0..1, pnl)]"""
    pad_l, pad_b, pad_t = 40, 22, 8
    lo, hi = _scale([p for _, p in points] + [0])
    ticks = nice_ticks(lo, hi)
    lo, hi = min(lo, ticks[0]), max(hi, ticks[-1])
    X = lambda x: pad_l + 6 + (w - pad_l - 12) * x
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    g = ''.join(f'<line class="gl" x1="{pad_l}" x2="{w}" y1="{Y(t):.1f}" y2="{Y(t):.1f}"/><text class="ax" x="{pad_l-8}" y="{Y(t)+3.5:.1f}" text-anchor="end">{fmt_axis(t)}</text>' for t in ticks)
    z = f'<line class="base" x1="{pad_l}" x2="{w}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>'
    dots = ''
    for x, p in points:
        if p >= 0:
            dots += f'<circle cx="{X(x):.1f}" cy="{Y(p):.1f}" r="2.6" fill="var(--gain-fill)" fill-opacity=".75"/>'
        else:
            dots += f'<circle cx="{X(x):.1f}" cy="{Y(p):.1f}" r="2.3" fill="none" stroke="var(--loss-fill)" stroke-width="1.3" stroke-opacity=".85"/>'
    xl = ''.join(f'<text class="ax" x="{X(f):.1f}" y="{h-6}" text-anchor="middle">{t}</text>' for f, t in xticks)
    return f'<svg class="chart" viewBox="0 0 {w} {h}" aria-hidden="true">{g}{z}{dots}{xl}</svg>'

def radar(subs, size=250, uid='r'):
    """subs: [(label, value 0..100)] clockwise from top."""
    c = size / 2
    R = size * .32
    n = len(subs)
    ang = lambda i: -math.pi / 2 + 2 * math.pi * i / n
    P = lambda i, r: (c + r * math.cos(ang(i)), c + r * math.sin(ang(i)))
    rings = ''
    for k in range(1, 6):
        pts = ' '.join('%.1f,%.1f' % P(i, R * k / 5) for i in range(n))
        rings += f'<polygon points="{pts}" fill="none" stroke="var(--line)" stroke-width="1"/>'
    spokes = ''.join(f'<line x1="{c}" y1="{c}" x2="{P(i, R)[0]:.1f}" y2="{P(i, R)[1]:.1f}" stroke="var(--line)"/>' for i in range(n))
    poly = ' '.join('%.1f,%.1f' % P(i, R * v / 100) for i, (_, v) in enumerate(subs))
    dots = ''.join(f'<circle cx="{P(i, R*v/100)[0]:.1f}" cy="{P(i, R*v/100)[1]:.1f}" r="3" fill="var(--surface-1)" stroke="var(--accent)" stroke-width="1.6"/>' for i, (_, v) in enumerate(subs))
    labels = ''
    for i, (l, v) in enumerate(subs):
        x, y = P(i, R + 20)
        anchor = 'middle' if abs(x - c) < 4 else ('start' if x > c else 'end')
        labels += f'<text x="{x:.1f}" y="{y+4:.1f}" text-anchor="{anchor}" class="rl">{l}</text>'
    return (f'<svg class="radar" viewBox="0 0 {size} {size}" aria-hidden="true">{rings}{spokes}'
            f'<polygon points="{poly}" fill="var(--accent)" fill-opacity=".16" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>{dots}{labels}</svg>')

def lines_chart(series_list, w=520, h=200, xlabels=(), kind='money', styles=None, zero=True):
    """Several lines on one axis. styles: [(color, dash or '')]."""
    pad_l, pad_b, pad_t = 40, 20, 8
    allv = [v for s in series_list for v in s] + ([0] if zero else [])
    lo, hi = _scale(allv)
    ticks = nice_ticks(lo, hi)
    lo, hi = min(lo, ticks[0]), max(hi, ticks[-1])
    n = max(len(s) for s in series_list)
    X = lambda i: pad_l + (w - pad_l - 4) * i / max(1, n - 1)
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    g = ''.join(f'<line class="gl" x1="{pad_l}" x2="{w}" y1="{Y(t):.1f}" y2="{Y(t):.1f}"/><text class="ax" x="{pad_l-8}" y="{Y(t)+3.5:.1f}" text-anchor="end">{fmt_axis(t, kind)}</text>' for t in ticks)
    xl = ''.join(f'<text class="ax" x="{X(int(i*(n-1)/max(1,len(xlabels)-1))):.1f}" y="{h-5}" text-anchor="middle">{t}</text>' for i, t in enumerate(xlabels))
    z = f'<line class="base" x1="{pad_l}" x2="{w}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>' if zero and lo < 0 < hi else ''
    styles = styles or [('var(--accent)', ''), ('var(--muted)', ''), ('color-mix(in srgb, var(--accent) 55%, var(--surface-1))', '5 4')]
    ls = ''
    for s, (c, d) in zip(series_list, styles):
        pts = ' '.join(f'{X(i):.1f},{Y(v):.1f}' for i, v in enumerate(s))
        da = f' stroke-dasharray="{d}"' if d else ''
        ls += f'<polyline fill="none" stroke="{c}" stroke-width="1.75"{da} stroke-linejoin="round" vector-effect="non-scaling-stroke" points="{pts}"/>'
    return f'<svg class="chart" viewBox="0 0 {w} {h}" aria-hidden="true">{g}{xl}{z}{ls}</svg>'

def dual_chart(left, right, w=340, h=200, xlabels=()):
    """Balance (accent, left scale) and a second line (muted, right scale)."""
    pad_l, pad_r, pad_b, pad_t = 44, 40, 20, 8
    lo, hi = _scale(left); t1 = nice_ticks(lo, hi); lo, hi = min(lo, t1[0]), max(hi, t1[-1])
    lo2, hi2 = _scale(right + [0]); t2 = nice_ticks(lo2, hi2, 3); lo2, hi2 = min(lo2, t2[0]), max(hi2, t2[-1])
    n = len(left)
    X = lambda i: pad_l + (w - pad_l - pad_r) * i / max(1, n - 1)
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    Y2 = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo2) / (hi2 - lo2))
    g = ''.join(f'<line class="gl" x1="{pad_l}" x2="{w-pad_r}" y1="{Y(t):.1f}" y2="{Y(t):.1f}"/><text class="ax" x="{pad_l-6}" y="{Y(t)+3.5:.1f}" text-anchor="end">{fmt_axis(t)}</text>' for t in t1)
    g += ''.join(f'<text class="ax" x="{w-pad_r+6}" y="{Y2(t)+3.5:.1f}">{fmt_axis(t)}</text>' for t in t2)
    xl = ''.join(f'<text class="ax" x="{X(int(i*(n-1)/max(1,len(xlabels)-1))):.1f}" y="{h-5}" text-anchor="middle">{t}</text>' for i, t in enumerate(xlabels))
    p1 = ' '.join(f'{X(i):.1f},{Y(v):.1f}' for i, v in enumerate(left))
    p2 = ' '.join(f'{X(i):.1f},{Y2(v):.1f}' for i, v in enumerate(right))
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" aria-hidden="true">{g}{xl}'
            f'<polyline fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" points="{p1}"/>'
            f'<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round" points="{p2}"/></svg>')
