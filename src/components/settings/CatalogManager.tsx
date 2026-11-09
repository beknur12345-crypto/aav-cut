'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deleteMaterial, saveMaterial, type MaterialInput } from '@/app/actions/settings';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, ErrorText, Field, NumberInput, ToolBtn, useUi } from '../ui';
import { SettingsSidebar } from './SettingsForms';
import type { CatalogMaterial } from '../editor/CatalogDialog';
import { formatMoney, formatNum } from '../editor/format';

const EMPTY: MaterialInput = { category: '', code: '', name: '', unit: 'm2', price: 0, thickness: 18, length: 2750, width: 1830 };

export function CatalogManager({ materials }: { materials: CatalogMaterial[] }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; data: MaterialInput } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => !q || `${m.category} ${m.code} ${m.name}`.toLowerCase().includes(q));
  }, [materials, query]);

  const submit = async () => {
    if (!editing) return;
    ui.setBusy(true);
    const r = await saveMaterial(editing);
    ui.setBusy(false);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SettingsSidebar />
      <div className="gl-tabbar">
        <span className="text-[17px]">{t('catalogOfGoods')}</span>
        <input className="input ml-4 w-64" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ml-auto flex items-center gap-0.5">
          <ToolBtn icon="add" label={t('addMaterial')} onClick={() => { setError(null); setEditing({ id: null, data: { ...EMPTY, category: t('myMaterials') } }); }} testId="add-material" />
          <ToolBtn icon="refresh" label={t('refresh')} onClick={() => router.refresh()} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="gl-grid">
          <thead>
            <tr>
              <th>{t('category')}</th><th>{t('code')}</th><th>{t('name')}</th><th>{t('unit')}</th>
              <th>{t('price')}</th><th>{t('thicknessShort')}</th><th>{t('lengthShort')}</th><th>{t('widthShort')}</th><th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.category}</td>
                <td>{m.code}</td>
                <td>{m.name}{!m.own && <span className="ml-1.5 text-[11px] text-[#777]">({t('shared')})</span>}</td>
                <td>{m.unit}</td>
                <td className="text-right tabular-nums">{formatMoney(m.price, locale)}</td>
                <td className="text-right tabular-nums">{formatNum(m.thickness, locale)}</td>
                <td className="text-right tabular-nums">{formatNum(m.length, locale)}</td>
                <td className="text-right tabular-nums">{formatNum(m.width, locale)}</td>
                <td className="px-2 text-right">
                  {m.own && (
                    <>
                      <button className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => (setError(null), setEditing({ id: m.id, data: { category: m.category, code: m.code, name: m.name, unit: m.unit, price: m.price, thickness: m.thickness, length: m.length, width: m.width } }))}><span aria-hidden>✎</span></button>
                      <button
                        className="icon-btn"
                        title={t('delete')}
                        aria-label={t('delete')}
                        onClick={async () => {
                          if (!(await ui.confirm({ title: t('delete'), message: t('confirmDeleteMaterial', { name: m.name }), danger: true }))) return;
                          const r = await deleteMaterial({ id: m.id });
                          if (!r.ok) ui.toast(t(r.error), 'error');
                          router.refresh();
                        }}
                      >
                        <span aria-hidden className="font-bold text-[#e5312b]">✕</span>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('editMaterial') : t('addMaterial')}
        footer={<><button className="btn" onClick={submit}>{t('save')}</button><button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button></>}
      >
        {editing && (
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => (e.preventDefault(), submit())}>
            <div className="col-span-2"><ErrorText error={error} /></div>
            <Field label={t('category')}><input className="input" required maxLength={100} value={editing.data.category} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, category: e.target.value } })} /></Field>
            <Field label={t('code')}><input className="input" maxLength={60} value={editing.data.code} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, code: e.target.value } })} /></Field>
            <div className="col-span-2"><Field label={t('name')}><input className="input" required maxLength={200} value={editing.data.name} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, name: e.target.value } })} /></Field></div>
            <Field label={t('unit')}><input className="input" maxLength={10} value={editing.data.unit} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, unit: e.target.value } })} /></Field>
            <Field label={`${t('price')} (${t('perM2')})`}><NumberInput value={editing.data.price} min={0} onChange={(v) => setEditing({ ...editing, data: { ...editing.data, price: v } })} /></Field>
            <Field label={`${t('thickness')}, mm`}><NumberInput value={editing.data.thickness} min={0} max={500} onChange={(v) => setEditing({ ...editing, data: { ...editing.data, thickness: v } })} /></Field>
            <div />
            <Field label={`${t('sheetLength')}, mm`}><NumberInput value={editing.data.length} min={0} onChange={(v) => setEditing({ ...editing, data: { ...editing.data, length: v } })} /></Field>
            <Field label={`${t('sheetWidth')}, mm`}><NumberInput value={editing.data.width} min={0} onChange={(v) => setEditing({ ...editing, data: { ...editing.data, width: v } })} /></Field>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialog>
    </div>
  );
}
