'use client';
import { useEffect, useRef, useState } from 'react';
import { inputHash, isResultCurrent, optimizerInput, packages } from '@/domain/calc';
import type { OptimizeResult } from '@/domain/optimizer';
import type { CuttingResult, SheetOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { CuttingMap } from '../CuttingMap';
import { Ico } from '../Ico';
import { cx, IconLink, ToolBtn, useUi } from '../ui';
import { useEditor, useEditorStore } from './store';
import { useSave } from './ProjectEditor';
import { PanelTools } from './PanelTools';
import { formatNum } from './format';
import { EditNestingDialog } from './EditNestingDialog';
import { PostprocessorDialog } from './PostprocessorDialog';

const CMD_KEYS: Record<string, MessageKey> = { R: 'cmdR', T: 'cmdT', C: 'cmdC', P: 'cmdP', W: 'cmdW' };

/** Runs the 2-D optimizer in a Web Worker. */
export function runSheetOptimizer(input: ReturnType<typeof optimizerInput>): Promise<OptimizeResult> {
  return new Promise<OptimizeResult>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/optimizer.worker.ts', import.meta.url));
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('timeout')); }, 60_000);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: OptimizeResult; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ kind: 'sheet', ...input });
  });
}

export function CuttingTab({ opIndex }: { opIndex: number }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const op = doc.operations[opIndex] as SheetOperation;
  const save = useSave();
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);
  const [rail, setRail] = useState<'thumbs' | 'commands'>('thumbs');
  const [nestOpen, setNestOpen] = useState(false);
  const [ppOpen, setPpOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const result = op.result;
  const current = isResultCurrent(op, doc);

  const run = async () => {
    const input = optimizerInput(op, doc);
    if (!input.parts.length) return ui.toast(t('noPartsToCut'), 'error');
    if (!input.stocks.length) return ui.toast(t('noSheetsToCut'), 'error');
    setRunning(true);
    ui.setBusy(true);
    try {
      const res = await runSheetOptimizer(input);
      const opId = op.id;
      update((d) => {
        const target = d.doc.operations.find((o) => o.id === opId);
        if (!target || (target.type !== 'CS' && target.type !== 'CN')) return;
        const stored: CuttingResult = { ...res, createdAt: new Date().toISOString(), inputHash: inputHash(target, d.doc), comment: '', edited: false };
        target.result = stored;
      });
      if (mounted.current) setPage(0);
      // A finished cutting plan is saved straight away.
      if (await save()) ui.toast(t('optimizedAndSaved', { sheets: res.sheetsUsed }));
      if (res.unplaced.length) ui.toast(t('someUnplaced', { count: res.unplaced.reduce((a, u) => a + u.qty, 0) }), 'error');
    } catch (e) {
      console.error(e);
      ui.toast(t('optimizerFailed'), 'error');
    } finally {
      ui.setBusy(false);
      if (mounted.current) setRunning(false);
    }
  };

  const tools = (
    <PanelTools>
      <ToolBtn icon="properties" label={t('editNesting')} onClick={() => setNestOpen(true)} disabled={!result} testId="edit-nesting-btn" />
      <ToolBtn icon="optimize" label={result ? t('reoptimize') : t('optimizeCutting')} onClick={run} disabled={running} testId="run-optimizer" />
      <ToolBtn icon="comment" label={t('comment')} disabled={!result}
        onClick={async () => {
          const c = await ui.prompt({ title: t('comment'), label: t('comment'), value: result?.comment ?? '' });
          if (c !== null) update((d) => { const o = d.doc.operations[opIndex]; if (o && (o.type === 'CS' || o.type === 'CN') && o.result) o.result.comment = c.slice(0, 2000); });
        }} />
      <ToolBtn icon="delete" label={t('removeCutting')} disabled={!result}
        onClick={async () => {
          if (await ui.confirm({ title: t('removeCutting'), message: t('removeCuttingConfirm'), danger: true })) update((d) => { const o = d.doc.operations[opIndex]; if (o && (o.type === 'CS' || o.type === 'CN')) o.result = null; });
        }} />
      <ToolBtn icon="print" label={t('printReport')} disabled={!result}
        onClick={async () => { if (await save()) window.open(`/projects/${store.getState().id}/print?op=${op.id}`, '_blank', 'noopener'); }} />
      <ToolBtn icon="commands" label={t('postprocessor')} disabled={!result} onClick={() => setPpOpen(true)} testId="pp-btn" />
      <EditNestingDialog open={nestOpen} onClose={() => setNestOpen(false)} opIndex={opIndex} />
      {result && <PostprocessorDialog open={ppOpen} onClose={() => setPpOpen(false)} op={op} />}
    </PanelTools>
  );

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center gap-2 pt-16">
        {tools}
        <IconLink icon="optimize" label={t('optimizeCutting')} onClick={run} disabled={running} testId="run-optimizer-empty" />
        <IconLink icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
        <p className="mt-4 max-w-md text-center text-sm text-[#555]">{t('cuttingEmpty')}</p>
      </div>
    );
  }

  const patterns = result.patterns;
  const idx = Math.min(page, Math.max(0, patterns.length - 1));
  const pat = patterns[idx];
  const totalParts = patterns.reduce((a, p) => a + p.placements.length * p.count, 0);
  const partNames = new Map(op.parts.map((p, i) => [i + 1, p.name]));
  const sheetsBefore = patterns.slice(0, idx).reduce((a, p) => a + p.count, 0);
  const cell = 'flex-1 border-r border-[#c4c4c4] px-2 text-center whitespace-nowrap';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {tools}
      {!current && (
        <div role="alert" className="flex items-center gap-2 bg-[#fff3bf] px-2 py-1 text-sm text-[#7a5b00]">
          <Ico name="help" size={14} /> {t('resultOutdated')}
        </div>
      )}
      {result.unplaced.length > 0 && (
        <div role="alert" className="bg-[#ffe3e3] px-2 py-1 text-sm text-[#a61e1e]">
          {t('unplacedParts')}: {result.unplaced.map((u) => { const i = op.parts.findIndex((p) => p.id === u.partId); return `№${i + 1} ${op.parts[i]?.name ?? ''} ×${u.qty}`; }).join(', ')}
        </div>
      )}
      {pat && (
        <>
          <div className="flex h-[26px] shrink-0 items-center border-b border-[#c4c4c4] bg-white text-sm" data-testid="pattern-header">
            <span className="px-2"><Ico name="properties" size={15} /></span>
            <span className={cell}>№: {idx + 1}/{patterns.length}</span>
            <span className={cell} title={t('statSizeTip')}>S: {pat.length}/{pat.width}</span>
            <span className={cell} title={t('statCountTip')}>C: {sheetsBefore + 1}{pat.count > 1 ? `–${sheetsBefore + pat.count}` : ''}/{result.sheetsUsed}</span>
            <span className={cell} title={t('statPackageTip', { n: packages(op, pat.count).perPackage })} data-testid="pattern-packages">P: {packages(op, pat.count).packages}×{Math.min(pat.count, packages(op, pat.count).perPackage)}</span>
            <span className={cell} title={t('statPartsTip')}>Cp: {pat.placements.length * pat.count}/{totalParts}</span>
            <span className={cell} title={t('statCutLengthTip')}>LT: {formatNum((pat.cutLength * pat.count) / 1000, locale, 2)}/{formatNum(result.cutLength / 1000, locale, 2)}</span>
            <span className={cell} title={t('statFillTip')} data-testid="cutting-stats">F: {formatNum((pat.partsArea / (pat.length * pat.width)) * 100, locale, 2)}%/{formatNum(result.fill * 100, locale, 2)}% · {t('statSheets')} {result.sheetsUsed}</span>
            <span className="flex px-1">
              <ToolBtn icon="first" label={t('first')} onClick={() => setPage(0)} disabled={idx === 0} />
              <ToolBtn icon="prev" label={t('previous')} onClick={() => setPage(idx - 1)} disabled={idx === 0} />
              <ToolBtn icon="next" label={t('next')} onClick={() => setPage(idx + 1)} disabled={idx >= patterns.length - 1} />
              <ToolBtn icon="last" label={t('last')} onClick={() => setPage(patterns.length - 1)} disabled={idx >= patterns.length - 1} />
            </span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_200px]">
            <div className="min-h-0 overflow-auto bg-white p-1">
              <CuttingMap pattern={pat} className="mx-auto h-full max-h-full w-full" title={`${t('sheet')} ${idx + 1}`} />
            </div>
            <aside className="flex min-h-0 flex-col border-l border-[#c4c4c4] bg-[var(--gl-bg)]">
              <button className="gl-link items-center justify-center border-b border-[#c4c4c4] py-1" onClick={() => setRail(rail === 'thumbs' ? 'commands' : 'thumbs')} data-testid="toggle-commands">
                <Ico name="commands" /> {rail === 'thumbs' ? t('tableOfCommands') : t('sheets')}
              </button>
              {rail === 'commands' ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="gl-grid text-xs" data-testid="commands-table">
                    <thead><tr><th>№</th><th>{t('cmd')}</th><th>{t('size')}</th><th title={t('cmdCountTip')}>C</th><th title={t('cmdPartTip')}>P</th></tr></thead>
                    <tbody>
                      {pat.commands.map((c) => (
                        <tr key={c.no} className={cx(c.cmd === 'R' && '!bg-[#fff3bf]')}>
                          <td className="no">{c.no}</td>
                          <td className="text-center font-bold" title={t(CMD_KEYS[c.cmd]!)}>{c.cmd}</td>
                          <td className="text-right tabular-nums">{c.cmd === 'R' ? '' : formatNum(c.size, locale, 1)}</td>
                          <td className="text-right tabular-nums">{c.cmd === 'R' ? '' : c.count}</td>
                          <td className="text-center" title={c.partNo ? partNames.get(c.partNo) : undefined}>{c.partNo ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2" data-testid="thumbs">
                  {patterns.map((p, i) => (
                    <button key={i} onClick={() => setPage(i)} className={cx('block w-full p-1 text-center text-[11px]', i === idx ? 'bg-[var(--gl-select)]' : 'hover:bg-white')} style={{ fontFamily: 'Times New Roman, serif' }}>
                      <CuttingMap pattern={p} labels={false} className="w-full" />
                      №:{i + 1} S:{p.length}/{p.width} C:{p.count}
                    </button>
                  ))}
                </div>
              )}
            </aside>
          </div>
          <div className="flex shrink-0 gap-4 border-t border-[#c4c4c4] bg-white px-2 py-0.5 text-[11px] text-[#444]">
            <Legend color="var(--gl-part)" label={t('legendPart')} />
            <Legend color="var(--gl-offcut)" label={t('legendOffcut')} />
            <Legend color="var(--gl-waste)" label={t('legendWaste')} />
            <span>↻ {t('legendRotated')}</span>
            {result.edited && <span className="font-bold text-[#c77d00]">✎ {t('nestEditedBadge')}</span>}
            {result.comment && <span className="ml-auto italic">“{result.comment}”</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 border border-[#555]" style={{ background: color }} />
      {label}
    </span>
  );
}
