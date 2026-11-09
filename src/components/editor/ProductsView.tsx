'use client';
import { useEffect, useMemo, useState } from 'react';
import { cuttingSize, elOps, totalCount, type ProjectCost } from '@/domain/calc';
import { isSheetOp, LIMITS, newId, newProduct } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import { Dialog, Field, NumberInput, Tabs, ToolBtn, useUi } from '../ui';
import { useEditor } from './store';
import { ProductCaption } from './OperationsView';
import { formatMoney, formatNum } from './format';

export function ProductsView({ cost, onTab }: { cost: ProjectCost; onTab: (t: 'operations' | 'products') => void }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedProductId);
  const select = useEditor((s) => s.select);
  const update = useEditor((s) => s.update);
  const [hideZero, setHideZero] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [showParts, setShowParts] = useState(true);
  const products = doc.products;
  const visible = hideZero ? products.filter((p) => p.qty > 0) : products;
  const selIndex = products.findIndex((p) => p.id === selectedId);
  const selected = selIndex >= 0 ? products[selIndex]! : null;

  useEffect(() => {
    if (!selected && products[0]) select({ product: products[0].id });
  }, [products, selected, select]);

  const els = useMemo(() => elOps(doc), [doc]);
  const parts = useMemo(
    () => (selected ? doc.operations.filter(isSheetOp).flatMap((op) => op.parts.map((p, i) => ({ p, i, op })).filter(({ p }) => p.productId === selected.id)) : []),
    [doc.operations, selected],
  );

  const actions = {
    add: (at?: number) => {
      if (products.length >= LIMITS.products) return;
      const p = newProduct(products.length + 1);
      update((d) => void d.doc.products.splice(at ?? d.doc.products.length, 0, p));
      select({ product: p.id });
    },
    clone: () => {
      if (!selected) return;
      const copy = { ...selected, id: newId('pr'), name: `${selected.name} (copy)` };
      update((d) => {
        d.doc.products.splice(selIndex + 1, 0, copy);
        // Copy the product's parts too, so the clone is a complete second product.
        for (const op of d.doc.operations) if (isSheetOp(op)) op.parts.push(...op.parts.filter((p) => p.productId === selected.id).map((p) => ({ ...structuredClone(p), id: newId('pt'), productId: copy.id })));
      });
      select({ product: copy.id });
    },
    remove: async () => {
      if (!selected) return;
      if (products.length <= 1) return ui.toast(t('lastProductCannotBeDeleted'), 'error');
      const used = doc.operations.some((op) => isSheetOp(op) && op.parts.some((p) => p.productId === selected.id));
      if (!(await ui.confirm({ title: t('delete'), message: t(used ? 'confirmDeleteProductWithParts' : 'confirmDeleteProduct', { name: selected.name }), danger: true }))) return;
      update((d) => {
        d.doc.products.splice(selIndex, 1);
        for (const op of d.doc.operations) {
          if (isSheetOp(op)) op.parts = op.parts.filter((p) => p.productId !== selected.id);
          else if (op.type === 'CL') op.parts = op.parts.filter((p) => p.productId !== selected.id);
          else if (op.type === 'O' && op.ownerId === selected.id) op.ownerId = null;
        }
      });
      select({ product: products[selIndex + 1]?.id ?? products[selIndex - 1]?.id ?? null });
    },
    move: (dir: -1 | 1) => {
      const j = selIndex + dir;
      if (!selected || j < 0 || j >= products.length) return;
      update((d) => { const a = d.doc.products; [a[selIndex], a[j]] = [a[j]!, a[selIndex]!]; });
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setHideZero((v) => !v); }
        else if (mod && e.key === 'PageUp') { e.preventDefault(); actions.add(Math.max(0, selIndex)); }
        else if (mod && e.key === ' ') { e.preventDefault(); setPropsOpen(true); }
      }}>
      <Tabs value="products" onChange={onTab} tabs={[{ id: 'operations', label: t('operations'), icon: 'general' }, { id: 'products', label: t('products'), icon: 'product' }]}>
        <ToolBtn icon="parts" label={t('partsOfProduct')} onClick={() => setShowParts((v) => !v)} pressed={showParts} />
        <ToolBtn icon="clone" label={t('setAllQtyZero')} onClick={async () => { if (await ui.confirm({ title: t('setAllQtyZero'), message: t('setAllQtyZeroConfirm') })) update((d) => d.doc.products.forEach((p) => (p.qty = 0))); }} />
        <ToolBtn icon="filter" label={t('filterZeroProducts')} onClick={() => setHideZero((v) => !v)} pressed={hideZero} shortcut="Ctrl+F" />
        <ToolBtn icon="properties" label={t('productProperties')} onClick={() => setPropsOpen(true)} disabled={!selected} shortcut="Ctrl+Space" />
        <span className="w-2" />
        <ToolBtn icon="up" label={t('moveUp')} onClick={() => actions.move(-1)} disabled={selIndex <= 0} />
        <ToolBtn icon="down" label={t('moveDown')} onClick={() => actions.move(1)} disabled={selIndex < 0 || selIndex >= products.length - 1} />
        <span className="w-2" />
        <ToolBtn icon="add" label={t('addProduct')} onClick={() => actions.add()} testId="add-product" />
        <ToolBtn icon="copy" label={t('clone')} onClick={actions.clone} disabled={!selected} />
        <span className="w-2" />
        <ToolBtn icon="delete" label={t('delete')} onClick={actions.remove} disabled={!selected} />
        <ToolBtn icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} />
      </Tabs>
      <section className="h-[190px] shrink-0 overflow-auto bg-[var(--gl-bg)]" data-testid="products-grid">
        <table className="gl-grid">
          <thead>
            <tr><th className="w-12">№</th><th className="w-40">{t('code')}</th><th>{t('name')}</th><th className="w-20">{t('colQty')}</th><th className="w-28">{t('costMaterialsShort')}</th><th className="w-28">{t('costOperationsShort')}</th><th className="w-28">{t('cost')}</th><th className="w-28">{t('total')}</th></tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const i = products.indexOf(p);
              const c = cost.byProduct[p.id] ?? { costMaterial: 0, costOperation: 0, cost: 0 };
              return (
                <tr key={p.id} onClick={() => select({ product: p.id })} onDoubleClick={() => setPropsOpen(true)} aria-selected={p.id === selectedId}>
                  <td className="no">{i + 1}</td>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{p.qty}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.costMaterial, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.costOperation, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.qty ? c.cost / p.qty : 0, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.cost, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="gl-caption justify-center"><ProductCaption /></div>
      <section className="min-h-0 flex-1 overflow-auto bg-[var(--gl-bg)]">
        {selected && showParts && parts.length > 0 && (
          <table className="gl-grid">
            <thead><tr><th>{t('operation')}</th><th className="w-12">№</th><th>{t('name')}</th><th>{t('colLength')}</th><th>{t('colWidth')}</th><th>{t('colQty')}</th><th>{t('colTC')}</th></tr></thead>
            <tbody>
              {parts.map(({ p, i, op }) => {
                const s = cuttingSize(p, doc, els);
                return (
                  <tr key={p.id}>
                    <td>({op.type}) {op.name}</td>
                    <td className="no">{i + 1}</td>
                    <td>{p.name}</td>
                    <td className="text-right tabular-nums">{formatNum(s.length, locale)}</td>
                    <td className="text-right tabular-nums">{formatNum(s.width, locale)}</td>
                    <td className="text-right tabular-nums">{p.qty}</td>
                    <td className="text-right tabular-nums">{totalCount(p, doc.products)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <Dialog open={propsOpen} onClose={() => setPropsOpen(false)} title={`${t('productProperties')} — №${selIndex + 1}`} width={520} footer={<button className="btn" onClick={() => setPropsOpen(false)}>{t('ok')}</button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('name')}><input className="input" value={selected.name} maxLength={200} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.name = e.target.value), `pname:${selected.id}`)} /></Field>
            <Field label={t('code')}><input className="input" value={selected.code} maxLength={60} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.code = e.target.value), `pcode:${selected.id}`)} /></Field>
            <Field label={t('colQty')} hint={t('productQtyHint')}><NumberInput value={selected.qty} min={0} max={100000} onChange={(v) => update((d) => void (d.doc.products[selIndex]!.qty = Math.round(v)))} /></Field>
            <Field label={t('readyDate')}><input type="date" className="input" value={selected.readyDate ?? ''} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.readyDate = e.target.value || null))} /></Field>
            <Field label={t('phone1')}><input className="input" maxLength={40} value={selected.phone1} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.phone1 = e.target.value), `ph1:${selected.id}`)} /></Field>
            <Field label={t('phone2')}><input className="input" maxLength={40} value={selected.phone2} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.phone2 = e.target.value), `ph2:${selected.id}`)} /></Field>
            <div className="col-span-2"><Field label={t('description')}><textarea className="input min-h-24" maxLength={5000} value={selected.description} onChange={(e) => update((d) => void (d.doc.products[selIndex]!.description = e.target.value), `pdesc:${selected.id}`)} /></Field></div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
