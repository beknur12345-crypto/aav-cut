/** Pure calculations: cutting sizes, totals, material quantities and costs for every operation type. */
import type { OptPart, OptSettings, OptStock } from './optimizer';
import type { LinPart, LinSettings, LinStock } from './optimizer/linear';
import { xncCost } from './xnc';
import {
  isSheetOp,
  type ClOperation, type CsParams, type CuttingResult, type ElOperation, type GrOperation, type LengthRounding, type LinearResult,
  type Operation, type Part, type Product, type ProjectDoc, type Sheet, type SheetOperation, type SpOperation,
} from './project';

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function elOps(doc: ProjectDoc): Map<string, ElOperation> {
  return new Map(doc.operations.filter((o): o is ElOperation => o.type === 'EL').map((o) => [o.id, o]));
}

/**
 * Size the saw must cut, from the entered size and the input mode:
 *  - workpiece / none: as entered
 *  - detail (finished, with edgeband): minus edgeband thickness, plus pre-milling, on banded sides
 *  - after pre-milling (without edgeband): plus pre-milling on banded sides
 */
export function cuttingSize(part: Part, doc: ProjectDoc, els = elOps(doc)): { length: number; width: number } {
  const mode = doc.inputMode;
  if (mode !== 'detail' && mode !== 'afterPremilling') return { length: part.length, width: part.width };
  const adj = (side: 't' | 'b' | 'l' | 'r') => {
    const el = part.edges[side] ? els.get(part.edges[side]!) : undefined;
    if (!el) return 0;
    return (mode === 'detail' ? -el.params.thickness : 0) + el.params.premillWidth;
  };
  return { length: Math.max(0, part.length + adj('l') + adj('r')), width: Math.max(0, part.width + adj('t') + adj('b')) };
}

/** TC: total count = part qty × product qty. */
export function totalCount(part: { productId: string | null; qty: number }, products: Product[]): number {
  if (!part.productId) return part.qty;
  const product = products.find((p) => p.id === part.productId);
  return part.qty * (product ? product.qty : 1);
}

export function partsTotals(op: SheetOperation, doc: ProjectDoc) {
  const els = elOps(doc);
  let qty = 0;
  let area = 0;
  let perimeter = 0;
  for (const p of op.parts) {
    const tc = totalCount(p, doc.products);
    const s = cuttingSize(p, doc, els);
    qty += tc;
    area += (s.length * s.width * tc) / 1e6;
    perimeter += (2 * (s.length + s.width) * tc) / 1000;
  }
  return { qty, area, perimeter };
}

export function effectiveTrims(sheet: Sheet, params: CsParams) {
  return { trimLength: sheet.trimLength ?? params.trimLength, trimWidth: sheet.trimWidth ?? params.trimWidth };
}

/** Kerf used by the optimizer: saw blade for CS, mill diameter + allowance for CN. */
export function effectiveKerf(op: SheetOperation): number {
  return op.type === 'CN' ? op.cn.millDiameter + op.cn.partAllowance : op.params.kerf;
}

export function optimizerInput(op: SheetOperation, doc: ProjectDoc): { parts: OptPart[]; stocks: OptStock[]; settings: OptSettings } {
  const els = elOps(doc);
  const parts: OptPart[] = [];
  op.parts.forEach((p, i) => {
    const s = cuttingSize(p, doc, els);
    const qty = totalCount(p, doc.products);
    if (qty <= 0 || s.length <= 0 || s.width <= 0) return;
    parts.push({ id: p.id, no: i + 1, length: s.length, width: s.width, qty, canRotate: !(op.params.fixTexture && p.grain) });
  });
  const stocks: OptStock[] = op.sheets
    .filter((s) => s.qty > 0)
    .map((s) => ({ id: s.id, length: s.length, width: s.width, qty: s.qty, minFill: s.minFill / 100, ...effectiveTrims(s, op.params) }));
  const settings: OptSettings = {
    kerf: effectiveKerf(op),
    initialDirection: op.params.initialDirection,
    maxRotations: op.type === 'CN' ? 6 : op.params.maxRotations,
    minOffcutLong: op.params.minOffcutLong,
    minOffcutShort: op.params.minOffcutShort,
    maxVarieties: op.params.maxVarieties,
    ...(op.type === 'CS'
      ? { band: { minWidth: op.params.minBandWidth, maxWidth: op.params.maxBandWidth, maxLength: op.params.maxBandLength, sort: op.params.sortBands, sortInto: op.params.sortIntoBands } }
      : {}),
  };
  return { parts, stocks, settings };
}

