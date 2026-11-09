import { describe, expect, it } from 'vitest';
import { inputHash, optimizerInput } from '../calc';
import { optimize } from '../optimizer';
import { emptyDoc, newOperation, newPart, type CnOperation, type CsOperation } from '../project';
import { readDxf, rectanglesFromDxf, writeDxf } from './dxf';
import { nestingGcode, runPostprocessor, sheetsCsv, DEFAULT_GCODE } from './postprocessors';

function optimized(type: 'CS' | 'CN') {
  const doc = emptyDoc();
  const op = newOperation(type, doc) as CsOperation | CnOperation;
  op.parts = [
    { ...newPart(null), length: 720, width: 560, qty: 2, name: 'Side' },
    { ...newPart(null), length: 300, width: 200, qty: 3, name: '=SUM(A1)' },
  ];
  doc.operations.push(op);
  const r = optimize(...(Object.values(optimizerInput(op, doc)) as Parameters<typeof optimize>));
  op.result = { ...r, createdAt: '', inputHash: inputHash(op, doc), comment: '', edited: false };
  return { doc, op };
}

describe('DXF', () => {
  it('writes entities that the reader reads back', () => {
    const text = writeDxf([
      { type: 'POLY', layer: 'Shelf', closed: true, points: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 300 }, { x: 0, y: 300 }] },
      { type: 'POLY', layer: 'Shelf', closed: true, points: [{ x: 900, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 800 }, { x: 900, y: 800 }] },
      { type: 'CIRCLE', layer: 'DRILL', x: 37, y: 32, r: 2.5 },
      { type: 'LINE', layer: 'GROOVE', x1: 0, y1: 10, x2: 800, y2: 10 },
    ]);
    const shapes = readDxf(text);
    expect(shapes.map((s) => s.type)).toEqual(['poly', 'poly', 'circle', 'line']);
    expect(rectanglesFromDxf(shapes)).toEqual([{ name: 'Shelf', length: 800, width: 300, qty: 2 }]);
  });

  it('reads LWPOLYLINE rectangles', () => {
    const lw = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'Door', '90', '4', '70', '1', '10', '0', '20', '0', '10', '596', '20', '0', '10', '596', '20', '716', '10', '0', '20', '716', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    expect(rectanglesFromDxf(readDxf(lw))).toEqual([{ name: 'Door', length: 716, width: 596, qty: 1 }]);
  });
});

describe('postprocessors', () => {
  it('CSV lists every placement and neutralises formulas', () => {
    const { op } = optimized('CS');
    const csv = sheetsCsv(op, op.result!);
    expect(csv.trim().split('\r\n')).toHaveLength(1 + 5);
    expect(csv).toContain("'=SUM(A1)");
  });

  it('DXF and XML exports are produced for sheet cutting', () => {
    const { op } = optimized('CS');
    const files = [...runPostprocessor('dxf', op, 'P', '', DEFAULT_GCODE), ...runPostprocessor('sawXml', op, 'P<&>', '', DEFAULT_GCODE)];
    expect(files.map((f) => f.name)).toEqual(['Material1.dxf', 'Material1.xml']);
    expect(readDxf(files[0]!.content).filter((s) => s.layer === 'PARTS')).toHaveLength(5);
    expect(files[1]!.content).toContain('project="P&lt;&amp;&gt;"');
    expect(files[1]!.content).toMatch(/<cmd no="1" code="T"/);
  });

  it('G-code contours every part outside by the tool radius', () => {
    const { op } = optimized('CN');
    if (op.type !== 'CN') throw new Error();
    const pat = op.result!.patterns[0]!;
    const code = nestingGcode(op, pat, DEFAULT_GCODE);
    expect(code.match(/\(Part \d+\)/g)).toHaveLength(pat.placements.length);
    expect(code).toContain(`G1 Z-${(18).toFixed(3)}`);
    expect(code.trim().endsWith('M30')).toBe(true);
    // First contour starts one tool radius (6 mm) outside the part.
    const p = pat.placements.find((x) => code.includes(`(Part ${x.no})`))!;
    expect(code).toContain(`X${(p.x - 6).toFixed(3)}`);
  });
});
