'use client';
import { useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { inputHash, isResultCurrent, linearInput, totalCount, type OperationCost } from '@/domain/calc';
import type { LinResult } from '@/domain/optimizer/linear';
import { CL_COST_OPERATION_BY, LIMITS, newClPart, newId, ROUNDING_BANDS, type ClOperation, type ClParams as ClP, type ClPart, type ClStock as ClStockRow } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { cx, IconLink, ToolBtn, useUi } from '../ui';
import { CheckField, Form, NumField, Section, SelectField, TextField, useOp } from './forms';
import { CL_COST_BY_KEYS } from './labels';
import { PanelTools } from './PanelTools';
import { SimpleGrid } from './SimpleGrid';
import { useEditor } from './store';
import { useSave } from './ProjectEditor';
import { formatNum } from './format';
import { PostprocessorDialog } from './PostprocessorDialog';

const BAND_ROUND: Record<(typeof ROUNDING_BANDS)[number], MessageKey> = { whole: 'roundWhole', length2: 'roundLength2', length3: 'roundLength3', length4: 'roundLength4' };

export function ClParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const { op, set } = useOp<ClOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof ClP>(k: K) => (v: ClP[K]) => set((o) => void (o.params[k] = v));
  return (
    <Form>
      <div>
        <Section title={t('materialParameters')} />
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <NumField label={t('width')} unit="mm" value={p.width} onChange={setP('width')} />
        <NumField label={t('thickness')} unit="mm" value={p.thickness} max={500} onChange={setP('thickness')} />
        <Section title={t('costGroup')} />
        <NumField label={t('priceOfMaterial')} help={t('helpPricePerMeter')} value={p.materialPrice} onChange={setP('materialPrice')} />
        <NumField label={t('estimatedFill')} unit="%" value={p.estimatedFill} min={1} max={100} onChange={setP('estimatedFill')} />
        <NumField label={t('amountOfMaterial')} unit="m" value={cost.materialLength} readOnly />
        <NumField label={t('numberOfBands')} unit={t('pcs')} value={cost.sheets} readOnly />
        <CheckField label={t('costByBands')} checked={p.costByBands} onChange={setP('costByBands')} />
        <SelectField label={t('roundingBands')} value={p.roundingBands} options={ROUNDING_BANDS.map((r) => ({ value: r, label: t(BAND_ROUND[r]) }))} onChange={setP('roundingBands')} wide />
        <NumField label={t('costMaterialM')} value={cost.costMaterial} readOnly />
        <SelectField label={t('costOperationBy')} value={p.costOperationBy} options={CL_COST_OPERATION_BY.map((r) => ({ value: r, label: t(CL_COST_BY_KEYS[r]) }))} onChange={setP('costOperationBy')} wide />
        <NumField label={t('priceOfOperationMeter')} value={p.operationPrice} onChange={setP('operationPrice')} />
        <NumField label={t('costOperation')} value={cost.costOperation} readOnly />
        <Section title={t('offcutGroup')} />
        <NumField label={t('minOffcut')} unit="mm" value={p.minOffcut} onChange={setP('minOffcut')} />
        <NumField label={t('businessOffcutLength')} unit="m" value={p.businessOffcutLength} onChange={setP('businessOffcutLength')} />
        <CheckField label={t('offcutIncludesTrim')} checked={p.offcutIncludesTrim} onChange={setP('offcutIncludesTrim')} />
        <Section title={t('constraintsGroup')} />
        <NumField label={t('minPartSize')} unit="mm" value={p.minPartSize} onChange={setP('minPartSize')} />
      </div>
      <div>
        <Section title={t('cuttingParameters')} />
        <NumField label={t('sawThickness')} help={t('helpKerf')} unit="mm" value={p.kerf} max={20} onChange={setP('kerf')} />
        <NumField label={t('trimming')} help={t('helpTrimBand')} unit="mm" value={p.trim} max={200} onChange={setP('trim')} />
        <NumField label={t('packageHeight')} unit="mm" value={p.packageHeight} max={1000} onChange={setP('packageHeight')} />
        <NumField label={t('repetition')} unit={t('pcs')} value={p.repetition} min={1} max={1000} onChange={setP('repetition')} />
        <SelectField label={t('maxVarieties')} value={p.maxVarieties} options={[{ value: 0, label: t('notLimited') }, ...Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))]} onChange={setP('maxVarieties')} wide />
        <Section title={t('preferencesGroup')} />
        <CheckField label={t('combineParts')} checked={p.combineParts} onChange={setP('combineParts')} />
        <CheckField label={t('saveDrawings')} checked={p.saveDrawings} onChange={setP('saveDrawings')} />
        <NumField label={t('processingAllowance')} help={t('helpProcessingAllowance')} unit="mm" value={p.processingAllowance} onChange={setP('processingAllowance')} />
      </div>
    </Form>
  );
}

