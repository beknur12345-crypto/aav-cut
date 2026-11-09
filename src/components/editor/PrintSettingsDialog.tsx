'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, NumberInput } from '../ui';

export const PRINT_SECTIONS = ['summary', 'parts', 'maps', 'commands', 'offcuts', 'operations'] as const;
type Section = (typeof PRINT_SECTIONS)[number];
const LABELS: Record<Section, MessageKey> = { summary: 'printSummary', parts: 'printPartsLists', maps: 'printMaps', commands: 'tableOfCommands', offcuts: 'legendOffcut', operations: 'printOtherOps' };
const STORAGE = 'aav.printSettings.v1';

type Settings = { sections: Section[]; margin: number; orientation: 'portrait' | 'landscape' };
const DEFAULTS: Settings = { sections: [...PRINT_SECTIONS], margin: 10, orientation: 'portrait' };

function loadSettings(): Settings {
  try {
    const v = typeof window === 'undefined' ? null : (JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Settings | null);
    if (v && Array.isArray(v.sections)) return { ...DEFAULTS, ...v, sections: v.sections.filter((x) => PRINT_SECTIONS.includes(x)) };
  } catch {
    /* storage unavailable */
  }
  return DEFAULTS;
}

/** Print settings (profile kept per browser), then opens the printable report. */
export function PrintSettingsDialog({ open, onClose, projectId, beforeOpen }: { open: boolean; onClose: () => void; projectId: string; beforeOpen: () => Promise<boolean> }) {
  const { t } = useI18n();
  const [s, setS] = useState<Settings>(loadSettings);
  const go = async () => {
    try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* ignore */ }
    if (!(await beforeOpen())) return;
    const q = new URLSearchParams({ s: s.sections.join(','), m: String(s.margin), o: s.orientation });
    window.open(`/projects/${projectId}/print?${q}`, '_blank', 'noopener');
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('printSettings')} width={420} testId="print-settings"
      footer={<><button className="btn" onClick={go} data-testid="print-go">{t('print')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <fieldset className="space-y-1 text-sm">
        <legend className="gl-section">{t('printSections')}</legend>
        {PRINT_SECTIONS.map((sec) => (
          <label key={sec} className="flex items-center gap-2">
            <input type="checkbox" checked={s.sections.includes(sec)} onChange={(e) => setS({ ...s, sections: e.target.checked ? [...s.sections, sec] : s.sections.filter((x) => x !== sec) })} />
            {t(LABELS[sec])}
          </label>
        ))}
      </fieldset>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <label><span className="label">{t('marginOfPage')}, mm</span><NumberInput value={s.margin} min={0} max={40} onChange={(margin) => setS({ ...s, margin })} /></label>
        <label><span className="label">{t('orientation')}</span>
          <select className="input" value={s.orientation} onChange={(e) => setS({ ...s, orientation: e.target.value as Settings['orientation'] })}>
            <option value="portrait">{t('portrait')}</option><option value="landscape">{t('landscape')}</option>
          </select>
        </label>
      </div>
    </Dialog>
  );
}
