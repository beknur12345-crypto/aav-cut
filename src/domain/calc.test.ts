import { describe, expect, it } from 'vitest';
import {
  cuttingSize, edgeRows, grooveRows, inputHash, isResultCurrent, linearInput, operationCost, optimizerInput, parsePastedAccessories,
  parsePastedParts, projectCost, roundLength, roundSheets, surfaceRows, totalCount,
} from './calc';
import { optimize } from './optimizer';
import { optimizeLinear } from './optimizer/linear';
import { migrateDoc } from './migrate';
import {
  emptyDoc, newCsOperation, newOperation, newPart, projectDocSchema,
  type ClOperation, type ElOperation, type GrOperation, type OOperation, type ProjectDoc, type SpOperation,
} from './project';

function cabinetDoc(): ProjectDoc {
  const doc = emptyDoc();
  const product = doc.products[0]!;
  product.qty = 2;
  const op = newCsOperation(1);
  const rows: [number, number, number, string][] = [
    [720, 560, 4, 'Side'], [564, 560, 2, 'Bottom'], [564, 100, 4, 'Top rail'], [562, 520, 2, 'Shelf'], [716, 596, 2, 'Door'],
  ];
  op.parts = rows.map(([l, w, q, name]) => ({ ...newPart(product.id), length: l, width: w, qty: q, name }));
  doc.operations.push(op);
  return doc;
}

describe('sheet cutting calculations', () => {
  it('TC = part qty × product qty', () => {
    const doc = cabinetDoc();
    expect(totalCount(doc.operations[0]!.type === 'CS' ? doc.operations[0]!.parts[0]! : newPart(null), doc.products)).toBe(8);
  });

  it('parts area of the benchmark job is 7.816 m²', () => {
    const doc = cabinetDoc();
    const c = operationCost(doc.operations[0]!, doc);
    expect(c.partsQty).toBe(28);
    expect(c.partsArea).toBeCloseTo(7.816, 3);
  });

  it('cutting size follows the input mode and the edgeband operations', () => {
    const doc = emptyDoc();
    const el = newOperation('EL', doc) as ElOperation;
    el.params.thickness = 2;
    el.params.premillWidth = 0.5;
    doc.operations.push(el);
    const part = { ...newPart(null), length: 700, width: 500, edges: { t: el.id, b: el.id, l: el.id, r: null } };
    doc.inputMode = 'workpiece';
    expect(cuttingSize(part, doc)).toEqual({ length: 700, width: 500 });
    doc.inputMode = 'detail';
    expect(cuttingSize(part, doc)).toEqual({ length: 698.5, width: 497 });
    doc.inputMode = 'afterPremilling';
    expect(cuttingSize(part, doc)).toEqual({ length: 700.5, width: 501 });
  });

  it('rounds sheets and lengths per rule', () => {
    expect(roundSheets(1.2, 'whole')).toBe(2);
    expect(roundSheets(1.2, 'any2')).toBe(1.5);
    expect(roundSheets(1.2, 'any4')).toBe(1.25);
    expect(roundLength(3.141, 'nearest1')).toBe(3.1);
    expect(roundLength(3.01, 'up0')).toBe(4);
  });

  it('estimates material before optimizing, then uses the real result', () => {
    const doc = cabinetDoc();
    const op = doc.operations[0]!;
    if (op.type !== 'CS') throw new Error('expected CS');
    Object.assign(op.params, { materialPrice: 10, costBySheets: true, operationPrice: 2 });
    const est = operationCost(op, doc);
    expect(est.fromResult).toBe(false);
    expect(est.sheets).toBe(Math.ceil(7.816 / 0.9 / 5.0325));

    const { parts, stocks, settings } = optimizerInput(op, doc);
    const r = optimize(parts, stocks, settings);
    op.result = { ...r, createdAt: new Date().toISOString(), inputHash: inputHash(op, doc), comment: '', edited: false };
    expect(isResultCurrent(op, doc)).toBe(true);
    const real = operationCost(op, doc);
    expect(real.sheets).toBe(2);
    expect(real.costMaterial).toBeCloseTo(2 * 5.0325 * 10, 2);
    expect(real.costOperation).toBeCloseTo((r.cutLength / 1000) * 2, 1);
    expect(projectDocSchema.safeParse(doc).success).toBe(true);
    op.parts[0]!.qty = 5;
    expect(isResultCurrent(op, doc)).toBe(false);
  });

  it('allocates project cost to products', () => {
    const doc = cabinetDoc();
    const op = doc.operations[0]!;
    if (op.type === 'CS') op.params.materialPrice = 100;
    const pc = projectCost(doc);
    expect(pc.byProduct[doc.products[0]!.id]!.cost).toBeCloseTo(pc.cost, 1);
  });

  it('parses parts and accessories pasted from a spreadsheet', () => {
    expect(parsePastedParts('Length\tWidth\tQty\tName\n720\t560\t8\tSide\n564;100;2;Rail\n12,5\t40\t\t\n')).toEqual([
      { length: 720, width: 560, qty: 8, name: 'Side' },
      { length: 564, width: 100, qty: 2, name: 'Rail' },
      { length: 12.5, width: 40, qty: 1, name: '' },
    ]);
    expect(parsePastedAccessories('H-01\tHinge\tpcs\t8\t1,5')).toEqual([{ code: 'H-01', name: 'Hinge', unit: 'pcs', qty: 8, price: 1.5 }]);
  });
});