export function ClParts({ opIndex }: { opIndex: number }) {
  const { t } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const { op, set } = useOp<ClOperation>(opIndex);
  const apiRef = useRef<GridApi | null>(null);
  const used = useMemo(() => {
    if (!isResultCurrent(op, doc)) return null;
    const m = new Map<string, number>();
    for (const pat of op.result.patterns) for (const pc of pat.pieces) m.set(pc.partId, (m.get(pc.partId) ?? 0) + pat.count);
    return m;
  }, [op, doc]);
  const def = doc.products[0]?.id ?? null;
  const add = () => {
    if (op.parts.length >= LIMITS.parts) return;
    set((o) => void o.parts.push(newClPart(def)));
  };
  const paste = async () => {
    const text = await ui.prompt({ title: t('pasteFromExcel'), label: t('pasteBandHint') });
    if (!text) return;
    const rows = text.split(/\s*[\n|]\s*/).map((l) => l.split(/[\t;]/).map((c) => c.trim())).filter((c) => Number(c[0]?.replace(',', '.')) > 0);
    set((o) => void o.parts.push(...rows.map((c) => ({ ...newClPart(def), length: Number(c[0]!.replace(',', '.')), qty: Math.max(1, Math.round(Number(c[1]) || 1)), name: (c[2] ?? '').slice(0, 200) }))));
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTools>
        <ToolBtn icon="add" label={t('addPart')} onClick={add} testId="cl-add-part" />
        <ToolBtn icon="paste" label={t('pasteFromExcel')} onClick={paste} />
        <ToolBtn icon="delete" label={t('delete')} onClick={() => { const ids = new Set((apiRef.current?.getSelectedRows() as ClPart[] | undefined)?.map((r) => r.id)); set((o) => void (o.parts = o.parts.filter((p) => !ids.has(p.id)))); }} />
      </PanelTools>
      {op.parts.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 pt-10">
          <IconLink icon="add" label={t('add')} onClick={add} />
          <IconLink icon="paste" label={t('paste')} onClick={paste} />
        </div>
      ) : (
        <SimpleGrid<ClPart & { tc: number; uq: number | string }>
          testId="cl-parts"
          rows={op.parts.map((p) => ({ ...p, tc: totalCount(p, doc.products), uq: used ? used.get(p.id) ?? 0 : '' }))}
          onReady={(api) => (apiRef.current = api as unknown as GridApi)}
          cols={[
            { field: 'length', header: t('colLength'), kind: 'num', width: 110, digits: 1 },
            { field: 'qty', header: t('colQty'), kind: 'int', width: 80, digits: 0 },
            { field: 'name', header: t('name'), flex: 1 },
            { field: 'productId', header: t('product'), kind: 'select', width: 150, options: doc.products.map((p) => ({ value: p.id, label: p.name })) },
            { field: 'tc', header: t('colTC'), kind: 'readonly', width: 70, digits: 0 },
            { field: 'uq', header: t('colUQ'), kind: 'readonly', width: 70, digits: 0 },
          ]}
          onEdit={(id, field, value) => set((o) => {
            const p = o.parts.find((x) => x.id === id);
            if (!p) return;
            if (field === 'length') p.length = Math.min(100000, Math.max(0, Number(value) || 0));
            else if (field === 'qty') p.qty = Math.min(100000, Math.max(0, Math.round(Number(value) || 0)));
            else if (field === 'name') p.name = String(value ?? '').slice(0, 200);
            else if (field === 'productId') p.productId = (value as string) || null;
          })}
        />
      )}
    </div>
  );
}

