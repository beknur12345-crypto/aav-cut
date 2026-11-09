'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellClassParams, CellEditRequestEvent, CellStyle, ColDef, GetRowIdParams, GridApi, ValueFormatterParams, ValueParserParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { cuttingSize, elOps, isResultCurrent, parsePastedParts, totalCount } from '@/domain/calc';
import { INPUT_MODES, LIMITS, newId, newPart, type GrOperation, type Part, type SheetOperation, type SpOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, IconLink, ToolBtn, useUi } from '../ui';
import { useEditor } from './store';
import { INPUT_MODE_KEYS } from './labels';
import { PanelTools } from './PanelTools';
import { formatNum } from './format';
import { Ico } from '../Ico';

type Row = Part & { _no: number; _tc: number; _used: number | null; _cutL: number; _cutW: number; _area: number };
type SideKey = 't' | 'b' | 'l' | 'r';

const COLUMN_STORAGE = 'aav.partsColumns.v2';
const OPTIONAL = ['code', 'product', 'description', 'cutL', 'cutW', 'area', 'grooves', 'surface'] as const;
type Optional = (typeof OPTIONAL)[number];
const OPTIONAL_LABEL: Record<Optional, MessageKey> = {
  code: 'code', product: 'product', description: 'description', cutL: 'colCutL', cutW: 'colCutW', area: 'colAreaTip', grooves: 'colGrooves', surface: 'colSurface',
};
const DEFAULT_COLUMNS: Optional[] = ['product'];

function loadColumns(): Set<Optional> {
  try {
    const v = JSON.parse(localStorage.getItem(COLUMN_STORAGE) ?? 'null');
    if (Array.isArray(v)) return new Set(v.filter((x): x is Optional => (OPTIONAL as readonly string[]).includes(x)));
  } catch {
    /* storage unavailable */
  }
  return new Set(DEFAULT_COLUMNS);
}

