import {
  linesOf,
  type FormatMoney,
} from '@/components/app/calendar/month-grid';
import type {
  CalendarDay,
  CalendarWeek,
  UnitSums,
  calendarMonth,
} from '@/data/calendar';
import type { CalendarStat, Cents } from '@/domain/types';
import { plural } from './format';

/*
 * The Calendar image (#49, C45): the month as the grid shows it, drawn as an
 * SVG with its own colours (a standalone image has no stylesheet to read the
 * page's tokens from), then rasterized to a PNG. Every money figure comes from
 * the caller's `fig`, so the display unit and Privacy apply to the picture as
 * they do to the page.
 */

/** A figure as the page's display writes it. `r` and `units` are what the day, week or month holds, for the units that are not money. */
export type CalendarFigure = (
  money: Cents,
  r?: number | null,
  units?: UnitSums,
) => string;

export interface CalendarImageOptions {
  /** The cell stats, in the order they lead; as `UserPrefs.calendarStats`. */
  stats: readonly CalendarStat[];
  fig: CalendarFigure;
  theme: 'light' | 'dark';
  /** The month: "November 2026". */
  title: string;
  /** The workspace and the accounts in words: "Sample workspace, all accounts". */
  subtitle: string;
  /** The label of the month's net; Net unless the page reads Gross. */
  basis?: 'net' | 'gross';
}

/** The tokens of `theme.css`, as the picture needs them. */
const PALETTE = {
  light: {
    surface: '#ffffff',
    sunken: '#f0f1f8',
    line: '#e7e9f3',
    text: '#121633',
    muted: '#4b5175',
    faint: '#636889',
    gain: '#0a7a52',
    gainFill: '#19a672',
    gainSoft: '#ddf3e8',
    loss: '#c22e3a',
    lossFill: '#e5484d',
    lossSoft: '#fceced',
    accent: '#2b35af',
    accentSoft: '#eeeffc',
    accentInk: '#2b35af',
  },
  dark: {
    surface: '#141414',
    sunken: '#1b1b1b',
    line: '#252525',
    text: '#ededed',
    muted: '#a3a3a3',
    faint: '#878787',
    gain: '#3fc08e',
    gainFill: '#2fb27f',
    gainSoft: '#10261c',
    loss: '#f06a78',
    lossFill: '#e5484d',
    lossSoft: '#2b1517',
    accent: '#4c57dc',
    accentSoft: '#1c1d2e',
    accentInk: '#aeb4ff',
  },
} as const;
type Palette = (typeof PALETTE)[keyof typeof PALETTE];

/** Keel's face first; where the picture is drawn without it, the device's own. */
const FONT =
  "'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const PAD = 28;
const GAP = 6;
const DAY_W = 116;
const WEEK_W = 124;
const WIDTH = PAD * 2 + 7 * DAY_W + WEEK_W + 7 * GAP;
const GRID_TOP = 116;
const INSET = 10;

const SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Month = ReturnType<typeof calendarMonth>;

