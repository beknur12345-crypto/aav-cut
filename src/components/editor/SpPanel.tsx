'use client';
import { useMemo } from 'react';
import { surfaceRows, type OperationCost } from '@/domain/calc';
import type { SpOperation, SpParams } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { CheckField, Description, Form, NumField, RadioGroup, Section, TextField, useOp } from './forms';
import { DerivedTable } from './SimpleGrid';
import { useEditor } from './store';
import { formatNum } from './format';

export function SpParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const { op, set } = useOp<SpOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof SpParams>(k: K) => (v: SpParams[K]) => set((o) => void (o.params[k] = v));
  return (
    <Form>
      <div>
        <Section title={t('materialParameters')} />
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <CheckField label={t('accountingOfMaterial')} help={t('helpAccounting')} checked={p.accounting} onChange={setP('accounting')} />
        <NumField label={t('length')} unit="mm" value={p.length} onChange={setP('length')} />
        <NumField label={t('width')} unit="mm" value={p.width} onChange={setP('width')} />
        <NumField label={t('thickness')} unit="mm" value={p.thickness} max={100} onChange={setP('thickness')} />
        <NumField label={t('wasteMaterialPct')} unit="%" value={p.wastePct} max={100} onChange={setP('wastePct')} />
        <NumField label={t('wasteAtEdges')} unit="mm" value={p.wasteAtEdges} max={1000} onChange={setP('wasteAtEdges')} />
        <RadioGroup label={t('sizesMode')} value={p.sizesMode} onChange={setP('sizesMode')}
          options={[{ value: 'cutting', label: t('cuttingSize') }, { value: 'workpiece', label: t('sizeWorkpiece') }]} />
        <Description label={t('description')} value={op.description} onChange={(v) => set((o) => void (o.description = v), `desc:${op.id}`)} />
      </div>
      <div>
        <Section title={t('costGroup')} />
        <NumField label={t('priceOfMaterial')} value={p.materialPrice} onChange={setP('materialPrice')} />
        <NumField label={t('areaOfMaterial')} unit="m2" value={cost.materialArea} readOnly />
        <NumField label={t('costMaterial')} value={cost.costMaterial} readOnly />
        <NumField label={t('priceOfOperationM2')} value={p.operationPrice} onChange={setP('operationPrice')} />
        <NumField label={t('areaOfPartsWork')} unit="m2" value={cost.partsArea} readOnly testId="sp-area" />
        <NumField label={t('costOperation')} value={cost.costOperation} readOnly />
        <NumField label={t('cost')} value={cost.cost} readOnly />
      </div>
    </Form>
  );
}

export function SpParts({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const doc = useEditor((s) => s.doc);
  const op = doc.operations[opIndex] as SpOperation;
  const rows = useMemo(() => surfaceRows(doc, op), [doc, op]);
  return (
    <DerivedTable
      testId="sp-parts"
      rows={rows}
      empty={t('spNoParts')}
      cols={[
        { header: t('good'), cell: (r) => `(CS) ${r.opName} · №${r.partNo}`, className: 'w-64' },
        { header: t('colLength'), cell: (r) => formatNum(r.length, locale, 1), num: true },
        { header: t('colWidth'), cell: (r) => formatNum(r.width, locale, 1), num: true },
        { header: t('faces'), cell: (r) => r.faces, num: true },
        { header: t('colTC'), cell: (r) => r.tc, num: true },
        { header: 'm²', cell: (r) => formatNum(r.area, locale, 3), num: true },
        { header: t('name'), cell: (r) => r.name },
      ]}
    />
  );
}
