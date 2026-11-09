'use client';
import { LABEL_FIELDS, type LabelField, type LbOperation, type LbParams as LbP } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Barcode } from '../Barcode';
import { IconLink, ToolBtn } from '../ui';
import { CheckField, NumField, RadioGroup, Section, SelectField, useOp } from './forms';
import { PanelTools } from './PanelTools';
import { useEditor, useEditorStore } from './store';
import { buildLabels } from '@/domain/labels';
import { buildZpl } from '@/domain/zpl';
import { download } from './PostprocessorDialog';
import { useUi } from '../ui';
import { useSave } from './ProjectEditor';

export const LABEL_FIELD_KEYS: Record<LabelField, MessageKey> = {
  barcode: 'lbBarcode', project: 'project', product: 'product', material: 'material', name: 'name', size: 'size', edges: 'edges', qty: 'colQty', number: 'partNumber', date: 'date',
};

function usePrintLabels(opId: string) {
  const store = useEditorStore();
  const save = useSave();
  return async () => {
    if (await save()) window.open(`/projects/${store.getState().id}/labels?op=${opId}`, '_blank', 'noopener');
  };
}

export function LbParams({ opIndex }: { opIndex: number }) {
  const { t } = useI18n();
  const { op, set } = useOp<LbOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof LbP>(k: K) => (v: LbP[K]) => set((o) => void (o.params[k] = v));
  const print = usePrintLabels(op.id);
  const ui = useUi();
  const doc = useEditor((st) => st.doc);
  const header = useEditor((st) => st.header);
  const number = useEditor((st) => st.number);
  const zpl = () => {
    const labels = buildLabels(doc, op, number);
    if (!labels.length) return ui.toast(t('noLabels'), 'error');
    download(`${header.name || 'labels'}.zpl`, 'text/plain', buildZpl(labels, op, header.name));
    ui.toast(t('labelsCount', { count: labels.length }));
  };
  return (
    <div className="h-full overflow-auto">
      <PanelTools>
        <ToolBtn icon="print" label={t('printLabels')} onClick={print} testId="lb-print" />
        <ToolBtn icon="commands" label={t('downloadZpl')} onClick={zpl} testId="lb-zpl" />
      </PanelTools>
      <div className="grid gap-8 p-3 lg:grid-cols-[440px_1fr]">
        <div>
          <SelectField label={t('dataSource')} value={p.source} wide onChange={setP('source')}
            options={[{ value: 'partsAndOffcuts', label: t('partsAndOffcuts') }, { value: 'parts', label: t('parts') }, { value: 'offcuts', label: t('offcuts') }]} />
          <RadioGroup label={t('printing')} value={p.printer} onChange={setP('printer')} options={[{ value: 'a4', label: t('onFormatA4') }, { value: 'label', label: t('onLabelPrinter') }]} />
          <NumField label={t('labelWidth')} unit="mm" value={p.labelWidth} max={500} onChange={setP('labelWidth')} />
          <NumField label={t('labelHeight')} unit="mm" value={p.labelHeight} max={500} onChange={setP('labelHeight')} />
          {p.printer === 'label' && (
            <>
              <SelectField label={t('printerDpi')} value={p.dpi} onChange={(v) => setP('dpi')(v as LbP['dpi'])} options={[203, 300, 600].map((d) => ({ value: d, label: `${d} dpi` }))} />
              <div className="mt-1">
                <label className="gl-section block" htmlFor={`zpl-${op.id}`}>{t('zplHeader')}</label>
                <textarea id={`zpl-${op.id}`} className="input h-20 font-mono text-xs" maxLength={500} placeholder={'^MMT\n^PR4'} value={p.zplHeader} onChange={(e) => set((o) => void (o.params.zplHeader = e.target.value), `zpl:${op.id}`)} />
              </div>
              <div className="mt-2"><IconLink icon="commands" label={t('downloadZpl')} onClick={zpl} /></div>
            </>
          )}
          {p.printer === 'a4' && (
            <>
              <Section title={t('layout')} />
              <NumField label={t('columns')} unit={t('pcs')} value={p.columns} min={1} max={10} onChange={(v) => setP('columns')(Math.round(v))} />
              <NumField label={t('rows')} unit={t('pcs')} value={p.rows} min={1} max={20} onChange={(v) => setP('rows')(Math.round(v))} />
              <NumField label={t('gap')} unit="mm" value={p.gap} max={50} onChange={setP('gap')} />
              <CheckField label={t('marginOfPage')} checked={p.pageMargin} onChange={setP('pageMargin')} />
              <SelectField label={t('borders')} value={p.borders} wide onChange={setP('borders')} options={[{ value: 'none', label: t('noBorders') }, { value: 'perimeter', label: t('perimeter') }]} />
            </>
          )}
        </div>
        <div>
          <Section title={t('parts')} />
          <CheckField label={t('printParts')} checked={p.printParts} onChange={setP('printParts')} />
          <CheckField label={t('forEachPart')} checked={p.forEachPart} onChange={setP('forEachPart')} />
          <CheckField label={t('onlyQtyAboveZero')} checked={p.onlyQtyAboveZero} onChange={setP('onlyQtyAboveZero')} />
          <Section title={t('offcuts')} />
          <CheckField label={t('printOffcuts')} checked={p.printOffcuts} onChange={setP('printOffcuts')} />
          <CheckField label={t('forEachOffcut')} checked={p.forEachOffcut} onChange={setP('forEachOffcut')} />
          <div className="mt-4"><IconLink icon="print" label={t('printLabels')} onClick={print} /></div>
        </div>
      </div>
    </div>
  );
}