export function linearInput(op: ClOperation, doc: ProjectDoc): { parts: LinPart[]; stocks: LinStock[]; settings: LinSettings } {
  const parts: LinPart[] = [];
  op.parts.forEach((p, i) => {
    const qty = totalCount(p, doc.products);
    const length = p.length + op.params.processingAllowance;
    if (qty > 0 && length > 0) parts.push({ id: p.id, no: i + 1, length, qty });
  });
  return {
    parts,
    stocks: op.sheets.filter((s) => s.qty > 0).map((s) => ({ id: s.id, length: s.length, qty: s.qty })),
    settings: { kerf: op.params.kerf, trim: op.params.trim, minOffcut: op.params.minOffcut },
  };
}

function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/** Stable fingerprint of everything that affects the cutting result. */
export function inputHash(op: SheetOperation | ClOperation, doc: ProjectDoc): string {
  return hash(JSON.stringify(op.type === 'CL' ? linearInput(op, doc) : optimizerInput(op, doc)));
}

export function isResultCurrent(op: SheetOperation, doc: ProjectDoc): op is SheetOperation & { result: CuttingResult };
export function isResultCurrent(op: ClOperation, doc: ProjectDoc): op is ClOperation & { result: LinearResult };
export function isResultCurrent(op: SheetOperation | ClOperation, doc: ProjectDoc): boolean {
  return !!op.result && op.result.inputHash === inputHash(op, doc);
}

const ROUND_STEP: Record<CsParams['roundingSheets'], number> = {
  whole: 1, any2: 2, any3: 3, any4: 4, width2: 2, width3: 3, width4: 4, length2: 2, length3: 3, length4: 4,
};

/** Rounds a number of sheets up to the step allowed by the rounding rule. */
export function roundSheets(sheets: number, rule: CsParams['roundingSheets']): number {
  const step = ROUND_STEP[rule];
  return Math.ceil(sheets * step - 1e-9) / step;
}

/** Rounds a length in metres per an edgeband rounding rule. */
export function roundLength(m: number, rule: LengthRounding): number {
  switch (rule) {
    case 'nearest2': return round(m, 2);
    case 'nearest1': return round(m, 1);
    case 'nearest0': return Math.round(m);
    case 'up1': return Math.ceil(m * 10 - 1e-9) / 10;
    case 'up0': return Math.ceil(m - 1e-9);
  }
}

/** Fraction of the last sheet that is actually consumed, per rounding rule. */
function lastSheetFraction(result: CuttingResult, rule: CsParams['roundingSheets']): number {
  const last = result.patterns[result.patterns.length - 1];
  if (!last) return 0;
  if (rule.startsWith('length')) return Math.max(...last.placements.map((p) => p.x + p.length), 0) / last.length;
  if (rule.startsWith('width')) return Math.max(...last.placements.map((p) => p.y + p.width), 0) / last.width;
  return last.partsArea / (last.length * last.width);
}

export interface OperationCost {
  partsQty: number;
  partsArea: number; // m²
  partsPerimeter: number; // m
  sheets: number; // rounded sheets or bands, may be fractional
  materialArea: number; // m²
  materialLength: number; // m (bands, edgeband)
  workLength: number; // m (edgebanding, grooving, band parts)
  cutLength: number; // m
  fill: number; // 0..1
  costMaterial: number;
  costOperation: number;
  cost: number;
  fromResult: boolean;
  /** Cost share per product id (sums to `cost`). */
  byProduct: Record<string, number>;
}

