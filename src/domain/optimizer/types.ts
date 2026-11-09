/**
 * Coordinate system used everywhere in the optimizer and the cutting map:
 *  - x runs along the sheet LENGTH (left → right)
 *  - y runs along the sheet WIDTH  (top → bottom)
 * All values are millimetres.
 */

export type InitialDirection = 'any' | 'length' | 'width' | 'lengthPreferred' | 'widthPreferred';

export interface OptPart {
  id: string;
  /** Display number of the part inside its operation (1-based). */
  no: number;
  length: number;
  width: number;
  qty: number;
  /** False when grain must follow the sheet length (fixed texture). */
  canRotate: boolean;
}

export interface OptStock {
  id: string;
  length: number;
  width: number;
  qty: number;
  /** Trim taken off EACH edge across the length (left & right), includes saw kerf. */
  trimLength: number;
  /** Trim taken off EACH edge across the width (top & bottom), includes saw kerf. */
  trimWidth: number;
  /** Use this stock only when a sheet would be filled at least this much (0..1). Typical for offcuts. */
  minFill?: number;
}

export interface OptSettings {
  kerf: number;
  initialDirection: InitialDirection;
  /** Maximum number of times a piece may be rotated on the saw (cut levels = rotations + 1). */
  maxRotations: number;
  /** A leftover is a reusable offcut when its long side ≥ minOffcutLong and short side ≥ minOffcutShort. */
  minOffcutLong: number;
  minOffcutShort: number;
  /** Safety cap for the search, in ms. */
  timeBudgetMs?: number;
  /** Maximum number of different parts on one sheet (0 = unlimited). */
  maxVarieties?: number;
  /** Band (strip) rules; when any limit is set, only strip layouts are produced. */
  band?: import('./guillotine').BandRules;
}

export interface Rect {
  x: number;
  y: number;
  length: number;
  width: number;
}

export interface Placement extends Rect {
  partId: string;
  no: number;
  rotated: boolean;
}

export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  trim: boolean;
}

/** Saw command codes: R rotate, T trimming, C cut, P cut releasing a part, W cut releasing an offcut/waste. */
export type CommandCode = 'R' | 'T' | 'C' | 'P' | 'W';

export interface SawCommand {
  no: number;
  cmd: CommandCode;
  size: number;
  count: number;
  partNo?: number;
}

export interface SheetPattern {
  stockId: string;
  length: number;
  width: number;
  /** How many identical sheets are cut with this pattern. */
  count: number;
  placements: Placement[];
  offcuts: Rect[];
  waste: Rect[];
  cuts: CutLine[];
  commands: SawCommand[];
  /** Cut length for ONE sheet of this pattern, mm. */
  cutLength: number;
  /** Area of parts on ONE sheet, mm². */
  partsArea: number;
  /** Cut tree (kerf-inflated coordinates) — lets the layout be edited by hand and rebuilt. */
  tree?: import('./guillotine').TreeNode;
  kerf?: number;
  trimLength?: number;
  trimWidth?: number;
}

export interface OptimizeResult {
  patterns: SheetPattern[];
  unplaced: { partId: string; qty: number }[];
  sheetsUsed: number;
  sheetArea: number;
  partsArea: number;
  cutLength: number;
  /** partsArea / sheetArea, 0..1 */
  fill: number;
  durationMs: number;
}
