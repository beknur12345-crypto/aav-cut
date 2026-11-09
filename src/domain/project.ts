/**
 * The project document: everything inside one project (products, operations, parts, stock,
 * optimizer results). It is edited client-side with undo/redo and saved as a whole, validated
 * by these schemas on the server.
 *
 * Schema version 2: operations are a discriminated union over the operation types, and parts
 * reference edgeband (EL), grooving (GR) and surface (SP) operations instead of storing numbers.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 2 as const;
export const LIMITS = { parts: 5000, sheets: 500, products: 1000, operations: 200, materials: 1000 } as const;

const id = z.string().min(1).max(40);
const ref = z.string().max(40).nullable();
const mm = z.number().finite().min(0).max(100_000);
const signedMm = z.number().finite().min(-1000).max(100_000);
const money = z.number().finite().min(0).max(1e9);
const pct = z.number().finite().min(0).max(100);
const text = (max: number) => z.string().max(max);

export const INPUT_MODES = ['none', 'workpiece', 'detail', 'afterPremilling'] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const PROJECT_STATES = ['NOT_ORDERED', 'ORDERED', 'APPROVED', 'DONE'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

/** Order shown in the "Select an operation type" dialog. */
export const OPERATION_TYPES = ['O', 'CS', 'CN', 'CL', 'EL', 'SP', 'GR', 'XNC', 'LB'] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];
/** Operation types available in this release; the rest are listed but disabled. */
export const ENABLED_OPERATION_TYPES: readonly OperationType[] = OPERATION_TYPES;

export const ROUNDING_SHEETS = ['whole', 'any2', 'any3', 'any4', 'width2', 'width3', 'width4', 'length2', 'length3', 'length4'] as const;
export const ROUNDING_BANDS = ['whole', 'length2', 'length3', 'length4'] as const;
export const COST_OPERATION_BY = ['cutLength', 'partsPerimeter', 'partsArea', 'materialArea'] as const;
export const CL_COST_OPERATION_BY = ['cutWithTrim', 'cutWithoutTrim', 'partsLength', 'materialLength'] as const;
export const INITIAL_DIRECTIONS = ['any', 'length', 'width', 'lengthPreferred', 'widthPreferred'] as const;
export const SORT_BANDS = ['descending', 'ascending', 'center', 'none'] as const;
export const LENGTH_ROUNDING = ['nearest2', 'nearest1', 'nearest0', 'up1', 'up0'] as const;
export type LengthRounding = (typeof LENGTH_ROUNDING)[number];
export const MILL_MOVEMENT = ['shortest', 'rows', 'columns'] as const;

/* ---------------- Sheet cutting (CS) and nesting (CN) ---------------- */

export const csParamsSchema = z.object({
  thickness: mm.max(500).default(18),
  materialPrice: money.default(0),
  estimatedFill: z.number().min(1).max(100).default(90),
  costBySheets: z.boolean().default(false),
  roundingSheets: z.enum(ROUNDING_SHEETS).default('whole'),
  costOperationBy: z.enum(COST_OPERATION_BY).default('cutLength'),
  operationPrice: money.default(0),
  minOffcutLong: mm.default(400),
  minOffcutShort: mm.default(100),
  businessOffcutArea: z.number().min(0).max(1000).default(10),
  offcutIncludesTrim: z.boolean().default(true),
  minPartSize: mm.default(0),
  kerf: z.number().min(0).max(20).default(4.4),
  trimLength: mm.max(200).default(10),
  trimWidth: mm.max(200).default(10),
  initialDirection: z.enum(INITIAL_DIRECTIONS).default('any'),
  fixTexture: z.boolean().default(true),
  complexBand: z.boolean().default(true),
  maxRotations: z.number().int().min(2).max(6).default(6),
  packageHeight: mm.max(1000).default(40),
  repetition: z.number().int().min(1).max(1000).default(2),
  maxVarieties: z.number().int().min(0).max(10).default(0),
  largePacket: z.boolean().default(false),
  sortBands: z.enum(SORT_BANDS).default('descending'),
  sortIntoBands: z.enum(SORT_BANDS).default('none'),
  minBandWidth: mm.default(0),
  maxBandWidth: mm.default(0),
  maxBandLength: mm.default(0),
});
export type CsParams = z.infer<typeof csParamsSchema>;
export const defaultCsParams = (): CsParams => csParamsSchema.parse({});

