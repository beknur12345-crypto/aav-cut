'use client';
import { useEffect, useMemo, useState } from 'react';
import { Folder, RefreshCw, Search } from 'lucide-react';
import { listMaterials } from '@/app/actions/settings';
import { useI18n } from '@/lib/i18n/client';
import { cx, Dialog, Spinner } from '../ui';
import { formatMoney, formatNum } from './format';

export type CatalogMaterial = Awaited<ReturnType<typeof listMaterials>>[number];

export function CatalogDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: CatalogMaterial) => void }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<CatalogMaterial[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    listMaterials().then(setItems).catch(() => setItems([]));
  };
  useEffect(() => {
    if (!open || items) return;
    let live = true;
    listMaterials().then((m) => live && setItems(m)).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [open, items]);

  const categories = useMemo(() => [...new Set((items ?? []).map((m) => m.category))], [items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((m) => (!category || m.category === category) && (!q || `${m.code} ${m.name}`.toLowerCase().includes(q)));
  }, [items, category, query]);
  const pick = (id: string | null) => {
    const m = items?.find((x) => x.id === id);
    if (m) onPick(m);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('catalogOfGoods')}
      width={900}
      testId="catalog-dialog"
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={!selected} onClick={() => pick(selected)}>{t('ok')}</button>
        </>
      }
    >
      <div className="grid min-h-[360px] grid-cols-[220px_1fr] gap-3">
        <nav className="space-y-0.5 border-r border-slate-200 pr-3" aria-label={t('categories')}>
          <p className="label">{t('categories')}</p>
          {[null, ...categories].map((c) => (
            <button key={c ?? 'all'} onClick={() => setCategory(c)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm', category === c ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100')}>
              <Folder size={14} className="shrink-0 text-wood-500" aria-hidden />
              <span className="truncate">{c ?? t('all')}</span>
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" aria-hidden />
              <input className="input pl-8" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button className="icon-btn" onClick={load} title={t('refresh')} aria-label={t('refresh')}><RefreshCw size={16} /></button>
          </div>
          {!items ? (
            <div className="flex flex-1 items-center justify-center text-brand-600"><Spinner size={22} /></div>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">№</th>
                    <th className="px-2 py-1.5">{t('code')}</th>
                    <th className="px-2 py-1.5">{t('name')}</th>
                    <th className="px-2 py-1.5">{t('unit')}</th>
                    <th className="px-2 py-1.5 text-right">{t('price')}</th>
                    <th className="px-2 py-1.5 text-right">{t('thicknessShort')}</th>
                    <th className="px-2 py-1.5 text-right">{t('lengthShort')}</th>
                    <th className="px-2 py-1.5 text-right">{t('widthShort')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, i) => (
                    <tr key={m.id} onClick={() => setSelected(m.id)} onDoubleClick={() => pick(m.id)} aria-selected={selected === m.id} className={cx('cursor-default border-t border-slate-100', selected === m.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                      <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1 text-slate-600">{m.code}</td>
                      <td className="px-2 py-1">{m.name}{m.own && <span className="ml-1.5 rounded bg-wood-100 px-1 text-[10px] text-wood-500">{t('mine')}</span>}</td>
                      <td className="px-2 py-1">{m.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatMoney(m.price, locale)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatNum(m.thickness, locale)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatNum(m.length, locale)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatNum(m.width, locale)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-500">{t('nothingFound')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
