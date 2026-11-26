// Test-only: the viewport a component reads through `matchMedia`, with motion
// reduced. Spy on `window.matchMedia`, so call `vi.restoreAllMocks()` after.
import { vi } from 'vitest';

const realMatchMedia = window.matchMedia.bind(window);

const media = (query: string, matches: boolean): MediaQueryList =>
  ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;

/**
 * A wide viewport as happy-dom has it, or a phone, where every width query is
 * false and `usePhone` is true. Motion is reduced either way, so the buttons'
 * press ripples do not run when a button leaves mid-animation (an animation
 * cancelled in happy-dom rejects a promise nobody awaits).
 */
export function viewport({ phone = false }: { phone?: boolean } = {}): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    if (query.includes('prefers-reduced-motion')) return media(query, true);
    return phone ? media(query, false) : realMatchMedia(query);
  });
}
