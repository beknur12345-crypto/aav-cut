'use client';
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellEditRequestEvent, ColDef, GridApi, ValueFormatterParams, ValueParserParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { useI18n } from '@/lib/i18n/client';
import { cx } from '../ui';
import { formatNum } from './format';

export type SimpleCol<R> = {
  field: keyof R & string;
  header: string;
  tip?: string;
  kind?: 'text' | 'num' | 'int' | 'bool' | 'select' | 'readonly';
  width?: number;
  flex?: number;
  options?: { value: string; label: string }[];
  digits?: number;
};

const parseNum = (p: ValueParserParams) => {
  const n = Number(String(p.newValue ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : p.oldValue;
};

/** Spreadsheet-style editable grid over immutable rows; edits are reported, never applied in place. */
export function SimpleGrid<R extends { id: string }>({
  rows, cols, onEdit, onReady, testId,
}: { rows: R[]; cols: SimpleCol<R>[]; onEdit: (id: string, field: keyof R & string, value: unknown) => void; onReady?: (api: GridApi<R & { _no: number }>) => void; testId?: string }) {
  const { locale } = useI18n();
  const data = useMemo(() => rows.map((r, i) => ({ ...r, _no: i + 1 })), [rows]);
  const columnDefs = useMemo<ColDef<R & { _no: number }>[]>(
    () => [
      { field: '_no' as never, headerName: '№', width: 70, checkboxSelection: true, cellClass: 'no' },
      ...cols.map((c): ColDef<R & { _no: number }> => {
        const base: ColDef<R & { _no: number }> = { field: c.field as never, headerName: c.header, headerTooltip: c.tip, width: c.width, flex: c.flex, editable: c.kind !== 'readonly' };
        if (c.kind === 'num' || c.kind === 'int' || c.kind === 'readonly')
          return {
            ...base, type: 'numericColumn', cellClass: 'num',
            valueParser: c.kind === 'int' ? (p) => { const n = Math.round(Number(p.newValue)); return Number.isFinite(n) && n >= 0 ? n : p.oldValue; } : parseNum,
            valueFormatter: (p: ValueFormatterParams) => (typeof p.value === 'number' ? formatNum(p.value, locale, c.digits ?? 2) : (p.value as string) ?? ''),
          };
        if (c.kind === 'bool') return { ...base, cellDataType: 'boolean' };
        if (c.kind === 'select')
          return { ...base, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: c.options?.map((o) => o.value) ?? [] }, refData: Object.fromEntries((c.options ?? []).map((o) => [o.value, o.label])) };
        return base;
      }),
    ],
    [cols, locale],
  );
  return (
    <div className="ag-theme-quartz h-full min-h-0" data-testid={testId}>
      <AgGridReact<R & { _no: number }>
        rowData={data}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        readOnlyEdit
        onCellEditRequest={(e: CellEditRequestEvent<R & { _no: number }>) => onEdit(e.data.id, e.colDef.field as keyof R & string, e.newValue)}
        rowSelection="multiple"
        suppressRowClickSelection
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        tooltipShowDelay={400}
        onGridReady={(e) => onReady?.(e.api)}
      />
    </div>
  );
}

/** Read-only list of parts derived from other operations (edgebanding, grooving, surface). */
export function DerivedTable<R extends { partId: string }>({ rows, cols, empty, testId }: { rows: R[]; cols: { header: string; cell: (r: R) => React.ReactNode; num?: boolean; className?: string }[]; empty: string; testId?: string }) {
  const [sel, setSel] = useState(0);
  return (
    <div className="h-full overflow-auto" tabIndex={0} data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); setSel((s) => (e.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, s + 1))); }
        if (e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); setSel((s) => (e.key === 'Home' ? 0 : Math.max(0, s - 1))); }
      }}>
      <table className="gl-grid">
        <thead><tr><th className="w-12">№</th>{cols.map((c) => <th key={c.header} className={c.className}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.partId}-${i}`} aria-selected={i === sel} onClick={() => setSel(i)}>
              <td className="no">{i + 1}</td>
              {cols.map((c) => <td key={c.header} className={cx(c.num && 'text-right tabular-nums')}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-6 text-center text-sm text-[#555]">{empty}</p>}
    </div>
  );
}
