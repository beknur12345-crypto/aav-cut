/**
 * Manual editing of a guillotine layout ("Edit nesting").
 *
 * Every edit works on the cut tree, so the result is always a valid guillotine layout and the
 * saw command sequence stays correct:
 *  - removing a part turns it into free space and merges free siblings back into one piece;
 *  - placing a part takes a free piece and splits it with at most two through-cuts.
 * Coordinates of tree nodes are kerf-inflated (see guillotine.ts).
 */
import type { Axis, FreeNode, SplitNode, TreeNode } from './guillotine';

const EPS = 1e-6;

/** Recomputes the cut level / last axis of every free piece from its position in the tree. */
function normalize(n: TreeNode, level = 0, last: Axis | null = null): TreeNode {
  if (n.kind === 'free') return { ...n, level, lastAxis: last };
  if (n.kind === 'part') return n;
  const lv = last === n.axis ? level : level + 1;
  return { ...n, a: normalize(n.a, lv, n.axis), b: normalize(n.b, lv, n.axis) };
}

/** Collapses splits whose both sides are free into a single free piece. */
function merge(n: TreeNode): TreeNode {
  if (n.kind !== 'split') return n;
  const a = merge(n.a);
  const b = merge(n.b);
  if (a.kind === 'free' && b.kind === 'free') return { kind: 'free', x: n.x, y: n.y, w: n.w, h: n.h, level: 0, lastAxis: null };
  return { ...n, a, b };
}

export function emptyTree(usableLength: number, usableWidth: number, originX: number, originY: number, kerf: number): FreeNode {
  return { kind: 'free', x: originX, y: originY, w: usableLength + kerf, h: usableWidth + kerf, level: 0, lastAxis: null };
}

/** Removes the part placed at (x, y) (its top-left corner). Returns null if there is none. */
export function removePart(tree: TreeNode, x: number, y: number): TreeNode | null {
  let found = false;
  const walk = (n: TreeNode): TreeNode => {
    if (n.kind === 'part' && Math.abs(n.x - x) < EPS && Math.abs(n.y - y) < EPS) {
      found = true;
      return { kind: 'free', x: n.x, y: n.y, w: n.w, h: n.h, level: 0, lastAxis: null };
    }
    if (n.kind === 'split') return { ...n, a: walk(n.a), b: walk(n.b) };
    return n;
  };
  const next = walk(tree);
  return found ? normalize(merge(next)) : null;
}

function leavesOf(tree: TreeNode): FreeNode[] {
  const out: FreeNode[] = [];
  const walk = (n: TreeNode) => {
    if (n.kind === 'free') out.push(n);
    else if (n.kind === 'split') { walk(n.a); walk(n.b); }
  };
  walk(tree);
  return out;
}

export function freeLeaves(tree: TreeNode): FreeNode[] {
  return leavesOf(normalize(tree));
}

export interface PlaceItem { partId: string; no: number; length: number; width: number }

export type PlaceError = 'noFreeSpace' | 'doesNotFit' | 'tooManyRotations';

/**
 * Places a part into the free piece that contains point (px, py), at that piece's top-left
 * corner. `rotated` swaps length and width.
 */
export function placePart(tree: TreeNode, px: number, py: number, item: PlaceItem, rotated: boolean, kerf: number, maxLevel: number): { tree: TreeNode } | { error: PlaceError } {
  const norm = normalize(tree);
  const target = leavesOf(norm).find((f) => px >= f.x - EPS && px < f.x + f.w - kerf + EPS && py >= f.y - EPS && py < f.y + f.h - kerf + EPS);
  if (!target) return { error: 'noFreeSpace' };
  const w = (rotated ? item.width : item.length) + kerf;
  const h = (rotated ? item.length : item.width) + kerf;
  if (w > target.w + EPS || h > target.h + EPS) return { error: 'doesNotFit' };
  const rw = target.w - w;
  const rh = target.h - h;
  const part: TreeNode = { kind: 'part', x: target.x, y: target.y, w, h, partId: item.partId, no: item.no, rotated };

  const levelOf = (ripFirst: boolean) => {
    let level = target.level;
    let last = target.lastAxis;
    const steps: [Axis, boolean][] = ripFirst ? [['y', rh > EPS], ['x', rw > EPS]] : [['x', rw > EPS], ['y', rh > EPS]];
    for (const [axis, needed] of steps) {
      if (!needed) continue;
      if (last !== axis) level++;
      last = axis;
    }
    return level;
  };
  // Prefer continuing in the direction of the previous cut (fewer rotations on the saw).
  const preferRip = target.lastAxis !== 'x';
  const ripFirst = levelOf(preferRip) <= maxLevel ? preferRip : levelOf(!preferRip) <= maxLevel ? !preferRip : null;
  if (ripFirst === null) return { error: 'tooManyRotations' };

  let node: TreeNode;
  const free = (x: number, y: number, fw: number, fh: number): FreeNode => ({ kind: 'free', x, y, w: fw, h: fh, level: 0, lastAxis: null });
  if (ripFirst) {
    const strip: TreeNode = rw > EPS ? ({ kind: 'split', x: target.x, y: target.y, w: target.w, h, axis: 'x', at: target.x + w, a: part, b: free(target.x + w, target.y, rw, h) } satisfies SplitNode) : part;
    node = rh > EPS ? { kind: 'split', x: target.x, y: target.y, w: target.w, h: target.h, axis: 'y', at: target.y + h, a: strip, b: free(target.x, target.y + h, target.w, rh) } : strip;
  } else {
    const column: TreeNode = rh > EPS ? ({ kind: 'split', x: target.x, y: target.y, w, h: target.h, axis: 'y', at: target.y + h, a: part, b: free(target.x, target.y + h, w, rh) } satisfies SplitNode) : part;
    node = rw > EPS ? { kind: 'split', x: target.x, y: target.y, w: target.w, h: target.h, axis: 'x', at: target.x + w, a: column, b: free(target.x + w, target.y, rw, target.h) } : column;
  }
  const replace = (n: TreeNode): TreeNode => {
    if (n === target) return node;
    if (n.kind === 'split') return { ...n, a: replace(n.a), b: replace(n.b) };
    return n;
  };
  return { tree: normalize(replace(norm)) };
}

/** Number of placed pieces per part id in a tree. */
export function countParts(tree: TreeNode): Map<string, number> {
  const m = new Map<string, number>();
  const walk = (n: TreeNode) => {
    if (n.kind === 'part') m.set(n.partId, (m.get(n.partId) ?? 0) + 1);
    else if (n.kind === 'split') { walk(n.a); walk(n.b); }
  };
  walk(tree);
  return m;
}