/** Text for an XML text node or attribute: markup written as itself, and nothing the format forbids. */
function esc(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** About how wide `text` sets at `size`, in the UI face's tabular figures: enough to tell a figure that will not fit its cell. */
function widthOf(text: string, size: number): number {
  let em = 0;
  for (const ch of text)
    em += /[0-9]/.test(ch)
      ? 0.6
      : /[.,:'; ]/.test(ch)
        ? 0.3
        : /[A-Z%+−$•★]/.test(ch)
          ? 0.68
          : 0.55;
  return em * size;
}

/** `size`, or the largest below it that sets `text` inside `avail`. */
function fit(text: string, size: number, avail: number): number {
  const w = widthOf(text, size);
  return w <= avail
    ? size
    : Math.max(9, Math.round(((size * avail) / w) * 10) / 10);
}

function text(
  x: number,
  y: number,
  size: number,
  weight: number,
  fill: string,
  body: string,
  extra = '',
): string {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${body}</text>`;
}

/** The day's fill, its hairline and the colour of its figures. */
function tone(p: Palette, t: CalendarDay['tone']) {
  switch (t) {
    case 'gain':
      return { fill: p.gainSoft, edge: p.gainFill, alpha: 0.28, ink: p.gain };
    case 'loss':
      return { fill: p.lossSoft, edge: p.lossFill, alpha: 0.26, ink: p.loss };
    case 'flat':
      return { fill: p.accentSoft, edge: p.accent, alpha: 0.2, ink: p.text };
    default:
      return { fill: p.surface, edge: p.line, alpha: 1, ink: p.text };
  }
}

const signInk = (p: Palette, net: Cents) =>
  net < 0 ? p.loss : net > 0 ? p.gain : p.text;

/** The note mark of a day with a daily note: a small pad with two lines. */
function noteMark(p: Palette, date: string, x: number, y: number): string {
  return (
    `<g data-note="${date}" fill="none" stroke="${p.muted}" stroke-width="1.3" stroke-linecap="round">` +
    `<rect x="${x}" y="${y}" width="12" height="14" rx="2.5"/>` +
    `<path d="M${x + 3} ${y + 5}h6M${x + 3} ${y + 8.5}h6"/></g>`
  );
}

/** Where a day's lines sit in its cell: the lead, then the rest. */
const LEAD_Y = 46;
const REST_Y = 65;
const LINE_STEP = 16;

/**
 * The month as an SVG string, as the Calendar shows it: the header, the grid
 * with the chosen stats in every traded day, a mark on days with a note, the
 * weekly column with each week's net and day count, and Keel's wordmark at the
 * foot. Pure: the same month and options give the same string.
 */
export function calendarSvg(month: Month, opts: CalendarImageOptions): string {
  const p = PALETTE[opts.theme];
  const { weeks, summary } = month;
  // One adapter for the grid's own `linesOf`: the picture takes its figures from `fig`, always in full.
  const fmt: FormatMoney = (money, r, _compact, units) => {
    const written = opts.fig(money, r, units);
    return { text: written, label: written };
  };
  const lineSets = weeks.map((w) =>
    w.days.map((d) =>
      d !== null && d.trades > 0 ? linesOf(d, opts.stats, fmt, 'USD') : [],
    ),
  );
  const tallest = Math.max(1, ...lineSets.flat().map((l) => l.length));
  const rowH = Math.max(
    84,
    (tallest > 1 ? REST_Y + LINE_STEP * (tallest - 2) : LEAD_Y) + 16,
  );
  const gridBottom = GRID_TOP + weeks.length * rowH + (weeks.length - 1) * GAP;
  const wordmarkY = gridBottom + 38;
  const height = wordmarkY + 24;

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${esc(FONT)}" style="font-variant-numeric:tabular-nums">`,
    `<rect width="${WIDTH}" height="${height}" fill="${p.surface}"/>`,
  ];

  // The header: the month, then its net, trading days, workspace and accounts.
  const label = opts.basis === 'gross' ? 'Gross P&L' : 'Net P&L';
  const net = opts.fig(summary.net, summary.r, summary);
  const days = `${summary.tradingDays} trading ${plural(summary.tradingDays, 'day')}`;
  const rest = `, ${days}, ${opts.subtitle}`;
  const subSize = fit(`${label} ${net}${rest}`, 14, WIDTH - PAD * 2);
  out.push(
    text(PAD, PAD + 20, 22, 600, p.text, esc(opts.title)),
    text(
      PAD,
      PAD + 44,
      subSize,
      400,
      p.muted,
      `${esc(label)} <tspan font-weight="600" fill="${signInk(p, summary.net)}">${esc(net)}</tspan>${esc(rest)}`,
    ),
  );

  // The weekday headers, from the day the first week starts on.
  const first = new Date(
    `${weeks[0]?.start ?? '2026-01-04'}T00:00:00Z`,
  ).getUTCDay();
  for (let i = 0; i < 7; i += 1) {
    const name = SUNDAY_FIRST[(first + i) % 7]!;
    out.push(
      text(
        PAD + i * (DAY_W + GAP) + INSET,
        GRID_TOP - 10,
        12,
        500,
        p.faint,
        name,
        ` data-dow="${name}"`,
      ),
    );
  }
  out.push(
    text(
      PAD + 7 * (DAY_W + GAP) + INSET,
      GRID_TOP - 10,
      12,
      500,
      p.faint,
      'Week',
    ),
  );

  weeks.forEach((week, wi) => {
    const y0 = GRID_TOP + wi * (rowH + GAP);
    week.days.forEach((day, di) => {
      if (day === null) return;
      const x0 = PAD + di * (DAY_W + GAP);
      out.push(...cell(p, day, lineSets[wi]![di]!, x0, y0, rowH));
    });
    out.push(
      ...weekCell(p, week, wi, opts.fig, PAD + 7 * (DAY_W + GAP), y0, rowH),
    );
  });

  // The wordmark, at the foot.
  out.push(
    text(
      WIDTH - PAD,
      wordmarkY,
      18,
      700,
      p.accentInk,
      'Keel',
      ' text-anchor="end"',
    ),
    '</svg>',
  );
  return out.join('');
}

type Lines = ReturnType<typeof linesOf>;

/** One day: its tint and hairline, its number, a note mark and the chosen stats stacked under it. */
function cell(
  p: Palette,
  day: CalendarDay,
  lines: Lines,
  x0: number,
  y0: number,
  rowH: number,
): string[] {
  const t = tone(p, day.tone);
  const avail = DAY_W - INSET * 2;
  const out = [
    `<rect x="${x0 + 0.5}" y="${y0 + 0.5}" width="${DAY_W - 1}" height="${rowH - 1}" rx="10" fill="${t.fill}" stroke="${t.edge}" stroke-opacity="${t.alpha}"/>`,
    text(
      x0 + INSET,
      y0 + 20,
      13,
      600,
      p.muted,
      `${Number(day.date.slice(8))}${day.tone === 'flat' ? `<tspan dx="5" font-size="12" fill="${p.accentInk}">Flat</tspan>` : ''}`,
    ),
  ];
  if (day.hasNote) out.push(noteMark(p, day.date, x0 + DAY_W - 26, y0 + 8));
  lines.forEach((line, i) => {
    const lead = i === 0;
    const size = fit(line.text, lead ? 17 : 12.5, avail);
    const ink = lead ? (line.toned ? t.ink : p.text) : p.muted;
    out.push(
      text(
        x0 + INSET,
        lead ? y0 + LEAD_Y : y0 + REST_Y + LINE_STEP * (i - 1),
        size,
        lead ? 600 : 400,
        ink,
        esc(line.text),
      ),
    );
  });
  return out;
}

/** A week's total on the sunken column: its number, its net and its trading days. */
function weekCell(
  p: Palette,
  week: CalendarWeek,
  index: number,
  fig: CalendarFigure,
  x0: number,
  y0: number,
  rowH: number,
): string[] {
  const none = week.tradingDays === 0;
  const figure = fig(week.net, week.r, week);
  const avail = WEEK_W - INSET * 2;
  return [
    `<rect x="${x0}" y="${y0}" width="${WEEK_W}" height="${rowH}" rx="10" fill="${p.sunken}"/>`,
    text(x0 + INSET, y0 + 20, 12.5, 500, p.faint, `Week ${index + 1}`),
    text(
      x0 + INSET,
      y0 + LEAD_Y,
      fit(figure, 16, avail),
      600,
      none ? p.faint : signInk(p, week.net),
      esc(figure),
    ),
    text(
      x0 + INSET,
      y0 + REST_Y,
      12.5,
      400,
      p.muted,
      none
        ? 'No trades'
        : `${week.tradingDays} ${plural(week.tradingDays, 'day')}`,
    ),
  ];
}

/** The picture's size, from its root: what the canvas it is drawn on is sized by. */
export function svgSize(svg: string): { width: number; height: number } {
  const m = /^<svg\b[^>]*?\swidth="([\d.]+)"[^>]*?\sheight="([\d.]+)"/.exec(
    svg,
  );
  if (!m) throw new Error('The calendar image has no size');
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** The SVG as an address an `<img>` can show and a canvas can draw. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The file a month is saved as. */
export function calendarFileName(month: string): string {
  return `keel-calendar-${month}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('The calendar image could not be drawn'));
    image.src = src;
  });
}

/**
 * The SVG drawn to a canvas at `scale` times its size and handed back as a
 * PNG. It waits for the page's fonts first, and draws on an `OffscreenCanvas`
 * where there is one, else a `<canvas>`.
 */
export async function calendarPng(svg: string, scale = 2): Promise<Blob> {
  await document.fonts?.ready;
  const size = svgSize(svg);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const image = await loadImage(svgDataUrl(svg));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to draw the calendar image on');
    context.drawImage(image, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the calendar image on');
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The canvas gave no image')),
      'image/png',
    ),
  );
}

/** Whether this browser can put an image on the clipboard: a `ClipboardItem` and `clipboard.write` (C46). */
export function canCopyImage(): boolean {
  return (
    typeof window !== 'undefined' &&
    'ClipboardItem' in window &&
    typeof navigator.clipboard?.write === 'function'
  );
}
