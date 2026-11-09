import { describe, expect, it } from 'vitest';
import { checkXnc, itemsFromDxf, makeTransform, xncCost, xncDims, xncGcode } from './xnc';
import { readDxf, writeDxf } from './export/dxf';
import { DEFAULT_GCODE } from './export/postprocessors';
import { emptyDoc, newOperation, newPart, projectDocSchema, type SheetOperation, type XncOperation } from './project';

function setup() {
  const doc = emptyDoc();
  doc.products[0]!.qty = 2;
  const cs = newOperation('CS', doc) as SheetOperation;
  cs.parts.push({ ...newPart(doc.products[0]!.id), length: 720, width: 560, qty: 2, name: 'Side' });
  const x = newOperation('XNC', doc) as XncOperation;
  x.params.partRef = { opId: cs.id, partId: cs.parts[0]!.id };
  x.items = [
    { id: 'h1', kind: 'hole', face: 'front', x: 37, y: 32, z: 0, d: 5, depth: 12 },
    { id: 'h2', kind: 'hole', face: 'front', x: 37, y: 528, z: 0, d: 5, depth: 12 },
    { id: 'h3', kind: 'hole', face: 'left', x: 32, y: 0, z: 9, d: 8, depth: 30 },
    { id: 'g1', kind: 'groove', face: 'back', x1: 0, y1: 20, x2: 720, y2: 20, width: 4, depth: 8 },
  ];
  x.params.pricePerHole = 0.5;
  x.params.pricePerMeter = 2;
  doc.operations.push(cs, x);
  return { doc, x };
}

describe('XNC', () => {
  it('takes size and quantity from the linked part', () => {
    const { doc, x } = setup();
    expect(xncDims(x, doc)).toEqual({ dx: 720, dy: 560, dz: 18, qty: 4, linked: true });
    expect(projectDocSchema.safeParse(doc).success).toBe(true);
  });

  it('costs holes and metres of milling × quantity', () => {
    const { doc, x } = setup();
    const c = xncCost(x, doc);
    expect(c.holes).toBe(3);
    expect(c.cost).toBeCloseTo((3 * 0.5 + 0.72 * 2) * 4, 6);
  });

  it('checks constraints', () => {
    const { doc, x } = setup();
    expect(checkXnc(x, doc)).toEqual([]);
    x.items.push({ id: 'bad', kind: 'hole', face: 'front', x: 2, y: 2, z: 0, d: 8, depth: 20 });
    expect(checkXnc(x, doc).map((w) => w.key)).toEqual(['holeNearEdge', 'throughHole']);
  });

  it('transforms by turn, mirror and origin', () => {
    expect(makeTransform({ turn: 0, mirror: 'none', origin: 'LB' }, 720, 560).apply(10, 20)).toEqual({ x: 10, y: 20 });
    expect(makeTransform({ turn: 0, mirror: 'none', origin: 'LT' }, 720, 560).apply(10, 20)).toEqual({ x: 10, y: 540 });
    expect(makeTransform({ turn: 90, mirror: 'none', origin: 'LB' }, 720, 560).apply(10, 20)).toEqual({ x: 540, y: 10 });
    expect(makeTransform({ turn: 0, mirror: 'h', origin: 'LB' }, 720, 560).apply(10, 20)).toEqual({ x: 710, y: 20 });
  });

  it('writes G-code with drilling cycles, back-face milling and edge holes', () => {
    const { doc, x } = setup();
    const code = xncGcode(x, doc, DEFAULT_GCODE);
    expect(code.match(/G81 /g)).toHaveLength(2);
    expect(code).toContain('(BACK FACE — turn the panel over)');
    expect(code).toContain('(LEFT X32.000 Z9.000 D8.000 DEPTH30.000)');
    expect(code.trim().endsWith('M30')).toBe(true);
  });

  it('imports holes, grooves and pockets from DXF with depth from the layer name', () => {
    const dxf = writeDxf([
      { type: 'CIRCLE', layer: 'DRILL_Z12', x: 37, y: 32, r: 2.5 },
      { type: 'LINE', layer: 'GROOVE', x1: 0, y1: 20, x2: 700, y2: 20 },
      { type: 'POLY', layer: 'POCKET_Z5', closed: true, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 150 }, { x: 100, y: 150 }] },
    ]);
    const items = itemsFromDxf(readDxf(dxf), { depth: 8, grooveWidth: 4, toolD: 8 });
    expect(items.map((i) => [i.kind, 'depth' in i ? i.depth : 0])).toEqual([['hole', 12], ['groove', 8], ['pocket', 5]]);
  });
});
