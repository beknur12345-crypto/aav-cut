/** CNC processing (XNC): dimensions, cost, constraint checks, placement transforms, DXF import and G-code. */
import { cuttingSize, elOps, totalCount } from './calc';
import { isSheetOp, newId, type ProjectDoc, type XncItem, type XncOperation } from './project';
import type { DxfShape } from './export/dxf';
import type { GcodeSettings } from './export/postprocessors';

export interface XncConstraints {
  minL: number; maxL: number; minW: number; maxW: number; minT: number; maxT: number;
  /** Minimum distance from a hole's centre to the panel edge, mm. */
  holeEdgeDistance: number;
}
export const DEFAULT_XNC_CONSTRAINTS: XncConstraints = { minL: 200, maxL: 3000, minW: 70, maxW: 950, minT: 12, maxT: 60, holeEdgeDistance: 2 };

export interface XncTool { id: string; name: string; type: 'drill' | 'mill'; diameter: number; number: number }
export const DEFAULT_XNC_TOOLS: XncTool[] = [
  { id: 'd5', name: 'Drill 5', type: 'drill', diameter: 5, number: 11 },
  { id: 'd8', name: 'Drill 8', type: 'drill', diameter: 8, number: 12 },
  { id: 'd15', name: 'Drill 15', type: 'drill', diameter: 15, number: 13 },
  { id: 'd35', name: 'Hinge cup 35', type: 'drill', diameter: 35, number: 14 },
  { id: 'm8', name: 'Mill 8', type: 'mill', diameter: 8, number: 2 },
  { id: 'm12', name: 'Mill 12', type: 'mill', diameter: 12, number: 1 },
];

/** Panel size: from the linked part (finished or cutting size) or entered by hand. */
export function xncDims(op: XncOperation, doc: ProjectDoc): { dx: number; dy: number; dz: number; qty: number; linked: boolean } {
  const ref = op.params.partRef;
  if (ref) {
    const src = doc.operations.find((o) => o.id === ref.opId);
    if (src && isSheetOp(src)) {
      const part = src.parts.find((p) => p.id === ref.partId);
      if (part) {
        const s = op.params.byDetailSize ? { length: part.length, width: part.width } : cuttingSize(part, doc, elOps(doc));
        return { dx: s.length, dy: s.width, dz: src.params.thickness, qty: totalCount(part, doc.products), linked: true };
      }
    }
  }
  return { dx: op.params.dx, dy: op.params.dy, dz: op.params.dz, qty: op.params.qty, linked: false };
}

export function itemLength(it: XncItem): number {
  if (it.kind === 'groove') return Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
  if (it.kind === 'mill') {
    let l = 0;
    const pts = it.closed ? [...it.points, it.points[0]!] : it.points;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    return l;
  }
  return 0;
}

export function xncCost(op: XncOperation, doc: ProjectDoc) {
  const { qty } = xncDims(op, doc);
  const holes = op.items.filter((i) => i.kind === 'hole').length;
  const pockets = op.items.filter((i) => i.kind === 'pocket').length;
  const meters = op.items.reduce((a, i) => a + itemLength(i), 0) / 1000;
  const p = op.params;
  return { holes, pockets, meters, qty, cost: (holes * p.pricePerHole + pockets * p.pricePerPocket + meters * p.pricePerMeter) * qty };
}

export type XncWarning = { key: 'sizeOutOfRange' | 'holeOutside' | 'holeNearEdge' | 'throughHole' | 'edgeHoleOutside' | 'itemOutside'; itemId?: string };

