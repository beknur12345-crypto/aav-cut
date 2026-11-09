/**
 * Postprocessors: turn a cutting plan into files for machines and CAM software.
 * Generic formats ship here; vendor saw formats (HOLZMA, SCM, Biesse…) plug into the same
 * registry once their file specifications are available.
 */
import type { ClOperation, CuttingResult, SheetOperation } from '../project';
import { rectPoly, writeDxf, type DxfEntity } from './dxf';

export interface GcodeSettings {
  spindle: number;
  feed: number;
  plungeFeed: number;
  safeZ: number;
  tool: number;
  decimals: number;
}
export const DEFAULT_GCODE: GcodeSettings = { spindle: 18000, feed: 6000, plungeFeed: 1500, safeZ: 20, tool: 1, decimals: 3 };

export interface ExportFile { name: string; mime: string; content: string }

export type PostprocessorId = 'dxf' | 'csv' | 'sawXml' | 'gcode' | 'bandCsv';
export interface Postprocessor { id: PostprocessorId; label: string; ops: ('CS' | 'CN' | 'CL')[] }

export const POSTPROCESSORS: Postprocessor[] = [
  { id: 'dxf', label: 'DXF (CAD/CAM, all sheets)', ops: ['CS', 'CN'] },
  { id: 'csv', label: 'CSV cutting list (placements per sheet)', ops: ['CS', 'CN'] },
  { id: 'sawXml', label: 'XML saw sequence (patterns + commands)', ops: ['CS'] },
  { id: 'gcode', label: 'ISO G-code nesting (CNC router)', ops: ['CN'] },
  { id: 'bandCsv', label: 'CSV band cutting list', ops: ['CL'] },
];

/** Vendor saw/CNC formats seen in the reference product; each needs its vendor file specification. */
export const VENDOR_MACHINES = [
  'HOLZMA (*.ptx)', 'HOLZMA CadMatic 4.x', 'HOLZMA CadMatic 3.x', 'Giben GVisionXP', 'Giben G57', 'Giben GDrive', 'SCM WinCut v5', 'SCM MaestroCut',
  'KDT KS33X v4.4', 'KDT (*.qk)', 'KDT XML', 'Biesse Selco OSI', 'Biesse NC300', 'Felder Format4 PC6', 'Felder Format4 PC7', 'Felder F4Classic',
  'Homag CHF 41/44/44 (NPS400)', 'FastPanel', 'Scheer (Pa)', 'Nanxing CutSawFG', 'Nanxing NXCutSaw', 'Shelling (MCS)', 'AES Alpha (SS)', 'Altendorf ELMO', 'Lisec (XOpt)',
];

type Pattern = CuttingResult['patterns'][number];

