'use client';
import { useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { parsePastedAccessories, type OperationCost } from '@/domain/calc';
import { LIMITS, newId, type Accessory, type OOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { Dialog, IconLink, ToolBtn, useUi } from '../ui';
import { useOp } from './forms';
import { SimpleGrid } from './SimpleGrid';
import { CatalogDialog } from './CatalogDialog';
import { useEditor } from './store';
import { formatMoney } from './format';
import { NumberInput } from '../ui';

export function OPanel({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const products = useEditor((s) => s.doc.products);
  const { op, set } = useOp<OOperation>(opIndex);
  const apiRef = useRef<GridApi | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const mult = op.ownerId ? products.find((p) => p.id === op.ownerId)?.qty ?? 1 : 1;
  const selectedIds = () => new Set((apiRef.current?.getSelectedRows() as Accessory[] | undefined)?.map((r) => r.id) ?? []);

  const addRows = (rows: Omit<Accessory, 'id'>[]) => {
    if (op.materials.length + rows.length > LIMITS.materials) return ui.toast(t('tooManyParts'), 'error');
    set((o) => void o.materials.push(...rows.map((r) => ({ ...r, id: newId('m') }))));
  };
  const move = (dir: -1 | 1) => {
    const ids = selectedIds();
    set((o) => {
      const arr = o.materials;
      const order = dir === -1 ? arr.map((_, i) => i) : arr.map((_, i) => arr.length - 1 - i);
      for (const i of order) {
        const j = i + dir;
        if (ids.has(arr[i]!.id) && j >= 0 && j < arr.length && !ids.has(arr[j]!.id)) [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-[360px_1fr] gap-4 p-2">
        <div className="space-y-1 text-sm">
          <div className="gl-row">
            <label className="gl-l" htmlFor={`own-${op.id}`}>{t('owner')}</label>
            <select id={`own-${op.id}`} className="input w-[240px]" value={op.ownerId ?? ''} onChange={(e) => set((o) => void (o.ownerId = e.target.value || null))}>
              <option value="">{t('projectOwner')}</option>
              {products.map((p, i) => <option key={p.id} value={p.id}>№{i + 1} {p.name}</option>)}
            </select>
          </div>
          <div className="gl-row"><span className="gl-l">{t('costMaterial')}</span><output className="input w-[120px] text-right">{formatMoney(cost.costMaterial / mult, locale)}</output></div>
          <div className="gl-row">
            <label className="gl-l" htmlFor={`cop-${op.id}`}>{t('costOperation')}</label>
            <NumberInput id={`cop-${op.id}`} className="!w-[120px]" value={op.costOperation} min={0} onChange={(v) => set((o) => void (o.costOperation = v))} />
          </div>
          <div className="gl-row"><span className="gl-l">{t('cost')}</span><output className="input w-[120px] text-right">{formatMoney(cost.cost / mult, locale)}</output></div>
          <div className="gl-row"><span className="gl-l">{t('costTimesQty', { qty: mult })}</span><output className="input w-[120px] text-right" data-testid="o-cost-total">{formatMoney(cost.cost, locale)}</output></div>
        </div>
        <div>
          <label className="gl-section block" htmlFor={`d-${op.id}`}>{t('description')}</label>
          <textarea id={`d-${op.id}`} className="input h-[112px]" maxLength={5000} value={op.description} onChange={(e) => set((o) => void (o.description = e.target.value), `desc:${op.id}`)} />
        </div>
      </div>
      <div className="gl-tabbar !min-h-[30px] border-y border-[#a4a4a4] bg-gradient-to-b from-[#e2e2e2] to-[#c8c8c8]">
        <span className="text-[17px]">{t('materials')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolBtn icon="up" label={t('moveUp')} onClick={() => move(-1)} />
          <ToolBtn icon="down" label={t('moveDown')} onClick={() => move(1)} />
          <ToolBtn icon="add" label={t('add')} onClick={() => addRows([{ code: '', name: t('newItem'), unit: t('pcs'), qty: 1, price: 0 }])} testId="o-add" />
          <ToolBtn icon="catalog" label={t('catalogOfGoods')} onClick={() => setCatalogOpen(true)} />
          <ToolBtn icon="paste" label={t('paste')} onClick={() => { setPasteText(''); setPasteOpen(true); }} />
          <ToolBtn icon="delete" label={t('delete')} onClick={() => { const ids = selectedIds(); set((o) => void (o.materials = o.materials.filter((m) => !ids.has(m.id)))); }} />
          <ToolBtn icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {op.materials.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 pt-6">
            <IconLink icon="add" label={t('add')} onClick={() => addRows([{ code: '', name: t('newItem'), unit: t('pcs'), qty: 1, price: 0 }])} />
            <IconLink icon="paste" label={t('paste')} onClick={() => { setPasteText(''); setPasteOpen(true); }} />
            <IconLink icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
          </div>
        ) : (
          <SimpleGrid<Accessory & { sum: number }>
            testId="o-materials"
            rows={op.materials.map((m) => ({ ...m, sum: m.qty * m.price }))}
            onReady={(api) => (apiRef.current = api as unknown as GridApi)}
            cols={[
              { field: 'code', header: t('code'), width: 120 },
              { field: 'name', header: t('name'), flex: 1 },
              { field: 'unit', header: t('unit'), width: 80 },
              { field: 'qty', header: t('colQty'), kind: 'num', width: 90, digits: 3 },
              { field: 'price', header: t('price'), kind: 'num', width: 110 },
              { field: 'sum', header: t('total'), kind: 'readonly', width: 120 },
            ]}
            onEdit={(id, field, value) => set((o) => {
              const m = o.materials.find((x) => x.id === id);
              if (!m) return;
              if (field === 'qty' || field === 'price') m[field] = Math.max(0, Number(value) || 0);
              else if (field === 'code' || field === 'name' || field === 'unit') m[field] = String(value ?? '').slice(0, field === 'unit' ? 10 : field === 'code' ? 60 : 200);
            })}
          />
        )}
      </div>
      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} title={t('paste')} width={560}
        footer={<><button className="btn" onClick={() => { const r = parsePastedAccessories(pasteText); if (r.length) addRows(r); else ui.toast(t('pasteNothing'), 'error'); setPasteOpen(false); }}>{t('add')}</button><button className="btn" onClick={() => setPasteOpen(false)}>{t('cancel')}</button></>}>
        <p className="mb-2 text-sm text-[#444]">{t('pasteAccessoriesHint')}</p>
        <textarea className="input min-h-40 font-mono text-xs" aria-label={t('paste')} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'H-01\tHinge 110°\tpcs\t8\t1.20'} />
      </Dialog>
      <CatalogDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} onPick={(m) => { addRows([{ code: m.code, name: m.name, unit: m.unit, qty: 1, price: m.price }]); setCatalogOpen(false); }} />
    </div>
  );
}