const emptyCost = (): OperationCost => ({
  partsQty: 0, partsArea: 0, partsPerimeter: 0, sheets: 0, materialArea: 0, materialLength: 0, workLength: 0, cutLength: 0, fill: 0,
  costMaterial: 0, costOperation: 0, cost: 0, fromResult: false, byProduct: {},
});

function finish(c: OperationCost, shares: Map<string, number>): OperationCost {
  c.costMaterial = round(c.costMaterial);
  c.costOperation = round(c.costOperation);
  c.cost = round(c.costMaterial + c.costOperation);
  const total = [...shares.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [pid, v] of shares) c.byProduct[pid] = (c.cost * v) / total;
  return c;
}

const addShare = (m: Map<string, number>, pid: string | null, v: number) => {
  if (pid) m.set(pid, (m.get(pid) ?? 0) + v);
};

function sheetOpCost(op: SheetOperation, doc: ProjectDoc): OperationCost {
  const c = emptyCost();
  const els = elOps(doc);
  const shares = new Map<string, number>();
  let area = 0;
  let perimeter = 0;
  for (const part of op.parts) {
    const tc = totalCount(part, doc.products);
    const s = cuttingSize(part, doc, els);
    c.partsQty += tc;
    area += (s.length * s.width * tc) / 1e6;
    perimeter += (2 * (s.length + s.width) * tc) / 1000;
    addShare(shares, part.productId, s.length * s.width * tc);
  }
  const p = op.params;
  const firstSheet = op.sheets.find((s) => s.qty > 0) ?? op.sheets[0];
  const sheetArea = firstSheet ? (firstSheet.length * firstSheet.width) / 1e6 : 0;
  if (isResultCurrent(op, doc)) {
    const r = op.result;
    const lastCount = r.patterns[r.patterns.length - 1]?.count ?? 0;
    const full = r.sheetsUsed - (lastCount > 0 ? 1 : 0);
    c.sheets = full + (lastCount > 0 ? roundSheets(lastSheetFraction(r, p.roundingSheets), p.roundingSheets) : 0);
    const avgSheet = r.sheetsUsed ? r.sheetArea / 1e6 / r.sheetsUsed : sheetArea;
    c.materialArea = p.costBySheets ? c.sheets * avgSheet : r.fill > 0 ? area / r.fill : 0;
    c.cutLength = r.cutLength / 1000;
    c.fill = r.fill;
    c.fromResult = true;
  } else {
    c.fill = p.estimatedFill / 100;
    const estimate = area / c.fill;
    c.sheets = sheetArea > 0 ? roundSheets(estimate / sheetArea, p.roundingSheets) : 0;
    c.materialArea = p.costBySheets ? c.sheets * sheetArea : estimate;
    c.cutLength = perimeter / 2; // estimate: neighbouring parts share cuts
  }
  c.partsArea = round(area, 3);
  c.partsPerimeter = round(perimeter, 2);
  c.costMaterial = c.materialArea * p.materialPrice;
  const measure = { cutLength: c.cutLength, partsPerimeter: perimeter, partsArea: area, materialArea: c.materialArea }[p.costOperationBy];
  c.costOperation = measure * p.operationPrice;
  c.sheets = round(c.sheets, 3);
  c.materialArea = round(c.materialArea, 3);
  c.cutLength = round(c.cutLength, 2);
  return finish(c, shares);
}