describe('edgebanding, grooving, surface, accessories', () => {
  function docWithOps() {
    const doc = cabinetDoc();
    const el = newOperation('EL', doc) as ElOperation;
    Object.assign(el.params, { thickness: 2, wastePct: 10, wasteAtEdges: 30, materialPrice: 1, operationPrice: 2 });
    const gr = newOperation('GR', doc) as GrOperation;
    gr.params.pricePerMeter = 3;
    const sp = newOperation('SP', doc) as SpOperation;
    Object.assign(sp.params, { materialPrice: 4, operationPrice: 5 });
    doc.operations.push(el, gr, sp);
    const cs = doc.operations[0]!;
    if (cs.type !== 'CS') throw new Error();
    // Side (720×560, TC 8): edge on top and left; groove on bottom; surface on the front.
    cs.parts[0]!.edges = { t: el.id, b: null, l: el.id, r: null };
    cs.parts[0]!.grooves = { t: null, b: gr.id, l: null, r: null };
    cs.parts[0]!.surface = { front: sp.id, back: null };
    return { doc, el, gr, sp };
  }

  it('edgeband length, waste and cost', () => {
    const { doc, el } = docWithOps();
    const rows = edgeRows(doc, el);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pastL: 1, pastW: 1, tc: 8 });
    const c = operationCost(el, doc);
    // work = (720 + 560) × 8 = 10.24 m; material = 10.24 × 1.1 + 16 pieces × 0.03 = 11.744 m
    expect(c.workLength).toBeCloseTo(10.24, 2);
    expect(c.materialLength).toBeCloseTo(11.74, 2);
    expect(c.costMaterial).toBeCloseTo(11.74, 2);
    expect(c.costOperation).toBeCloseTo(20.48, 2);
  });

  it('groove length and cost', () => {
    const { doc, gr } = docWithOps();
    expect(grooveRows(doc, gr)[0]).toMatchObject({ sides: 'B', grooveLength: 5.76 });
    expect(operationCost(gr, doc).cost).toBeCloseTo(17.28, 2);
  });

  it('surface area and cost', () => {
    const { doc, sp } = docWithOps();
    expect(surfaceRows(doc, sp)[0]!.area).toBeCloseTo(0.72 * 0.56 * 8, 6);
    const c = operationCost(sp, doc);
    expect(c.costMaterial).toBeCloseTo(3.2256 * 4, 2);
    expect(c.costOperation).toBeCloseTo(3.2256 * 5, 2);
  });

  it('accessories are multiplied by the owner product quantity', () => {
    const doc = cabinetDoc();
    const o = newOperation('O', doc) as OOperation;
    o.ownerId = doc.products[0]!.id; // qty 2
    o.costOperation = 10;
    o.materials.push({ id: 'm1', code: '', name: 'Hinge', unit: 'pcs', qty: 4, price: 2.5 });
    doc.operations.push(o);
    const c = operationCost(o, doc);
    expect(c.costMaterial).toBe(20);
    expect(c.costOperation).toBe(20);
    expect(projectCost(doc).byProduct[doc.products[0]!.id]!.cost).toBeCloseTo(40, 2);
  });

  it('every new operation type passes the save schema', () => {
    const { doc } = docWithOps();
    for (const t of ['O', 'CN', 'CL', 'LB'] as const) doc.operations.push(newOperation(t, doc));
    const r = projectDocSchema.safeParse(doc);
    expect(r.success ? 'ok' : JSON.stringify(r.error.issues.slice(0, 2))).toBe('ok');
  });
});

