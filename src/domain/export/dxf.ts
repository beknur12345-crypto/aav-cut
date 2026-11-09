/** Minimal DXF (R12 ASCII) writer and reader — understood by every CAD/CAM program. */

export type DxfEntity =
  | { type: 'LINE'; layer: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'CIRCLE'; layer: string; x: number; y: number; r: number }
  | { type: 'TEXT'; layer: string; x: number; y: number; h: number; text: string }
  | { type: 'POLY'; layer: string; points: { x: number; y: number }[]; closed: boolean };

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
/** DXF text is single-line; strip control characters. */
const safe = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f]/g, '').slice(0, 250);

export function writeDxf(entities: DxfEntity[]): string {
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const e of entities) {
    const layer = safe(e.layer).replace(/[^\w-]/g, '_') || '0';
    if (e.type === 'LINE') out.push('0', 'LINE', '8', layer, '10', n(e.x1), '20', n(e.y1), '30', '0', '11', n(e.x2), '21', n(e.y2), '31', '0');
    else if (e.type === 'CIRCLE') out.push('0', 'CIRCLE', '8', layer, '10', n(e.x), '20', n(e.y), '30', '0', '40', n(e.r));
    else if (e.type === 'TEXT') out.push('0', 'TEXT', '8', layer, '10', n(e.x), '20', n(e.y), '30', '0', '40', n(e.h), '1', safe(e.text));
    else {
      out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', e.closed ? '1' : '0');
      for (const p of e.points) out.push('0', 'VERTEX', '8', layer, '10', n(p.x), '20', n(p.y), '30', '0');
      out.push('0', 'SEQEND', '8', layer);
    }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n') + '\r\n';
}

export const rectPoly = (layer: string, x: number, y: number, w: number, h: number): DxfEntity => ({
  type: 'POLY', layer, closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});

/** Shapes read from a DXF file (LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE). */
export type DxfShape =
  | { type: 'line'; layer: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; layer: string; x: number; y: number; r: number }
  | { type: 'poly'; layer: string; points: { x: number; y: number }[]; closed: boolean };

const MAX_SHAPES = 20000;

export function readDxf(text: string): DxfShape[] {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]!.trim()), lines[i + 1]!.trim()]);
  const shapes: DxfShape[] = [];
  let inEntities = false;
  let i = 0;
  const readEntity = () => {
    const type = pairs[i]![1];
    const data: [number, string][] = [];
    i++;
    while (i < pairs.length && pairs[i]![0] !== 0) data.push(pairs[i++]!);
    return { type, data };
  };
  const num = (data: [number, string][], code: number, fallback = 0) => {
    const f = data.find(([c]) => c === code);
    return f ? Number(f[1]) : fallback;
  };
  const layerOf = (data: [number, string][]) => data.find(([c]) => c === 8)?.[1] ?? '0';
  while (i < pairs.length && shapes.length < MAX_SHAPES) {
    const [code, value] = pairs[i]!;
    if (code === 2 && value === 'ENTITIES') { inEntities = true; i++; continue; }
    if (code === 0 && value === 'ENDSEC') { inEntities = false; i++; continue; }
    if (!inEntities || code !== 0) { i++; continue; }
    const { type, data } = readEntity();
    const layer = layerOf(data);
    if (type === 'LINE') shapes.push({ type: 'line', layer, x1: num(data, 10), y1: num(data, 20), x2: num(data, 11), y2: num(data, 21) });
    else if (type === 'CIRCLE') shapes.push({ type: 'circle', layer, x: num(data, 10), y: num(data, 20), r: num(data, 40) });
    else if (type === 'LWPOLYLINE') {
      const points: { x: number; y: number }[] = [];
      for (let k = 0; k < data.length; k++) if (data[k]![0] === 10) points.push({ x: Number(data[k]![1]), y: Number(data.slice(k).find(([c]) => c === 20)?.[1] ?? 0) });
      shapes.push({ type: 'poly', layer, points, closed: (num(data, 70) & 1) === 1 });
    } else if (type === 'POLYLINE') {
      const closed = (num(data, 70) & 1) === 1;
      const points: { x: number; y: number }[] = [];
      while (i < pairs.length && pairs[i]![1] === 'VERTEX') {
        const v = readEntity();
        points.push({ x: num(v.data, 10), y: num(v.data, 20) });
      }
      if (i < pairs.length && pairs[i]![1] === 'SEQEND') readEntity();
      shapes.push({ type: 'poly', layer, points, closed });
    }
  }
  return shapes.filter((s) => (s.type === 'poly' ? s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : Object.values(s).every((v) => typeof v !== 'number' || Number.isFinite(v))));
}

/** Axis-aligned rectangles in a DXF (closed 4-point polylines) → part sizes grouped by layer and size. */
export function rectanglesFromDxf(shapes: DxfShape[]): { name: string; length: number; width: number; qty: number }[] {
  const groups = new Map<string, { name: string; length: number; width: number; qty: number }>();
  for (const s of shapes) {
    if (s.type !== 'poly') continue;
    const pts = s.points.length === 5 && s.points[0]!.x === s.points[4]!.x && s.points[0]!.y === s.points[4]!.y ? s.points.slice(0, 4) : s.points;
    if (pts.length !== 4 || (!s.closed && s.points.length !== 5)) continue;
    const xs = [...new Set(pts.map((p) => Math.round(p.x * 100) / 100))];
    const ys = [...new Set(pts.map((p) => Math.round(p.y * 100) / 100))];
    if (xs.length !== 2 || ys.length !== 2) continue; // not axis-aligned
    const a = Math.abs(xs[1]! - xs[0]!);
    const b = Math.abs(ys[1]! - ys[0]!);
    const length = Math.max(a, b);
    const width = Math.min(a, b);
    if (length <= 0 || width <= 0) continue;
    const key = `${s.layer}|${length}|${width}`;
    const g = groups.get(key);
    if (g) g.qty++;
    else groups.set(key, { name: s.layer === '0' ? '' : s.layer, length, width, qty: 1 });
  }
  return [...groups.values()];
}
