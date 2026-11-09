'use client';
import { useEffect, useState } from 'react';
import type { ProjectCost } from '@/domain/calc';
import { clearReferences, combineSameMaterial } from '@/domain/merge';
import { ENABLED_OPERATION_TYPES, isSheetOp, newId, newOperation, OPERATION_TYPES, type CatalogPick, type Operation, type OperationType } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Ico, type IcoName } from '../Ico';
import { Dialog, Tabs, ToolBtn, useUi } from '../ui';
import { useEditor } from './store';
import { OpPanel } from './OpPanel';
import { CatalogDialog } from './CatalogDialog';
import { formatMoney } from './format';

export const OP_TYPE_KEYS: Record<OperationType, MessageKey> = {
  CS: 'opCS', CN: 'opCN', CL: 'opCL', EL: 'opEL', SP: 'opSP', GR: 'opGR', XNC: 'opXNC', LB: 'opLB', O: 'opO',
};
export const OP_ICON: Record<OperationType, IcoName> = { CS: 'opCS', CN: 'opCN', CL: 'opCL', EL: 'opEL', SP: 'opSP', GR: 'opGR', XNC: 'opXNC', LB: 'opLB', O: 'opO' };
const TYPE_ORDER: OperationType[] = ['CS', 'CN', 'CL', 'EL', 'GR', 'SP', 'XNC', 'O', 'LB'];

/** Types picked from the catalog of goods (they carry a material). */
const CATALOG_TYPES = new Set<OperationType>(['CS', 'CN', 'CL', 'EL', 'SP']);

export function opCaption(op: Operation, t: (k: MessageKey) => string) {
  return `(${op.type}) ${op.name || (op.type === 'O' ? '' : t(OP_TYPE_KEYS[op.type]))}`.trim();
}

export function ProductCaption() {
  const products = useEditor((s) => s.doc.products);
  const selectedId = useEditor((s) => s.selectedProductId);
  const { t } = useI18n();
  const i = Math.max(0, products.findIndex((p) => p.id === selectedId));
  const p = products[i];
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Ico name="product" size={15} /> №{i + 1} {p.name} ({p.qty}{t('pcs')})
    </span>
  );
}

