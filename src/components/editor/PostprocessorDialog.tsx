'use client';
import { useState } from 'react';
import { POSTPROCESSORS, runPostprocessor, VENDOR_MACHINES, type PostprocessorId } from '@/domain/export/postprocessors';
import type { ClOperation, SheetOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { cx, Dialog, useUi } from '../ui';
import { useEditor } from './store';
import { usePrefs } from './prefs';

export function download(name: string, mime: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function PostprocessorDialog({ open, onClose, op }: { open: boolean; onClose: () => void; op: SheetOperation | ClOperation }) {
  const { t } = useI18n();
  const ui = useUi();
  const prefs = usePrefs();
  const projectName = useEditor((s) => s.header.name);
  const options = POSTPROCESSORS.filter((p) => p.ops.includes(op.type));
  const [choice, setChoice] = useState<PostprocessorId>(options[0]?.id ?? 'dxf');

  const run = () => {
    const prefix = prefs.postprocessor.prefixMachine ? `${choice}_` : '';
    const files = runPostprocessor(choice, op, projectName, prefix, prefs.postprocessor.gcode);
    if (!files.length) return ui.toast(t('noCuttingYet'), 'error');
    files.forEach((f, i) => setTimeout(() => download(f.name, f.mime, f.content), i * 250));
    ui.toast(t('filesExported', { count: files.length }));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('postprocessors')} width={560} testId="pp-dialog"
      footer={<><button className="btn" onClick={run} data-testid="pp-export">{t('export')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <fieldset className="space-y-1">
        <legend className="gl-section">{t('ppGeneric')}</legend>
        {options.map((p) => (
          <label key={p.id} className={cx('flex items-center gap-2 px-1 py-0.5 text-sm', choice === p.id && 'bg-[var(--gl-select)]')}>
            <input type="radio" name="pp" checked={choice === p.id} onChange={() => setChoice(p.id)} /> {p.label}
          </label>
        ))}
      </fieldset>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-[var(--gl-link)]">{t('ppVendorTitle')}</summary>
        <p className="my-1 text-xs text-[#555]">{t('ppVendorText')}</p>
        <ul className="columns-2 text-xs text-[#777]">{VENDOR_MACHINES.map((m) => <li key={m}>{m}</li>)}</ul>
      </details>
    </Dialog>
  );
}
