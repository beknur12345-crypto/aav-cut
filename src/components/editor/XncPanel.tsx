'use client';
import { useMemo, useRef, useState } from 'react';
import type { OperationCost } from '@/domain/calc';
import { readDxf, writeDxf, rectPoly, type DxfEntity } from '@/domain/export/dxf';
import { isSheetOp, newId, XNC_FACES, type XncFace, type XncItem, type XncOperation, type XncParams as XP } from '@/domain/project';
import { checkXnc, itemLength, itemsFromDxf, xncCost, xncDims, xncGcode } from '@/domain/xnc';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { cx, NumberInput, ToolBtn, useUi } from '../ui';
import { CheckField, Description, Form, NumField, Section, SelectField, TextField, useOp } from './forms';
import { PanelTools } from './PanelTools';
import { useEditor } from './store';
import { usePrefs } from './prefs';
import { download } from './PostprocessorDialog';
import { formatNum } from './format';

const FACE_KEYS: Record<XncFace, MessageKey> = { front: 'faceFront', back: 'faceBack', top: 'faceTop', bottom: 'faceBottom', left: 'faceLeft', right: 'faceRight' };
const WARN_KEYS: Record<string, MessageKey> = {
  sizeOutOfRange: 'xncWarnSize', holeOutside: 'xncWarnHoleOutside', holeNearEdge: 'xncWarnHoleNearEdge', throughHole: 'xncWarnThrough', edgeHoleOutside: 'xncWarnEdgeHole', itemOutside: 'xncWarnItemOutside',
};

export function XncParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const doc = useEditor((s) => s.doc);
  const { op, set } = useOp<XncOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof XP>(k: K) => (v: XP[K]) => set((o) => void (o.params[k] = v));
  const dims = xncDims(op, doc);
  const x = xncCost(op, doc);
  const partOptions = doc.operations.filter(isSheetOp).flatMap((o) => o.parts.map((part, i) => ({ value: `${o.id}|${part.id}`, label: `(${o.type}) ${o.name} · №${i + 1} ${part.name} ${part.length}×${part.width}` })));
  return (
    <Form>
      <div>
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <SelectField label={t('xncSelectPart')} wide value={p.partRef ? `${p.partRef.opId}|${p.partRef.partId}` : ''}
          options={[{ value: '', label: t('xncNoPart') }, ...partOptions]}
          onChange={(v) => set((o) => { const [opId, partId] = v.split('|'); o.params.partRef = opId && partId ? { opId, partId } : null; })} />
        <CheckField label={t('xncByDetailSize')} checked={p.byDetailSize} onChange={setP('byDetailSize')} />
        {dims.linked ? (
          <>
            <NumField label="DX" unit="mm" value={dims.dx} readOnly />
            <NumField label="DY" unit="mm" value={dims.dy} readOnly />
            <NumField label="DZ" unit="mm" value={dims.dz} readOnly />
            <NumField label={t('colQty')} unit={t('pcs')} value={dims.qty} readOnly />
          </>
        ) : (
          <>
            <NumField label="DX" unit="mm" value={p.dx} min={1} onChange={setP('dx')} testId="xnc-dx" />
            <NumField label="DY" unit="mm" value={p.dy} min={1} onChange={setP('dy')} />
            <NumField label="DZ" unit="mm" value={p.dz} min={1} max={500} onChange={setP('dz')} />
            <NumField label={t('colQty')} unit={t('pcs')} value={p.qty} onChange={(v) => setP('qty')(Math.round(v))} />
          </>
        )}
        <CheckField label={t('xncFrontSide')} checked={p.frontSide} onChange={setP('frontSide')} />
        <SelectField label={t('xncTurn')} value={p.turn} options={[0, 90, 180, 270].map((n) => ({ value: n, label: `${n}°` }))} onChange={(v) => setP('turn')(v as XP['turn'])} />
        <SelectField label={t('xncMirror')} value={p.mirror} options={[{ value: 'none', label: t('none') }, { value: 'h', label: t('horizontal') }, { value: 'v', label: t('vertical') }]} onChange={setP('mirror')} />
        <SelectField label={t('xncOrigin')} value={p.origin} options={(['LB', 'LT', 'RB', 'RT'] as const).map((o) => ({ value: o, label: o }))} onChange={setP('origin')} />
      </div>
      <div>
        <Section title={t('costGroup')} />
        <NumField label={t('xncPricePerHole')} value={p.pricePerHole} onChange={setP('pricePerHole')} />
        <NumField label={t('xncPricePerPocket')} value={p.pricePerPocket} onChange={setP('pricePerPocket')} />
        <NumField label={t('xncPricePerMeter')} value={p.pricePerMeter} onChange={setP('pricePerMeter')} />
        <NumField label={t('xncHoles')} unit={t('pcs')} value={x.holes} readOnly testId="xnc-holes" />
        <NumField label={t('xncMillLength')} unit="m" value={Math.round(x.meters * 1000) / 1000} readOnly />
        <NumField label={t('cost')} value={cost.cost} readOnly />
        <Description label={t('description')} value={op.description} onChange={(v) => set((o) => void (o.description = v), `desc:${op.id}`)} />
      </div>
    </Form>
  );
}