export function OperationsView({ cost, onTab }: { cost: ProjectCost; onTab: (t: 'operations' | 'products') => void }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const doc = useEditor((s) => s.doc);
  const ops = doc.operations;
  const selectedId = useEditor((s) => s.selectedOpId);
  const select = useEditor((s) => s.select);
  const update = useEditor((s) => s.update);
  const [typeOpen, setTypeOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ mode: 'new' | 'assign'; type: OperationType } | null>(null);
  const selIndex = ops.findIndex((o) => o.id === selectedId);
  const selected = selIndex >= 0 ? ops[selIndex]! : null;

  useEffect(() => {
    if (!selected && ops[0]) select({ op: ops[0].id });
  }, [ops, selected, select]);

  const add = (type: OperationType, material?: CatalogPick) => {
    const op = newOperation(type, doc, material);
    update((d) => void d.doc.operations.push(op));
    select({ op: op.id });
  };

  const actions = {
    clone: () => {
      if (!selected) return;
      const copy = { ...structuredClone(selected), id: newId('op'), name: `${selected.name} (copy)` } as Operation;
      if (isSheetOp(copy) || copy.type === 'CL') {
        copy.result = null;
        copy.parts = copy.parts.map((p) => ({ ...p, id: newId('pt') })) as never;
        copy.sheets = copy.sheets.map((s) => ({ ...s, id: newId('sh') })) as never;
      }
      update((d) => void d.doc.operations.splice(selIndex + 1, 0, copy));
      select({ op: copy.id });
    },
    remove: async () => {
      if (!selected) return;
      if (!(await ui.confirm({ title: t('deleteOperation'), message: t('confirmDeleteOperation', { name: opCaption(selected, t) }), danger: true }))) return;
      update((d) => {
        d.doc.operations.splice(selIndex, 1);
        clearReferences(d.doc, selected.id);
      });
      select({ op: ops[selIndex + 1]?.id ?? ops[selIndex - 1]?.id ?? null });
    },
    move: (dir: -1 | 1) => {
      const j = selIndex + dir;
      if (!selected || j < 0 || j >= ops.length) return;
      update((d) => {
        const arr = d.doc.operations;
        [arr[selIndex], arr[j]] = [arr[j]!, arr[selIndex]!];
      });
    },
    sort: () => update((d) => void d.doc.operations.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))),
    merge: () => {
      let n = 0;
      update((d) => void (n = combineSameMaterial(d.doc)));
      ui.toast(t('mergedOperations', { count: n }));
    },
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown' && !mod && ops[selIndex + 1]) { e.preventDefault(); select({ op: ops[selIndex + 1]!.id }); }
    else if (e.key === 'ArrowUp' && !mod && ops[selIndex - 1]) { e.preventDefault(); select({ op: ops[selIndex - 1]!.id }); }
    else if (mod && e.key === 'ArrowUp') { e.preventDefault(); actions.move(-1); }
    else if (mod && e.key === 'ArrowDown') { e.preventDefault(); actions.move(1); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); actions.clone(); }
    else if (e.key === 'Delete') { e.preventDefault(); actions.remove(); }
  };

  const productName = (id: string | null) => (id ? doc.products.find((p) => p.id === id)?.name ?? '' : t('projectOwner'));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value="operations"
        onChange={onTab}
        tabs={[
          { id: 'operations', label: t('operations'), icon: 'general' },
          { id: 'products', label: t('products'), icon: 'product' },
        ]}
      >
        <ToolBtn icon="opCS" label={`${t('add')} (CS) ${t('opCS')}`} onClick={() => add('CS')} testId="add-cs" />
        <ToolBtn icon="opEL" label={`${t('add')} (EL) ${t('opEL')}`} onClick={() => add('EL')} />
        <ToolBtn icon="opGR" label={`${t('add')} (GR) ${t('opGR')}`} onClick={() => add('GR')} />
        <ToolBtn icon="opXNC" label={`${t('add')} (XNC) ${t('opXNC')}`} onClick={() => add('XNC')} testId="add-xnc" />
        <button className="inline-flex items-center gap-1 px-1 text-[15px] font-bold text-[var(--gl-link)] hover:underline" onClick={() => setTypeOpen(true)} data-testid="add-operation">
          <Ico name="add" /> {t('operation')}
        </button>
        <ToolBtn icon="clone" label={t('clone')} onClick={actions.clone} disabled={!selected} shortcut="Ctrl+K" />
        <span className="w-2" />
        <ToolBtn icon="catalog" label={t('catalogOfGoods')} onClick={() => setCatalog({ mode: selected && CATALOG_TYPES.has(selected.type) ? 'assign' : 'new', type: selected && CATALOG_TYPES.has(selected.type) ? selected.type : 'CS' })} />
        <ToolBtn icon="general" label={t('mergeOperations')} onClick={actions.merge} disabled={ops.length < 2} />
        <ToolBtn icon="filter" label={t('sortOperations')} onClick={actions.sort} disabled={ops.length < 2} />
        <span className="w-2" />
        <ToolBtn icon="delete" label={t('delete')} onClick={actions.remove} disabled={!selected} shortcut="Del" />
        <ToolBtn icon="up" label={t('moveUp')} onClick={() => actions.move(-1)} disabled={selIndex <= 0} shortcut="Ctrl+↑" />
        <ToolBtn icon="down" label={t('moveDown')} onClick={() => actions.move(1)} disabled={selIndex < 0 || selIndex >= ops.length - 1} shortcut="Ctrl+↓" />
        <ToolBtn icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} shortcut="F1" />
      </Tabs>

      <section className="h-[190px] shrink-0 overflow-auto bg-[var(--gl-bg)] outline-none" tabIndex={0} onKeyDown={onKeyDown} data-testid="operations-grid">
        <table className="gl-grid">
          <thead>
            <tr>
              <th className="w-12">№</th><th className="w-20">{t('type')}</th><th className="w-52">{t('codeProduct')}</th><th>{t('name')}</th>
              <th className="w-28">{t('costMaterialsShort')}</th><th className="w-28">{t('costOperationsShort')}</th><th className="w-28">{t('cost')}</th>
              <th className="w-14">{t('printShort')}</th><th className="w-14" title={t('standardTip')}>St.N.</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op, i) => {
              const c = cost.byOperation[op.id];
              return (
                <tr key={op.id} onClick={() => select({ op: op.id })} aria-selected={op.id === selectedId}>
                  <td className="no">{i + 1}</td>
                  <td><span className="inline-flex items-center gap-1.5"><Ico name={OP_ICON[op.type]} size={15} />{op.type}</span></td>
                  <td>{op.type === 'O' ? productName(op.ownerId) : op.code}</td>
                  <td>{op.name}</td>
                  <td className="text-right tabular-nums">{formatMoney(c?.costMaterial ?? 0, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c?.costOperation ?? 0, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c?.cost ?? 0, locale)}</td>
                  <td className="text-center">
                    <input type="checkbox" aria-label={t('includeInPrint')} title={t('includeInPrint')} checked={op.print} onClick={(e) => e.stopPropagation()} onChange={(e) => update((d) => void (d.doc.operations[i]!.print = e.target.checked))} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" aria-label={t('standardTip')} title={t('standardTip')} checked={op.standard} onClick={(e) => e.stopPropagation()} onChange={(e) => update((d) => void (d.doc.operations[i]!.standard = e.target.checked))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ops.length === 0 && (
          <div className="flex flex-col items-center gap-0.5 py-3">
            <OperationTypeList onPick={(type) => add(type)} compact />
          </div>
        )}
      </section>

      <div className="gl-caption" data-testid="caption-bar">
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate" data-testid="panel-caption">
          {selected && <><Ico name={OP_ICON[selected.type]} size={15} /> {opCaption(selected, t)}</>}
        </span>
        <span className="flex-1 text-center"><ProductCaption /></span>
        <span className="flex-1" />
      </div>

      <section className="min-h-0 flex-1">
        {selected ? <OpPanel key={selected.id} opIndex={selIndex} cost={cost.byOperation[selected.id]!} /> : null}
      </section>

      <Dialog open={typeOpen} onClose={() => setTypeOpen(false)} title={t('selectOperationType')} width={420} testId="op-type-dialog"
        footer={<button className="btn" onClick={() => setTypeOpen(false)}>{t('cancel')}</button>}>
        <OperationTypeList onPick={(type) => { add(type); setTypeOpen(false); }} />
      </Dialog>
      <CatalogDialog
        open={!!catalog}
        onClose={() => setCatalog(null)}
        onPick={(m) => {
          if (catalog?.mode === 'assign' && selected && CATALOG_TYPES.has(selected.type)) {
            update((d) => {
              const op = d.doc.operations[selIndex]!;
              op.name = m.name;
              op.code = m.code;
              if ('materialId' in op) op.materialId = m.id;
              if (isSheetOp(op)) {
                op.params.thickness = m.thickness || op.params.thickness;
                op.params.materialPrice = m.price;
                const first = op.sheets[0];
                if (first && m.length > 0 && m.width > 0) Object.assign(first, { length: m.length, width: m.width, name: m.name });
              } else if (op.type === 'CL') {
                Object.assign(op.params, { thickness: m.thickness || op.params.thickness, materialPrice: m.price });
              } else if (op.type === 'EL' || op.type === 'SP') {
                op.params.materialPrice = m.price;
              }
            });
          } else if (catalog) add(catalog.type, m);
          setCatalog(null);
        }}
      />
    </div>
  );
}

export function OperationTypeList({ onPick, compact }: { onPick: (t: OperationType) => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <ul className={compact ? 'space-y-0' : 'space-y-1.5 py-1'}>
      {OPERATION_TYPES.map((type) => {
        const enabled = ENABLED_OPERATION_TYPES.includes(type);
        return (
          <li key={type}>
            <button disabled={!enabled} onClick={() => onPick(type)} className="gl-link items-center text-[16px] disabled:opacity-60" title={enabled ? undefined : t('comingSoon')}>
              <Ico name={OP_ICON[type]} size={16} />
              ({type}) {t(OP_TYPE_KEYS[type])}
              {!enabled && <span className="ml-1 text-xs text-[#888]">— {t('comingSoon')}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
