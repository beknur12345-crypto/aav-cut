'use client';
import { useMemo, useState } from 'react';
import { isSheetOp, LIMITS, newOperation, newPart, newProduct, type ElOperation, type Part } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, useUi } from '../ui';
import { useEditor } from './store';

type Target = 'length' | 'width' | 'qty' | 'name' | 'code' | 'grain' | 'et' | 'eb' | 'el' | 'er' | 'product' | 'material';
const TARGETS: Target[] = ['length', 'width', 'qty', 'name', 'code', 'grain', 'et', 'eb', 'el', 'er', 'product', 'material'];
const TARGET_KEYS: Record<Target, MessageKey> = {
  length: 'colLength', width: 'colWidth', qty: 'colQty', name: 'name', code: 'code', grain: 'colTxt', et: 'colET', eb: 'colEB', el: 'colEL', er: 'colER', product: 'product', material: 'material',
};
/** Header words recognised automatically (EN / UK / RU). */
const GUESS: Record<Target, RegExp> = {
  length: /^(l|len|length|довж|длин|l-th)/i, width: /^(w|wid|width|шир|w-th)/i, qty: /^(q|qty|quant|кільк|кол|к-сть|шт)/i, name: /^(name|назв|наимен|деталь)/i,
  code: /^(code|код|арт)/i, grain: /^(txt|grain|текст)/i, et: /^(et|кв|top)/i, eb: /^(eb|кн|bottom)/i, el: /^(el|кл|left)/i, er: /^(er|кп|right)/i,
  product: /^(product|виріб|издел)/i, material: /^(material|матер)/i,
};

type Cell = string | number | boolean | Date | null;

async function readFile(file: File): Promise<Cell[][]> {
  if (/\.(xlsx)$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file');
    return (await readXlsxFile(file)) as Cell[][];
  }
  const text = await file.text();
  const sep = text.includes('\t') ? '\t' : text.split('\n')[0]!.includes(';') ? ';' : ',';
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
}