/** Extra parameters of nesting (CNC router) cutting. */
export const cnParamsSchema = z.object({
  millDiameter: z.number().min(0.5).max(50).default(12),
  millProtrusion: signedMm.max(50).default(0),
  partAllowance: mm.max(50).default(0),
  movement: z.enum(MILL_MOVEMENT).default('shortest'),
  plungeAngle: z.number().min(0).max(90).default(90),
  millName: text(60).default('MillBaseCut'),
  preCutUse: z.boolean().default(false),
  preCutDiameter: z.number().min(0.5).max(50).default(8),
  preCutProtrusion: signedMm.max(50).default(-2),
  preCutPlungeAngle: z.number().min(0).max(90).default(90),
  preCutName: text(60).default('MillPreCut'),
  backSideSkip: z.boolean().default(true),
  startX: signedMm.default(0),
  startY: signedMm.default(0),
});
export type CnParams = z.infer<typeof cnParamsSchema>;

/** Edgeband / groove / surface operation referenced from each side of a part. */
export const sidesSchema = z.object({ t: ref, b: ref, l: ref, r: ref });
export type Sides = z.infer<typeof sidesSchema>;
export const noSides = (): Sides => ({ t: null, b: null, l: null, r: null });

export const partSchema = z.object({
  id,
  productId: ref,
  name: text(200),
  code: text(60),
  length: mm,
  width: mm,
  qty: z.number().int().min(0).max(100_000),
  /** Grain fixed along the length (Txt). */
  grain: z.boolean(),
  /** Edgeband operation (EL) on each side: top, bottom, left, right. */
  edges: sidesSchema,
  /** Grooving operation (GR) on each side. */
  grooves: sidesSchema.default(noSides),
  /** Surface processing operation (SP) on the front and back faces. */
  surface: z.object({ front: ref, back: ref }).default({ front: null, back: null }),
  description: text(1000),
});
export type Part = z.infer<typeof partSchema>;

export const sheetSchema = z.object({
  id,
  name: text(200),
  length: mm.min(1),
  width: mm.min(1),
  qty: z.number().int().min(0).max(100_000),
  /** Per-sheet trimming override (null = use the operation parameters). */
  trimLength: mm.max(200).nullable(),
  trimWidth: mm.max(200).nullable(),
  /** Minimum fill % required to use this sheet (for offcuts), 0 = any. */
  minFill: pct,
  isOffcut: z.boolean(),
  description: text(1000),
});
export type Sheet = z.infer<typeof sheetSchema>;

const rect = z.object({ x: z.number(), y: z.number(), length: z.number(), width: z.number() });

/** Guillotine cut tree stored with each sheet (kerf-inflated coordinates), for Edit nesting. */
type TreeJson =
  | { kind: 'free'; x: number; y: number; w: number; h: number; level: number; lastAxis: 'x' | 'y' | null }
  | { kind: 'part'; x: number; y: number; w: number; h: number; partId: string; no: number; rotated: boolean }
  | { kind: 'split'; x: number; y: number; w: number; h: number; axis: 'x' | 'y'; at: number; a: TreeJson; b: TreeJson };
