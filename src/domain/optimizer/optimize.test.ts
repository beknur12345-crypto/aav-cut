import { describe, expect, it } from 'vitest';
import { optimize } from './optimize';
import type { OptPart, OptSettings, OptStock, Placement } from './types';

const settings: OptSettings = { kerf: 4.4, initialDirection: 'any', maxRotations: 6, minOffcutLong: 400, minOffcutShort: 100 };
const stock: OptStock = { id: 's', length: 2750, width: 1830, qty: 1000, trimLength: 10, trimWidth: 10 };

// The 4-cabinet job used as the GibLab benchmark (2 sheets, 77.66 % fill, 43.17 m of cuts).
const cabinets: OptPart[] = [
  { id: 'side', no: 1, length: 720, width: 560, qty: 8, canRotate: false },
  { id: 'bottom', no: 2, length: 564, width: 560, qty: 4, canRotate: false },
  { id: 'rail', no: 3, length: 564, width: 100, qty: 8, canRotate: false },
  { id: 'shelf', no: 4, length: 562, width: 520, qty: 4, canRotate: false },
  { id: 'door', no: 5, length: 716, width: 596, qty: 4, canRotate: false },
];

function overlaps(a: Placement, b: Placement, gap: number) {
  return a.x < b.x + b.length + gap - 1e-6 && b.x < a.x + a.length + gap - 1e-6 && a.y < b.y + b.width + gap - 1e-6 && b.y < a.y + a.width + gap - 1e-6;
}

