import { describe, expect, it } from 'vitest';
import { enter, exit } from './motion';

describe('motion tokens', () => {
  it('enter is 240ms ease-out', () => {
    expect(enter).toEqual({ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] });
  });
  it('exit is 160ms ease-in', () => {
    expect(exit).toEqual({ duration: 0.16, ease: [0.4, 0, 1, 1] });
  });
});
