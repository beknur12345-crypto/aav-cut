'use client';
import { useMemo, useState } from 'react';
import { edgeRows, type OperationCost } from '@/domain/calc';
import { LENGTH_ROUNDING, type ElOperation, type ElParams } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { Dialog, ToolBtn } from '../ui';
import { CheckField, Description, Form, NumField, Section, SelectField, TextField, useOp } from './forms';
import { LENGTH_ROUNDING_KEYS } from './labels';
import { PanelTools } from './PanelTools';
import { DerivedTable } from './SimpleGrid';
import { useEditor } from './store';
import { formatNum } from './format';

export function ElParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const { op, set } = useOp<ElOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof ElParams>(k: K) => (v: ElParams[K]) => set((o) => void (o.params[k] = v));
  const rounding = LENGTH_ROUNDING.map((r) => ({ value: r, label: t(LENGTH_ROUNDING_KEYS[r]) }));
  return (
    <Form>
      <div>
        <Section title={t('materialParameters')} />
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <CheckField label={t('accountingOfMaterial')} help={t('helpAccounting')} checked={p.accounting} onChange={setP('accounting')} />
        <NumField label={t('width')} unit="mm" value={p.width} max={200} onChange={setP('width')} />
        <NumField label={t('thickness')} help={t('helpEdgeThickness')} unit="mm" value={p.thickness} max={20} onChange={setP('thickness')} testId="el-thickness" />
        <NumField label={t('widthPremilling')} help={t('helpPremilling')} unit="mm" value={p.premillWidth} max={20} onChange={setP('premillWidth')} />
        <Section title={t('consumptionOfMaterials')} />
        <NumField label={t('wasteMaterialPct')} unit="%" value={p.wastePct} max={100} onChange={setP('wastePct')} />
        <NumField label={t('wasteAtEdges')} help={t('helpWasteAtEdges')} unit="mm" value={p.wasteAtEdges} max={1000} onChange={setP('wasteAtEdges')} />
        <NumField label={t('minPastedLength')} unit="mm" value={p.minPastedLength} onChange={setP('minPastedLength')} />
        <Section title={t('designation')} />
        <div className="gl-row">
          <label className="gl-l" htmlFor={`sym-${op.id}`}>{t('symbolForDesignation')}</label>
          <div className="gl-v"><input id={`sym-${op.id}`} className="input text-center font-bold" maxLength={1} value={p.symbol} onChange={(e) => setP('symbol')(e.target.value.toUpperCase().slice(0, 1))} /></div>
          <span className="w-24 text-sm">{t('onlyOneSymbol')}</span>
        </div>
        <div className="gl-row">
          <label className="gl-l" htmlFor={`col-${op.id}`}>{t('colorForDesignation')}</label>
          <div className="gl-v"><input id={`col-${op.id}`} type="color" className="h-7 w-full cursor-pointer border border-[#a4a4a4]" value={p.color} onChange={(e) => setP('color')(e.target.value)} /></div>
          <span className="gl-u" />
        </div>
        <SelectField label={t('markerLines')} value={p.markerLines} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} onChange={setP('markerLines')} />
        <Section title={t('constraintsGroup')} />
        <NumField label={t('minPerpendicularSide')} unit="mm" value={p.minPerpendicularSide} onChange={setP('minPerpendicularSide')} />
      </div>
      <div>
        <Section title={t('costGroup')} />
        <NumField label={t('priceOfMaterial')} value={p.materialPrice} onChange={setP('materialPrice')} />
        <SelectField label={t('roundingLengthMaterial')} value={p.roundingMaterial} options={rounding} onChange={setP('roundingMaterial')} wide />
        <NumField label={t('lengthOfMaterial')} unit="m" value={cost.materialLength} readOnly testId="el-material-length" />
        <NumField label={t('costMaterial')} value={cost.costMaterial} readOnly />
        <NumField label={t('priceOfOperationM')} value={p.operationPrice} onChange={setP('operationPrice')} />
        <SelectField label={t('roundingLengthWork')} value={p.roundingWork} options={rounding} onChange={setP('roundingWork')} wide />
        <NumField label={t('lengthOfEdgebandWork')} unit="m" value={cost.workLength} readOnly />
        <NumField label={t('costOperation')} value={cost.costOperation} readOnly />
        <NumField label={t('cost')} value={cost.cost} readOnly />
        <Description label={t('description')} value={op.description} onChange={(v) => set((o) => void (o.description = v), `desc:${op.id}`)} />
      </div>
    </Form>
  );
}

export function ElParts({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const op = doc.operations[opIndex] as ElOperation;
  const rows = useMemo(() => edgeRows(doc, op), [doc, op]);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const els = doc.operations.map((o, i) => ({ o, i })).filter((x): x is { o: ElOperation; i: number } => x.o.type === 'EL');
  const n = (v: number, d = 1) => formatNum(v, locale, d);
  return (
    <>
      <PanelTools>
        <ToolBtn icon="properties" label={t('symbolsAndColors')} onClick={() => setSymbolsOpen(true)} />
      </PanelTools>
      <DerivedTable
        testId="el-parts"
        rows={rows}
        empty={t('elNoParts')}
        cols={[
          { header: t('good'), cell: (r) => `(CS) ${r.opName} · №${r.partNo}`, className: 'w-64' },
          { header: t('colLength'), cell: (r) => n(r.length), num: true },
          { header: t('pastingL'), cell: (r) => r.pastL || '', num: true },
          { header: t('colWidth'), cell: (r) => n(r.width), num: true },
          { header: t('pastingW'), cell: (r) => r.pastW || '', num: true },
          { header: t('colTC'), cell: (r) => r.tc, num: true },
          { header: t('edgeLengthM'), cell: (r) => n(r.edgeLength, 3), num: true },
          { header: t('name'), cell: (r) => r.name },
        ]}
      />
      <Dialog open={symbolsOpen} onClose={() => setSymbolsOpen(false)} title={t('symbolsAndColors')} width={460} footer={<button className="btn" onClick={() => setSymbolsOpen(false)}>{t('ok')}</button>}>
        <table className="gl-grid">
          <thead><tr><th>{t('name')}</th><th className="w-20">{t('symbol')}</th><th className="w-24">{t('color')}</th></tr></thead>
          <tbody>
            {els.map(({ o, i }) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td><input aria-label={t('symbol')} className="input text-center font-bold" maxLength={1} value={o.params.symbol} onChange={(e) => update((d) => void ((d.doc.operations[i] as ElOperation).params.symbol = e.target.value.toUpperCase().slice(0, 1)))} /></td>
                <td><input aria-label={t('color')} type="color" className="h-6 w-full" value={o.params.color} onChange={(e) => update((d) => void ((d.doc.operations[i] as ElOperation).params.color = e.target.value))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </>
  );
}