const parseNum = (p: ValueParserParams) => {
  const n = Number(String(p.newValue ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : p.oldValue;
};
const parseInt0 = (p: ValueParserParams) => {
  const n = Math.round(Number(String(p.newValue ?? '').trim()));
  return Number.isFinite(n) && n >= 0 ? n : p.oldValue;
};

export function PartsGrid({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const op = doc.operations[opIndex] as SheetOperation;
  const update = useEditor((s) => s.update);
  const apiRef = useRef<GridApi<Row> | null>(null);
  const [visible, setVisible] = useState<Set<Optional>>(() => (typeof window === 'undefined' ? new Set(DEFAULT_COLUMNS) : loadColumns()));
  const [colsOpen, setColsOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE, JSON.stringify([...visible]));
    } catch {
      /* ignore */
    }
  }, [visible]);

  const els = useMemo(() => elOps(doc), [doc]);
  const elList = useMemo(() => [...els.values()], [els]);
  const grList = useMemo(() => doc.operations.filter((o): o is GrOperation => o.type === 'GR'), [doc.operations]);
  const spList = useMemo(() => doc.operations.filter((o): o is SpOperation => o.type === 'SP'), [doc.operations]);

  const used = useMemo(() => {
    if (!isResultCurrent(op, doc)) return null;
    const m = new Map<string, number>();
    for (const pat of op.result.patterns) for (const pl of pat.placements) m.set(pl.partId, (m.get(pl.partId) ?? 0) + pat.count);
    return m;
  }, [op, doc]);

  const rows: Row[] = useMemo(
    () =>
      op.parts.map((p, i) => {
        const s = cuttingSize(p, doc, els);
        const tc = totalCount(p, doc.products);
        return { ...p, _no: i + 1, _tc: tc, _used: used ? used.get(p.id) ?? 0 : null, _cutL: s.length, _cutW: s.width, _area: (s.length * s.width * tc) / 1e6 };
      }),
    [op.parts, doc, els, used],
  );
  const totals = useMemo(() => rows.reduce((a, r) => ({ qty: a.qty + r._tc, area: a.area + r._area }), { qty: 0, area: 0 }), [rows]);

  const selectedIds = () => apiRef.current?.getSelectedRows().map((r) => r.id) ?? [];
  const focusedIndex = () => apiRef.current?.getFocusedCell()?.rowIndex ?? -1;
  const mutateParts = useCallback((fn: (parts: Part[]) => void) => update((d) => fn((d.doc.operations[opIndex] as SheetOperation).parts)), [opIndex, update]);

  const defaultProduct = doc.products[0]?.id ?? null;
  const add = (at?: number) => {
    if (op.parts.length >= LIMITS.parts) return ui.toast(t('tooManyParts'), 'error');
    const part = newPart(defaultProduct);
    mutateParts((parts) => void parts.splice(at ?? parts.length, 0, part));
    pendingFocus.current = part.id;
  };

  const actions = {
    add: () => add(),
    insert: () => add(Math.max(0, focusedIndex())),
    clone: () => {
      const ids = new Set(selectedIds());
      if (!ids.size) return;
      mutateParts((parts) => {
        const copies = parts.filter((p) => ids.has(p.id)).map((p) => ({ ...structuredClone(p), id: newId('pt') }));
        const last = Math.max(...parts.map((p, i) => (ids.has(p.id) ? i : -1)));
        parts.splice(last + 1, 0, ...copies);
      });
    },
    remove: () => {
      const ids = new Set(selectedIds());
      if (!ids.size) return;
      mutateParts((parts) => {
        for (let i = parts.length - 1; i >= 0; i--) if (ids.has(parts[i]!.id)) parts.splice(i, 1);
      });
    },
    move: (dir: -1 | 1) => {
      const ids = new Set(selectedIds());
      if (!ids.size) return;
      mutateParts((parts) => {
        const order = dir === -1 ? parts.map((_, i) => i) : parts.map((_, i) => parts.length - 1 - i);
        for (const i of order) {
          const j = i + dir;
          if (ids.has(parts[i]!.id) && j >= 0 && j < parts.length && !ids.has(parts[j]!.id)) [parts[i], parts[j]] = [parts[j]!, parts[i]!];
        }
      });
    },
    paste: (text: string) => {
      const rowsIn = parsePastedParts(text);
      if (!rowsIn.length) return ui.toast(t('pasteNothing'), 'error');
      if (op.parts.length + rowsIn.length > LIMITS.parts) return ui.toast(t('tooManyParts'), 'error');
      mutateParts((parts) => void parts.push(...rowsIn.map((r) => ({ ...newPart(defaultProduct), ...r }))));
      ui.toast(t('pastedRows', { count: rowsIn.length }));
    },
    openPaste: () => { setPasteText(''); setPasteOpen(true); },
  };

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || !apiRef.current) return;
    const node = apiRef.current.getRowNode(id);
    if (!node || node.rowIndex == null) return;
    pendingFocus.current = null;
    apiRef.current.ensureIndexVisible(node.rowIndex);
    apiRef.current.setFocusedCell(node.rowIndex, 'length');
    apiRef.current.startEditingCell({ rowIndex: node.rowIndex, colKey: 'length' });
  }, [rows]);

  const onCellEditRequest = useCallback(
    (e: CellEditRequestEvent<Row>) => {
      const field = e.colDef.field as string;
      const id = e.data.id;
      mutateParts((parts) => {
        const p = parts.find((x) => x.id === id);
        if (!p) return;
        const refVal = (v: unknown) => (typeof v === 'string' && v ? v : null);
        if (field.startsWith('edges.')) p.edges[field.slice(6) as SideKey] = refVal(e.newValue);
        else if (field.startsWith('grooves.')) p.grooves[field.slice(8) as SideKey] = refVal(e.newValue);
        else if (field === 'surface.front' || field === 'surface.back') p.surface[field.slice(8) as 'front' | 'back'] = refVal(e.newValue);
        else if (field === 'length' || field === 'width') p[field] = Math.min(100000, Number(e.newValue) || 0);
        else if (field === 'qty') p.qty = Math.min(100000, Math.round(Number(e.newValue) || 0));
        else if (field === 'grain') p.grain = !!e.newValue;
        else if (field === 'productId') p.productId = refVal(e.newValue);
        else if (field === 'name' || field === 'code') p[field] = String(e.newValue ?? '').slice(0, field === 'name' ? 200 : 60);
        else if (field === 'description') p.description = String(e.newValue ?? '').slice(0, 1000);
      });
    },
    [mutateParts],
  );

  const fmt = (d = 1) => (p: ValueFormatterParams) => (p.value == null ? '' : formatNum(p.value as number, locale, d));

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const num = (field: string, headerName: string, tip: string, extra: Partial<ColDef<Row>> = {}): ColDef<Row> => ({
      field: field as ColDef<Row>['field'], headerName, headerTooltip: tip, editable: true, width: 82, type: 'numericColumn', cellClass: 'num', valueParser: parseNum, valueFormatter: fmt(), ...extra,
    });
    /** Reference column: pick an operation; shows its symbol, coloured for edgebands. */
    const refCol = (field: string, headerName: string, tip: string, list: { id: string; name: string }[], symbolOf: (id: string) => string, colorOf?: (id: string) => string): ColDef<Row> => ({
      field: field as ColDef<Row>['field'], headerName, headerTooltip: tip, editable: true, width: 58,
      cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['', ...list.map((o) => o.id)] },
      refData: Object.fromEntries([['', '—'], ...list.map((o) => [o.id, `${symbolOf(o.id)} · ${o.name}`])]),
      valueFormatter: (p: ValueFormatterParams) => (p.value ? symbolOf(p.value as string) : ''),
      cellStyle: (p: CellClassParams<Row>): CellStyle => (p.value && colorOf ? { color: '#fff', background: colorOf(p.value as string), textAlign: 'center', fontWeight: 700 } : { textAlign: 'center' }),
    });
    const elSym = (id: string) => els.get(id)?.params.symbol ?? '?';
    const elColor = (id: string) => els.get(id)?.params.color ?? '#999';
    const grSym = (id: string) => `G${grList.findIndex((g) => g.id === id) + 1}`;
    const spSym = (id: string) => `S${spList.findIndex((g) => g.id === id) + 1}`;
    const defs: (ColDef<Row> | false)[] = [
      { field: '_no', headerName: '№', width: 74, checkboxSelection: true, headerCheckboxSelection: true, cellClass: 'no', pinned: 'left' },
      num('length', t('colLength'), t('colLengthTip'), { width: 88 }),
      num('width', t('colWidth'), t('colWidthTip'), { width: 88 }),
      num('qty', t('colQty'), t('colQtyTip'), { width: 66, valueParser: parseInt0, valueFormatter: fmt(0) }),
      { field: 'grain', headerName: t('colTxt'), headerTooltip: t('colTxtTip'), editable: true, width: 56, cellDataType: 'boolean' },
      refCol('edges.t', t('colET'), t('colETTip'), elList, elSym, elColor),
      refCol('edges.b', t('colEB'), t('colEBTip'), elList, elSym, elColor),
      refCol('edges.l', t('colEL'), t('colELTip'), elList, elSym, elColor),
      refCol('edges.r', t('colER'), t('colERTip'), elList, elSym, elColor),
      { field: 'name', headerName: t('name'), headerTooltip: t('colNameTip'), editable: true, flex: 1, minWidth: 140 },
      visible.has('grooves') && refCol('grooves.t', 'GT', t('colGrooveTip'), grList, grSym),
      visible.has('grooves') && refCol('grooves.b', 'GB', t('colGrooveTip'), grList, grSym),
      visible.has('grooves') && refCol('grooves.l', 'GL', t('colGrooveTip'), grList, grSym),
      visible.has('grooves') && refCol('grooves.r', 'GR', t('colGrooveTip'), grList, grSym),
      visible.has('surface') && refCol('surface.front', t('colFront'), t('colSurfaceTip'), spList, spSym),
      visible.has('surface') && refCol('surface.back', t('colBack'), t('colSurfaceTip'), spList, spSym),
      visible.has('code') && { field: 'code', headerName: t('code'), editable: true, width: 100 },
      visible.has('product') && {
        field: 'productId', headerName: t('product'), headerTooltip: t('colProductTip'), editable: true, width: 140,
        cellEditor: 'agSelectCellEditor', cellEditorParams: { values: doc.products.map((p) => p.id) },
        refData: Object.fromEntries(doc.products.map((p) => [p.id, p.name])),
      },
      visible.has('description') && { field: 'description', headerName: t('description'), editable: true, width: 180 },
      visible.has('cutL') && { field: '_cutL', headerName: t('colCutL'), headerTooltip: t('colCutTip'), width: 90, cellClass: 'num', type: 'numericColumn', valueFormatter: fmt() },
      visible.has('cutW') && { field: '_cutW', headerName: t('colCutW'), headerTooltip: t('colCutTip'), width: 90, cellClass: 'num', type: 'numericColumn', valueFormatter: fmt() },
      visible.has('area') && { field: '_area', headerName: 'm²', headerTooltip: t('colAreaTip'), width: 80, cellClass: 'num', type: 'numericColumn', valueFormatter: fmt(3) },
      { field: '_tc', headerName: t('colTC'), headerTooltip: t('colTCTip'), width: 60, cellClass: 'num', type: 'numericColumn' },
      {
        field: '_used', headerName: t('colUQ'), headerTooltip: t('colUQTip'), width: 60, cellClass: 'num', type: 'numericColumn',
        cellClassRules: { 'text-red-600 font-semibold': (p) => p.data != null && p.data._used != null && p.data._used < p.data._tc },
        valueFormatter: (p: ValueFormatterParams) => (p.value == null ? '' : String(p.value)),
      },
    ];
    return defs.filter(Boolean) as ColDef<Row>[];
  }, [t, visible, doc.products, locale, els, elList, grList, spList]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeLink = (
    <button className="gl-link w-auto items-center" onClick={() => setModeOpen(true)} data-testid="input-mode">
      <Ico name="parts" /> {t('inputMode')}: {t(INPUT_MODE_KEYS[doc.inputMode])}
    </button>
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onPaste={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea')) return;
        e.preventDefault();
        actions.paste(e.clipboardData.getData('text'));
      }}
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (apiRef.current?.getEditingCells().length) return;
        if (mod && e.key === 'PageUp') { e.preventDefault(); actions.insert(); }
        else if (e.key === 'Insert' || (mod && e.key === 'Enter')) { e.preventDefault(); actions.add(); }
        else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); actions.clone(); }
        else if (e.key === 'Delete' && selectedIds().length) { e.preventDefault(); e.stopPropagation(); actions.remove(); }
        else if (mod && e.key === 'ArrowUp') { e.preventDefault(); actions.move(-1); }
        else if (mod && e.key === 'ArrowDown') { e.preventDefault(); actions.move(1); }
      }}
    >
      <PanelTools>
        <ToolBtn icon="properties" label={t('inputMode')} onClick={() => setModeOpen(true)} />
        <ToolBtn icon="up" label={t('moveUp')} onClick={() => actions.move(-1)} shortcut="Ctrl+↑" />
        <ToolBtn icon="down" label={t('moveDown')} onClick={() => actions.move(1)} shortcut="Ctrl+↓" />
        <ToolBtn icon="add" label={t('addPart')} onClick={actions.add} shortcut="Insert" testId="add-part" />
        <ToolBtn icon="clone" label={t('clone')} onClick={actions.clone} shortcut="Ctrl+K" />
        <ToolBtn icon="delete" label={t('delete')} onClick={actions.remove} shortcut="Del" />
        <ToolBtn icon="paste" label={t('pasteFromExcel')} onClick={actions.openPaste} shortcut="Ctrl+V" />
        <ToolBtn icon="columns" label={t('columnSettings')} onClick={() => setColsOpen(true)} shortcut="Ctrl+P" />
      </PanelTools>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center pt-6">
          {modeLink}
          <div className="mt-12 flex flex-col items-center gap-1.5">
            <IconLink icon="add" label={t('add')} onClick={actions.add} testId="add-part-empty" />
            <IconLink icon="paste" label={t('paste')} onClick={actions.openPaste} />
            <IconLink icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-2 py-0.5 text-sm">
            {modeLink}
            <span data-testid="parts-totals">
              {t('qtyTotal')}: <b className="tabular-nums">{totals.qty}</b> · {t('areaTotal')}: <b className="tabular-nums">{formatNum(totals.area, locale, 3)}</b> m²
            </span>
          </div>
          <div className="ag-theme-quartz min-h-0 flex-1" data-testid="parts-grid">
            <AgGridReact<Row>
              rowData={rows}
              columnDefs={columnDefs}
              getRowId={(p: GetRowIdParams<Row>) => p.data.id}
              readOnlyEdit
              onCellEditRequest={onCellEditRequest}
              rowSelection="multiple"
              suppressRowClickSelection
              singleClickEdit
              enterNavigatesVerticallyAfterEdit
              stopEditingWhenCellsLoseFocus
              tooltipShowDelay={400}
              onGridReady={(e) => (apiRef.current = e.api)}
            />
          </div>
        </>
      )}

      <Dialog open={colsOpen} onClose={() => setColsOpen(false)} title={t('columnSettings')} width={380} footer={<button className="btn" onClick={() => setColsOpen(false)}>{t('ok')}</button>}>
        <p className="mb-2 text-xs text-[#555]">{t('columnSettingsHint')}</p>
        {OPTIONAL.map((c) => (
          <label key={c} className="flex items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" checked={visible.has(c)} onChange={(e) => setVisible((v) => { const n = new Set(v); if (e.target.checked) n.add(c); else n.delete(c); return n; })} />
            {t(OPTIONAL_LABEL[c])}
          </label>
        ))}
        <button className="gl-link mt-2 w-auto" onClick={() => setVisible(new Set(DEFAULT_COLUMNS))}>{t('restoreDefaults')}</button>
      </Dialog>

      <Dialog open={modeOpen} onClose={() => setModeOpen(false)} title={t('inputMode')} width={460} footer={<button className="btn" onClick={() => setModeOpen(false)}>{t('ok')}</button>}>
        <fieldset className="space-y-1.5">
          {INPUT_MODES.map((m) => (
            <label key={m} className="flex items-start gap-2 text-sm">
              <input type="radio" name="inputMode" className="mt-1" checked={doc.inputMode === m} onChange={() => update((d) => void (d.doc.inputMode = m))} />
              <span>{t(INPUT_MODE_KEYS[m])}</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-xs text-[#555]">{t('inputModeHint')}</p>
      </Dialog>

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} title={t('pasteFromExcel')} width={560}
        footer={<><button className="btn" onClick={() => { actions.paste(pasteText); setPasteOpen(false); }}>{t('addParts')}</button><button className="btn" onClick={() => setPasteOpen(false)}>{t('cancel')}</button></>}>
        <p className="mb-2 text-sm text-[#444]">{t('pasteHint')}</p>
        <textarea className="input min-h-48 font-mono text-xs" aria-label={t('pasteFromExcel')} placeholder={'720\t560\t8\tSide\n564\t560\t4\tBottom'} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
      </Dialog>
    </div>
  );
}