const box = { x: z.number(), y: z.number(), w: z.number(), h: z.number() };
export const treeSchema: z.ZodType<TreeJson> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free'), ...box, level: z.number().int(), lastAxis: z.enum(['x', 'y']).nullable() }),
    z.object({ kind: z.literal('part'), ...box, partId: id, no: z.number().int(), rotated: z.boolean() }),
    z.object({ kind: z.literal('split'), ...box, axis: z.enum(['x', 'y']), at: z.number(), a: treeSchema, b: treeSchema }),
  ]),
);
/** Guards against hostile, absurdly deep trees before recursive validation. */
export function treeDepth(t: unknown, d = 0): number {
  if (d > 400 || !t || typeof t !== 'object') return d;
  const n = t as { a?: unknown; b?: unknown };
  return Math.max(treeDepth(n.a, d + 1), treeDepth(n.b, d + 1));
}

export const cuttingResultSchema = z.object({
  createdAt: z.string().max(40),
  /** Fingerprint of the inputs; the result is shown as outdated when inputs change. */
  inputHash: z.string().max(80),
  sheetsUsed: z.number().int().min(0),
  sheetArea: z.number().min(0),
  partsArea: z.number().min(0),
  cutLength: z.number().min(0),
  fill: z.number().min(0).max(1),
  durationMs: z.number().min(0),
  unplaced: z.array(z.object({ partId: id, qty: z.number().int().min(0) })).max(LIMITS.parts),
  patterns: z
    .array(
      z.object({
        stockId: id,
        length: z.number(),
        width: z.number(),
        count: z.number().int().min(1),
        placements: z.array(rect.extend({ partId: id, no: z.number().int(), rotated: z.boolean() })).max(20_000),
        offcuts: z.array(rect).max(20_000),
        waste: z.array(rect).max(20_000),
        cuts: z.array(z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), trim: z.boolean() })).max(40_000),
        commands: z
          .array(z.object({ no: z.number().int(), cmd: z.enum(['R', 'T', 'C', 'P', 'W']), size: z.number(), count: z.number().int(), partNo: z.number().int().optional() }))
          .max(40_000),
        cutLength: z.number(),
        partsArea: z.number(),
        tree: z.custom<unknown>((v) => treeDepth(v) <= 400, 'tree too deep').pipe(treeSchema).optional(),
        kerf: z.number().min(0).max(100).optional(),
        trimLength: z.number().min(0).max(1000).optional(),
        trimWidth: z.number().min(0).max(1000).optional(),
      }),
    )
    .max(2000),
  comment: text(2000).default(''),
  /** True when the layout was changed by hand in Edit nesting. */
  edited: z.boolean().default(false),
});
export type CuttingResult = z.infer<typeof cuttingResultSchema>;

const opBase = {
  id,
  code: text(60),
  name: text(200),
  print: z.boolean(),
  /** St.N. — include in the standard (shop-floor) documents. */
  standard: z.boolean().default(true),
  description: text(5000).default(''),
};

const sheetOpFields = {
  ...opBase,
  materialId: z.string().max(40).nullable(),
  params: csParamsSchema,
  parts: z.array(partSchema).max(LIMITS.parts),
  sheets: z.array(sheetSchema).max(LIMITS.sheets),
  result: cuttingResultSchema.nullable(),
};
export const csOperationSchema = z.object({ type: z.literal('CS'), ...sheetOpFields });
export const cnOperationSchema = z.object({ type: z.literal('CN'), ...sheetOpFields, cn: cnParamsSchema.prefault({}) });
export type CsOperation = z.infer<typeof csOperationSchema>;
export type CnOperation = z.infer<typeof cnOperationSchema>;
/** Operations cut from sheets (they own parts, stock and a cutting result). */
export type SheetOperation = CsOperation | CnOperation;

/* ---------------- Band (linear) cutting (CL) ---------------- */

