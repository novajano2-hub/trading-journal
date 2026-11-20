import type { Locator } from '@playwright/test';

/**
 * Every piece of text inside `scope` that is cut off: a text node ending in an
 * ellipsis, or text wider than the box that holds it (clipped by `truncate`
 * or spilling past its cell). An empty list means every figure shows in full.
 *
 * Widths are compared to the sub-pixel: `truncate` ellipsizes text that is a
 * fraction of a pixel too wide, which whole-pixel scrollWidth cannot see.
 */
export function cutOffText(scope: Locator): Promise<string[]> {
  return scope.evaluateAll(async (roots) => {
    // Measure in the real faces: the fallbacks are narrower.
    await document.fonts.ready;
    // Rotation only changes paint, not layout: lift it so rects match layout.
    const turned: [HTMLElement, string][] = [];
    const straighten = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      if (cs.rotate === 'none' && cs.transform === 'none') return;
      turned.push([el, el.style.cssText]);
      el.style.rotate = 'none';
      el.style.transform = 'none';
    };
    for (const root of roots) {
      for (let a = root.parentElement; a; a = a.parentElement) straighten(a);
      straighten(root as HTMLElement);
      root.querySelectorAll<HTMLElement>('*').forEach(straighten);
    }

    const problems: string[] = [];
    const boxOf = (node: Node): HTMLElement | null => {
      let el = node.parentElement;
      while (el && getComputedStyle(el).display === 'inline')
        el = el.parentElement;
      return el;
    };
    for (const root of roots) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        if (!text) continue;
        if (/(…|\.\.\.)$/.test(text)) {
          problems.push(`"${text}" ends in an ellipsis`);
          continue;
        }
        const box = boxOf(n);
        // Visually hidden text (sr-only) is clipped on purpose.
        if (!box || box.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const ink = range.getBoundingClientRect(); // full width, even if ellipsized
        const r = box.getBoundingClientRect();
        const cs = getComputedStyle(box);
        const left =
          r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
        const right =
          r.right -
          parseFloat(cs.borderRightWidth) -
          parseFloat(cs.paddingRight);
        // A figure on one line: wrapping "21100.0 / 0" is no better than "21100…".
        if (box.localName === 'dd' && range.getClientRects().length > 1) {
          problems.push(`"${text}" wraps onto a second line`);
          continue;
        }
        if (ink.left < left - 0.5 || ink.right > right + 0.5) {
          problems.push(
            `"${text}" needs ${ink.width.toFixed(1)}px but its box holds ${(right - left).toFixed(1)}px`,
          );
          continue;
        }
        // Nor may it spill past any enclosing box, such as a crowded header row.
        for (let a = box.parentElement; a; a = a.parentElement) {
          const ar = a.getBoundingClientRect();
          const acs = getComputedStyle(a);
          const aLeft = ar.left + parseFloat(acs.borderLeftWidth);
          const aRight = ar.right - parseFloat(acs.borderRightWidth);
          if (ink.left < aLeft - 0.5 || ink.right > aRight + 0.5) {
            problems.push(`"${text}" spills past its ${a.localName}`);
            break;
          }
          if (a === root) break;
        }
      }
    }

    for (const [el, css] of turned) el.style.cssText = css;
    return problems;
  });
}

/** WCAG contrast of an element's own text against what it is drawn on. */
export function textContrast(target: Locator): Promise<number> {
  return target.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
    type RGBA = [number, number, number, number];
    const parse = (css: string): RGBA => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    const over = (top: RGBA, under: RGBA): RGBA => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    // The nearest opaque surface behind the element, and the opacity between.
    let backdrop: RGBA = [255, 255, 255, 1];
    let opacity = Number(getComputedStyle(el).opacity);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const bg = parse(getComputedStyle(p).backgroundColor);
      if (bg[3] === 1) {
        backdrop = bg;
        break;
      }
      opacity *= Number(getComputedStyle(p).opacity);
    }
    const style = getComputedStyle(el);
    const bg = over(parse(style.backgroundColor), backdrop);
    const fg = over(parse(style.color), bg);
    const seen = (c: RGBA) => over([c[0], c[1], c[2], opacity], backdrop);
    const lum = ([r, g, b]: RGBA) => {
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const [hi, lo] = [lum(seen(fg)), lum(seen(bg))].sort((a, b) => b - a);
    return (hi! + 0.05) / (lo! + 0.05);
  });
}

/**
 * Every label or figure a rubber stamp lands on, per ticket in `scope`, plus
 * any ticket whose contents run past its bottom edge. Rotation of the ticket
 * itself is lifted while measuring (it is paint, not layout); the stamp keeps
 * its own tilt, since that is the impression it leaves.
 */
export function stampCollisions(scope: Locator): Promise<string[]> {
  return scope.evaluateAll(async (tickets) => {
    await document.fonts.ready;
    const turned: [HTMLElement, string][] = [];
    for (const t of tickets)
      for (
        let a: HTMLElement | null = t as HTMLElement;
        a;
        a = a.parentElement
      ) {
        const cs = getComputedStyle(a);
        if (cs.rotate === 'none' && cs.transform === 'none') continue;
        turned.push([a, a.style.cssText]);
        a.style.rotate = 'none';
        a.style.transform = 'none';
      }

    const problems: string[] = [];
    const hit = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    for (const t of tickets) {
      const name = t.getAttribute('aria-label');
      const box = t.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(t).paddingBottom);
      for (const el of t.querySelectorAll<HTMLElement>('header, dl, p'))
        if (el.getBoundingClientRect().bottom > box.bottom - pad + 0.5)
          problems.push(
            `${name}: its ${el.localName} runs past the bottom edge`,
          );
      for (const stamp of t.querySelectorAll<HTMLElement>('.rubber-stamp')) {
        const s = stamp.getBoundingClientRect();
        for (const el of t.querySelectorAll<HTMLElement>(
          'dt, dd, header span, p > span',
        )) {
          if (el.closest('.sr-only') || !el.textContent?.trim()) continue;
          if (hit(s, el.getBoundingClientRect()))
            problems.push(
              `${name}: ${stamp.textContent} covers "${el.textContent.trim()}"`,
            );
        }
      }
    }

    for (const [el, css] of turned) el.style.cssText = css;
    return problems;
  });
}

/** True when every sampled point of `target` shows its own ticket, not one stacked over it. */
export function inPlainView(target: Locator): Promise<boolean> {
  return target.evaluate(async (el) => {
    await document.fonts.ready;
    const own = el.closest('article');
    // Points are hit-tested in the viewport, so bring the stamp into it.
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    for (const fx of [0.15, 0.32, 0.5, 0.68, 0.85])
      for (const fy of [0.3, 0.5, 0.7]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        // The stamp ignores the pointer, so this finds what lies at that spot.
        const at = document.elementFromPoint(x, y);
        if (!at || at.closest('article') !== own) return false;
      }
    return true;
  });
}
