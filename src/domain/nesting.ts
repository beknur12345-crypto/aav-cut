/**
 * Result-level editing for "Edit nesting": applies tree edits to one sheet of a stored cutting
 * result, splitting repeated patterns when needed and recomputing totals and unplaced parts.
 */
import { optimizerInput } from './calc';
import { buildPattern } from './optimizer/optimize';
import { countParts, emptyTree, placePart, removePart, type PlaceError } from './optimizer/edit';
import type { TreeNode } from './optimizer/guillotine';
import type { CuttingResult, ProjectDoc, SheetOperation } from './project';

type Pattern = CuttingResult['patterns'][number];

export const canEditPattern = (p: Pattern): boolean => !!p.tree;

function settingsOf(op: SheetOperation) {
  return { minOffcutLong: op.params.minOffcutLong, minOffcutShort: op.params.minOffcutShort };
}

function rebuild(op: SheetOperation, p: Pattern, tree: TreeNode, count: number): Pattern {
  const stock = { id: p.stockId, length: p.length, width: p.width, qty: count, trimLength: p.trimLength ?? 0, trimWidth: p.trimWidth ?? 0 };
  return buildPattern(stock, tree, count, settingsOf(op), p.kerf ?? 0) as Pattern;
}

/** Totals and unplaced parts of a result, against the operation's current demand. */
export function summarize(result: CuttingResult, op: SheetOperation, doc: ProjectDoc): CuttingResult {
  const demand = new Map(optimizerInput(op, doc).parts.map((p) => [p.id, p.qty]));
  const placed = new Map<string, number>();
  for (const pat of result.patterns) for (const pl of pat.placements) placed.set(pl.partId, (placed.get(pl.partId) ?? 0) + pat.count);
  const unplaced = [...demand].map(([partId, qty]) => ({ partId, qty: qty - (placed.get(partId) ?? 0) })).filter((u) => u.qty > 0);
  const sheetsUsed = result.patterns.reduce((a, p) => a + p.count, 0);
  const sheetArea = result.patterns.reduce((a, p) => a + p.length * p.width * p.count, 0);
  const partsArea = result.patterns.reduce((a, p) => a + p.partsArea * p.count, 0);
  const cutLength = result.patterns.reduce((a, p) => a + p.cutLength * p.count, 0);
  return { ...result, unplaced, sheetsUsed, sheetArea, partsArea, cutLength, fill: sheetArea ? partsArea / sheetArea : 0 };
}

/** Isolates one sheet of a repeated pattern so it can be edited on its own. */
function isolate(result: CuttingResult, index: number): CuttingResult {
  const p = result.patterns[index]!;
  if (p.count <= 1) return result;
  const patterns = [...result.patterns];
  patterns.splice(index, 1, { ...p, count: 1 }, { ...p, count: p.count - 1 });
  return { ...result, patterns };
}

export function removeFromSheet(result: CuttingResult, index: number, x: number, y: number, op: SheetOperation, doc: ProjectDoc): CuttingResult | null {
  const r = isolate(result, index);
  const p = r.patterns[index]!;
  if (!p.tree) return null;
  const tree = removePart(p.tree as TreeNode, x, y);
  if (!tree) return null;
  const patterns = [...r.patterns];
  const rebuilt = rebuild(op, p, tree, 1);
  // A sheet with nothing left on it is dropped from the plan.
  if (rebuilt.placements.length === 0) patterns.splice(index, 1);
  else patterns[index] = rebuilt;
  return summarize({ ...r, patterns }, op, doc);
}

export function placeOnSheet(
  result: CuttingResult, index: number, px: number, py: number, partId: string, rotated: boolean, op: SheetOperation, doc: ProjectDoc,
): CuttingResult | PlaceError | 'grain' | 'noneLeft' {
  const input = optimizerInput(op, doc);
  const part = input.parts.find((p) => p.id === partId);
  if (!part) return 'noneLeft';
  if (rotated && !part.canRotate) return 'grain';
  const current = summarize(result, op, doc);
  if (!current.unplaced.some((u) => u.partId === partId)) return 'noneLeft';
  const r = isolate(current, index);
  const p = r.patterns[index]!;
  if (!p.tree) return 'noFreeSpace';
  const res = placePart(p.tree as TreeNode, px, py, { partId, no: part.no, length: part.length, width: part.width }, rotated, p.kerf ?? 0, op.type === 'CN' ? 7 : op.params.maxRotations + 1);
  if ('error' in res) return res.error;
  const patterns = [...r.patterns];
  patterns[index] = rebuild(op, p, res.tree, 1);
  return summarize({ ...r, patterns }, op, doc);
}

/** Adds an empty sheet of the given stock to the plan (to place remaining parts by hand). */
export function addEmptySheet(result: CuttingResult, stockId: string, op: SheetOperation, doc: ProjectDoc): CuttingResult | null {
  const input = optimizerInput(op, doc);
  const stock = input.stocks.find((s) => s.id === stockId);
  if (!stock) return null;
  const used = result.patterns.filter((p) => p.stockId === stockId).reduce((a, p) => a + p.count, 0);
  if (used >= stock.qty) return null;
  const k = input.settings.kerf;
  const tree = emptyTree(stock.length - 2 * stock.trimLength, stock.width - 2 * stock.trimWidth, stock.trimLength, stock.trimWidth, k);
  const pattern = buildPattern(stock, tree, 1, settingsOf(op), k) as Pattern;
  return summarize({ ...result, patterns: [...result.patterns, pattern] }, op, doc);
}

export { countParts };