function clCost(op: ClOperation, doc: ProjectDoc): OperationCost {
  const c = emptyCost();
  const p = op.params;
  const shares = new Map<string, number>();
  let length = 0;
  for (const part of op.parts) {
    const tc = totalCount(part, doc.products);
    c.partsQty += tc;
    length += (part.length * tc) / 1000;
    addShare(shares, part.productId, part.length * tc);
  }
  c.workLength = round(length, 3);
  c.partsArea = round((length * p.width) / 1000, 3);
  const stock = op.sheets.find((s) => s.qty > 0) ?? op.sheets[0];
  const bandM = stock ? stock.length / 1000 : 0;
  let cuts: number;
  if (isResultCurrent(op, doc)) {
    const r = op.result;
    const last = r.patterns[r.patterns.length - 1];
    const lastFrac = last ? (last.pieces.reduce((a, x) => Math.max(a, x.x + x.length), 0) / last.length) : 0;
    const step = p.roundingBands === 'whole' ? 1 : Number(p.roundingBands.slice(-1));
    c.sheets = r.barsUsed - (last ? 1 : 0) + (last ? Math.ceil(lastFrac * step - 1e-9) / step : 0);
    c.materialLength = p.costByBands ? c.sheets * (r.barsUsed ? r.stockLength / 1000 / r.barsUsed : bandM) : r.fill > 0 ? length / r.fill : 0;
    c.fill = r.fill;
    cuts = r.cuts;
    c.fromResult = true;
  } else {
    c.fill = p.estimatedFill / 100;
    const est = length / c.fill;
    c.sheets = bandM > 0 ? Math.ceil(est / bandM - 1e-9) : 0;
    c.materialLength = p.costByBands ? c.sheets * bandM : est;
    cuts = c.partsQty + (p.trim > 0 ? 2 * c.sheets : 0);
  }
  const trimCuts = p.trim > 0 ? 2 * Math.ceil(c.sheets) : 0;
  c.cutLength = round((cuts * p.width) / 1000, 2);
  c.costMaterial = c.materialLength * p.materialPrice;
  const measure = {
    cutWithTrim: c.cutLength,
    cutWithoutTrim: (Math.max(0, cuts - trimCuts) * p.width) / 1000,
    partsLength: length,
    materialLength: c.materialLength,
  }[p.costOperationBy];
  c.costOperation = measure * p.operationPrice;
  c.materialLength = round(c.materialLength, 3);
  return finish(c, shares);
}

export interface EdgeRow {
  opId: string; opName: string; partId: string; partNo: number; name: string; productId: string | null;
  length: number; pastL: number; width: number; pastW: number; tc: number; edgeLength: number;
}

/** Parts banded with this edgeband operation (top/bottom run along the length, left/right along the width). */
export function edgeRows(doc: ProjectDoc, el: ElOperation): EdgeRow[] {
  const rows: EdgeRow[] = [];
  for (const op of doc.operations) {
    if (!isSheetOp(op)) continue;
    op.parts.forEach((part, i) => {
      const pastL = (part.edges.t === el.id ? 1 : 0) + (part.edges.b === el.id ? 1 : 0);
      const pastW = (part.edges.l === el.id ? 1 : 0) + (part.edges.r === el.id ? 1 : 0);
      if (!pastL && !pastW) return;
      const tc = totalCount(part, doc.products);
      const pieces = (pastL + pastW) * tc;
      const work = ((part.length * pastL + part.width * pastW) * tc) / 1000;
      const edgeLength = work * (1 + el.params.wastePct / 100) + (pieces * el.params.wasteAtEdges) / 1000;
      rows.push({ opId: op.id, opName: op.name, partId: part.id, partNo: i + 1, name: part.name, productId: part.productId, length: part.length, pastL, width: part.width, pastW, tc, edgeLength });
    });
  }
  return rows;
}

function elCost(op: ElOperation, doc: ProjectDoc): OperationCost {
  const c = emptyCost();
  const p = op.params;
  const shares = new Map<string, number>();
  let work = 0;
  let material = 0;
  for (const r of edgeRows(doc, op)) {
    const w = ((r.length * r.pastL + r.width * r.pastW) * r.tc) / 1000;
    work += w;
    material += r.edgeLength;
    c.partsQty += r.tc;
    addShare(shares, r.productId, w);
  }
  c.workLength = roundLength(work, p.roundingWork);
  c.materialLength = roundLength(material, p.roundingMaterial);
  c.costMaterial = p.accounting ? c.materialLength * p.materialPrice : 0;
  c.costOperation = c.workLength * p.operationPrice;
  return finish(c, shares);
}

export interface GrooveRow { opId: string; opName: string; partId: string; partNo: number; name: string; productId: string | null; length: number; width: number; sides: string; tc: number; grooveLength: number }

