import { describe, expect, it } from 'vitest';
import { clearReferences, combineSameMaterial, divideEdgingByMaterial, mergeDocInto } from './merge';
import { emptyDoc, isSheetOp, newOperation, newPart, projectDocSchema, type ElOperation } from './project';

function twoMaterialsOneEdge() {
  const doc = emptyDoc();
  const a = newOperation('CS', doc);
  const b = newOperation('CS', doc);
  b.name = 'Oak';
  const el = newOperation('EL', doc) as ElOperation;
  doc.operations.push(a, b, el);
  for (const op of [a, b]) if (isSheetOp(op)) op.parts.push({ ...newPart(doc.products[0]!.id), length: 500, width: 300, edges: { t: el.id, b: null, l: null, r: null } });
  return { doc, a, b, el };
}

describe('document tools', () => {
  it('merges another project with fresh ids and remapped references', () => {
    const { doc } = twoMaterialsOneEdge();
    const target = emptyDoc();
    mergeDocInto(target, doc);
    expect(target.operations).toHaveLength(3);
    expect(target.products).toHaveLength(2);
    const el = target.operations.find((o) => o.type === 'EL')!;
    const cs = target.operations.find(isSheetOp)!;
    expect(cs.parts[0]!.edges.t).toBe(el.id);
    expect(doc.operations.map((o) => o.id)).not.toContain(el.id);
    expect(projectDocSchema.safeParse(target).success).toBe(true);
  });

  it('divides an edgeband used by two materials', () => {
    const { doc, b } = twoMaterialsOneEdge();
    expect(divideEdgingByMaterial(doc)).toBe(1);
    const els = doc.operations.filter((o) => o.type === 'EL');
    expect(els).toHaveLength(2);
    if (isSheetOp(b)) expect(b.parts[0]!.edges.t).toBe(els[1]!.id);
  });

  it('combines operations with the same code and material', () => {
    const doc = emptyDoc();
    const a = newOperation('CS', doc);
    const c = newOperation('CS', doc);
    c.name = a.name;
    if (isSheetOp(a) && isSheetOp(c)) {
      a.parts.push(newPart(null));
      c.parts.push(newPart(null), newPart(null));
    }
    doc.operations.push(a, c);
    expect(combineSameMaterial(doc)).toBe(1);
    expect(doc.operations).toHaveLength(1);
    if (isSheetOp(doc.operations[0]!)) expect(doc.operations[0]!.parts).toHaveLength(3);
  });

  it('clears references to a deleted operation', () => {
    const { doc, a, el } = twoMaterialsOneEdge();
    clearReferences(doc, el.id);
    if (isSheetOp(a)) expect(a.parts[0]!.edges.t).toBeNull();
  });
});
