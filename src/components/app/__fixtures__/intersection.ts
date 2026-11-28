// Test-only: a stand-in for IntersectionObserver. happy-dom's never reports
// anything, so a component that waits to be near the viewport would wait for
// ever. `auto` reports every observed element as visible at once; otherwise a
// test calls `reveal`.
import { vi } from 'vitest';

interface Observed {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  targets: Set<Element>;
}

export interface FakeIntersection {
  /** Reports `el` (or every observed element) as intersecting. */
  reveal(el?: Element): void;
  /** Reports `el` (or every observed element) as outside. */
  hide(el?: Element): void;
  /** Observers that have not been disconnected. */
  live(): number;
  /** The options each live observer was made with. */
  options(): (IntersectionObserverInit | undefined)[];
}

export function fakeIntersectionObserver(
  opts: { auto?: boolean } = {},
): FakeIntersection {
  const all = new Set<Observed>();
  const send = (o: Observed, el: Element, isIntersecting: boolean) =>
    o.callback(
      [{ target: el, isIntersecting } as IntersectionObserverEntry],
      o as unknown as IntersectionObserver,
    );
  class Fake {
    private readonly seen: Observed;
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.seen = { callback, options, targets: new Set() };
      all.add(this.seen);
    }
    observe(el: Element) {
      this.seen.targets.add(el);
      if (opts.auto) queueMicrotask(() => send(this.seen, el, true));
    }
    unobserve(el: Element) {
      this.seen.targets.delete(el);
    }
    disconnect() {
      this.seen.targets.clear();
      all.delete(this.seen);
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', Fake);
  const each = (el: Element | undefined, isIntersecting: boolean): void => {
    for (const o of [...all])
      for (const t of [...o.targets])
        if (el === undefined || t === el) send(o, t, isIntersecting);
  };
  return {
    reveal: (el) => each(el, true),
    hide: (el) => each(el, false),
    live: () => all.size,
    options: () => [...all].map((o) => o.options),
  };
}
