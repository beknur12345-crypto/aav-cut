/**
 * Document-level operations used by "Import" and "General actions".
 * All functions mutate the target document in place (callers pass an editor draft).
 */
import { isSheetOp, newId, type ElOperation, type Operation, type ProjectDoc, type Sides } from './project';

const remapSides = (s: Sides, ids: Map<string, string>): Sides => ({
  t: s.t ? ids.get(s.t) ?? null : null, b: s.b ? ids.get(s.b) ?? null : null, l: s.l ? ids.get(s.l) ?? null : null, r: s.r ? ids.get(s.r) ?? null : null,
});

/** Appends the products and operations of `source` to `target`, with fresh ids and all references remapped. */
export function mergeDocInto(target: ProjectDoc, source: ProjectDoc): void {
  const ids = new Map<string, string>();
  for (const p of source.products) ids.set(p.id, newId('pr'));
  for (const op of source.operations) ids.set(op.id, newId('op'));
  const mapRef = (v: string | null) => (v ? ids.get(v) ?? null : null);
  target.products.push(...source.products.map((p) => ({ ...p, id: ids.get(p.id)! })));
  for (const src of source.operations) {
    const op = structuredClone(src) as Operation;
    op.id = ids.get(src.id)!;
    if (isSheetOp(op)) {
      op.parts = op.parts.map((p) => ({
        ...p, id: newId('pt'), productId: mapRef(p.productId), edges: remapSides(p.edges, ids), grooves: remapSides(p.grooves, ids),
        surface: { front: mapRef(p.surface.front), back: mapRef(p.surface.back) },
      }));
      op.sheets = op.sheets.map((s) => ({ ...s, id: newId('sh') }));
      op.result = null;
    } else if (op.type === 'CL') {
      op.parts = op.parts.map((p) => ({ ...p, id: newId('pt'), productId: mapRef(p.productId) }));
      op.sheets = op.sheets.map((s) => ({ ...s, id: newId('sh') }));
      op.result = null;
    } else if (op.type === 'O') {
      op.ownerId = mapRef(op.ownerId);
      op.materials = op.materials.map((m) => ({ ...m, id: newId('m') }));
    }
    target.operations.push(op);
  }
}

/**
 * "Combine operations with the same code and material": sheet and band operations of the same
 * type, code, name and thickness are merged into the first one. Returns the number removed.
 */
export function combineSameMaterial(doc: ProjectDoc): number {
  const keep = new Map<string, Operation>();
  const removed = new Set<string>();
  for (const op of doc.operations) {
    if (!isSheetOp(op) && op.type !== 'CL') continue;
    const key = `${op.type}|${op.code.trim().toLowerCase()}|${op.name.trim().toLowerCase()}|${op.params.thickness}`;
    const first = keep.get(key);
    if (!first) {
      keep.set(key, op);
      continue;
    }
    if (isSheetOp(first) && isSheetOp(op)) first.parts.push(...op.parts);
    else if (first.type === 'CL' && op.type === 'CL') first.parts.push(...op.parts);
    if ('result' in first) first.result = null;
    removed.add(op.id);
  }
  doc.operations = doc.operations.filter((o) => !removed.has(o.id));
  return removed.size;
}

/**
 * "Divide edging operations by cutting material": an edgeband used on parts of several sheet
 * materials is split into one edgeband operation per material. Returns the number created.
 */
export function divideEdgingByMaterial(doc: ProjectDoc): number {
  let created = 0;
  const els = doc.operations.filter((o): o is ElOperation => o.type === 'EL');
  for (const el of els) {
    const users = doc.operations.filter(isSheetOp).filter((op) => op.parts.some((p) => Object.values(p.edges).includes(el.id)));
    for (const op of users.slice(1)) {
      const copy: ElOperation = { ...structuredClone(el), id: newId('op'), name: `${el.name} (${op.name})` };
      for (const p of op.parts) for (const side of ['t', 'b', 'l', 'r'] as const) if (p.edges[side] === el.id) p.edges[side] = copy.id;
      doc.operations.splice(doc.operations.indexOf(el) + 1 + created, 0, copy);
      created++;
    }
    if (users.length > 1 && users[0]) el.name = `${el.name} (${users[0].name})`;
  }
  return created;
}

/** Removes references to an operation that is being deleted (edges, grooves, surfaces). */
export function clearReferences(doc: ProjectDoc, opId: string): void {
  for (const op of doc.operations) {
    if (!isSheetOp(op)) continue;
    for (const p of op.parts) {
      for (const side of ['t', 'b', 'l', 'r'] as const) {
        if (p.edges[side] === opId) p.edges[side] = null;
        if (p.grooves[side] === opId) p.grooves[side] = null;
      }
      if (p.surface.front === opId) p.surface.front = null;
      if (p.surface.back === opId) p.surface.back = null;
    }
  }
}
