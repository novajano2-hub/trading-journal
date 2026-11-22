// Test-only: every string a reader can get from a subtree.

/** Every text node and every attribute value under `root`: what a screen, a tooltip or a screen reader can get. */
export function everyString(root: Element): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) out.push(n.textContent ?? '');
    else
      for (const a of Array.from((n as Element).attributes)) out.push(a.value);
  }
  return out;
}
