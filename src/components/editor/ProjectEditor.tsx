'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { saveProject, setProjectState } from '@/app/actions/projects';
import { projectCost } from '@/domain/calc';
import { mergeDocInto } from '@/domain/merge';
import { projectDocSchema, type ProjectDoc, type ProjectHeader, type ProjectState } from '@/domain/project';
import { migrateDoc } from '@/domain/migrate';
import { useI18n } from '@/lib/i18n/client';
import { Ico } from '../Ico';
import { SideBar, SidebarBottom, SidebarSection, SideLink } from '../shell/Sidebar';
import { useUi } from '../ui';
import { STATE_KEYS } from '../projects/ProjectsBrowser';
import { createEditorStore, EditorContext, isDirty, useEditor, useEditorStore } from './store';
import { OperationsView } from './OperationsView';
import { ProductsView } from './ProductsView';
import { GeneralActionsDialog } from './GeneralActionsDialog';
import { ExcelImportDialog } from './ExcelImportDialog';
import { formatMoney } from './format';
import { PrefsProvider } from './prefs';
import { DxfImportDialog } from './DxfImportDialog';
import { PrintSettingsDialog } from './PrintSettingsDialog';
import type { Prefs } from '@/domain/prefs';

type ProjectData = { id: string; number: number; state: ProjectState; version: number; header: ProjectHeader; doc: ProjectDoc };

export function ProjectEditor({ project, prefs }: { project: ProjectData; prefs: Prefs }) {
  const [store] = useState(() => createEditorStore(project));
  return (
    <PrefsProvider value={prefs}>
      <EditorContext.Provider value={store}>
        <EditorFrame />
      </EditorContext.Provider>
    </PrefsProvider>
  );
}

/** Saving is shared by the sidebar, Ctrl+S and the optimizer (which auto-saves its result). */
export function useSave() {
  const store = useEditorStore();
  const ui = useUi();
  const { t } = useI18n();
  return useCallback(async () => {
    const s = store.getState();
    if (!isDirty(s)) return true;
    const { header, doc } = s;
    const r = await saveProject({ id: s.id, version: s.version, header, doc }).catch(() => null);
    if (!r) {
      ui.toast(t('saveFailed'), 'error');
      return false;
    }
    if (!r.ok) {
      ui.toast(t(r.error), 'error');
      return false;
    }
    const now = store.getState();
    if (now.header === header && now.doc === doc) now.markSaved(r.data.version);
    else store.setState({ version: r.data.version, saved: { header, doc } });
    return true;
  }, [store, ui, t]);
}