export function checkXnc(op: XncOperation, doc: ProjectDoc, c: XncConstraints = DEFAULT_XNC_CONSTRAINTS): XncWarning[] {
  const { dx, dy, dz } = xncDims(op, doc);
  const w: XncWarning[] = [];
  const L = Math.max(dx, dy);
  const W = Math.min(dx, dy);
  if (L < c.minL || L > c.maxL || W < c.minW || W > c.maxW || dz < c.minT || dz > c.maxT) w.push({ key: 'sizeOutOfRange' });
  const inside = (x: number, y: number) => x >= 0 && x <= dx && y >= 0 && y <= dy;
  for (const it of op.items) {
    if (it.kind === 'hole') {
      if (it.face === 'front' || it.face === 'back') {
        if (!inside(it.x, it.y)) w.push({ key: 'holeOutside', itemId: it.id });
        else if (Math.min(it.x, it.y, dx - it.x, dy - it.y) < it.d / 2 + c.holeEdgeDistance) w.push({ key: 'holeNearEdge', itemId: it.id });
        if (it.depth >= dz) w.push({ key: 'throughHole', itemId: it.id });
      } else {
        const along = it.face === 'top' || it.face === 'bottom' ? dx : dy;
        if (it.x < it.d / 2 || it.x > along - it.d / 2 || it.z < it.d / 2 || it.z > dz - it.d / 2) w.push({ key: 'edgeHoleOutside', itemId: it.id });
      }
    } else {
      const pts = it.kind === 'groove' ? [{ x: it.x1, y: it.y1 }, { x: it.x2, y: it.y2 }] : it.kind === 'pocket' ? [{ x: it.x, y: it.y }, { x: it.x + it.w, y: it.y + it.h }] : it.points;
      if (pts.some((p) => !inside(p.x, p.y))) w.push({ key: 'itemOutside', itemId: it.id });
    }
  }
  return w;
}

/**
 * Panel → machine coordinates: turn (about the panel centre, re-anchored at 0,0), mirror, then
 * the origin corner the machine measures from. Panel coordinates have their origin bottom-left.
 */
export function makeTransform(p: Pick<XncOperation['params'], 'turn' | 'mirror' | 'origin'>, dx: number, dy: number) {
  const turned = p.turn === 90 || p.turn === 270 ? { w: dy, h: dx } : { w: dx, h: dy };
  return {
    width: turned.w,
    height: turned.h,
    apply: (x: number, y: number) => {
      let X = x;
      let Y = y;
      if (p.turn === 90) [X, Y] = [dy - y, x];
      else if (p.turn === 180) [X, Y] = [dx - x, dy - y];
      else if (p.turn === 270) [X, Y] = [y, dx - x];
      if (p.mirror === 'h') X = turned.w - X;
      if (p.mirror === 'v') Y = turned.h - Y;
      if (p.origin === 'LT' || p.origin === 'RT') Y = turned.h - Y;
      if (p.origin === 'RT' || p.origin === 'RB') X = turned.w - X;
      return { x: X, y: Y };
    },
  };
}

/** XNC items from DXF shapes: circles → holes, lines → grooves, rectangles → pockets, other polylines → milling. */
export function itemsFromDxf(shapes: DxfShape[], defaults: { depth: number; grooveWidth: number; toolD: number }): XncItem[] {
  const depthOf = (layer: string) => {
    const m = layer.match(/(?:Z|DEPTH|D_)(\d+(?:[.,]\d+)?)/i);
    return m ? Number(m[1]!.replace(',', '.')) : defaults.depth;
  };
  const out: XncItem[] = [];
  for (const s of shapes) {
    const depth = depthOf(s.layer);
    if (s.type === 'circle' && s.r > 0) out.push({ id: newId('x'), kind: 'hole', face: 'front', x: s.x, y: s.y, z: 0, d: Math.min(200, s.r * 2), depth });
    else if (s.type === 'line') out.push({ id: newId('x'), kind: 'groove', face: 'front', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, width: defaults.grooveWidth, depth });
    else if (s.type === 'poly' && s.points.length >= 2) {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      const rect = s.closed && s.points.length === 4 && new Set(xs).size === 2 && new Set(ys).size === 2;
      if (rect) out.push({ id: newId('x'), kind: 'pocket', face: 'front', x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), depth, toolD: defaults.toolD });
      else out.push({ id: newId('x'), kind: 'mill', face: 'front', points: s.points.slice(0, 5000), closed: s.closed, toolD: defaults.toolD, depth });
    }
  }
  return out;
}