const fileBase = (op: { name: string }, prefix: string) => `${prefix}${op.name || 'operation'}`.replace(/[^\p{L}\p{N}_ -]+/gu, '_').trim() || 'operation';
const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote separators.
  const guarded = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[;"\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

function partName(op: SheetOperation, partId: string) {
  return op.parts.find((p) => p.id === partId)?.name ?? '';
}

export function sheetsDxf(op: SheetOperation, result: CuttingResult): string {
  const entities: DxfEntity[] = [];
  let offsetX = 0;
  // Sheets side by side, 200 mm apart; DXF y grows upwards, so flip the layout vertically.
  result.patterns.forEach((pat, i) => {
    const flip = (y: number, h: number) => pat.width - y - h;
    entities.push(rectPoly('SHEET', offsetX, 0, pat.length, pat.width));
    entities.push({ type: 'TEXT', layer: 'TEXT', x: offsetX, y: pat.width + 30, h: 40, text: `Sheet ${i + 1} x${pat.count}  ${pat.length}x${pat.width}` });
    for (const p of pat.placements) {
      entities.push(rectPoly('PARTS', offsetX + p.x, flip(p.y, p.width), p.length, p.width));
      entities.push({ type: 'TEXT', layer: 'TEXT', x: offsetX + p.x + 10, y: flip(p.y, p.width) + 10, h: Math.min(30, p.width / 3), text: `${p.no} ${partName(op, p.partId)} ${p.length}x${p.width}` });
    }
    for (const o of pat.offcuts) entities.push(rectPoly('OFFCUTS', offsetX + o.x, flip(o.y, o.width), o.length, o.width));
    for (const c of pat.cuts) entities.push({ type: 'LINE', layer: c.trim ? 'TRIM' : 'CUTS', x1: offsetX + c.x1, y1: pat.width - c.y1, x2: offsetX + c.x2, y2: pat.width - c.y2 });
    offsetX += pat.length + 200;
  });
  return writeDxf(entities);
}

export function sheetsCsv(op: SheetOperation, result: CuttingResult): string {
  const rows = [['Sheet', 'Count', 'SheetLength', 'SheetWidth', 'PartNo', 'Name', 'X', 'Y', 'Length', 'Width', 'Rotated']];
  result.patterns.forEach((pat, i) => {
    for (const p of pat.placements) rows.push([String(i + 1), String(pat.count), String(pat.length), String(pat.width), String(p.no), partName(op, p.partId), String(p.x), String(p.y), String(p.length), String(p.width), p.rotated ? '1' : '0']);
  });
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function sawXml(op: SheetOperation, result: CuttingResult, projectName: string): string {
  const perPackage = Math.max(1, Math.floor(op.params.packageHeight / Math.max(1, op.params.thickness)));
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<cuttingPlan project="${xml(projectName)}" material="${xml(op.name)}" thickness="${op.params.thickness}" kerf="${op.params.kerf}" sheetsPerPackage="${perPackage}">`];
  result.patterns.forEach((pat: Pattern, i) => {
    out.push(`  <pattern no="${i + 1}" count="${pat.count}" packages="${Math.ceil(pat.count / perPackage)}" length="${pat.length}" width="${pat.width}" trimLength="${pat.trimLength ?? 0}" trimWidth="${pat.trimWidth ?? 0}">`);
    for (const c of pat.commands) out.push(`    <cmd no="${c.no}" code="${c.cmd}" size="${c.size}" count="${c.count}"${c.partNo ? ` part="${c.partNo}"` : ''}/>`);
    for (const p of pat.placements) out.push(`    <part no="${p.no}" name="${xml(partName(op, p.partId))}" x="${p.x}" y="${p.y}" length="${p.length}" width="${p.width}" rotated="${p.rotated}"/>`);
    out.push('  </pattern>');
  });
  out.push('</cuttingPlan>');
  return out.join('\n') + '\n';
}

/**
 * ISO G-code for one nested sheet: each part is contoured on the outside (tool radius offset),
 * in nearest-neighbour order, small parts first so they are cut while the sheet is still rigid.
 */
export function nestingGcode(op: SheetOperation & { type: 'CN' }, pat: Pattern, g: GcodeSettings): string {
  const r = op.cn.millDiameter / 2;
  const depth = op.params.thickness + Math.max(0, op.cn.millProtrusion);
  const f = (v: number) => v.toFixed(g.decimals);
  const lines = [
    `(${op.name} ${pat.length}x${pat.width} t=${op.params.thickness})`,
    'G21 G90 G17 G40 G49',
    `T${g.tool} M6`,
    `S${g.spindle} M3`,
    `G0 Z${f(g.safeZ)}`,
  ];
  const parts = [...pat.placements].sort((a, b) => a.length * a.width - b.length * b.width);
  const ordered: typeof parts = [];
  let cx = 0;
  let cy = 0;
  while (parts.length) {
    // Small parts first; within similar sizes, nearest next.
    const smallest = parts[0]!.length * parts[0]!.width;
    const candidates = parts.filter((p) => p.length * p.width <= smallest * 1.5);
    candidates.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const next = candidates[0]!;
    ordered.push(next);
    parts.splice(parts.indexOf(next), 1);
    cx = next.x;
    cy = next.y;
  }
  const passes: { z: number; label: string }[] = [];
  if (op.cn.preCutUse) passes.push({ z: -Math.max(0.5, op.params.thickness + op.cn.preCutProtrusion), label: op.cn.preCutName });
  passes.push({ z: -depth, label: op.cn.millName });
  for (const pass of passes) {
    lines.push(`(${pass.label})`);
    for (const p of ordered) {
      // Machine Y grows away from the operator; flip the drawing's top-left origin.
      const x0 = p.x - r;
      const y0 = pat.width - (p.y + p.width) - r;
      const x1 = p.x + p.length + r;
      const y1 = pat.width - p.y + r;
      lines.push(`(Part ${p.no})`, `G0 X${f(x0)} Y${f(y0)}`, `G1 Z${f(pass.z)} F${g.plungeFeed}`, `G1 X${f(x0)} Y${f(y1)} F${g.feed}`, `G1 X${f(x1)} Y${f(y1)}`, `G1 X${f(x1)} Y${f(y0)}`, `G1 X${f(x0)} Y${f(y0)}`, `G0 Z${f(g.safeZ)}`);
    }
  }
  lines.push('M5', 'G0 X0 Y0', 'M30');
  return lines.join('\n') + '\n';
}

export function bandCsv(op: ClOperation): string {
  const r = op.result;
  if (!r) return '';
  const rows = [['Band', 'Count', 'BandLength', 'PartNo', 'Name', 'X', 'Length']];
  r.patterns.forEach((pat, i) => {
    for (const pc of pat.pieces) rows.push([String(i + 1), String(pat.count), String(pat.length), String(pc.no), op.parts.find((p) => p.id === pc.partId)?.name ?? '', String(pc.x), String(pc.length)]);
  });
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** Runs a postprocessor; returns one or more files to download. */
export function runPostprocessor(id: PostprocessorId, op: SheetOperation | ClOperation, projectName: string, prefix: string, gcode: GcodeSettings): ExportFile[] {
  const base = fileBase(op, prefix);
  if (op.type === 'CL') return id === 'bandCsv' && op.result ? [{ name: `${base}.csv`, mime: 'text/csv', content: bandCsv(op) }] : [];
  const result = op.result;
  if (!result) return [];
  switch (id) {
    case 'dxf':
      return [{ name: `${base}.dxf`, mime: 'application/dxf', content: sheetsDxf(op, result) }];
    case 'csv':
      return [{ name: `${base}.csv`, mime: 'text/csv', content: sheetsCsv(op, result) }];
    case 'sawXml':
      return [{ name: `${base}.xml`, mime: 'application/xml', content: sawXml(op, result, projectName) }];
    case 'gcode':
      if (op.type !== 'CN') return [];
      return result.patterns.map((pat, i) => ({ name: `${base}_sheet${i + 1}.nc`, mime: 'text/plain', content: nestingGcode(op, pat, gcode) }));
    default:
      return [];
  }
}
