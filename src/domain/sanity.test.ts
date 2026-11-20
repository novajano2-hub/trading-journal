import { aliasProbe } from '@/domain/sanity-alias';
import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('adds', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolves the @/ alias', () => {
    expect(aliasProbe).toBe('ok');
  });
});