/** ISO G-code for the front and back faces (edge holes are listed as comments for the horizontal unit). */
export function xncGcode(op: XncOperation, doc: ProjectDoc, g: GcodeSettings, tools: XncTool[] = DEFAULT_XNC_TOOLS): string {
  const { dx, dy, dz } = xncDims(op, doc);
  const tf = makeTransform(op.params, dx, dy);
  const f = (v: number) => v.toFixed(g.decimals);
  const lines = [`(${op.name} ${dx}x${dy}x${dz} turn=${op.params.turn} mirror=${op.params.mirror} origin=${op.params.origin})`, 'G21 G90 G17 G40 G49'];
  const toolFor = (d: number, type: 'drill' | 'mill') => tools.filter((t) => t.type === type).sort((a, b) => Math.abs(a.diameter - d) - Math.abs(b.diameter - d))[0];
  let current: number | null = null;
  const selectTool = (d: number, type: 'drill' | 'mill') => {
    const t = toolFor(d, type);
    const n = t?.number ?? g.tool;
    if (n !== current) {
      lines.push(`(${t ? t.name : `D${d}`})`, `G0 Z${f(g.safeZ)}`, `T${n} M6`, `S${g.spindle} M3`);
      current = n;
    }
  };
  for (const face of ['front', 'back'] as const) {
    const items = op.items.filter((i) => i.face === face);
    if (!items.length) continue;
    lines.push(`(${face.toUpperCase()} FACE${face === 'back' ? ' — turn the panel over' : ''})`);
    const holes = items.filter((i): i is Extract<XncItem, { kind: 'hole' }> => i.kind === 'hole').sort((a, b) => a.d - b.d);
    for (const h of holes) {
      selectTool(h.d, 'drill');
      const p = tf.apply(h.x, h.y);
      lines.push(`G81 X${f(p.x)} Y${f(p.y)} Z${f(-h.depth)} R${f(2)} F${g.plungeFeed}`);
    }
    if (holes.length) lines.push('G80');
    for (const it of items) {
      if (it.kind === 'hole') continue;
      const d = it.kind === 'groove' ? it.width : it.toolD;
      selectTool(d, 'mill');
      const path =
        it.kind === 'groove' ? [{ x: it.x1, y: it.y1 }, { x: it.x2, y: it.y2 }]
        : it.kind === 'pocket' ? pocketPath(it.x, it.y, it.w, it.h, it.toolD)
        : it.closed ? [...it.points, it.points[0]!] : it.points;
      const pts = path.map((q) => tf.apply(q.x, q.y));
      lines.push(`G0 Z${f(g.safeZ)}`, `G0 X${f(pts[0]!.x)} Y${f(pts[0]!.y)}`, `G1 Z${f(-it.depth)} F${g.plungeFeed}`);
      for (const q of pts.slice(1)) lines.push(`G1 X${f(q.x)} Y${f(q.y)} F${g.feed}`);
      lines.push(`G0 Z${f(g.safeZ)}`);
    }
  }
  const edge = op.items.filter((i): i is Extract<XncItem, { kind: 'hole' }> => i.kind === 'hole' && i.face !== 'front' && i.face !== 'back');
  if (edge.length) {
    lines.push('(HORIZONTAL DRILLING — face, position along edge, height, diameter, depth)');
    for (const h of edge) lines.push(`(${h.face.toUpperCase()} X${f(h.x)} Z${f(h.z)} D${f(h.d)} DEPTH${f(h.depth)})`);
  }
  lines.push(`G0 Z${f(g.safeZ)}`, 'M5', 'M30');
  return lines.join('\n') + '\n';
}

/** Zig-zag pocket clearing inside a rectangle, then one finishing pass along the walls. */
export function pocketPath(x: number, y: number, w: number, h: number, toolD: number): { x: number; y: number }[] {
  const r = toolD / 2;
  const x0 = x + r;
  const x1 = x + w - r;
  const y0 = y + r;
  const y1 = y + h - r;
  if (x1 < x0 || y1 < y0) return [{ x: x + w / 2, y: y + h / 2 }, { x: x + w / 2, y: y + h / 2 }];
  const step = toolD * 0.7;
  const pts: { x: number; y: number }[] = [];
  let dir = 0;
  for (let yy = y0; yy <= y1 + 1e-9; yy += step) {
    pts.push(dir === 0 ? { x: x0, y: yy } : { x: x1, y: yy }, dir === 0 ? { x: x1, y: yy } : { x: x0, y: yy });
    dir = 1 - dir;
  }
  pts.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 });
  return pts;
}