export function ClStock({ opIndex }: { opIndex: number }) {
  const { t } = useI18n();
  const doc = useEditor((s) => s.doc);
  const { op, set } = useOp<ClOperation>(opIndex);
  const apiRef = useRef<GridApi | null>(null);
  const used = useMemo(() => {
    if (!isResultCurrent(op, doc)) return null;
    const m = new Map<string, number>();
    for (const pat of op.result.patterns) m.set(pat.stockId, (m.get(pat.stockId) ?? 0) + pat.count);
    return m;
  }, [op, doc]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTools>
        <ToolBtn icon="add" label={t('addBand')} onClick={() => set((o) => void o.sheets.push({ id: newId('sh'), name: t('band'), length: 2750, qty: 100, isOffcut: false }))} />
        <ToolBtn icon="sheets" label={t('addOffcut')} onClick={() => set((o) => void o.sheets.push({ id: newId('sh'), name: t('offcut'), length: 1000, qty: 1, isOffcut: true }))} />
        <ToolBtn icon="delete" label={t('delete')} onClick={() => { const ids = new Set((apiRef.current?.getSelectedRows() as ClStockRow[] | undefined)?.map((r) => r.id)); set((o) => void (o.sheets = o.sheets.filter((s) => !ids.has(s.id)))); }} />
      </PanelTools>
      <SimpleGrid<ClStockRow & { uq: number | string }>
        testId="cl-stock"
        rows={op.sheets.map((s) => ({ ...s, uq: used ? used.get(s.id) ?? 0 : '' }))}
        onReady={(api) => (apiRef.current = api as unknown as GridApi)}
        cols={[
          { field: 'name', header: t('name'), flex: 1 },
          { field: 'length', header: t('colLength'), kind: 'num', width: 110, digits: 1 },
          { field: 'qty', header: t('colQty'), kind: 'int', width: 90, digits: 0 },
          { field: 'uq', header: t('colUQ'), kind: 'readonly', width: 80, digits: 0 },
          { field: 'isOffcut', header: t('offcut'), kind: 'bool', width: 90 },
        ]}
        onEdit={(id, field, value) => set((o) => {
          const s = o.sheets.find((x) => x.id === id);
          if (!s) return;
          if (field === 'length') s.length = Math.min(100000, Math.max(1, Number(value) || 1));
          else if (field === 'qty') s.qty = Math.min(100000, Math.max(0, Math.round(Number(value) || 0)));
          else if (field === 'name') s.name = String(value ?? '').slice(0, 200);
          else if (field === 'isOffcut') s.isOffcut = !!value;
        })}
      />
    </div>
  );
}

function runLinear(input: ReturnType<typeof linearInput>): Promise<LinResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/optimizer.worker.ts', import.meta.url));
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('timeout')); }, 60_000);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: LinResult; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.postMessage({ kind: 'linear', ...input });
  });
}
export { runLinear };