export function LbTemplate({ opIndex }: { opIndex: number }) {
  const { t } = useI18n();
  const { op, set } = useOp<LbOperation>(opIndex);
  const p = op.params;
  const toggle = (f: LabelField, on: boolean) => set((o) => void (o.params.fields = on ? LABEL_FIELDS.filter((x) => x === f || o.params.fields.includes(x)) : o.params.fields.filter((x) => x !== f)));
  const scale = 4;
  return (
    <div className="grid h-full gap-6 overflow-auto p-3 lg:grid-cols-[300px_1fr]">
      <div>
        <Section title={t('labelContent')} />
        {LABEL_FIELDS.map((f) => (
          <label key={f} className="gl-row cursor-pointer gap-1.5">
            <input type="checkbox" checked={p.fields.includes(f)} onChange={(e) => toggle(f, e.target.checked)} />
            {t(LABEL_FIELD_KEYS[f])}
          </label>
        ))}
      </div>
      <div>
        <Section title={t('preview')} />
        <div className="mt-2 inline-block border border-[#333] bg-white p-1.5 text-[11px] leading-tight" style={{ width: p.labelWidth * scale, minHeight: p.labelHeight * scale }}>
          {p.fields.includes('barcode') && <Barcode value="NC1-000001" height={28} />}
          {p.fields.includes('project') && <div className="font-bold">{t('project')}: Kitchen 12</div>}
          {p.fields.includes('product') && <div>{t('product')}: Product1</div>}
          {p.fields.includes('material') && <div>White melamine 18 mm</div>}
          {p.fields.includes('name') && <div className="text-sm font-bold">Side</div>}
          {p.fields.includes('size') && <div className="text-sm font-bold">720 × 560</div>}
          {p.fields.includes('edges') && <div>{t('edges')}: A / A / – / –</div>}
          {p.fields.includes('qty') && <div>{t('colQty')}: 1/8</div>}
          {p.fields.includes('number') && <div>№ 1</div>}
          {p.fields.includes('date') && <div>{new Date().toLocaleDateString()}</div>}
        </div>
      </div>
    </div>
  );
}
