/**
 * Single-sheet guillotine packer.
 *
 * Works in "kerf-inflated" space: every part occupies (size + kerf) and the usable sheet area
 * is enlarged by one kerf, so the last part on an edge does not need a cut. Every placement
 * splits a free rectangle with at most two straight through-cuts, so the result is always a
 * guillotine layout that a panel saw can execute. The split history is kept as a tree, which is
 * what produces the saw command sequence and the cut lines.
 */

export type Axis = 'x' | 'y'; // 'x' = cut line at constant x (crosscut), 'y' = cut line at constant y (rip along length)

export type ScoreRule = 'bestArea' | 'bestShortSide' | 'bestLongSide';
export type SplitRule = 'shorterLeftover' | 'longerLeftover' | 'minArea' | 'maxArea' | 'shorterAxis' | 'longerAxis';

export interface Heuristic {
  score: ScoreRule;
  split: SplitRule;
}

export interface Item {
  partId: string;
  no: number;
  /** Inflated sizes (real + kerf). */
  l: number;
  w: number;
  canRotate: boolean;
}

export interface FreeNode {
  kind: 'free';
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  lastAxis: Axis | null;
}

export interface PartNode {
  kind: 'part';
  x: number;
  y: number;
  w: number;
  h: number;
  partId: string;
  no: number;
  rotated: boolean;
}

export interface SplitNode {
  kind: 'split';
  x: number;
  y: number;
  w: number;
  h: number;
  axis: Axis;
  /** Coordinate (inflated) where piece `a` ends and piece `b` starts. */
  at: number;
  a: TreeNode;
  b: TreeNode;
}

export type TreeNode = FreeNode | PartNode | SplitNode;

export interface PackResult {
  root: TreeNode;
  placedArea: number; // inflated area is not used for scoring; this is REAL part area
  placed: Map<string, number>;
  free: FreeNode[];
}

export interface PackOptions {
  kerf: number;
  maxLevel: number;
  /** Forced axis of the very first cut, or null for free choice. */
  rootAxis: Axis | null;
  /** Maximum number of different parts on one sheet (0 = unlimited). */
  maxVarieties?: number;
  /** Strip (band) rules for the strip packer, real mm (0 = no limit). */
  band?: BandRules;
}

export type BandSort = 'descending' | 'ascending' | 'center' | 'none';
export interface BandRules { minWidth: number; maxWidth: number; maxLength: number; sort: BandSort; sortInto: BandSort }

/** Orders items by size per a band-sorting rule; "center" puts the smallest in the middle. */
export function sortBySize<T>(arr: T[], size: (t: T) => number, rule: BandSort): T[] {
  if (rule === 'none') return arr;
  const sorted = [...arr].sort((a, b) => size(b) - size(a));
  if (rule === 'descending') return sorted;
  if (rule === 'ascending') return sorted.reverse();
  const left: T[] = [];
  const right: T[] = [];
  sorted.forEach((t, i) => (i % 2 === 0 ? left : right).push(t));
  return [...left, ...right.reverse()];
}

const tooManyVarieties = (placed: Map<string, number>, partId: string, max = 0) => max > 0 && !placed.has(partId) && placed.size >= max;

const EPS = 1e-6;

function fits(f: FreeNode, w: number, h: number) {
  return w <= f.w + EPS && h <= f.h + EPS;
}

function score(rule: ScoreRule, f: FreeNode, w: number, h: number): number {
  const dw = f.w - w;
  const dh = f.h - h;
  if (Math.abs(dw) < EPS && Math.abs(dh) < EPS) return -Infinity; // perfect fit
  switch (rule) {
    case 'bestArea':
      return f.w * f.h - w * h + Math.min(dw, dh) * 1e-6;
    case 'bestShortSide':
      return Math.min(dw, dh) + Math.max(dw, dh) * 1e-6;
    case 'bestLongSide':
      return Math.max(dw, dh) + Math.min(dw, dh) * 1e-6;
  }
}

/** true → first cut is axis 'y' (full-width strip on top), false → first cut is axis 'x'. */
function preferRipFirst(rule: SplitRule, f: FreeNode, w: number, h: number): boolean {
  const rw = f.w - w;
  const rh = f.h - h;
  switch (rule) {
    case 'shorterLeftover':
      return rw <= rh;
    case 'longerLeftover':
      return rw > rh;
    case 'minArea':
      return w * rh > rw * h;
    case 'maxArea':
      return w * rh <= rw * h;
    case 'shorterAxis':
      return f.w <= f.h;
    case 'longerAxis':
      return f.w > f.h;
  }
}

