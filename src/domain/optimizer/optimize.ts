import { packSheet, packStrips, type Axis, type Heuristic, type Item, type PackResult, type ScoreRule, type SplitRule, type TreeNode } from './guillotine';
import type { CutLine, OptimizeResult, OptPart, OptSettings, OptStock, Placement, Rect, SawCommand, SheetPattern } from './types';

const SCORES: ScoreRule[] = ['bestArea', 'bestShortSide', 'bestLongSide'];
const SPLITS: SplitRule[] = ['shorterLeftover', 'longerLeftover', 'minArea', 'maxArea', 'shorterAxis', 'longerAxis'];
type SortKey = 'area' | 'longSide' | 'shortSide' | 'length' | 'width' | 'perimeter';
const SORTS: SortKey[] = ['area', 'longSide', 'length', 'width', 'perimeter', 'shortSide'];

const sortValue: Record<SortKey, (p: OptPart) => number> = {
  area: (p) => p.length * p.width,
  longSide: (p) => Math.max(p.length, p.width) * 1e6 + Math.min(p.length, p.width),
  shortSide: (p) => Math.min(p.length, p.width) * 1e6 + Math.max(p.length, p.width),
  length: (p) => p.length * 1e6 + p.width,
  width: (p) => p.width * 1e6 + p.length,
  perimeter: (p) => p.length + p.width,
};

function rootAxes(dir: OptSettings['initialDirection']): (Axis | null)[] {
  switch (dir) {
    case 'length':
      return ['y'];
    case 'width':
      return ['x'];
    case 'lengthPreferred':
      return ['y', null];
    case 'widthPreferred':
      return ['x', null];
    default:
      return [null, 'y', 'x'];
  }
}

function fitsStock(p: OptPart, s: OptStock): boolean {
  const L = s.length - 2 * s.trimLength;
  const W = s.width - 2 * s.trimWidth;
  return (p.length <= L && p.width <= W) || (p.canRotate && p.width <= L && p.length <= W);
}

interface Candidate {
  stock: OptStock;
  pack: PackResult;
  preferred: boolean;
  largestFree: number;
  cutLength: number;
}

function treeCutLength(n: TreeNode, k: number): number {
  if (n.kind !== 'split') return 0;
  return (n.axis === 'y' ? n.w : n.h) - k + treeCutLength(n.a, k) + treeCutLength(n.b, k);
}

/** Layouts whose fill differs by less than this are considered equal, and the shorter total cut wins. */
const FILL_TOLERANCE = 0.003;

/**
 * Multi-sheet optimizer: repeatedly picks the stock + heuristic that fills the next sheet best,
 * then repeats that sheet pattern as many times as the remaining demand allows.
 */
type Strategy = 'mixed' | 'strips' | 'free';

/**
 * Runs the whole job with each strategy and keeps the best plan:
 * fewest unplaced parts → fewest sheets (by area) → shortest total cut.
 */
export function optimize(parts: OptPart[], stocks: OptStock[], settings: OptSettings): OptimizeResult {
  const t0 = Date.now();
  let best: OptimizeResult | null = null;
  const b = settings.band;
  // Band size limits can only be honoured by strip layouts.
  const strategies: Strategy[] = b && (b.minWidth > 0 || b.maxWidth > 0 || b.maxLength > 0) ? ['strips'] : ['mixed', 'strips', 'free'];
  for (const strategy of strategies) {
    if (best && Date.now() - t0 > (settings.timeBudgetMs ?? 8000) / 2) break;
    const r = run(parts, stocks, settings, strategy, t0);
    if (!best || betterPlan(r, best)) best = r;
  }
  return { ...best!, durationMs: Date.now() - t0 };
}

function betterPlan(a: OptimizeResult, b: OptimizeResult): boolean {
  const ua = a.unplaced.reduce((s, u) => s + u.qty, 0);
  const ub = b.unplaced.reduce((s, u) => s + u.qty, 0);
  if (ua !== ub) return ua < ub;
  if (Math.abs(a.sheetArea - b.sheetArea) > 1) return a.sheetArea < b.sheetArea;
  return a.cutLength < b.cutLength - 1;
}

