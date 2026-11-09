import { describe, expect, it } from 'vitest';
import { inputHash, optimizerInput } from './calc';
import { addEmptySheet, placeOnSheet, removeFromSheet, summarize } from './nesting';
import { optimize } from './optimizer';
import { emptyDoc, newCsOperation, newPart, projectDocSchema, type ProjectDoc, type SheetOperation } from './project';

function setup(): { doc: ProjectDoc; op: SheetOperation } {
  const doc = emptyDoc();
  const op = newCsOperation(1);
  op.parts = [
    { ...newPart(doc.products[0]!.id), length: 720, width: 560, qty: 8, name: 'Side' },
    { ...newPart(doc.products[0]!.id), length: 564, width: 100, qty: 8, name: 'Rail' },
  ];
  doc.operations.push(op);
  const r = optimize(...(Object.values(optimizerInput(op, doc)) as Parameters<typeof optimize>));
  op.result = { ...r, createdAt: '', inputHash: inputHash(op, doc), comment: '', edited: false };
  return { doc, op };
}

describe('edit nesting', () => {
  it('removes a part, reports it unplaced, and places it back', () => {
    const { doc, op } = setup();
    const before = op.result!;
    expect(before.unplaced).toEqual([]);
    const first = before.patterns[0]!.placements[0]!;
    const removed = removeFromSheet(before, 0, first.x, first.y, op, doc)!;
    expect(removed.unplaced).toEqual([{ partId: first.partId, qty: 1 }]);
    expect(removed.partsArea).toBeCloseTo(before.partsArea - first.length * first.width, 3);

    const placed = placeOnSheet(removed, 0, first.x + 1, first.y + 1, first.partId, false, op, doc);
    if (typeof placed === 'string') throw new Error(placed);
    expect(placed.unplaced).toEqual([]);
    expect(placed.partsArea).toBeCloseTo(before.partsArea, 3);
    // The rebuilt sheet still has a saw sequence and passes the save schema.
    expect(placed.patterns[0]!.commands.some((c) => c.cmd === 'P')).toBe(true);
    op.result = placed;
    const saved = projectDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    const savedOp = saved.operations[0]!;
    // The cut tree survives a save round-trip, so the sheet can be edited again later.
    expect(savedOp.type === 'CS' && savedOp.result?.patterns[0]?.tree).toBeTruthy();
  });

  it('refuses rotation of grain-fixed parts and parts that do not fit', () => {
    const { doc, op } = setup();
    const r = op.result!;
    const pl = r.patterns[0]!.placements[0]!;
    const removed = removeFromSheet(r, 0, pl.x, pl.y, op, doc)!;
    expect(placeOnSheet(removed, 0, pl.x, pl.y, pl.partId, true, op, doc)).toBe('grain');
    expect(placeOnSheet(r, 0, 1, 1, pl.partId, false, op, doc)).toBe('noneLeft');
  });

  it('adds an empty sheet and places a part on it', () => {
    const { doc, op } = setup();
    const r = op.result!;
    const pl = r.patterns[0]!.placements[0]!;
    const removed = removeFromSheet(r, 0, pl.x, pl.y, op, doc)!;
    const withSheet = addEmptySheet(removed, op.sheets[0]!.id, op, doc)!;
    const idx = withSheet.patterns.length - 1;
    expect(withSheet.patterns[idx]!.placements).toHaveLength(0);
    const placed = placeOnSheet(withSheet, idx, 20, 20, pl.partId, false, op, doc);
    if (typeof placed === 'string') throw new Error(placed);
    expect(placed.patterns[idx]!.placements).toHaveLength(1);
    expect(summarize(placed, op, doc).sheetsUsed).toBe(r.sheetsUsed + 1);
  });

  it('isolates one sheet of a repeated pattern', () => {
    const doc = emptyDoc();
    const op = newCsOperation(1);
    op.parts = [{ ...newPart(null), length: 1300, width: 900, qty: 40 }];
    doc.operations.push(op);
    const r0 = optimize(...(Object.values(optimizerInput(op, doc)) as Parameters<typeof optimize>));
    const r = { ...r0, createdAt: '', inputHash: '', comment: '', edited: false };
    expect(r.patterns[0]!.count).toBe(10);
    const pl = r.patterns[0]!.placements[0]!;
    const edited = removeFromSheet(r, 0, pl.x, pl.y, op, doc)!;
    expect(edited.patterns.map((p) => p.count)).toEqual([1, 9]);
    expect(edited.unplaced).toEqual([{ partId: op.parts[0]!.id, qty: 1 }]);
  });
});
