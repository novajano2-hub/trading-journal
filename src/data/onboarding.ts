import type { UserPrefs } from '@/domain/types';

/** K48: letters, digits, dots and underscores, 3 to 30 characters. */
export const USERNAME = /^[A-Za-z0-9._]{3,30}$/;

/** Whether the first run is over: the flag a first run or the v3 upgrade writes (K54). */
export function isOnboarded(prefs: Pick<UserPrefs, 'onboarding'>): boolean {
  return prefs.onboarding?.status === 'done';
}

/** A three-letter currency code Intl knows. */
export function isCurrencyCode(code: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}
