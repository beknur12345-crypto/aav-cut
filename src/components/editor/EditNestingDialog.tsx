'use client';
import { useMemo, useState } from 'react';
import { optimizerInput } from '@/domain/calc';
import { addEmptySheet, canEditPattern, placeOnSheet, removeFromSheet, summarize } from '@/domain/nesting';
import type { CuttingResult, SheetOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { CuttingMap } from '../CuttingMap';
import { cx, Dialog, ToolBtn, useUi } from '../ui';
import { useEditor } from './store';
import { useSave } from './ProjectEditor';
import { formatNum } from './format';

const ERRORS: Record<string, MessageKey> = { noFreeSpace: 'nestNoFreeSpace', doesNotFit: 'nestDoesNotFit', tooManyRotations: 'nestTooManyRotations', grain: 'nestGrain', noneLeft: 'nestNoneLeft' };

/**
 * Manual layout editing: pick a part in the list, click a free (grey/violet) area to place it;
 * click a placed part to select it and press Delete (or right-click) to take it off the sheet.
 * Every change keeps the layout a valid guillotine plan with an up-to-date saw sequence.
 */
export function EditNestingDialog({ open, onClose, opIndex }: { open: boolean; onClose: () => void; opIndex: number }) {
  const op = useEditor((s) => s.doc.operations[opIndex]);
  // Mounted only while open, so every opening starts from the current plan.
  if (!open || !op || (op.type !== 'CS' && op.type !== 'CN') || !op.result) return null;
  return <EditNestingBody onClose={onClose} opIndex={opIndex} />;
}

function EditNestingBody({ onClose, opIndex }: { onClose: () => void; opIndex: number }) {
  const open = true;
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const save = useSave();
  const op = doc.operations[opIndex] as SheetOperation;
  const [work, setWork] = useState<CuttingResult | null>(() => (op.result ? summarize(op.result, op, doc) : null));
  const [page, setPage] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [rotate, setRotate] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [history, setHistory] = useState<CuttingResult[]>([]);

  const input = useMemo(() => optimizerInput(op, doc), [op, doc]);
  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of work?.patterns ?? []) for (const pl of p.placements) m.set(pl.partId, (m.get(pl.partId) ?? 0) + p.count);
    return m;
  }, [work]);

  if (!open || !work) return null;
  const idx = Math.min(page, Math.max(0, work.patterns.length - 1));
  const pat = work.patterns[idx];
  const editable = !!pat && canEditPattern(pat);
  const commit = (next: CuttingResult) => {
    setHistory((h) => [...h.slice(-50), work]);
    setWork(next);
    setSel(null);
  };

  const remove = (i: number | null) => {
    if (i === null || !pat) return;
    const pl = pat.placements[i];
    if (!pl) return;
    const next = removeFromSheet(work, idx, pl.x, pl.y, op, doc);
    if (next) {
      commit(next);
      setPick(pl.partId);
      if (idx >= next.patterns.length) setPage(Math.max(0, next.patterns.length - 1));
    }
  };

  const place = (x: number, y: number) => {
    if (!pick) return ui.toast(t('nestPickFirst'), 'error');
    const r = placeOnSheet(work, idx, x, y, pick, rotate, op, doc);
    if (typeof r === 'string') ui.toast(t(ERRORS[r] ?? 'errorText'), 'error');
    else commit(r);
  };

  const apply = async () => {
    update((d) => {
      const o = d.doc.operations[opIndex];
      if (o && (o.type === 'CS' || o.type === 'CN')) o.result = { ...work, edited: true };
    });
    onClose();
    if (await save()) ui.toast(t('nestSaved'));
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('editNesting')} width={1180} testId="edit-nesting"
      footer={<><button className="btn" onClick={apply} data-testid="nest-apply">{t('ok')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <div className="grid h-[64vh] grid-cols-[400px_1fr] gap-2"
        onKeyDown={(e) => {
          if (e.key === 'Delete') { e.preventDefault(); remove(sel); }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && history.length) { e.preventDefault(); setWork(history[history.length - 1]!); setHistory((h) => h.slice(0, -1)); }
        }}>
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto border border-[#c4c4c4]">
            <table className="gl-grid text-xs" data-testid="nest-parts">
              <thead><tr><th>№</th><th>{t('colLength')}</th><th>{t('colWidth')}</th><th>{t('colQty')}</th><th>{t('nestUsed')}</th><th>{t('nestLeft')}</th><th>{t('colTxt')}</th><th>{t('name')}</th></tr></thead>
              <tbody>
                {input.parts.map((p) => {
                  const u = used.get(p.id) ?? 0;
                  const name = op.parts.find((x) => x.id === p.id)?.name ?? '';
                  return (
                    <tr key={p.id} aria-selected={pick === p.id} onClick={() => setPick(p.id)} className={cx(p.qty - u > 0 && 'font-bold')}>
                      <td className="no">{p.no}</td>
                      <td className="text-right">{formatNum(p.length, locale, 1)}</td>
                      <td className="text-right">{formatNum(p.width, locale, 1)}</td>
                      <td className="text-right">{p.qty}</td>
                      <td className="text-right">{u}</td>
                      <td className={cx('text-right', p.qty - u > 0 && 'text-[#c0141b]')}>{p.qty - u}</td>
                      <td className="text-center">{p.canRotate ? '' : '✓'}</td>
                      <td>{name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1 text-xs text-[#444]">
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} /> {t('nestRotate')}</label>
            <p>{t('nestHelp')}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-col border border-[#c4c4c4] bg-white">
          <div className="gl-tabbar !min-h-[30px] text-sm">
            <span data-testid="nest-header">№ {idx + 1}/{work.patterns.length} · F {formatNum(work.fill * 100, locale, 2)}% · {t('statSheets')} {work.sheetsUsed}{pat && pat.count > 1 && ` · ×${pat.count}`}</span>
            <div className="ml-auto flex items-center gap-0.5">
              <ToolBtn icon="prev" label={t('previous')} onClick={() => setPage(idx - 1)} disabled={idx === 0} />
              <ToolBtn icon="next" label={t('next')} onClick={() => setPage(idx + 1)} disabled={idx >= work.patterns.length - 1} />
              <ToolBtn icon="delete" label={t('nestRemovePart')} onClick={() => remove(sel)} disabled={sel === null} shortcut="Del" testId="nest-remove" />
              <ToolBtn icon="undo" label={t('undo')} onClick={() => { setWork(history[history.length - 1]!); setHistory((h) => h.slice(0, -1)); }} disabled={!history.length} shortcut="Ctrl+Z" />
              <ToolBtn icon="add" label={t('nestAddSheet')} testId="nest-add-sheet" onClick={() => {
                const stock = op.sheets.find((s) => s.qty > 0);
                const next = stock ? addEmptySheet(work, stock.id, op, doc) : null;
                if (next) { commit(next); setPage(next.patterns.length - 1); } else ui.toast(t('noSheetsToCut'), 'error');
              }} />
            </div>
          </div>
          {work.unplaced.length > 0 && (
            <div className="bg-[#ffe3e3] px-2 py-0.5 text-xs text-[#a61e1e]" data-testid="nest-unplaced">{t('nestUnplaced')}: {work.unplaced.reduce((a, u) => a + u.qty, 0)}</div>
          )}
          <div className="min-h-0 flex-1 overflow-auto p-2" tabIndex={0}>
            {pat && editable ? (
              <CuttingMap pattern={pat} className="mx-auto h-full max-h-full w-full" selected={sel}
                onPartClick={(i) => setSel(i === sel ? null : i)} onFreeClick={place} />
            ) : (
              <p className="p-6 text-sm text-[#555]">{t('nestReoptimizeFirst')}</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
