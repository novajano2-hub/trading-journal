import type { Appearance } from '@/domain/types';

/**
 * Where the Appearance choice is mirrored for the script that runs before
 * first paint. The prefs hold the choice; IndexedDB is too slow to read
 * before the page draws, so this copy lets a dark choice never flash light.
 */
export const APPEARANCE_KEY = 'keel-appearance';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The theme a choice comes to: System follows the device. */
export function resolveTheme(
  mode: Appearance,
  prefersDark: boolean,
): 'light' | 'dark' {
  return mode === 'dark' || (mode === 'system' && prefersDark)
    ? 'dark'
    : 'light';
}

/**
 * Applies a choice to the page now and keeps its pre-paint copy. `<html>`
 * carries the choice (`data-appearance`) and what it resolves to
 * (`data-theme`); the pre-paint script's listener re-resolves System when the
 * device switches.
 */
export function applyAppearance(mode: Appearance): void {
  const root = document.documentElement;
  const dark =
    typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
  root.dataset.appearance = mode;
  root.dataset.theme = resolveTheme(mode, dark);
  try {
    localStorage.setItem(APPEARANCE_KEY, mode);
  } catch {
    // Storage can be blocked: the page still switches, the next one starts from System.
  }
}

/**
 * Runs in `<head>` before first paint: reads the mirrored choice (System when
 * there is none), sets `data-appearance` and `data-theme`, and keeps System in
 * step with the device for the life of the page.
 */
export const APPEARANCE_SCRIPT = `(function(){var d=document.documentElement,m=null;try{m=localStorage.getItem('${APPEARANCE_KEY}')}catch(e){}d.dataset.appearance=m==='light'||m==='dark'?m:'system';try{var q=matchMedia('${DARK_QUERY}');var a=function(){var c=d.dataset.appearance;d.dataset.theme=c==='dark'||(c!=='light'&&q.matches)?'dark':'light'};a();if(q.addEventListener)q.addEventListener('change',a);else q.addListener(a)}catch(e){d.dataset.theme=m==='dark'?'dark':'light'}})()`;