export function grooveRows(doc: ProjectDoc, gr: GrOperation): GrooveRow[] {
  const rows: GrooveRow[] = [];
  for (const op of doc.operations) {
    if (!isSheetOp(op)) continue;
    op.parts.forEach((part, i) => {
      const sides = (['t', 'b', 'l', 'r'] as const).filter((s) => part.grooves[s] === gr.id);
      if (!sides.length) return;
      const tc = totalCount(part, doc.products);
      const each = sides.reduce((a, s) => a + (s === 't' || s === 'b' ? part.length : part.width), 0);
      rows.push({ opId: op.id, opName: op.name, partId: part.id, partNo: i + 1, name: part.name, productId: part.productId, length: part.length, width: part.width, sides: sides.join('').toUpperCase(), tc, grooveLength: (each * tc) / 1000 });
    });
  }
  return rows;
}

function grCost(op: GrOperation, doc: ProjectDoc): OperationCost {
  const c = emptyCost();
  const shares = new Map<string, number>();
  for (const r of grooveRows(doc, op)) {
    c.workLength += r.grooveLength;
    c.partsQty += r.tc;
    addShare(shares, r.productId, r.grooveLength);
  }
  c.workLength = round(c.workLength, 2);
  c.costOperation = c.workLength * op.params.pricePerMeter;
  return finish(c, shares);
}

export interface SurfaceRow { opId: string; opName: string; partId: string; partNo: number; name: string; productId: string | null; length: number; width: number; faces: number; tc: number; area: number }

export function surfaceRows(doc: ProjectDoc, sp: SpOperation): SurfaceRow[] {
  const els = elOps(doc);
  const rows: SurfaceRow[] = [];
  for (const op of doc.operations) {
    if (!isSheetOp(op)) continue;
    op.parts.forEach((part, i) => {
      const faces = (part.surface.front === sp.id ? 1 : 0) + (part.surface.back === sp.id ? 1 : 0);
      if (!faces) return;
      const s = sp.params.sizesMode === 'cutting' ? cuttingSize(part, doc, els) : { length: part.length, width: part.width };
      const tc = totalCount(part, doc.products);
      rows.push({ opId: op.id, opName: op.name, partId: part.id, partNo: i + 1, name: part.name, productId: part.productId, length: s.length, width: s.width, faces, tc, area: (s.length * s.width * faces * tc) / 1e6 });
    });
  }
  return rows;
}

function spCost(op: SpOperation, doc: ProjectDoc): OperationCost {
  const c = emptyCost();
  const p = op.params;
  const shares = new Map<string, number>();
  let material = 0;
  for (const r of surfaceRows(doc, op)) {
    c.partsArea += r.area;
    c.partsQty += r.tc;
    const e = 2 * p.wasteAtEdges;
    material += ((r.length + e) * (r.width + e) * r.faces * r.tc) / 1e6;
    addShare(shares, r.productId, r.area);
  }
  c.materialArea = round(material * (1 + p.wastePct / 100), 3);
  c.partsArea = round(c.partsArea, 3);
  c.costMaterial = p.accounting ? c.materialArea * p.materialPrice : 0;
  c.costOperation = c.partsArea * p.operationPrice;
  return finish(c, shares);
}

export function operationCost(op: Operation, doc: ProjectDoc): OperationCost {
  switch (op.type) {
    case 'CS':
    case 'CN':
      return sheetOpCost(op, doc);
    case 'CL':
      return clCost(op, doc);
    case 'EL':
      return elCost(op, doc);
    case 'GR':
      return grCost(op, doc);
    case 'SP':
      return spCost(op, doc);
    case 'O': {
      const c = emptyCost();
      const mult = op.ownerId ? doc.products.find((p) => p.id === op.ownerId)?.qty ?? 1 : 1;
      c.costMaterial = op.materials.reduce((a, m) => a + m.qty * m.price, 0) * mult;
      c.costOperation = op.costOperation * mult;
      c.partsQty = mult;
      const shares = new Map<string, number>();
      addShare(shares, op.ownerId, 1);
      return finish(c, shares);
    }
    case 'LB':
      return finish(emptyCost(), new Map());
    case 'XNC': {
      const c = emptyCost();
      const x = xncCost(op, doc);
      c.costOperation = x.cost;
      c.partsQty = x.qty;
      c.workLength = Math.round(x.meters * 1000) / 1000;
      const shares = new Map<string, number>();
      const ref = op.params.partRef;
      const src = ref ? doc.operations.find((o) => o.id === ref.opId) : undefined;
      const part = src && isSheetOp(src) ? src.parts.find((p) => p.id === ref!.partId) : undefined;
      addShare(shares, part?.productId ?? null, 1);
      return finish(c, shares);
    }
  }
}

