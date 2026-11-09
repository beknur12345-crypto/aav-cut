'use client';
import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellEditRequestEvent, ColDef, GridApi, ValueFormatterParams, ValueParserParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { effectiveTrims, isResultCurrent } from '@/domain/calc';
import { defaultSheet, LIMITS, type Sheet, type SheetOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { ToolBtn, useUi } from '../ui';
import { PanelTools } from './PanelTools';
import { useEditor } from './store';
import { formatNum } from './format';

type Row = Sheet & { _no: number; _area: number; _used: number | null; _left: number | null; _tl: number; _tw: number };

const parseNullableNum = (p: ValueParserParams) => {
  const s = String(p.newValue ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : p.oldValue;
};
const parseNum = (p: ValueParserParams) => {
  const n = Number(String(p.newValue ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : p.oldValue;
};

export function SheetsGrid({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const op = doc.operations[opIndex] as SheetOperation;
  const update = useEditor((s) => s.update);
  const apiRef = useRef<GridApi<Row> | null>(null);

  const used = useMemo(() => {
    if (!isResultCurrent(op, doc)) return null;
    const m = new Map<string, number>();
    for (const p of op.result.patterns) m.set(p.stockId, (m.get(p.stockId) ?? 0) + p.count);
    return m;
  }, [op, doc]);

  const rows: Row[] = useMemo(
    () => op.sheets.map((s, i) => {
      const tr = effectiveTrims(s, op.params);
      return { ...s, _no: i + 1, _area: (s.length * s.width) / 1e6, _used: used ? used.get(s.id) ?? 0 : null, _left: used ? s.qty - (used.get(s.id) ?? 0) : null, _tl: tr.trimLength, _tw: tr.trimWidth };
    }),
    [op.sheets, op.params, used],
  );

  const mutate = useCallback((fn: (sheets: Sheet[]) => void) => update((d) => fn((d.doc.operations[opIndex] as SheetOperation).sheets)), [opIndex, update]);
  const selected = () => new Set(apiRef.current?.getSelectedRows().map((r) => r.id) ?? []);

  const add = (offcut: boolean) => {
    if (op.sheets.length >= LIMITS.sheets) return;
    const s = defaultSheet();
    if (offcut) Object.assign(s, { name: t('offcut'), length: 1000, width: 600, qty: 1, isOffcut: true });
    mutate((sheets) => void sheets.push(s));
  };

  const onCellEditRequest = useCallback(
    (e: CellEditRequestEvent<Row>) => {
      const field = e.colDef.field as string;
      mutate((sheets) => {
        const s = sheets.find((x) => x.id === e.data.id);
        if (!s) return;
        if (field === 'name' || field === 'description') s[field] = String(e.newValue ?? '').slice(0, field === 'name' ? 200 : 1000);
        else if (field === 'length' || field === 'width') s[field] = Math.max(1, Math.min(100000, Number(e.newValue) || 1));
        else if (field === 'qty') s.qty = Math.max(0, Math.min(100000, Math.round(Number(e.newValue) || 0)));
        else if (field === 'minFill') s.minFill = Math.max(0, Math.min(100, Number(e.newValue) || 0));
        else if (field === '_tl') s.trimLength = e.newValue == null ? null : Math.min(200, Number(e.newValue));
        else if (field === '_tw') s.trimWidth = e.newValue == null ? null : Math.min(200, Number(e.newValue));
        else if (field === 'isOffcut') s.isOffcut = !!e.newValue;
      });
    },
    [mutate],
  );

  const fmt = (d = 1) => (p: ValueFormatterParams) => (p.value == null ? '' : formatNum(p.value as number, locale, d));
  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      { field: '_no', headerName: '№', width: 74, checkboxSelection: true, cellClass: 'no' },
      { field: 'name', headerName: t('name'), editable: true, flex: 1, minWidth: 160 },
      { field: 'length', headerName: t('colLength'), editable: true, width: 90, type: 'numericColumn', valueParser: parseNum, valueFormatter: fmt() },
      { field: 'width', headerName: t('colWidth'), editable: true, width: 90, type: 'numericColumn', valueParser: parseNum, valueFormatter: fmt() },
      {
        field: '_tl', headerName: 'TL', headerTooltip: t('colTLTip'), editable: true, width: 70, type: 'numericColumn', valueParser: parseNullableNum,
        valueFormatter: fmt(), cellClassRules: { 'text-slate-400': (p) => p.data?.trimLength == null },
      },
      {
        field: '_tw', headerName: 'TW', headerTooltip: t('colTWTip'), editable: true, width: 70, type: 'numericColumn', valueParser: parseNullableNum,
        valueFormatter: fmt(), cellClassRules: { 'text-slate-400': (p) => p.data?.trimWidth == null },
      },
      { field: '_area', headerName: 'm²', width: 76, type: 'numericColumn', valueFormatter: fmt(3) },
      { field: 'qty', headerName: t('colQty'), headerTooltip: t('colSheetQtyTip'), editable: true, width: 80, type: 'numericColumn', valueParser: parseNum, valueFormatter: fmt(0) },
      { field: '_used', headerName: t('colUQ'), headerTooltip: t('colSheetUQTip'), width: 70, type: 'numericColumn', valueFormatter: (p: ValueFormatterParams) => (p.value == null ? '' : String(p.value)) },
      { field: '_left', headerName: 'OQ', headerTooltip: t('colSheetOQTip'), width: 70, type: 'numericColumn', valueFormatter: (p: ValueFormatterParams) => (p.value == null ? '' : String(p.value)) },
      { field: 'minFill', headerName: 'MFill %', headerTooltip: t('colMFillTip'), editable: true, width: 84, type: 'numericColumn', valueParser: parseNum, valueFormatter: fmt(0) },
      { field: 'isOffcut', headerName: t('offcut'), headerTooltip: t('colOffcutTip'), editable: true, width: 80, cellDataType: 'boolean' },
    ],
    [t, locale], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTools>
        <ToolBtn
          icon="filter"
          label={t('removeUnusedMaterial')}
          disabled={!used}
          onClick={async () => {
            if (!used || !(await ui.confirm({ title: t('removeUnusedMaterial'), message: t('removeUnusedConfirm') }))) return;
            mutate((sheets) => { for (let i = sheets.length - 1; i >= 0; i--) if (!used.get(sheets[i]!.id)) sheets.splice(i, 1); });
          }}
        />
        <ToolBtn icon="sheets" label={t('addOffcut')} onClick={() => add(true)} />
        <ToolBtn icon="add" label={t('addSheet')} onClick={() => add(false)} testId="add-sheet" />
        <ToolBtn
          icon="delete"
          label={t('delete')}
          onClick={() => {
            const ids = selected();
            if (ids.size) mutate((sheets) => { for (let i = sheets.length - 1; i >= 0; i--) if (ids.has(sheets[i]!.id)) sheets.splice(i, 1); });
          }}
        />
      </PanelTools>
      <div className="ag-theme-quartz min-h-0 flex-1" data-testid="sheets-grid">
        <AgGridReact<Row>
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          readOnlyEdit
          onCellEditRequest={onCellEditRequest}
          rowSelection="multiple"
          suppressRowClickSelection
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          tooltipShowDelay={400}
          onGridReady={(e) => (apiRef.current = e.api)}
        />
      </div>
    </div>
  );
}
