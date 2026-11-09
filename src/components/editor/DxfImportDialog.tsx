'use client';
import { useState } from 'react';
import { readDxf, rectanglesFromDxf } from '@/domain/export/dxf';
import { isSheetOp, newOperation, newPart } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { Dialog, useUi } from '../ui';
import { useEditor } from './store';

const OTHER_FORMATS = ['PRO100 / 3D-Constructor (*.sto)', 'WOODY (*.wes, *.xml)', 'Bazis (*.obl, *.xml)', 'VBA macro export'];

/** "Import from other programs": parts from DXF rectangles (one closed rectangle = one part; layer = name). */
export function DxfImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const [rows, setRows] = useState<{ name: string; length: number; width: number; qty: number }[] | null>(null);
  const [target, setTarget] = useState('new');
  const sheetOps = doc.operations.filter(isSheetOp);

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return ui.toast(t('importTooLarge'), 'error');
    try {
      const r = rectanglesFromDxf(readDxf(await file.text()));
      if (!r.length) ui.toast(t('dxfNothing'), 'error');
      setRows(r);
    } catch {
      ui.toast(t('excelReadFailed'), 'error');
    }
  };

  const doImport = () => {
    if (!rows?.length) return;
    let opId = '';
    update((d) => {
      let op = d.doc.operations.find((o) => o.id === target);
      if (!op || !isSheetOp(op)) {
        op = newOperation('CS', d.doc);
        op.name = 'DXF import';
        d.doc.operations.push(op);
      }
      if (!isSheetOp(op)) return;
      opId = op.id;
      op.parts.push(...rows.map((r) => ({ ...newPart(d.doc.products[0]?.id ?? null), name: r.name.slice(0, 200), length: r.length, width: r.width, qty: r.qty })));
    });
    select({ op: opId });
    ui.toast(t('pastedRows', { count: rows.length }));
    setRows(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('importFromOtherPrograms')} width={640} testId="dxf-dialog"
      footer={<><button className="btn" disabled={!rows?.length} onClick={doImport}>{t('import')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <div className="space-y-2 text-sm">
        <p className="gl-section font-bold">DXF (AutoCAD and any CAD)</p>
        <p className="text-[#444]">{t('dxfPartsHint')}</p>
        <input type="file" accept=".dxf" aria-label={t('chooseFile')} data-testid="dxf-file" onChange={(e) => load(e.target.files?.[0])} />
        {rows && rows.length > 0 && (
          <>
            <label className="flex items-center gap-2">{t('importInto')}
              <select className="input w-64" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">{t('newOperation')}</option>
                {sheetOps.map((o) => <option key={o.id} value={o.id}>({o.type}) {o.name}</option>)}
              </select>
            </label>
            <div className="max-h-56 overflow-auto border border-[#c4c4c4]">
              <table className="gl-grid text-xs" data-testid="dxf-rows">
                <thead><tr><th>№</th><th>{t('name')}</th><th>{t('colLength')}</th><th>{t('colWidth')}</th><th>{t('colQty')}</th></tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}><td className="no">{i + 1}</td><td>{r.name}</td><td className="text-right">{r.length}</td><td className="text-right">{r.width}</td><td className="text-right">{r.qty}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
        <p className="gl-section mt-3 font-bold">{t('otherFormats')}</p>
        <ul className="list-disc pl-5 text-xs text-[#555]">{OTHER_FORMATS.map((f) => <li key={f}>{f}</li>)}</ul>
        <p className="text-xs text-[#555]">{t('otherFormatsText')}</p>
      </div>
    </Dialog>
  );
}