type Mode = 'select' | 'hole' | 'groove' | 'pocket' | 'mill';

export function XncTemplate({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const prefs = usePrefs();
  const doc = useEditor((s) => s.doc);
  const { op, set } = useOp<XncOperation>(opIndex);
  const { dx, dy, dz } = xncDims(op, doc);
  const [face, setFace] = useState<XncFace>('front');
  const [mode, setMode] = useState<Mode>('select');
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [tool, setTool] = useState({ d: 5, depth: 12, width: 4 });
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const edge = face !== 'front' && face !== 'back';
  // Edge faces are drawn as a strip: length along the edge × thickness.
  const W = edge ? (face === 'top' || face === 'bottom' ? dx : dy) : dx;
  const H = edge ? dz : dy;
  const warnings = useMemo(() => checkXnc(op, doc, prefs.xnc.constraints), [op, doc, prefs.xnc.constraints]);
  const warnFor = (id: string) => warnings.filter((w) => w.itemId === id);
  const items = op.items.filter((i) => i.face === face);
  const sel = op.items.find((i) => i.id === selId) ?? null;
  const pad = Math.max(W, H) * 0.05;
  const snap = (v: number) => Math.round(v * 2) / 2;

  const toPanel = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: snap(pt.x), y: snap(H - pt.y) }; // panel y grows upwards
  };

  const add = (it: XncItem) => {
    set((o) => void o.items.push(it));
    setSelId(it.id);
  };

  const onClick = (e: React.MouseEvent) => {
    const p = toPanel(e);
    if (!p || mode === 'select') return;
    if (mode === 'hole') {
      add(edge ? { id: newId('x'), kind: 'hole', face, x: p.x, y: 0, z: Math.min(dz, Math.max(0, p.y)), d: tool.d, depth: tool.depth } : { id: newId('x'), kind: 'hole', face, x: p.x, y: p.y, z: 0, d: tool.d, depth: tool.depth });
      return;
    }
    if (edge) return ui.toast(t('xncEdgeHolesOnly'), 'error');
    const pts = [...draft, p];
    if ((mode === 'groove' || mode === 'pocket') && pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      if (mode === 'groove') add({ id: newId('x'), kind: 'groove', face: face as 'front' | 'back', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: tool.width, depth: tool.depth });
      else add({ id: newId('x'), kind: 'pocket', face: face as 'front' | 'back', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(1, Math.abs(b.x - a.x)), h: Math.max(1, Math.abs(b.y - a.y)), depth: tool.depth, toolD: tool.d });
      setDraft([]);
    } else setDraft(pts);
  };

  const finishMill = (closed: boolean) => {
    if (draft.length >= 2) add({ id: newId('x'), kind: 'mill', face: face as 'front' | 'back', points: draft, closed, toolD: tool.d, depth: tool.depth });
    setDraft([]);
  };

  const mirror = (axis: 'h' | 'v') =>
    set((o) => {
      for (const it of o.items) {
        if (it.face !== face) continue;
        const mx = (x: number) => (axis === 'h' ? W - x : x);
        const my = (y: number) => (axis === 'v' ? H - y : y);
        if (it.kind === 'hole') { it.x = mx(it.x); if (edge) it.z = axis === 'v' ? dz - it.z : it.z; else it.y = my(it.y); }
        else if (it.kind === 'groove') { it.x1 = mx(it.x1); it.x2 = mx(it.x2); it.y1 = my(it.y1); it.y2 = my(it.y2); }
        else if (it.kind === 'pocket') { it.x = axis === 'h' ? W - it.x - it.w : it.x; it.y = axis === 'v' ? H - it.y - it.h : it.y; }
        else it.points = it.points.map((q) => ({ x: mx(q.x), y: my(q.y) }));
      }
    });

  const importDxf = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return ui.toast(t('importTooLarge'), 'error');
    try {
      const imported = itemsFromDxf(readDxf(await file.text()), { depth: tool.depth, grooveWidth: tool.width, toolD: tool.d }).map((i) => ({ ...i, face: (face === 'back' ? 'back' : 'front') as 'front' }));
      if (!imported.length) return ui.toast(t('dxfNothing'), 'error');
      set((o) => void o.items.push(...(imported as XncItem[])));
      ui.toast(t('dxfImported', { count: imported.length }));
    } catch {
      ui.toast(t('excelReadFailed'), 'error');
    }
  };

  const exportDxf = () => {
    const ents: DxfEntity[] = [rectPoly('PANEL', 0, 0, dx, dy)];
    for (const it of op.items.filter((i) => i.face === 'front')) {
      const layer = `${it.kind.toUpperCase()}_Z${'depth' in it ? it.depth : 0}`;
      if (it.kind === 'hole') ents.push({ type: 'CIRCLE', layer, x: it.x, y: it.y, r: it.d / 2 });
      else if (it.kind === 'groove') ents.push({ type: 'LINE', layer, x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2 });
      else if (it.kind === 'pocket') ents.push(rectPoly(layer, it.x, it.y, it.w, it.h));
      else ents.push({ type: 'POLY', layer, points: it.points, closed: it.closed });
    }
    download(`${op.name || 'xnc'}.dxf`, 'application/dxf', writeDxf(ents));
  };

  const modeBtn = (m: Mode, label: MessageKey, icon: Parameters<typeof ToolBtn>[0]['icon']) => (
    <ToolBtn icon={icon} label={t(label)} onClick={() => { setMode(m); setDraft([]); }} pressed={mode === m} testId={`xnc-mode-${m}`} />
  );

  const Y = (y: number) => H - y;
  const sw = Math.max(W, H) / 500;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTools>
        {modeBtn('select', 'xncSelect', 'properties')}
        {modeBtn('hole', 'xncAddHole', 'add')}
        {modeBtn('groove', 'xncAddGroove', 'opGR')}
        {modeBtn('pocket', 'xncAddPocket', 'opCS')}
        {modeBtn('mill', 'xncAddMill', 'template')}
        <ToolBtn icon="delete" label={t('delete')} onClick={() => { set((o) => void (o.items = o.items.filter((i) => i.id !== selId))); setSelId(null); }} disabled={!sel} shortcut="Del" />
        <ToolBtn icon="prev" label={t('xncMirrorH')} onClick={() => mirror('h')} />
        <ToolBtn icon="up" label={t('xncMirrorV')} onClick={() => mirror('v')} />
        <ToolBtn icon="import" label={t('xncImportDxf')} onClick={() => fileRef.current?.click()} />
        <ToolBtn icon="export" label={t('xncExportDxf')} onClick={exportDxf} />
        <ToolBtn icon="commands" label={t('xncExportGcode')} testId="xnc-gcode" onClick={() => download(`${op.name || 'xnc'}.nc`, 'text/plain', xncGcode(op, doc, prefs.postprocessor.gcode, prefs.xnc.tools))} />
        <input ref={fileRef} type="file" accept=".dxf" className="hidden" onChange={(e) => { importDxf(e.target.files?.[0]); e.target.value = ''; }} />
      </PanelTools>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#c4c4c4] bg-white px-2 py-1 text-sm">
        <span role="tablist" className="flex gap-0.5">
          {XNC_FACES.map((f) => (
            <button key={f} role="tab" aria-selected={face === f} onClick={() => { setFace(f); setDraft([]); setSelId(null); }} className={cx('border px-2 py-0.5 text-xs', face === f ? 'border-[#2f6fde] bg-[var(--gl-select)]' : 'border-[#c4c4c4] bg-[#f4f4f4]')}>
              {t(FACE_KEYS[f])} ({op.items.filter((i) => i.face === f).length})
            </button>
          ))}
        </span>
        <label className="flex items-center gap-1">{t('xncDiameter')} <NumberInput className="!w-16 !py-0" value={tool.d} min={0.5} max={200} onChange={(d) => setTool({ ...tool, d })} /></label>
        <label className="flex items-center gap-1">{t('depth')} <NumberInput className="!w-16 !py-0" value={tool.depth} min={0.1} max={500} onChange={(depth) => setTool({ ...tool, depth })} /></label>
        <label className="flex items-center gap-1">{t('xncGrooveWidth')} <NumberInput className="!w-14 !py-0" value={tool.width} min={0.5} max={100} onChange={(width) => setTool({ ...tool, width })} /></label>
        {mode === 'mill' && draft.length >= 2 && (
          <span className="flex gap-1"><button className="btn !py-0" onClick={() => finishMill(false)}>{t('xncFinishOpen')}</button><button className="btn !py-0" onClick={() => finishMill(true)}>{t('xncFinishClosed')}</button></span>
        )}
        <span className="ml-auto text-xs text-[#555]">{dx} × {dy} × {dz} mm · {t(`xncHint_${mode}` as MessageKey)}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px]">
        <div className="min-h-0 overflow-auto bg-white p-2">
          <svg ref={svgRef} viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`} className={cx('h-full max-h-full w-full', mode !== 'select' && 'cursor-crosshair')} onClick={onClick} role="img" aria-label={t(FACE_KEYS[face])} data-testid="xnc-canvas">
            <rect x={0} y={0} width={W} height={H} fill="var(--gl-part)" stroke="#333" strokeWidth={sw} />
            {Array.from({ length: Math.floor(W / 100) }, (_, i) => <line key={`gx${i}`} x1={(i + 1) * 100} y1={0} x2={(i + 1) * 100} y2={H} stroke="#00000018" strokeWidth={sw / 2} />)}
            {Array.from({ length: Math.floor(H / 100) }, (_, i) => <line key={`gy${i}`} x1={0} y1={H - (i + 1) * 100} x2={W} y2={H - (i + 1) * 100} stroke="#00000018" strokeWidth={sw / 2} />)}
            {items.map((it) => {
              const isSel = it.id === selId;
              const color = warnFor(it.id).length ? '#c0141b' : isSel ? '#1c4fa0' : '#222';
              const pick = (e: React.MouseEvent) => { if (mode === 'select') { e.stopPropagation(); setSelId(it.id); } };
              if (it.kind === 'hole') {
                const cy = edge ? Y(it.z) : Y(it.y);
                return <circle key={it.id} cx={it.x} cy={cy} r={it.d / 2} fill={isSel ? '#9cc7ff' : '#fff'} stroke={color} strokeWidth={sw * (isSel ? 2 : 1)} onClick={pick} data-testid="xnc-hole" />;
              }
              if (it.kind === 'groove') return <line key={it.id} x1={it.x1} y1={Y(it.y1)} x2={it.x2} y2={Y(it.y2)} stroke={isSel ? '#1c4fa0' : '#5b3a00'} strokeOpacity={0.7} strokeWidth={it.width} onClick={pick} />;
              if (it.kind === 'pocket') return <rect key={it.id} x={it.x} y={Y(it.y + it.h)} width={it.w} height={it.h} fill="#5b3a0055" stroke={color} strokeWidth={sw * (isSel ? 2 : 1)} onClick={pick} />;
              return <polyline key={it.id} points={(it.closed ? [...it.points, it.points[0]!] : it.points).map((q) => `${q.x},${Y(q.y)}`).join(' ')} fill="none" stroke={color} strokeWidth={Math.max(sw, it.toolD / 2)} strokeOpacity={0.8} onClick={pick} />;
            })}
            {draft.length > 0 && <polyline points={draft.map((q) => `${q.x},${Y(q.y)}`).join(' ')} fill="none" stroke="#1c4fa0" strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw * 2} />}
            {draft.map((q, i) => <circle key={i} cx={q.x} cy={Y(q.y)} r={sw * 4} fill="#1c4fa0" />)}
            <text x={0} y={H + pad * 0.7} fontSize={pad * 0.5} fill="#333">0,0</text>
            <text x={W} y={H + pad * 0.7} fontSize={pad * 0.5} fill="#333" textAnchor="end">{W}</text>
            <text x={-pad * 0.2} y={0} fontSize={pad * 0.5} fill="#333" textAnchor="end">{H}</text>
          </svg>
        </div>
        <aside className="flex min-h-0 flex-col border-l border-[#c4c4c4] bg-[var(--gl-bg)] text-sm">
          {sel ? <ItemProps item={sel} edge={edge} onChange={(fn) => set((o) => { const it = o.items.find((i) => i.id === sel.id); if (it) fn(it); })} /> : <p className="p-2 text-xs text-[#555]">{t('xncSelectHint')}</p>}
          <div className="min-h-0 flex-1 overflow-auto border-t border-[#c4c4c4]">
            <table className="gl-grid text-xs" data-testid="xnc-items">
              <thead><tr><th>№</th><th>{t('type')}</th><th>{t('xncFace')}</th><th>Ø/W</th><th>{t('depth')}</th></tr></thead>
              <tbody>
                {op.items.map((it, i) => (
                  <tr key={it.id} aria-selected={it.id === selId} onClick={() => { setSelId(it.id); setFace(it.face); }} className={cx(warnFor(it.id).length > 0 && 'text-[#c0141b]')}>
                    <td className="no">{i + 1}</td><td>{t(`xncKind_${it.kind}` as MessageKey)}</td><td>{t(FACE_KEYS[it.face])}</td>
                    <td className="text-right">{it.kind === 'hole' ? it.d : it.kind === 'groove' ? it.width : it.kind === 'pocket' ? formatNum(it.w, locale, 0) : formatNum(itemLength(it), locale, 0)}</td>
                    <td className="text-right">{it.depth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.length > 0 && (
            <ul className="max-h-28 overflow-auto border-t border-[#c4c4c4] bg-[#fff3bf] p-1.5 text-xs text-[#7a5b00]" data-testid="xnc-warnings">
              {warnings.map((w, i) => <li key={i}>⚠ {t(WARN_KEYS[w.key]!)}{w.itemId ? ` (№${op.items.findIndex((x) => x.id === w.itemId) + 1})` : ''}</li>)}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function ItemProps({ item, edge, onChange }: { item: XncItem; edge: boolean; onChange: (fn: (it: XncItem) => void) => void }) {
  const { t } = useI18n();
  const num = (label: string, value: number, apply: (v: number) => void, min = -100000, max = 100000) => (
    <label className="flex items-center justify-between gap-2 py-0.5">
      <span>{label}</span>
      <NumberInput className="!w-24 !py-0" value={value} min={min} max={max} onChange={apply} />
    </label>
  );
  return (
    <div className="p-2" data-testid="xnc-props">
      <div className="gl-section mb-1 font-bold">{t(`xncKind_${item.kind}` as MessageKey)}</div>
      {item.kind === 'hole' && (
        <>
          {num(edge ? t('xncAlongEdge') : 'X', item.x, (v) => onChange((it) => { if (it.kind === 'hole') it.x = v; }))}
          {edge ? num('Z', item.z, (v) => onChange((it) => { if (it.kind === 'hole') it.z = v; })) : num('Y', item.y, (v) => onChange((it) => { if (it.kind === 'hole') it.y = v; }))}
          {num(t('xncDiameter'), item.d, (v) => onChange((it) => { if (it.kind === 'hole') it.d = v; }), 0.5, 200)}
          {num(t('depth'), item.depth, (v) => onChange((it) => { if (it.kind === 'hole') it.depth = v; }), 0.1, 500)}
        </>
      )}
      {item.kind === 'groove' && (
        <>
          {num('X1', item.x1, (v) => onChange((it) => { if (it.kind === 'groove') it.x1 = v; }))}
          {num('Y1', item.y1, (v) => onChange((it) => { if (it.kind === 'groove') it.y1 = v; }))}
          {num('X2', item.x2, (v) => onChange((it) => { if (it.kind === 'groove') it.x2 = v; }))}
          {num('Y2', item.y2, (v) => onChange((it) => { if (it.kind === 'groove') it.y2 = v; }))}
          {num(t('width'), item.width, (v) => onChange((it) => { if (it.kind === 'groove') it.width = v; }), 0.5, 100)}
          {num(t('depth'), item.depth, (v) => onChange((it) => { if (it.kind === 'groove') it.depth = v; }), 0.1, 500)}
        </>
      )}
      {item.kind === 'pocket' && (
        <>
          {num('X', item.x, (v) => onChange((it) => { if (it.kind === 'pocket') it.x = v; }))}
          {num('Y', item.y, (v) => onChange((it) => { if (it.kind === 'pocket') it.y = v; }))}
          {num(t('length'), item.w, (v) => onChange((it) => { if (it.kind === 'pocket') it.w = v; }), 1)}
          {num(t('width'), item.h, (v) => onChange((it) => { if (it.kind === 'pocket') it.h = v; }), 1)}
          {num(t('depth'), item.depth, (v) => onChange((it) => { if (it.kind === 'pocket') it.depth = v; }), 0.1, 500)}
          {num(t('xncToolD'), item.toolD, (v) => onChange((it) => { if (it.kind === 'pocket') it.toolD = v; }), 1, 50)}
        </>
      )}
      {item.kind === 'mill' && (
        <>
          <p className="text-xs">{item.points.length} {t('xncPoints')}{item.closed ? ` · ${t('xncClosed')}` : ''}</p>
          {num(t('depth'), item.depth, (v) => onChange((it) => { if (it.kind === 'mill') it.depth = v; }), 0.1, 500)}
          {num(t('xncToolD'), item.toolD, (v) => onChange((it) => { if (it.kind === 'mill') it.toolD = v; }), 1, 50)}
        </>
      )}
    </div>
  );
}
