'use client';
import { useMemo } from 'react';
import { grooveRows, type OperationCost } from '@/domain/calc';
import type { GrOperation, GrParams } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { CheckField, Description, Form, NumField, Section, TextField, useOp } from './forms';
import { DerivedTable } from './SimpleGrid';
import { useEditor } from './store';
import { formatNum } from './format';

/** Cross-section of the board with the groove, dimensioned like a shop drawing. */
function GrooveDiagram({ p }: { p: GrParams }) {
  const s = 4; // px per mm, capped below
  const w = Math.min(p.width, 30) * s;
  const d = Math.min(p.depth, 30) * s;
  const off = Math.min(p.offset, 40) * s;
  const x0 = 60;
  const y0 = 60;
  const boardH = Math.max(d + 30, 80);
  const gx = p.offsetInclusive ? x0 + off - w : x0 + off;
  return (
    <svg viewBox="0 0 420 200" className="h-[170px] w-full bg-white" role="img" aria-label="groove">
      <path d={`M${x0} ${y0} H${gx} V${y0 + d} H${gx + w} V${y0} H400 V${y0 + boardH} H${x0} Z`} fill="var(--gl-part)" stroke="#333" />
      <g stroke="#111" fontSize="14" fontFamily="Times New Roman, serif">
        <line x1={x0} y1={y0 - 25} x2={x0} y2={y0} /><line x1={p.offsetInclusive ? gx : gx} y1={y0 - 25} x2={p.offsetInclusive ? gx : gx} y2={y0} />
        <line x1={x0} y1={y0 - 18} x2={p.offsetInclusive ? gx + w : gx} y2={y0 - 18} />
        <text x={(x0 + gx) / 2} y={y0 - 24} textAnchor="middle" stroke="none">{p.offset}</text>
        <line x1={gx} y1={y0 - 8} x2={gx + w} y2={y0 - 8} />
        <text x={gx + w + 6} y={y0 - 4} stroke="none">{p.width}</text>
        <line x1={x0 - 12} y1={y0} x2={x0 - 12} y2={y0 + d} />
        <text x={x0 - 28} y={y0 + d / 2 + 5} stroke="none">{p.depth}</text>
      </g>
    </svg>
  );
}

export function GrParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const { op, set } = useOp<GrOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof GrParams>(k: K) => (v: GrParams[K]) => set((o) => void (o.params[k] = v));
  return (
    <Form>
      <div>
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <NumField label={t('width')} unit="mm" value={p.width} min={0.1} max={100} onChange={setP('width')} />
        <NumField label={t('depth')} unit="mm" value={p.depth} min={0.1} max={100} onChange={setP('depth')} />
        <NumField label={t('offset')} help={t('helpOffset')} unit="mm" value={p.offset} max={5000} onChange={setP('offset')} />
        <CheckField label={t('offsetInclusive')} help={t('helpOffsetInclusive')} checked={p.offsetInclusive} onChange={setP('offsetInclusive')} />
        <Description label={t('description')} value={op.description} onChange={(v) => set((o) => void (o.description = v), `desc:${op.id}`)} />
      </div>
      <div>
        <Section title={t('costGroup')} />
        <NumField label={t('priceOfMeterGroove')} value={p.pricePerMeter} onChange={setP('pricePerMeter')} />
        <NumField label={t('grooveLength')} unit="m" value={cost.workLength} readOnly testId="gr-length" />
        <NumField label={t('cost')} value={cost.cost} readOnly />
        <NumField label={t('sawThickness')} unit="mm" value={p.sawThickness} min={0.1} max={20} onChange={setP('sawThickness')} />
        <div className="mt-3"><GrooveDiagram p={p} /></div>
      </div>
    </Form>
  );
}

export function GrParts({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const doc = useEditor((s) => s.doc);
  const op = doc.operations[opIndex] as GrOperation;
  const rows = useMemo(() => grooveRows(doc, op), [doc, op]);
  return (
    <DerivedTable
      testId="gr-parts"
      rows={rows}
      empty={t('grNoParts')}
      cols={[
        { header: t('good'), cell: (r) => `(CS) ${r.opName} · №${r.partNo}`, className: 'w-64' },
        { header: t('colLength'), cell: (r) => formatNum(r.length, locale, 1), num: true },
        { header: t('colWidth'), cell: (r) => formatNum(r.width, locale, 1), num: true },
        { header: t('sides'), cell: (r) => r.sides },
        { header: t('colTC'), cell: (r) => r.tc, num: true },
        { header: t('grooveLength'), cell: (r) => formatNum(r.grooveLength, locale, 3), num: true },
        { header: t('name'), cell: (r) => r.name },
      ]}
    />
  );
}