function EditorFrame() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ui = useUi();
  const store = useEditorStore();
  const header = useEditor((s) => s.header);
  const doc = useEditor((s) => s.doc);
  const number = useEditor((s) => s.number);
  const state = useEditor((s) => s.state);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useStore(store, isDirty);
  const update = useEditor((s) => s.update);
  const [tab, setTab] = useState<'operations' | 'products'>('operations');
  const [generalOpen, setGeneralOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [dxfOpen, setDxfOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const save = useSave();
  const cost = useMemo(() => projectCost(doc), [doc]);

  const doSave = useCallback(async () => {
    ui.setBusy(true);
    const ok = await save();
    ui.setBusy(false);
    if (ok) ui.toast(t('saved'));
  }, [save, t, ui]);

  const confirmDiscard = useCallback(async () => {
    if (!isDirty(store.getState())) return true;
    return ui.confirm({ title: t('closeProject'), message: t('unsavedChangesConfirm'), danger: true });
  }, [store, t, ui]);

  const close = useCallback(async () => {
    if (await confirmDiscard()) router.push('/projects');
  }, [confirmDiscard, router]);

  const exportFile = () => {
    const s = store.getState();
    const blob = new Blob([JSON.stringify({ format: 'aav-cut-project', version: 2, exportedAt: new Date().toISOString(), header: s.header, doc: s.doc }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.header.name.replace(/[^\p{L}\p{N}_ -]+/gu, '_') || 'project'}.aavcut.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as { format?: string; doc?: unknown };
      const parsed = projectDocSchema.safeParse(migrateDoc(json.doc));
      if (json.format !== 'aav-cut-project' || !parsed.success) throw new Error('invalid');
      update((d) => mergeDocInto(d.doc, parsed.data));
      ui.toast(t('importedOperations', { count: parsed.data.operations.length }));
    } catch {
      ui.toast(t('importInvalid'), 'error');
    }
  };

  const printReport = () => setPrintOpen(true);

  const markOrdered = async () => {
    if (state !== 'NOT_ORDERED') return;
    if (!(await ui.confirm({ title: t('ordered'), message: t('orderedConfirm') }))) return;
    if (!(await save())) return;
    ui.setBusy(true);
    const r = await setProjectState({ ids: [store.getState().id], state: 'ORDERED' });
    ui.setBusy(false);
    if (r.ok) {
      store.setState({ state: 'ORDERED' });
      ui.toast(t('stateOrdered'));
    } else ui.toast(t(r.error), 'error');
  };

  // Global editor shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const inField = (e.target as HTMLElement).closest('input,textarea,select,.ag-cell-inline-editing');
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
      else if (mod && !inField && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.getState().undo(); }
      else if (mod && !inField && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); store.getState().redo(); }
      else if (e.key === 'F1') { e.preventDefault(); window.open('/help', '_blank', 'noopener'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave, store]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarSection title={t('project')} icon="project">
        <SideLink icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
        <SideLink icon="refresh" label={t('refresh')} onClick={async () => { if (await confirmDiscard()) window.location.reload(); }} />
        <SideLink icon="undo" label={t('undo')} onClick={() => store.getState().undo()} disabled={!canUndo} testId="sb-undo" />
        <SideLink icon="redo" label={t('redo')} onClick={() => store.getState().redo()} disabled={!canRedo} />
        <SideLink icon="save" label={t('save')} onClick={doSave} disabled={!dirty} testId="sb-save" />
        <SideLink icon="general" label={t('generalActions')} onClick={() => setGeneralOpen(true)} />
        <SideLink icon="export" label={t('export')} onClick={exportFile} />
        <SideLink icon="import" label={t('import')} onClick={() => importRef.current?.click()} />
        <SideLink icon="excel" label={t('importsFromExcel')} onClick={() => setExcelOpen(true)} />
        <SideLink icon="otherPrograms" label={t('importFromOtherPrograms')} onClick={() => setDxfOpen(true)} />
        <div className="h-5" />
        <SideLink icon="ordered" label={state === 'NOT_ORDERED' ? t('ordered') : t(STATE_KEYS[state])} onClick={markOrdered} disabled={state !== 'NOT_ORDERED'} testId="sb-ordered" />
        <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1.5 px-3 pt-1 text-xs" data-testid="project-cost">
          <dt>{t('orderId')}</dt><dd className="tabular-nums">{number}</dd>
          <dt>{t('cost')}</dt><dd className="tabular-nums">{formatMoney(cost.cost, locale)}</dd>
          <dt>{t('costMaterials')}</dt><dd className="tabular-nums">{formatMoney(cost.costMaterial, locale)}</dd>
          <dt>{t('costOperations')}</dt><dd className="tabular-nums">{formatMoney(cost.costOperation, locale)}</dd>
        </dl>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </SidebarSection>
      <SidebarBottom>
        <SideBar icon="print" label={t('printReport')} onClick={printReport} />
        <SideBar icon="settings" label={t('settings')} href="/settings" />
        <SideBar icon="close" label={t('closeProject')} onClick={close} />
        <SideBar icon="help" label={t('help')} href="/help" />
      </SidebarBottom>

      <header className="flex shrink-0 gap-3 border-b border-[#c4c4c4] px-2 py-1">
        <div className="grid flex-[0_1_680px] grid-cols-[140px_1fr_1fr] gap-x-1.5 text-sm">
          <label className="self-center" htmlFor="pj-name">{t('name')}</label>
          <input id="pj-name" aria-label={t('projectName')} className="input col-span-2" value={header.name} maxLength={200}
            onChange={(e) => update((d) => void (d.header.name = e.target.value), 'name')}
            onBlur={(e) => !e.target.value.trim() && update((d) => void (d.header.name = t('newProject')))} />
          <label htmlFor="pj-cur" className="mt-0.5">{t('currency')}</label>
          <label htmlFor="pj-od" className="mt-0.5">{t('orderDate')}</label>
          <label htmlFor="pj-rd" className="mt-0.5">{t('readyDate')}</label>
          <input id="pj-cur" className="input" value={header.currency} maxLength={8} onChange={(e) => update((d) => void (d.header.currency = e.target.value), 'currency')} />
          <input id="pj-od" type="date" className="input" value={header.orderDate ?? ''} onChange={(e) => update((d) => void (d.header.orderDate = e.target.value || null))} />
          <input id="pj-rd" type="date" className="input" value={header.readyDate ?? ''} onChange={(e) => update((d) => void (d.header.readyDate = e.target.value || null))} />
        </div>
        <textarea aria-label={t('notes')} placeholder={t('notes')} className="input min-h-[64px] flex-1 resize-none" maxLength={5000} value={header.notes}
          onChange={(e) => update((d) => void (d.header.notes = e.target.value), 'notes')} />
        <div className="flex flex-col items-center justify-between py-1">
          <button className="icon-btn" onClick={close} title={t('closeProject')} aria-label={t('closeProject')}><Ico name="close" size={22} /></button>
          {dirty && <span className="text-[11px] text-[#c77d00]" data-testid="unsaved" title={t('unsaved')}>● {t('unsavedShort')}</span>}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {tab === 'operations' ? <OperationsView cost={cost} onTab={setTab} /> : <ProductsView cost={cost} onTab={setTab} />}
      </div>

      <GeneralActionsDialog open={generalOpen} onClose={() => setGeneralOpen(false)} />
      <ExcelImportDialog open={excelOpen} onClose={() => setExcelOpen(false)} />
      <DxfImportDialog open={dxfOpen} onClose={() => setDxfOpen(false)} />
      <PrintSettingsDialog open={printOpen} onClose={() => setPrintOpen(false)} projectId={store.getState().id} beforeOpen={async () => !isDirty(store.getState()) || (await save())} />
    </div>
  );
}