describe('band cutting (CL)', () => {
  it('cuts lengths from bars with kerf and trimming', () => {
    const doc = emptyDoc();
    const cl = newOperation('CL', doc) as ClOperation;
    cl.sheets = [{ id: 'b', name: 'Band', length: 2750, qty: 100, isOffcut: false }];
    cl.parts = [
      { id: 'a', productId: null, name: 'A', code: '', length: 1200, qty: 5, description: '' },
      { id: 'c', productId: null, name: 'C', code: '', length: 700, qty: 6, description: '' },
      { id: 'd', productId: null, name: 'D', code: '', length: 3000, qty: 1, description: '' },
    ];
    doc.operations.push(cl);
    const { parts, stocks, settings } = linearInput(cl, doc);
    const r = optimizeLinear(parts, stocks, settings);
    expect(r.unplaced).toEqual([{ partId: 'd', qty: 1 }]);
    // 5×1200 + 6×700 = 10.2 m → lower bound 10.2 / 2.73 usable ≈ 3.74 → 4 bars
    expect(r.barsUsed).toBe(4);
    for (const pat of r.patterns) {
      const end = Math.max(...pat.pieces.map((p) => p.x + p.length));
      expect(end).toBeLessThanOrEqual(pat.length - settings.trim + 1e-6);
      for (let i = 1; i < pat.pieces.length; i++) expect(pat.pieces[i]!.x - (pat.pieces[i - 1]!.x + pat.pieces[i - 1]!.length)).toBeCloseTo(settings.kerf, 6);
    }
    const placed = r.patterns.reduce((a, p) => a + p.count * p.pieces.length, 0);
    expect(placed).toBe(11);
    cl.result = { ...r, createdAt: '', inputHash: inputHash(cl, doc) };
    expect(isResultCurrent(cl, doc)).toBe(true);
    expect(operationCost(cl, doc).sheets).toBeGreaterThan(3);
    expect(projectDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe('migration v1 → v2', () => {
  it('turns numeric edges into edgeband operations and keeps cutting sizes', () => {
    const v1 = {
      schemaVersion: 1,
      inputMode: 'detail',
      products: [{ id: 'p1', code: '', name: 'P', qty: 1 }],
      operations: [{
        id: 'op1', type: 'CS', code: '', name: 'M', materialId: null, print: true, params: {}, sheets: [], result: null,
        parts: [{ id: 'x', productId: 'p1', name: '', code: '', length: 700, width: 500, qty: 1, grain: true, edges: { t: 2, b: 2, l: 0.4, r: 0 }, description: '' }],
      }],
    };
    const doc = projectDocSchema.parse(migrateDoc(v1));
    expect(doc.operations.filter((o) => o.type === 'EL')).toHaveLength(2);
    const cs = doc.operations[0]!;
    if (cs.type !== 'CS') throw new Error();
    expect(cuttingSize(cs.parts[0]!, doc)).toEqual({ length: 699.6, width: 496 });
  });
});