export function run(parts: OptPart[], stocks: OptStock[], settings: OptSettings, strategy: Strategy, t0: number): OptimizeResult {
  const budget = settings.timeBudgetMs ?? 8000;
  const k = Math.max(0, settings.kerf);
  const maxLevel = Math.max(1, Math.round(settings.maxRotations) + 1);
  const remaining = new Map(parts.filter((p) => p.qty > 0 && p.length > 0 && p.width > 0).map((p) => [p.id, p.qty]));
  const byId = new Map(parts.map((p) => [p.id, p]));
  const stockLeft = new Map(stocks.map((s) => [s.id, s.qty]));
  const patterns: SheetPattern[] = [];
  const unplaced: { partId: string; qty: number }[] = [];

  // Parts that cannot fit on any stock are reported once and removed from demand.
  for (const [id, qty] of remaining) {
    const p = byId.get(id)!;
    if (!stocks.some((s) => s.qty > 0 && fitsStock(p, s))) {
      unplaced.push({ partId: id, qty });
      remaining.delete(id);
    }
  }

  const axes = rootAxes(settings.initialDirection);

  while (remaining.size > 0) {
    let best: Candidate | null = null;
    const remainingArea = [...remaining].reduce((a, [id, q]) => a + byId.get(id)!.length * byId.get(id)!.width * q, 0);
    const outOfTime = Date.now() - t0 > budget;

    for (const stock of stocks) {
      if ((stockLeft.get(stock.id) ?? 0) <= 0) continue;
      const L = stock.length - 2 * stock.trimLength;
      const W = stock.width - 2 * stock.trimWidth;
      if (L <= 0 || W <= 0) continue;
      const active = [...remaining].map(([id, q]) => ({ p: byId.get(id)!, q })).filter(({ p }) => fitsStock(p, stock));
      if (!active.length) continue;

      for (const sortKey of outOfTime ? SORTS.slice(0, 1) : SORTS) {
        const sorted = [...active].sort((a, b) => sortValue[sortKey](b.p) - sortValue[sortKey](a.p));
        // Never expand more instances of a part than could physically fit on one sheet.
        const items: Item[] = [];
        for (const { p, q } of sorted) {
          const cap = Math.max(1, Math.floor(((L + k) * (W + k)) / ((p.length + k) * (p.width + k))));
          for (let i = 0; i < Math.min(q, cap); i++) items.push({ partId: p.id, no: p.no, l: p.length + k, w: p.width + k, canRotate: p.canRotate });
        }
        for (const [ai, rootAxis] of axes.entries()) {
          for (const stripAxis of strategy === 'free' ? [] : rootAxis ? [rootAxis] : (['x', 'y'] as const)) {
            const pack = packStrips(items, L, W, stock.trimLength, stock.trimWidth, stripAxis, { kerf: k, maxLevel, rootAxis, maxVarieties: settings.maxVarieties, band: settings.band });
            if (!pack || pack.placedArea / (stock.length * stock.width) < (stock.minFill ?? 0)) continue;
            const largestFree = pack.free.reduce((m, f) => Math.max(m, Math.max(0, f.w - k) * Math.max(0, f.h - k)), 0);
            const cand: Candidate = { stock, pack, preferred: ai === 0 && settings.initialDirection !== 'any', largestFree, cutLength: treeCutLength(pack.root, k) };
            if (!best || better(cand, best, remainingArea)) best = cand;
          }
          for (const sc of strategy === 'strips' ? [] : outOfTime ? SCORES.slice(0, 1) : SCORES) {
            for (const sp of outOfTime ? SPLITS.slice(0, 1) : SPLITS) {
              const h: Heuristic = { score: sc, split: sp };
              const pack = packSheet(items, L, W, stock.trimLength, stock.trimWidth, h, { kerf: k, maxLevel, rootAxis, maxVarieties: settings.maxVarieties });
              if (pack.placed.size === 0 || pack.placedArea / (stock.length * stock.width) < (stock.minFill ?? 0)) continue;
              const largestFree = pack.free.reduce((m, f) => Math.max(m, Math.max(0, f.w - k) * Math.max(0, f.h - k)), 0);
              const cand: Candidate = { stock, pack, preferred: ai === 0 && settings.initialDirection !== 'any', largestFree, cutLength: treeCutLength(pack.root, k) };
              if (!best || better(cand, best, remainingArea)) best = cand;
            }
          }
        }
      }
    }

    if (!best) {
      for (const [id, qty] of remaining) unplaced.push({ partId: id, qty });
      break;
    }

    // Repeat this pattern while demand and stock allow.
    let repeat = stockLeft.get(best.stock.id) ?? 1;
    for (const [id, used] of best.pack.placed) repeat = Math.min(repeat, Math.floor((remaining.get(id) ?? 0) / used));
    repeat = Math.max(1, repeat);
    for (const [id, used] of best.pack.placed) {
      const left = (remaining.get(id) ?? 0) - used * repeat;
      if (left > 0) remaining.set(id, left);
      else remaining.delete(id);
    }
    stockLeft.set(best.stock.id, (stockLeft.get(best.stock.id) ?? 0) - repeat);
    patterns.push(buildPattern(best.stock, best.pack.root, repeat, settings, k));
  }

  const sheetsUsed = patterns.reduce((a, p) => a + p.count, 0);
  const sheetArea = patterns.reduce((a, p) => a + p.length * p.width * p.count, 0);
  const partsArea = patterns.reduce((a, p) => a + p.partsArea * p.count, 0);
  const cutLength = patterns.reduce((a, p) => a + p.cutLength * p.count, 0);
  return { patterns, unplaced, sheetsUsed, sheetArea, partsArea, cutLength, fill: sheetArea ? partsArea / sheetArea : 0, durationMs: Date.now() - t0 };
}