export function ClCutting({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const op = doc.operations[opIndex] as ClOperation;
  const save = useSave();
  const [busy, setBusy] = useState(false);
  const [ppOpen, setPpOpen] = useState(false);
  const r = op.result;
  const current = isResultCurrent(op, doc);
  const run = async () => {
    const input = linearInput(op, doc);
    if (!input.parts.length) return ui.toast(t('noPartsToCut'), 'error');
    if (!input.stocks.length) return ui.toast(t('noSheetsToCut'), 'error');
    setBusy(true);
    ui.setBusy(true);
    try {
      const res = await runLinear(input);
      update((d) => {
        const o = d.doc.operations.find((x) => x.id === op.id);
        if (o?.type === 'CL') o.result = { ...res, createdAt: new Date().toISOString(), inputHash: inputHash(o, d.doc) };
      });
      if (await save()) ui.toast(t('optimizedBands', { bands: res.barsUsed }));
    } catch {
      ui.toast(t('optimizerFailed'), 'error');
    } finally {
      ui.setBusy(false);
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTools>
        <ToolBtn icon="optimize" label={r ? t('reoptimize') : t('optimizeCutting')} onClick={run} disabled={busy} testId="cl-run" />
        <ToolBtn icon="delete" label={t('removeCutting')} disabled={!r} onClick={() => update((d) => { const o = d.doc.operations[opIndex]; if (o?.type === 'CL') o.result = null; })} />
        <ToolBtn icon="commands" label={t('postprocessor')} disabled={!r} onClick={() => setPpOpen(true)} />
        {r && <PostprocessorDialog open={ppOpen} onClose={() => setPpOpen(false)} op={op} />}
      </PanelTools>
      {!r ? (
        <div className="flex flex-col items-center gap-2 pt-16">
          <IconLink icon="optimize" label={t('optimizeCutting')} onClick={run} disabled={busy} />
          <p className="max-w-md text-center text-sm text-[#555]">{t('cuttingEmpty')}</p>
        </div>
      ) : (
        <>
          {!current && <div role="alert" className="bg-[#fff3bf] px-2 py-1 text-sm text-[#7a5b00]">{t('resultOutdated')}</div>}
          <div className="flex h-[26px] shrink-0 items-center gap-6 border-b border-[#c4c4c4] bg-white px-3 text-sm" data-testid="cl-stats">
            <span>{t('bands')}: {r.barsUsed}</span>
            <span>F: {formatNum(r.fill * 100, locale, 2)}%</span>
            <span>{t('cuts')}: {r.cuts}</span>
            <span>{t('partsLengthM')}: {formatNum(r.partsLength / 1000, locale, 2)}</span>
            {r.unplaced.length > 0 && <span className="text-[#c0141b]">{t('unplacedParts')}: {r.unplaced.reduce((a, u) => a + u.qty, 0)}</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-white p-3">
            {r.patterns.map((pat, i) => (
              <div key={i}>
                <div className="mb-0.5 text-xs" style={{ fontFamily: 'Times New Roman, serif' }}>№:{i + 1} L:{pat.length} C:{pat.count}{pat.offcut > 0 && ` · ${t('legendOffcut')} ${formatNum(pat.offcut, locale, 1)}`}</div>
                <svg viewBox={`0 0 ${pat.length} 60`} className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label={`${t('band')} ${i + 1}`}>
                  <rect x={0} y={0} width={pat.length} height={60} fill="var(--gl-waste)" stroke="#333" vectorEffect="non-scaling-stroke" />
                  {pat.offcut > 0 && <rect x={pat.length - op.params.trim - pat.offcut} y={0} width={pat.offcut} height={60} fill="var(--gl-offcut)" stroke="#333" vectorEffect="non-scaling-stroke" />}
                  {pat.pieces.map((pc, j) => (
                    <rect key={j} x={pc.x} y={0} width={pc.length} height={60} fill="var(--gl-part)" stroke="#333" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                <div className="relative h-4 text-[11px] font-bold">
                  {pat.pieces.map((pc, j) => (
                    <span key={j} className={cx('absolute -translate-x-1/2 whitespace-nowrap')} style={{ left: `${((pc.x + pc.length / 2) / pat.length) * 100}%` }}>{pc.no}: {formatNum(pc.length, locale, 1)}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
