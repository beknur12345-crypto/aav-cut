'use client';
import { useState } from 'react';
import { inputHash, linearInput, optimizerInput } from '@/domain/calc';
import { combineSameMaterial, divideEdgingByMaterial } from '@/domain/merge';
import { isSheetOp } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { Dialog, IconLink, useUi } from '../ui';
import { useEditorStore } from './store';
import { useSave } from './ProjectEditor';
import { runSheetOptimizer } from './CuttingTab';
import { runLinear } from './ClPanel';

export function GeneralActionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ui = useUi();
  const store = useEditorStore();
  const save = useSave();
  const [busy, setBusy] = useState(false);

  const combine = () => {
    let n = 0;
    store.getState().update((d) => void (n = combineSameMaterial(d.doc)));
    ui.toast(t('mergedOperations', { count: n }));
    onClose();
  };
  const divide = () => {
    let n = 0;
    store.getState().update((d) => void (n = divideEdgingByMaterial(d.doc)));
    ui.toast(t('dividedEdging', { count: n }));
    onClose();
  };
  /** Optimizes every sheet and band operation in turn, then saves once. */
  const optimizeAll = async () => {
    setBusy(true);
    ui.setBusy(true);
    let done = 0;
    try {
      const doc = store.getState().doc;
      for (const op of doc.operations) {
        if (isSheetOp(op)) {
          const input = optimizerInput(op, doc);
          if (!input.parts.length || !input.stocks.length) continue;
          const res = await runSheetOptimizer(input);
          store.getState().update((d) => {
            const o = d.doc.operations.find((x) => x.id === op.id);
            if (o && isSheetOp(o)) o.result = { ...res, createdAt: new Date().toISOString(), inputHash: inputHash(o, d.doc), comment: '', edited: false };
          });
          done++;
        } else if (op.type === 'CL') {
          const input = linearInput(op, doc);
          if (!input.parts.length || !input.stocks.length) continue;
          const res = await runLinear(input);
          store.getState().update((d) => {
            const o = d.doc.operations.find((x) => x.id === op.id);
            if (o?.type === 'CL') o.result = { ...res, createdAt: new Date().toISOString(), inputHash: inputHash(o, d.doc) };
          });
          done++;
        }
      }
      if (done && (await save())) ui.toast(t('optimizedOperations', { count: done }));
      else if (!done) ui.toast(t('nothingToOptimize'), 'error');
    } catch {
      ui.toast(t('optimizerFailed'), 'error');
    } finally {
      ui.setBusy(false);
      setBusy(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('generalActions')} width={460} footer={<button className="btn" onClick={onClose}>{t('cancel')}</button>}>
      <div className="flex flex-col gap-2 py-1">
        <IconLink icon="general" label={t('combineSameMaterial')} onClick={combine} disabled={busy} />
        <IconLink icon="opEL" label={t('divideEdgingByMaterial')} onClick={divide} disabled={busy} />
        <IconLink icon="optimize" label={t('optimizeOperations')} onClick={optimizeAll} disabled={busy} testId="optimize-all" />
      </div>
    </Dialog>
  );
}
