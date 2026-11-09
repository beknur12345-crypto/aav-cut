import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, encodeCode128B } from './code128';

describe('Code 128', () => {
  it('every symbol is 11 modules wide (stop is 13) and patterns are unique', () => {
    CODE128_PATTERNS.forEach((p, i) => expect([...p].reduce((a, c) => a + Number(c), 0)).toBe(i === 106 ? 13 : 11));
    expect(new Set(CODE128_PATTERNS).size).toBe(CODE128_PATTERNS.length);
  });

  it('encodes with start B, checksum and stop', () => {
    // "PJJ123C": checksum = (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 55 → '311321'
    const m = encodeCode128B('PJJ123C');
    expect(m.length).toBe(6 * (1 + 7 + 1) + 7);
    expect(m.slice(0, 6).join('')).toBe('211214');
    expect(m.slice(-13, -7).join('')).toBe('311321');
    expect(m.slice(-7).join('')).toBe('2331112');
  });

  it('rejects characters outside subset B', () => {
    expect(() => encodeCode128B('é')).toThrow();
  });
});