export function ExcelImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const [rows, setRows] = useState<Cell[][] | null>(null);
  const [header, setHeader] = useState(true);
  const [map, setMap] = useState<(Target | '')[]>([]);
  const [target, setTarget] = useState<string>('new');
  const sheetOps = doc.operations.filter(isSheetOp);
  const width = rows ? Math.max(...rows.slice(0, 50).map((r) => r.length)) : 0;

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return ui.toast(t('importTooLarge'), 'error');
    try {
      const data = await readFile(file);
      setRows(data);
      const head = data[0] ?? [];
      const used = new Set<Target>();
      setMap(head.map((h) => {
        const g = TARGETS.find((tg) => !used.has(tg) && GUESS[tg].test(String(h ?? '').trim()));
        if (g) used.add(g);
        return g ?? '';
      }));
      setHeader(head.some((h) => typeof h === 'string' && Number.isNaN(Number(h))));
    } catch {
      ui.toast(t('excelReadFailed'), 'error');
    }
  };

  const parsed = useMemo(() => {
    if (!rows) return [];
    const col = (tg: Target) => map.indexOf(tg);
    const num = (v: Cell) => Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
    return rows.slice(header ? 1 : 0).map((r) => {
      const g = (tg: Target): Cell => (col(tg) >= 0 ? r[col(tg)] ?? null : null);
      return {
        length: num(g('length')), width: num(g('width')), qty: Math.max(1, Math.round(num(g('qty')) || 1)), name: String(g('name') ?? ''), code: String(g('code') ?? ''),
        grain: g('grain') == null ? true : /^(1|true|yes|так|да|x|\+)$/i.test(String(g('grain'))), edges: { t: g('et'), b: g('eb'), l: g('el'), r: g('er') },
        product: String(g('product') ?? '').trim(), material: String(g('material') ?? '').trim(),
      };
    }).filter((p) => p.length > 0 && p.width > 0);
  }, [rows, map, header]);

  const doImport = () => {
    if (!parsed.length) return ui.toast(t('pasteNothing'), 'error');
    if (map.indexOf('length') < 0 || map.indexOf('width') < 0) return ui.toast(t('mapLengthWidth'), 'error');
    if (parsed.length > LIMITS.parts) return ui.toast(t('tooManyParts'), 'error');
    let firstOp: string | null = null;
    update((d) => {
      const els = d.doc.operations.filter((o): o is ElOperation => o.type === 'EL');
      const elBySymbol = (v: Cell) => {
        const s = String(v ?? '').trim().toUpperCase();
        if (!s || s === '0') return null;
        // A number is an edgeband thickness in mm; a letter is the symbol of an edgeband operation.
        const thick = Number(s.replace(',', '.'));
        const isThickness = Number.isFinite(thick) && thick > 0;
        let el = isThickness ? els.find((e) => e.params.thickness === Math.min(20, thick)) : els.find((e) => e.params.symbol === s[0]);
        if (!el) {
          el = newOperation('EL', d.doc) as ElOperation;
          if (isThickness) {
            el.params.thickness = Math.min(20, thick);
            el.name = `Edgeband ${thick} mm`;
          } else el.params.symbol = s[0]!;
          d.doc.operations.push(el);
          els.push(el);
        }
        return el.id;
      };
      const productByName = (name: string) => {
        if (!name) return d.doc.products[0]?.id ?? null;
        let p = d.doc.products.find((x) => x.name === name);
        if (!p) { p = { ...newProduct(d.doc.products.length + 1), name }; d.doc.products.push(p); }
        return p.id;
      };
      const opFor = (material: string) => {
        if (target !== 'new' && target !== 'byMaterial') return d.doc.operations.find((o) => o.id === target);
        const name = target === 'byMaterial' && material ? material : 'Imported';
        let op = d.doc.operations.find((o) => isSheetOp(o) && o.name === name);
        if (!op) { op = newOperation('CS', d.doc); op.name = name; d.doc.operations.push(op); }
        return op;
      };
      for (const r of parsed) {
        const op = opFor(r.material);
        if (!op || !isSheetOp(op)) continue;
        firstOp ??= op.id;
        const part: Part = {
          ...newPart(productByName(r.product)), length: r.length, width: r.width, qty: r.qty, name: r.name.slice(0, 200), code: r.code.slice(0, 60), grain: r.grain,
          edges: { t: elBySymbol(r.edges.t), b: elBySymbol(r.edges.b), l: elBySymbol(r.edges.l), r: elBySymbol(r.edges.r) },
        };
        op.parts.push(part);
      }
    });
    if (firstOp) select({ op: firstOp });
    ui.toast(t('pastedRows', { count: parsed.length }));
    setRows(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('importsFromExcel')} width={880} testId="excel-dialog"
      footer={<><button className="btn" disabled={!parsed.length} onClick={doImport}>{t('import')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <div className="space-y-2 text-sm">
        <p className="text-[#444]">{t('excelHint')}</p>
        <input type="file" accept=".xlsx,.csv,.tsv,.txt" aria-label={t('chooseFile')} onChange={(e) => load(e.target.files?.[0])} data-testid="excel-file" />
        {rows && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> {t('firstRowIsHeader')}</label>
              <label className="flex items-center gap-1.5">{t('importInto')}
                <select className="input w-64" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">{t('newOperation')}</option>
                  <option value="byMaterial">{t('operationPerMaterial')}</option>
                  {sheetOps.map((o) => <option key={o.id} value={o.id}>({o.type}) {o.name}</option>)}
                </select>
              </label>
              <span className="text-[#555]">{t('rowsRecognised', { count: parsed.length })}</span>
            </div>
            <div className="max-h-[45vh] overflow-auto border border-[#c4c4c4]">
              <table className="gl-grid text-xs">
                <thead>
                  <tr>
                    {Array.from({ length: width }, (_, c) => (
                      <th key={c} className="!p-0.5">
                        <select aria-label={`${t('column')} ${c + 1}`} className="input !py-0 text-xs" value={map[c] ?? ''} onChange={(e) => setMap((m) => { const n = [...m]; n[c] = e.target.value as Target | ''; return n; })}>
                          <option value="">—</option>
                          {TARGETS.map((tg) => <option key={tg} value={tg}>{t(TARGET_KEYS[tg])}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r, i) => (
                    <tr key={i} className={header && i === 0 ? 'font-bold' : ''}>
                      {Array.from({ length: width }, (_, c) => <td key={c}>{r[c] instanceof Date ? (r[c] as Date).toLocaleDateString() : String(r[c] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