export const clParamsSchema = z.object({
  width: mm.default(1830),
  thickness: mm.max(500).default(18),
  materialPrice: money.default(0),
  estimatedFill: z.number().min(1).max(100).default(90),
  costByBands: z.boolean().default(false),
  roundingBands: z.enum(ROUNDING_BANDS).default('whole'),
  costOperationBy: z.enum(CL_COST_OPERATION_BY).default('cutWithTrim'),
  operationPrice: money.default(0),
  minOffcut: mm.default(400),
  businessOffcutLength: z.number().min(0).max(1000).default(10),
  offcutIncludesTrim: z.boolean().default(true),
  minPartSize: mm.default(0),
  kerf: z.number().min(0).max(20).default(4.4),
  trim: mm.max(200).default(10),
  packageHeight: mm.max(1000).default(40),
  repetition: z.number().int().min(1).max(1000).default(2),
  maxVarieties: z.number().int().min(0).max(10).default(0),
  combineParts: z.boolean().default(false),
  saveDrawings: z.boolean().default(false),
  processingAllowance: mm.default(0),
});
export type ClParams = z.infer<typeof clParamsSchema>;

export const clPartSchema = z.object({
  id, productId: ref, name: text(200), code: text(60), length: mm, qty: z.number().int().min(0).max(100_000), description: text(1000),
});
export type ClPart = z.infer<typeof clPartSchema>;
export const clStockSchema = z.object({ id, name: text(200), length: mm.min(1), qty: z.number().int().min(0).max(100_000), isOffcut: z.boolean() });
export type ClStock = z.infer<typeof clStockSchema>;

export const linearResultSchema = z.object({
  createdAt: z.string().max(40),
  inputHash: z.string().max(80),
  barsUsed: z.number().int().min(0),
  stockLength: z.number().min(0),
  partsLength: z.number().min(0),
  cuts: z.number().int().min(0),
  fill: z.number().min(0).max(1),
  durationMs: z.number().min(0),
  unplaced: z.array(z.object({ partId: id, qty: z.number().int().min(0) })).max(LIMITS.parts),
  patterns: z
    .array(
      z.object({
        stockId: id,
        length: z.number(),
        count: z.number().int().min(1),
        pieces: z.array(z.object({ partId: id, no: z.number().int(), x: z.number(), length: z.number() })).max(10_000),
        offcut: z.number(),
        waste: z.number(),
      }),
    )
    .max(2000),
});
export type LinearResult = z.infer<typeof linearResultSchema>;

export const clOperationSchema = z.object({
  type: z.literal('CL'),
  ...opBase,
  materialId: z.string().max(40).nullable(),
  params: clParamsSchema,
  parts: z.array(clPartSchema).max(LIMITS.parts),
  sheets: z.array(clStockSchema).max(LIMITS.sheets),
  result: linearResultSchema.nullable(),
});
export type ClOperation = z.infer<typeof clOperationSchema>;

/* ---------------- Edgebanding (EL) ---------------- */