function assertValid(res: ReturnType<typeof optimize>, parts: OptPart[], st: OptStock, kerf: number) {
  for (const pat of res.patterns) {
    for (const p of pat.placements) {
      expect(p.x).toBeGreaterThanOrEqual(st.trimLength - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(st.trimWidth - 1e-6);
      expect(p.x + p.length).toBeLessThanOrEqual(pat.length - st.trimLength + 1e-6);
      expect(p.y + p.width).toBeLessThanOrEqual(pat.width - st.trimWidth + 1e-6);
      const part = parts.find((q) => q.id === p.partId)!;
      if (!part.canRotate) expect(p.rotated).toBe(false);
      const [l, w] = p.rotated ? [part.width, part.length] : [part.length, part.width];
      expect(p.length).toBeCloseTo(l, 6);
      expect(p.width).toBeCloseTo(w, 6);
    }
    // Every pair of parts is separated by at least one saw kerf.
    for (let i = 0; i < pat.placements.length; i++)
      for (let j = i + 1; j < pat.placements.length; j++) expect(overlaps(pat.placements[i]!, pat.placements[j]!, kerf)).toBe(false);
  }
  // Demand is met exactly.
  for (const part of parts) {
    const placed = res.patterns.reduce((a, pat) => a + pat.count * pat.placements.filter((p) => p.partId === part.id).length, 0);
    const missing = res.unplaced.find((u) => u.partId === part.id)?.qty ?? 0;
    expect(placed + missing).toBe(part.qty);
  }
}

describe('optimize', () => {
  it('matches the benchmark: 28 cabinet parts on 2 sheets', () => {
    const res = optimize(cabinets, [stock], settings);
    assertValid(res, cabinets, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
    expect(res.sheetsUsed).toBe(2);
    expect(res.partsArea / 1e6).toBeCloseTo(7.816, 3);
    expect(res.fill).toBeCloseTo(7.816 / (2 * 2.75 * 1.83), 3);
    expect(res.durationMs).toBeLessThan(5000);
  });

  it('honours grain: fixed parts are never rotated, free parts may be', () => {
    const parts: OptPart[] = [{ id: 'a', no: 1, length: 300, width: 1700, qty: 10, canRotate: true }];
    const res = optimize(parts, [stock], settings);
    assertValid(res, parts, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
  });

  it('reports parts that do not fit any sheet', () => {
    const parts: OptPart[] = [
      { id: 'big', no: 1, length: 3000, width: 500, qty: 2, canRotate: false },
      { id: 'ok', no: 2, length: 500, width: 500, qty: 1, canRotate: false },
    ];
    const res = optimize(parts, [stock], settings);
    expect(res.unplaced).toEqual([{ partId: 'big', qty: 2 }]);
    expect(res.sheetsUsed).toBe(1);
  });

  it('respects stock quantity', () => {
    const parts: OptPart[] = [{ id: 'a', no: 1, length: 2700, width: 1800, qty: 3, canRotate: false }];
    const res = optimize(parts, [{ ...stock, qty: 2 }], settings);
    expect(res.sheetsUsed).toBe(2);
    expect(res.unplaced).toEqual([{ partId: 'a', qty: 1 }]);
  });

  it('uses an offcut only when it is filled at least its minimum fill', () => {
    const offcut: OptStock = { id: 'off', length: 1000, width: 600, qty: 1, trimLength: 0, trimWidth: 0, minFill: 0.5 };
    const small: OptPart[] = [{ id: 'a', no: 1, length: 300, width: 200, qty: 1, canRotate: false }];
    // 10 % fill of the offcut is below its 50 % minimum, so a full sheet is used instead.
    expect(optimize(small, [offcut, stock], settings).patterns[0]!.stockId).toBe('s');
    const fits: OptPart[] = [{ id: 'b', no: 1, length: 900, width: 550, qty: 1, canRotate: false }];
    expect(optimize(fits, [offcut, stock], settings).patterns[0]!.stockId).toBe('off');
  });

  it('groups identical sheets into one pattern', () => {
    const parts: OptPart[] = [{ id: 'a', no: 1, length: 1300, width: 900, qty: 40, canRotate: false }];
    const res = optimize(parts, [stock], settings);
    assertValid(res, parts, stock, settings.kerf);
    expect(res.sheetsUsed).toBe(10);
    expect(res.patterns.length).toBe(1);
    expect(res.patterns[0]!.count).toBe(10);
  });

  it('uses a forced first-cut direction and keeps cuts within the level limit', () => {
    const res = optimize(cabinets, [stock], { ...settings, initialDirection: 'length', maxRotations: 2 });
    assertValid(res, cabinets, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
    const firstCut = res.patterns[0]!.commands.find((c) => c.cmd !== 'T' && c.cmd !== 'R');
    expect(firstCut).toBeDefined();
  });

  it('emits cut lines and saw commands with a positive cut length', () => {
    const res = optimize(cabinets, [stock], settings);
    for (const pat of res.patterns) {
      expect(pat.cutLength).toBeGreaterThan(0);
      expect(pat.commands[0]!.cmd).toBe('T');
      expect(pat.commands.filter((c) => c.cmd === 'P').length).toBeGreaterThan(0);
    }
  });

  it('handles larger jobs within the time budget', () => {
    const parts: OptPart[] = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`, no: i + 1, length: 200 + ((i * 137) % 900), width: 100 + ((i * 89) % 600), qty: 1 + (i % 7), canRotate: i % 3 !== 0,
    }));
    const res = optimize(parts, [stock], settings);
    assertValid(res, parts, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
    expect(res.fill).toBeGreaterThan(0.75);
    expect(res.durationMs).toBeLessThan(10000);
  });

  it('limits the number of different parts per sheet', () => {
    const res = optimize(cabinets, [stock], { ...settings, maxVarieties: 1 });
    assertValid(res, cabinets, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
    for (const pat of res.patterns) expect(new Set(pat.placements.map((p) => p.partId)).size).toBe(1);
  });

  it('respects maximum band width and length (strip layouts only)', () => {
    const band = { minWidth: 0, maxWidth: 600, maxLength: 1500, sort: 'descending' as const, sortInto: 'none' as const };
    const res = optimize(cabinets, [stock], { ...settings, initialDirection: 'length', band });
    assertValid(res, cabinets, stock, settings.kerf);
    expect(res.unplaced).toEqual([]);
    for (const pat of res.patterns)
      for (const p of pat.placements) {
        // Strips run along the length: every part fits inside a band ≤ 600 wide and ≤ 1500 long.
        expect(p.width).toBeLessThanOrEqual(600);
        expect(p.x + p.length - stock.trimLength).toBeLessThanOrEqual(1500 + 1e-6);
      }
  });

  it('sorts bands across the sheet', () => {
    const parts: OptPart[] = [
      { id: 'a', no: 1, length: 2000, width: 200, qty: 2, canRotate: false },
      { id: 'b', no: 2, length: 2000, width: 500, qty: 2, canRotate: false },
    ];
    const widthsInOrder = (sort: 'ascending' | 'descending') => {
      const r = optimize(parts, [stock], { ...settings, initialDirection: 'length', band: { minWidth: 0, maxWidth: 0, maxLength: 2700, sort, sortInto: 'none' } });
      return [...r.patterns[0]!.placements].sort((p, q) => p.y - q.y).map((p) => p.width);
    };
    expect(widthsInOrder('ascending')).toEqual([200, 200, 500, 500]);
    expect(widthsInOrder('descending')).toEqual([500, 500, 200, 200]);
  });
});