/** Levels reached by the two cuts of a placement; returns null if not allowed. */
function plan(f: FreeNode, w: number, h: number, ripFirst: boolean, opts: PackOptions, isRoot: boolean) {
  const rw = f.w - w;
  const rh = f.h - h;
  const first: Axis = ripFirst ? 'y' : 'x';
  const second: Axis = ripFirst ? 'x' : 'y';
  const firstNeeded = ripFirst ? rh > EPS : rw > EPS;
  const secondNeeded = ripFirst ? rw > EPS : rh > EPS;
  if (isRoot && opts.rootAxis && firstNeeded && first !== opts.rootAxis) return null;
  if (isRoot && opts.rootAxis && !firstNeeded && secondNeeded && second !== opts.rootAxis) return null;
  let level = f.level;
  let last = f.lastAxis;
  if (firstNeeded) {
    level = last === first ? level : level + 1;
    last = first;
  }
  const afterFirst = { level, last };
  if (secondNeeded) {
    level = last === second ? level : level + 1;
    last = second;
  }
  if (level > opts.maxLevel) return null;
  return { first, second, firstNeeded, secondNeeded, afterFirst, final: { level, last } };
}

export function packSheet(
  items: Item[],
  usableLength: number,
  usableWidth: number,
  originX: number,
  originY: number,
  heuristic: Heuristic,
  opts: PackOptions,
): PackResult {
  const k = opts.kerf;
  const root: FreeNode = { kind: 'free', x: originX, y: originY, w: usableLength + k, h: usableWidth + k, level: 0, lastAxis: null };
  // Parent pointers let us replace a free leaf in the tree in O(1).
  const parents = new Map<TreeNode, { parent: SplitNode; side: 'a' | 'b' } | null>([[root, null]]);
  let treeRoot: TreeNode = root;
  const free: FreeNode[] = [root];
  const placed = new Map<string, number>();
  let placedArea = 0;

  const replace = (oldNode: TreeNode, newNode: TreeNode) => {
    const p = parents.get(oldNode);
    parents.delete(oldNode);
    if (!p) treeRoot = newNode;
    else p.parent[p.side] = newNode;
    parents.set(newNode, p ?? null);
  };

  for (const item of items) {
    if (tooManyVarieties(placed, item.partId, opts.maxVarieties)) continue;
    let best: { fi: number; w: number; h: number; rotated: boolean; s: number } | null = null;
    for (let fi = 0; fi < free.length; fi++) {
      const f = free[fi]!;
      const orients: [number, number, boolean][] = [[item.l, item.w, false]];
      if (item.canRotate && Math.abs(item.l - item.w) > EPS) orients.push([item.w, item.l, true]);
      for (const [w, h, rotated] of orients) {
        if (!fits(f, w, h)) continue;
        const isRoot = f === root && parents.get(f) === null;
        const ok =
          plan(f, w, h, true, opts, isRoot) ?? plan(f, w, h, false, opts, isRoot);
        if (!ok) continue;
        const s = score(heuristic.score, f, w, h);
        if (!best || s < best.s) best = { fi, w, h, rotated, s };
      }
    }
    if (!best) continue;

    const f = free[best.fi]!;
    const isRoot = f === root && parents.get(f) === null;
    const want = preferRipFirst(heuristic.split, f, best.w, best.h);
    const p = plan(f, best.w, best.h, want, opts, isRoot) ?? plan(f, best.w, best.h, !want, opts, isRoot)!;
    free.splice(best.fi, 1);

    const part: PartNode = { kind: 'part', x: f.x, y: f.y, w: best.w, h: best.h, partId: item.partId, no: item.no, rotated: best.rotated };
    const rw = f.w - best.w;
    const rh = f.h - best.h;
    const newFree: FreeNode[] = [];

    let node: TreeNode;
    if (p.first === 'y') {
      // Rip a full-width strip of height h, then crosscut the part off the strip.
      let strip: TreeNode = part;
      if (p.secondNeeded) {
        const right: FreeNode = { kind: 'free', x: f.x + best.w, y: f.y, w: rw, h: best.h, level: p.final.level, lastAxis: p.final.last };
        strip = { kind: 'split', x: f.x, y: f.y, w: f.w, h: best.h, axis: 'x', at: f.x + best.w, a: part, b: right };
        newFree.push(right);
      }
      if (p.firstNeeded) {
        const below: FreeNode = { kind: 'free', x: f.x, y: f.y + best.h, w: f.w, h: rh, level: p.afterFirst.level, lastAxis: p.afterFirst.last };
        node = { kind: 'split', x: f.x, y: f.y, w: f.w, h: f.h, axis: 'y', at: f.y + best.h, a: strip, b: below };
        newFree.push(below);
      } else node = strip;
    } else {
      let column: TreeNode = part;
      if (p.secondNeeded) {
        const below: FreeNode = { kind: 'free', x: f.x, y: f.y + best.h, w: best.w, h: rh, level: p.final.level, lastAxis: p.final.last };
        column = { kind: 'split', x: f.x, y: f.y, w: best.w, h: f.h, axis: 'y', at: f.y + best.h, a: part, b: below };
        newFree.push(below);
      }
      if (p.firstNeeded) {
        const right: FreeNode = { kind: 'free', x: f.x + best.w, y: f.y, w: rw, h: f.h, level: p.afterFirst.level, lastAxis: p.afterFirst.last };
        node = { kind: 'split', x: f.x, y: f.y, w: f.w, h: f.h, axis: 'x', at: f.x + best.w, a: column, b: right };
        newFree.push(right);
      } else node = column;
    }

    replace(f, node);
    // Register parent pointers for the new subtree's free leaves.
    const register = (n: TreeNode) => {
      if (n.kind !== 'split') return;
      for (const side of ['a', 'b'] as const) {
        parents.set(n[side], { parent: n, side });
        register(n[side]);
      }
    };
    register(node);
    for (const nf of newFree) if (nf.w > k + EPS && nf.h > k + EPS) free.push(nf);

    placed.set(item.partId, (placed.get(item.partId) ?? 0) + 1);
    placedArea += (best.w - k) * (best.h - k);
  }

  // Collect every free leaf (including slivers we stopped tracking) for offcut/waste reporting.
  const leaves: FreeNode[] = [];
  const walk = (n: TreeNode) => {
    if (n.kind === 'free') leaves.push(n);
    else if (n.kind === 'split') {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(treeRoot);

  return { root: treeRoot, placedArea, placed, free: leaves };
}

/**
 * Strip packer (3-stage guillotine, the classic panel-saw layout):
 *  stage 1 – cut the sheet into strips across `axis`,
 *  stage 2 – cut each strip into cells, one part per cell,
 *  stage 3 – trim a cell when the part is shorter than the strip.
 * Produces fewer, longer cuts than the free-rectangle packer; both compete per sheet.
 */
export function packStrips(
  items: Item[],
  usableLength: number,
  usableWidth: number,
  originX: number,
  originY: number,
  axis: Axis,
  opts: PackOptions,
): PackResult | null {
  if (opts.maxLevel < 3) return null;
  const k = opts.kerf;
  // Work in a frame where strips are stacked along "u" and parts along "v".
  const U = (axis === 'x' ? usableLength : usableWidth) + k;
  const V = (axis === 'x' ? usableWidth : usableLength) + k;
  const band = opts.band;
  /** Usable length of a strip (a maximum band length leaves the rest of the strip free). */
  const VL = band && band.maxLength > 0 ? Math.min(V, band.maxLength + k) : V;
  type Cell = { item: Item; su: number; sv: number; rotated: boolean };
  const strips: { size: number; used: number; cells: Cell[] }[] = [];
  let usedU = 0;
  const placed = new Map<string, number>();
  let placedArea = 0;

  for (const item of items) {
    if (tooManyVarieties(placed, item.partId, opts.maxVarieties)) continue;
    // Orientations expressed as (size across the strip "u", size along the strip "v").
    const orients: { su: number; sv: number; rotated: boolean }[] = [];
    const base = axis === 'x' ? { su: item.l, sv: item.w } : { su: item.w, sv: item.l };
    orients.push({ ...base, rotated: false });
    if (item.canRotate && Math.abs(item.l - item.w) > EPS) orients.push({ su: base.sv, sv: base.su, rotated: true });

    let best: { strip: number; o: (typeof orients)[number]; waste: number } | null = null;
    for (let si = 0; si < strips.length; si++) {
      const s = strips[si]!;
      for (const o of orients) {
        if (o.su <= s.size + EPS && o.sv <= VL - s.used + EPS) {
          const waste = (s.size - o.su) * o.sv;
          if (!best || waste < best.waste) best = { strip: si, o, waste };
        }
      }
    }
    if (best) {
      const s = strips[best.strip]!;
      s.cells.push({ item, ...best.o });
      s.used += best.o.sv;
    } else {
      // Open a new strip with the orientation that makes the narrowest strip that still fits.
      const o = orients
        .filter((x) => x.su <= U - usedU + EPS && x.sv <= VL + EPS && !(band && band.maxWidth > 0 && x.su - k > band.maxWidth + EPS))
        .sort((a, b) => a.su - b.su)[0];
      if (!o) continue;
      // A minimum band width widens narrow strips (other parts may still share them).
      const size = band && band.minWidth > 0 ? Math.min(U - usedU, Math.max(o.su, band.minWidth + k)) : o.su;
      strips.push({ size, used: o.sv, cells: [{ item, ...o }] });
      usedU += size;
    }
    placed.set(item.partId, (placed.get(item.partId) ?? 0) + 1);
    placedArea += (item.l - k) * (item.w - k);
  }
  if (!strips.length) return null;
  if (band) {
    strips.splice(0, strips.length, ...sortBySize(strips, (st) => st.size, band.sort));
    for (const st of strips) st.cells = sortBySize(st.cells, (c) => c.sv, band.sortInto);
  }

  // Build the cut tree in real coordinates.
  const vAxis: Axis = axis === 'x' ? 'y' : 'x';
  const mk = (u: number, v: number, su: number, sv: number) =>
    axis === 'x' ? { x: originX + u, y: originY + v, w: su, h: sv } : { x: originX + v, y: originY + u, w: sv, h: su };
  const free: FreeNode[] = [];
  const freeNode = (u: number, v: number, su: number, sv: number, level: number, lastAxis: Axis): FreeNode => {
    const n: FreeNode = { kind: 'free', ...mk(u, v, su, sv), level, lastAxis };
    free.push(n);
    return n;
  };

  const buildStrip = (u: number, s: (typeof strips)[number]): TreeNode => {
    let v = 0;
    const cellNodes: { node: TreeNode; sv: number }[] = s.cells.map((c) => {
      const part: PartNode = { kind: 'part', ...mk(u, v, c.su, c.sv), partId: c.item.partId, no: c.item.no, rotated: c.rotated };
      let node: TreeNode = part;
      if (s.size - c.su > EPS) {
        const rest = freeNode(u + c.su, v, s.size - c.su, c.sv, 3, axis);
        node = { kind: 'split', ...mk(u, v, s.size, c.sv), axis, at: (axis === 'x' ? originX : originY) + u + c.su, a: part, b: rest };
      }
      v += c.sv;
      return { node, sv: c.sv };
    });
    // Chain the cells along the strip: each cut releases one cell and leaves the rest of the strip.
    let tail: TreeNode | null = V - s.used > EPS ? freeNode(u, s.used, s.size, V - s.used, 2, vAxis) : null;
    let tailStart = s.used;
    for (let i = cellNodes.length - 1; i >= 0; i--) {
      const { node, sv } = cellNodes[i]!;
      const start = tailStart - sv;
      if (tail) {
        tail = { kind: 'split', ...mk(u, start, s.size, V - start), axis: vAxis, at: (axis === 'x' ? originY : originX) + start + sv, a: node, b: tail };
      } else tail = node;
      tailStart = start;
    }
    return tail!;
  };

  let root: TreeNode | null = U - usedU > EPS ? freeNode(usedU, 0, U - usedU, V, 1, axis) : null;
  let start = usedU;
  for (let i = strips.length - 1; i >= 0; i--) {
    const s = strips[i]!;
    start -= s.size;
    const node = buildStrip(start, s);
    root = root
      ? { kind: 'split', ...mk(start, 0, U - start, V), axis, at: (axis === 'x' ? originX : originY) + start + s.size, a: node, b: root }
      : node;
  }
  return { root: root!, placedArea, placed, free };
}