export const elParamsSchema = z.object({
  accounting: z.boolean().default(true),
  width: mm.max(200).default(22),
  thickness: z.number().min(0).max(20).default(0),
  premillWidth: z.number().min(0).max(20).default(0),
  wastePct: pct.default(0),
  wasteAtEdges: mm.max(1000).default(0),
  minPastedLength: mm.default(0),
  symbol: z.string().max(1).default('A'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e8590c'),
  markerLines: z.number().int().min(0).max(3).default(0),
  minPerpendicularSide: mm.default(0),
  materialPrice: money.default(0),
  roundingMaterial: z.enum(LENGTH_ROUNDING).default('nearest2'),
  operationPrice: money.default(0),
  roundingWork: z.enum(LENGTH_ROUNDING).default('nearest2'),
});
export type ElParams = z.infer<typeof elParamsSchema>;
export const elOperationSchema = z.object({ type: z.literal('EL'), ...opBase, materialId: z.string().max(40).nullable().default(null), params: elParamsSchema });
export type ElOperation = z.infer<typeof elOperationSchema>;

/* ---------------- Grooving (GR) ---------------- */

export const grParamsSchema = z.object({
  width: z.number().min(0.1).max(100).default(4),
  depth: z.number().min(0.1).max(100).default(8),
  offset: mm.max(5000).default(10),
  offsetInclusive: z.boolean().default(true),
  pricePerMeter: money.default(0),
  sawThickness: z.number().min(0.1).max(20).default(4),
});
export type GrParams = z.infer<typeof grParamsSchema>;
export const grOperationSchema = z.object({ type: z.literal('GR'), ...opBase, params: grParamsSchema });
export type GrOperation = z.infer<typeof grOperationSchema>;

/* ---------------- Surface processing (SP) ---------------- */

export const spParamsSchema = z.object({
  accounting: z.boolean().default(true),
  length: mm.default(2200),
  width: mm.default(800),
  thickness: z.number().min(0).max(100).default(1),
  wastePct: pct.default(0),
  wasteAtEdges: mm.max(1000).default(0),
  sizesMode: z.enum(['cutting', 'workpiece']).default('cutting'),
  materialPrice: money.default(0),
  operationPrice: money.default(0),
});
export type SpParams = z.infer<typeof spParamsSchema>;
export const spOperationSchema = z.object({ type: z.literal('SP'), ...opBase, materialId: z.string().max(40).nullable().default(null), params: spParamsSchema });
export type SpOperation = z.infer<typeof spOperationSchema>;

/* ---------------- Accessories and other actions (O) ---------------- */

export const accessorySchema = z.object({ id, code: text(60), name: text(200), unit: text(10), qty: z.number().min(0).max(1e6), price: money });
export type Accessory = z.infer<typeof accessorySchema>;
export const oOperationSchema = z.object({
  type: z.literal('O'),
  ...opBase,
  /** null = the whole project, otherwise a product id (cost is multiplied by its quantity). */
  ownerId: ref,
  costOperation: money,
  materials: z.array(accessorySchema).max(LIMITS.materials),
});
export type OOperation = z.infer<typeof oOperationSchema>;

/* ---------------- Labels (LB) ---------------- */

export const LABEL_FIELDS = ['barcode', 'project', 'product', 'material', 'name', 'size', 'edges', 'qty', 'number', 'date'] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];
export const lbParamsSchema = z.object({
  source: z.enum(['partsAndOffcuts', 'parts', 'offcuts']).default('partsAndOffcuts'),
  printer: z.enum(['a4', 'label']).default('a4'),
  labelWidth: mm.max(500).default(58),
  labelHeight: mm.max(500).default(40),
  columns: z.number().int().min(1).max(10).default(3),
  rows: z.number().int().min(1).max(20).default(7),
  gap: mm.max(50).default(2),
  pageMargin: z.boolean().default(true),
  borders: z.enum(['none', 'perimeter']).default('perimeter'),
  printParts: z.boolean().default(true),
  forEachPart: z.boolean().default(false),
  onlyQtyAboveZero: z.boolean().default(true),
  printOffcuts: z.boolean().default(true),
  forEachOffcut: z.boolean().default(false),
  fields: z.array(z.enum(LABEL_FIELDS)).max(LABEL_FIELDS.length).default(['barcode', 'project', 'product', 'material', 'name', 'size', 'edges', 'qty']),
  /** Label printer resolution and extra ZPL commands sent before every label. */
  dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]).default(203),
  zplHeader: text(500).default(''),
});
export type LbParams = z.infer<typeof lbParamsSchema>;
export const lbOperationSchema = z.object({ type: z.literal('LB'), ...opBase, params: lbParamsSchema });
export type LbOperation = z.infer<typeof lbOperationSchema>;

/* ---------------- CNC processing (XNC) ---------------- */