export interface ProjectCost {
  costMaterial: number;
  costOperation: number;
  cost: number;
  byOperation: Record<string, OperationCost>;
  /** Cost per product, from each operation's per-product share. */
  byProduct: Record<string, { costMaterial: number; costOperation: number; cost: number }>;
}

export function projectCost(doc: ProjectDoc): ProjectCost {
  const byOperation: ProjectCost['byOperation'] = {};
  const byProduct: ProjectCost['byProduct'] = Object.fromEntries(doc.products.map((p) => [p.id, { costMaterial: 0, costOperation: 0, cost: 0 }]));
  let costMaterial = 0;
  let costOperation = 0;
  for (const op of doc.operations) {
    const c = operationCost(op, doc);
    byOperation[op.id] = c;
    costMaterial += c.costMaterial;
    costOperation += c.costOperation;
    for (const [pid, share] of Object.entries(c.byProduct)) {
      const bp = byProduct[pid];
      if (!bp || c.cost <= 0) continue;
      const f = share / c.cost;
      bp.costMaterial += c.costMaterial * f;
      bp.costOperation += c.costOperation * f;
      bp.cost += share;
    }
  }
  for (const v of Object.values(byProduct)) {
    v.costMaterial = round(v.costMaterial);
    v.costOperation = round(v.costOperation);
    v.cost = round(v.cost);
  }
  return { costMaterial: round(costMaterial), costOperation: round(costOperation), cost: round(costMaterial + costOperation), byOperation, byProduct };
}

/** Parses tab/semicolon separated rows pasted from a spreadsheet: L, W, Qty, Name (header row optional). */
export function parsePastedParts(text: string): { length: number; width: number; qty: number; name: string }[] {
  const rows: { length: number; width: number; qty: number; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/\t|;/).map((c) => c.trim());
    const num = (s: string | undefined) => Number((s ?? '').replace(',', '.').replace(/\s/g, ''));
    const length = num(cells[0]);
    const width = num(cells[1]);
    if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) continue; // header or junk
    const q = num(cells[2]);
    rows.push({ length, width, qty: Number.isInteger(q) && q > 0 ? q : 1, name: (cells[3] ?? '').slice(0, 200) });
  }
  return rows;
}

/** Parses pasted accessory rows: Code, Name, Unit, Qty, Price. */
export function parsePastedAccessories(text: string): { code: string; name: string; unit: string; qty: number; price: number }[] {
  const out: { code: string; name: string; unit: string; qty: number; price: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(/\t|;/).map((x) => x.trim());
    if (!c.some(Boolean)) continue;
    const qty = Number((c[3] ?? '1').replace(',', '.'));
    const price = Number((c[4] ?? '0').replace(',', '.'));
    if (!c[1] || !Number.isFinite(qty) || !Number.isFinite(price)) continue;
    out.push({ code: (c[0] ?? '').slice(0, 60), name: c[1].slice(0, 200), unit: (c[2] || 'pcs').slice(0, 10), qty: Math.max(0, qty), price: Math.max(0, price) });
  }
  return out;
}

/** Sheets cut together in one stack (package height ÷ board thickness) and stacks per pattern. */
export function packages(op: SheetOperation, count: number): { perPackage: number; packages: number } {
  const perPackage = Math.max(1, Math.floor(op.params.packageHeight / Math.max(1, op.params.thickness)));
  return { perPackage, packages: Math.ceil(count / perPackage) };
}