/**
 * Ranking of candidate sheets.
 *  - Intermediate sheets: highest fill; near-equal fills → fewer metres of cutting.
 *  - Final sheet (everything fits): smallest stock, then the largest reusable leftover, then fewer metres of cutting.
 */
function better(a: Candidate, b: Candidate, remainingArea: number): boolean {
  const aAll = a.pack.placedArea >= remainingArea - 1;
  const bAll = b.pack.placedArea >= remainingArea - 1;
  const aArea = a.stock.length * a.stock.width;
  const bArea = b.stock.length * b.stock.width;
  if (aAll && bAll) {
    if (aArea !== bArea) return aArea < bArea;
    if (a.preferred !== b.preferred) return a.preferred;
    const rel = (a.largestFree - b.largestFree) / Math.max(1, aArea);
    if (Math.abs(rel) > 0.02) return rel > 0;
    return a.cutLength < b.cutLength;
  }
  const fa = a.pack.placedArea / aArea;
  const fb = b.pack.placedArea / bArea;
  if (Math.abs(fa - fb) > FILL_TOLERANCE) return fa > fb;
  if (a.preferred !== b.preferred) return a.preferred;
  if (Math.abs(a.cutLength - b.cutLength) > 1) return a.cutLength < b.cutLength;
  return fa > fb;
}

/**
 * Turns a cut tree into a sheet pattern: placements, offcuts/waste, cut lines and the saw command
 * sequence. Exported so manually edited trees (Edit nesting) are rebuilt the same way.
 */