export const XNC_FACES = ['front', 'back', 'top', 'bottom', 'left', 'right'] as const;
export type XncFace = (typeof XNC_FACES)[number];
const coord = z.number().finite().min(-100_000).max(100_000);
const pt = z.object({ x: coord, y: coord });
export const xncItemSchema = z.discriminatedUnion('kind', [
  /** Front/back: (x, y) on the panel. Edges: x along the edge, z across the thickness. */
  z.object({ id, kind: z.literal('hole'), face: z.enum(XNC_FACES), x: coord, y: coord, z: coord.default(0), d: z.number().min(0.5).max(200), depth: z.number().min(0.1).max(500) }),
  z.object({ id, kind: z.literal('groove'), face: z.enum(['front', 'back']), x1: coord, y1: coord, x2: coord, y2: coord, width: z.number().min(0.5).max(100), depth: z.number().min(0.1).max(500) }),
  z.object({ id, kind: z.literal('pocket'), face: z.enum(['front', 'back']), x: coord, y: coord, w: z.number().min(1).max(100_000), h: z.number().min(1).max(100_000), depth: z.number().min(0.1).max(500), toolD: z.number().min(1).max(50) }),
  z.object({ id, kind: z.literal('mill'), face: z.enum(['front', 'back']), points: z.array(pt).min(2).max(5000), closed: z.boolean(), toolD: z.number().min(1).max(50), depth: z.number().min(0.1).max(500) }),
]);
export type XncItem = z.infer<typeof xncItemSchema>;

export const xncParamsSchema = z.object({
  partRef: z.object({ opId: id, partId: id }).nullable().default(null),
  byDetailSize: z.boolean().default(true),
  dx: mm.min(1).default(1000),
  dy: mm.min(1).default(600),
  dz: mm.min(1).max(500).default(18),
  qty: z.number().int().min(0).max(100_000).default(1),
  frontSide: z.boolean().default(true),
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  mirror: z.enum(['none', 'h', 'v']).default('none'),
  origin: z.enum(['LT', 'LB', 'RT', 'RB']).default('LB'),
  pricePerHole: money.default(0),
  pricePerMeter: money.default(0),
  pricePerPocket: money.default(0),
});
export type XncParams = z.infer<typeof xncParamsSchema>;
export const xncOperationSchema = z.object({ type: z.literal('XNC'), ...opBase, params: xncParamsSchema, items: z.array(xncItemSchema).max(5000) });
export type XncOperation = z.infer<typeof xncOperationSchema>;

/* ---------------- Document ---------------- */

export const operationSchema = z.discriminatedUnion('type', [
  csOperationSchema, cnOperationSchema, clOperationSchema, elOperationSchema, grOperationSchema, spOperationSchema, oOperationSchema, lbOperationSchema, xncOperationSchema,
]);
export type Operation = z.infer<typeof operationSchema>;

export const productSchema = z.object({
  id, code: text(60), name: text(200), qty: z.number().int().min(0).max(100_000),
  readyDate: z.string().max(10).nullable().default(null), phone1: text(40).default(''), phone2: text(40).default(''), description: text(5000).default(''),
});
export type Product = z.infer<typeof productSchema>;

export const projectDocSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  inputMode: z.enum(INPUT_MODES),
  products: z.array(productSchema).max(LIMITS.products),
  operations: z.array(operationSchema).max(LIMITS.operations),
});
export type ProjectDoc = z.infer<typeof projectDocSchema>;

export const projectHeaderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currency: z.string().trim().max(8),
  orderDate: z.string().max(10).nullable(),
  readyDate: z.string().max(10).nullable(),
  notes: text(5000),
});
export type ProjectHeader = z.infer<typeof projectHeaderSchema>;

export const isSheetOp = (op: Operation): op is SheetOperation => op.type === 'CS' || op.type === 'CN';

let counter = 0;
/** Short unique ids for rows inside a document. */
export function newId(prefix = ''): string {
  counter = (counter + 1) % 1e6;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}${rand}${counter.toString(36)}`;
}

export function newProduct(n: number) {
  return productSchema.parse({ id: newId('pr'), code: '', name: `Product${n}`, qty: 1 });
}

export function emptyDoc(inputMode: InputMode = 'none'): ProjectDoc {
  return { schemaVersion: SCHEMA_VERSION, inputMode, products: [newProduct(1)], operations: [] };
}

export function defaultSheet(): Sheet {
  return { id: newId('sh'), name: 'Sheet', length: 2750, width: 1830, qty: 1000, trimLength: null, trimWidth: null, minFill: 0, isOffcut: false, description: '' };
}

export interface CatalogPick { id: string; name: string; code: string; thickness: number; price: number; length: number; width: number }

export function newSheetOperation(type: 'CS' | 'CN', index: number, material?: CatalogPick): SheetOperation {
  const params = defaultCsParams();
  if (type === 'CN') {
    params.kerf = 12;
    params.initialDirection = 'any';
  }
  if (material) {
    params.thickness = material.thickness || params.thickness;
    params.materialPrice = material.price;
  }
  const sheet = defaultSheet();
  if (material && material.length > 0 && material.width > 0) Object.assign(sheet, { length: material.length, width: material.width, name: material.name });
  const base = {
    id: newId('op'), code: material?.code ?? '', name: material?.name ?? `Material${index}`, materialId: material?.id ?? null,
    print: true, standard: true, description: '', params, parts: [], sheets: [sheet], result: null,
  };
  return type === 'CS' ? { type: 'CS', ...base } : { type: 'CN', ...base, cn: cnParamsSchema.parse({}) };
}
/** @deprecated kept for callers from milestone 1 */
export const newCsOperation = (index: number, material?: CatalogPick) => newSheetOperation('CS', index, material) as CsOperation;

const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const EL_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131', '#5c940d'];

export function newOperation(type: OperationType, doc: ProjectDoc, material?: CatalogPick): Operation {
  const sameType = doc.operations.filter((o) => o.type === type).length;
  const base = { id: newId('op'), code: material?.code ?? '', print: true, standard: true, description: '' };
  switch (type) {
    case 'CS':
    case 'CN':
      return newSheetOperation(type, doc.operations.filter(isSheetOp).length + 1, material);
    case 'CL': {
      const params = clParamsSchema.parse({});
      if (material) Object.assign(params, { thickness: material.thickness || params.thickness, materialPrice: material.price, width: material.width || params.width });
      return {
        type, ...base, name: material?.name ?? `Material${sameType + 1}`, materialId: material?.id ?? null, params, parts: [],
        sheets: [{ id: newId('sh'), name: 'Band', length: material?.length || 2750, qty: 1000, isOffcut: false }], result: null,
      };
    }
    case 'EL': {
      const used = new Set(doc.operations.filter((o): o is ElOperation => o.type === 'EL').map((o) => o.params.symbol));
      const symbol = [...SYMBOLS].find((s) => !used.has(s)) ?? 'A';
      const params = elParamsSchema.parse({ symbol, color: EL_COLORS[sameType % EL_COLORS.length] });
      if (material) Object.assign(params, { thickness: Math.min(20, material.thickness), materialPrice: material.price });
      return { type, ...base, name: material?.name ?? `Edgeband${sameType + 1}`, materialId: material?.id ?? null, params };
    }
    case 'GR':
      return { type, ...base, name: `Grooving${sameType + 1}`, params: grParamsSchema.parse({}) };
    case 'SP': {
      const params = spParamsSchema.parse({});
      if (material) Object.assign(params, { materialPrice: material.price, thickness: Math.min(100, material.thickness) });
      return { type, ...base, name: material?.name ?? `Surface material${sameType + 1}`, materialId: material?.id ?? null, params };
    }
    case 'O':
      return { type, ...base, name: '', standard: false, ownerId: null, costOperation: 0, materials: [] };
    case 'LB':
      return { type, ...base, name: 'Labels: Parts and offcuts', params: lbParamsSchema.parse({}) };
    case 'XNC':
      return { type, ...base, name: `Processing${sameType + 1}`, params: xncParamsSchema.parse({}), items: [] };
  }
}

export function newPart(productId: string | null): Part {
  return {
    id: newId('pt'), productId, name: '', code: '', length: 0, width: 0, qty: 1, grain: true,
    edges: noSides(), grooves: noSides(), surface: { front: null, back: null }, description: '',
  };
}

export function newClPart(productId: string | null): ClPart {
  return { id: newId('pt'), productId, name: '', code: '', length: 0, qty: 1, description: '' };
}