export function buildPattern(stock: OptStock, root: TreeNode, count: number, s: Pick<OptSettings, 'minOffcutLong' | 'minOffcutShort'>, k: number): SheetPattern {
  const placements: Placement[] = [];
  const offcuts: Rect[] = [];
  const waste: Rect[] = [];
  const cuts: CutLine[] = [];
  const commands: Omit<SawCommand, 'no'>[] = [];
  let cutLength = 0;
  let partsArea = 0;

  const L = stock.length;
  const W = stock.width;
  // Trimming cuts: rip edges first (cuts along the length), then the crosscut edges.
  const tl = stock.trimLength;
  const tw = stock.trimWidth;
  if (tw > 0) {
    cuts.push({ x1: 0, y1: tw, x2: L, y2: tw, trim: true }, { x1: 0, y1: W - tw, x2: L, y2: W - tw, trim: true });
    cutLength += 2 * L;
    commands.push({ cmd: 'T', size: tw, count: 2 });
  }
  if (tl > 0) {
    if (tw > 0) commands.push({ cmd: 'R', size: 0, count: 1 });
    cuts.push({ x1: tl, y1: tw, x2: tl, y2: W - tw, trim: true }, { x1: L - tl, y1: tw, x2: L - tl, y2: W - tw, trim: true });
    cutLength += 2 * (W - 2 * tw);
    commands.push({ cmd: 'T', size: tl, count: 2 });
  }
  const tableAxis: Axis | null = tl > 0 ? 'x' : tw > 0 ? 'y' : null;

  const isOffcut = (w: number, h: number) =>
    Math.max(w, h) >= s.minOffcutLong && Math.min(w, h) >= s.minOffcutShort;

  const leaf = (n: TreeNode) => {
    const rl = n.w - k;
    const rw = n.h - k;
    if (n.kind === 'part') {
      placements.push({ partId: n.partId, no: n.no, x: n.x, y: n.y, length: rl, width: rw, rotated: n.rotated });
      partsArea += rl * rw;
    } else if (rl > 0.05 && rw > 0.05) (isOffcut(rl, rw) ? offcuts : waste).push({ x: n.x, y: n.y, length: rl, width: rw });
  };

  /**
   * Saw sequence the way a panel saw is operated: all parallel cuts across a piece are made in
   * one pass (strips), then the strips are rotated together (one R) and processed one by one.
   */
  const processPiece = (n: TreeNode, onTable: Axis | null) => {
    if (n.kind !== 'split') return leaf(n);
    const chain: Extract<TreeNode, { kind: 'split' }>[] = [];
    let rest: TreeNode = n;
    while (rest.kind === 'split' && rest.axis === n.axis) {
      chain.push(rest);
      rest = rest.b;
    }
    if (onTable !== null && onTable !== n.axis) commands.push({ cmd: 'R', size: 0, count: 1 });
    for (const c of chain) {
      const pos = c.at - k / 2; // centre of the kerf
      if (c.axis === 'y') {
        cuts.push({ x1: c.x, y1: pos, x2: c.x + c.w - k, y2: pos, trim: false });
        cutLength += c.w - k;
      } else {
        cuts.push({ x1: pos, y1: c.y, x2: pos, y2: c.y + c.h - k, trim: false });
        cutLength += c.h - k;
      }
      const size = Math.round((c.at - k - (c.axis === 'y' ? c.y : c.x)) * 10) / 10;
      const partNo = c.a.kind === 'part' ? c.a.no : undefined;
      commands.push({ cmd: partNo !== undefined ? 'P' : c.a.kind === 'free' ? 'W' : 'C', size, count: 1, partNo });
    }
    const pieces = [...chain.map((c) => c.a), rest];
    const other: Axis = n.axis === 'x' ? 'y' : 'x';
    // One rotation for the whole stack of strips, then each strip is cut in turn.
    const anyRotated = pieces.some((p) => p.kind === 'split' && p.axis === other);
    if (anyRotated) commands.push({ cmd: 'R', size: 0, count: 1 });
    for (const p of pieces) processPiece(p, anyRotated ? other : n.axis);
  };
  processPiece(root, tableAxis);

  // Merge consecutive identical commands into one row with a count (as a saw operator reads them).
  const merged: SawCommand[] = [];
  for (const c of commands) {
    const last = merged[merged.length - 1];
    if (last && last.cmd === c.cmd && last.size === c.size && last.partNo === c.partNo && c.cmd !== 'R') last.count += c.count;
    else if (last && c.cmd === 'R' && last.cmd === 'R') merged.pop(); // two rotations cancel out
    else merged.push({ ...c, no: merged.length + 1 });
  }
  merged.forEach((c, i) => (c.no = i + 1));
  if (merged[merged.length - 1]?.cmd === 'R') merged.pop();

  return { stockId: stock.id, length: L, width: W, count, placements, offcuts, waste, cuts, commands: merged, cutLength, partsArea, tree: root, kerf: k, trimLength: tl, trimWidth: tw };
}
