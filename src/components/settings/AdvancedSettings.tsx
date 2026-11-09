'use client';
import { useState, useTransition } from 'react';
import { updatePrefs } from '@/app/actions/settings';
import type { Prefs } from '@/domain/prefs';
import { VENDOR_MACHINES } from '@/domain/export/postprocessors';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, Field, NumberInput, Spinner, Tabs, useUi } from '../ui';

function useSaveSection(onSaved: (p: Prefs) => void) {
  const { t } = useI18n();
  const ui = useUi();
  const [pending, start] = useTransition();
  const save = (section: 'postprocessor' | 'xnc' | 'orders', data: unknown, close: () => void) =>
    start(async () => {
      const r = await updatePrefs({ section, data });
      if (r.ok) { onSaved(r.data); ui.toast(t('saved')); close(); }
      else ui.toast(t(r.error), 'error');
    });
  return { pending, save };
}

const Num = ({ label, value, onChange, min = 0, max = 100000 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
  <Field label={label}><NumberInput value={value} min={min} max={max} onChange={onChange} /></Field>
);

export function PostprocessorSettings({ open, onClose, prefs, onSaved }: { open: boolean; onClose: () => void; prefs: Prefs; onSaved: (p: Prefs) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(prefs.postprocessor);
  const [tab, setTab] = useState<'general' | 'gcode' | 'machines'>('general');
  const { pending, save } = useSaveSection(onSaved);
  const g = v.gcode;
  const setG = (k: keyof typeof g) => (n: number) => setV({ ...v, gcode: { ...g, [k]: n } });
  return (
    <Dialog open={open} onClose={onClose} title={t('postprocessors')} width={560} testId="pp-settings"
      footer={<><button className="btn" disabled={pending} onClick={() => save('postprocessor', v, onClose)}>{pending && <Spinner />} {t('ok')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <Tabs value={tab} onChange={setTab} className="-mx-3 -mt-3 mb-3" tabs={[{ id: 'general', label: t('general') }, { id: 'gcode', label: 'G-code' }, { id: 'machines', label: t('machines') }]} />
      {tab === 'general' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.prefixMachine} onChange={(e) => setV({ ...v, prefixMachine: e.target.checked })} /> {t('prefixMachine')}</label>
      )}
      {tab === 'gcode' && (
        <div className="grid grid-cols-2 gap-3">
          <Num label={t('spindleRpm')} value={g.spindle} onChange={setG('spindle')} min={100} max={60000} />
          <Num label={t('toolNumber')} value={g.tool} onChange={(n) => setG('tool')(Math.round(n))} max={999} />
          <Num label={t('feedRate')} value={g.feed} onChange={setG('feed')} min={10} />
          <Num label={t('plungeRate')} value={g.plungeFeed} onChange={setG('plungeFeed')} min={10} />
          <Num label={t('safeZ')} value={g.safeZ} onChange={setG('safeZ')} min={1} max={500} />
          <Num label={t('decimals')} value={g.decimals} onChange={(n) => setG('decimals')(Math.round(n))} max={4} />
        </div>
      )}
      {tab === 'machines' && (
        <>
          <p className="mb-2 text-sm text-[#444]">{t('ppVendorText')}</p>
          <ul className="columns-2 text-xs text-[#555]">{VENDOR_MACHINES.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
    </Dialog>
  );
}

export function XncSettings({ open, onClose, prefs, onSaved }: { open: boolean; onClose: () => void; prefs: Prefs; onSaved: (p: Prefs) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(prefs.xnc);
  const [tab, setTab] = useState<'tools' | 'constraints'>('tools');
  const { pending, save } = useSaveSection(onSaved);
  const c = v.constraints;
  const setC = (k: keyof typeof c) => (n: number) => setV({ ...v, constraints: { ...c, [k]: n } });
  return (
    <Dialog open={open} onClose={onClose} title={t('xncEditor')} width={620} testId="xnc-settings"
      footer={<><button className="btn" disabled={pending} onClick={() => save('xnc', v, onClose)}>{pending && <Spinner />} {t('ok')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <Tabs value={tab} onChange={setTab} className="-mx-3 -mt-3 mb-3" tabs={[{ id: 'tools', label: t('tools') }, { id: 'constraints', label: t('constraintsGroup') }]} />
      {tab === 'tools' ? (
        <>
          <table className="gl-grid text-sm">
            <thead><tr><th>{t('name')}</th><th>{t('type')}</th><th>Ø</th><th>T</th><th /></tr></thead>
            <tbody>
              {v.tools.map((tool, i) => (
                <tr key={tool.id}>
                  <td><input aria-label={t('name')} className="input !py-0" value={tool.name} maxLength={60} onChange={(e) => setV({ ...v, tools: v.tools.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></td>
                  <td>
                    <select aria-label={t('type')} className="input !py-0" value={tool.type} onChange={(e) => setV({ ...v, tools: v.tools.map((x, j) => (j === i ? { ...x, type: e.target.value as 'drill' | 'mill' } : x)) })}>
                      <option value="drill">{t('drill')}</option><option value="mill">{t('mill')}</option>
                    </select>
                  </td>
                  <td><NumberInput aria-label="Ø" className="!w-20 !py-0" value={tool.diameter} min={0.5} max={200} onChange={(n) => setV({ ...v, tools: v.tools.map((x, j) => (j === i ? { ...x, diameter: n } : x)) })} /></td>
                  <td><NumberInput aria-label="T" className="!w-16 !py-0" value={tool.number} max={999} onChange={(n) => setV({ ...v, tools: v.tools.map((x, j) => (j === i ? { ...x, number: Math.round(n) } : x)) })} /></td>
                  <td><button className="icon-btn" aria-label={t('delete')} title={t('delete')} onClick={() => setV({ ...v, tools: v.tools.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="gl-link mt-2 w-auto" disabled={v.tools.length >= 100} onClick={() => setV({ ...v, tools: [...v.tools, { id: `t${Date.now()}`, name: 'Drill 10', type: 'drill', diameter: 10, number: v.tools.length + 1 }] })}>+ {t('add')}</button>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {([['minL', 'minLength'], ['maxL', 'maxLength'], ['minW', 'minWidth'], ['maxW', 'maxWidth'], ['minT', 'minThickness'], ['maxT', 'maxThickness'], ['holeEdgeDistance', 'holeEdgeDistance']] as [keyof typeof c, MessageKey][]).map(([k, label]) => (
            <Num key={k} label={`${t(label)}, mm`} value={c[k]} onChange={setC(k)} />
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function OrderSettings({ open, onClose, prefs, onSaved, userNumber }: { open: boolean; onClose: () => void; prefs: Prefs; onSaved: (p: Prefs) => void; userNumber: number }) {
  const { t } = useI18n();
  const [v, setV] = useState(prefs.orders);
  const [tab, setTab] = useState<'settings' | 'welcome' | 'mail'>('settings');
  const { pending, save } = useSaveSection(onSaved);
  const url = typeof window === 'undefined' ? `/order/${userNumber}` : `${window.location.origin}/order/${userNumber}`;
  return (
    <Dialog open={open} onClose={onClose} title={t('moduleOrders')} width={600} testId="orders-settings"
      footer={<><button className="btn" disabled={pending} onClick={() => save('orders', v, onClose)}>{pending && <Spinner />} {t('ok')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <Tabs value={tab} onChange={setTab} className="-mx-3 -mt-3 mb-3" tabs={[{ id: 'settings', label: t('settings') }, { id: 'welcome', label: t('welcomePage') }, { id: 'mail', label: t('mailAlert') }]} />
      {tab === 'settings' && (
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} data-testid="orders-enabled" /> {t('enableOnlineOrders')}</label>
          <Field label={t('publicOrderUrl')}><input className="input" readOnly value={url} onFocus={(e) => e.target.select()} data-testid="orders-url" /></Field>
          <Field label={t('manufacturerName')}><input className="input" maxLength={120} value={v.manufacturer} onChange={(e) => setV({ ...v, manufacturer: e.target.value })} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.allowEdges} onChange={(e) => setV({ ...v, allowEdges: e.target.checked })} /> {t('ordersAllowEdges')}</label>
          <p className="text-xs text-[#555]">{t('ordersMaterialsHint')}</p>
        </div>
      )}
      {tab === 'welcome' && (
        <Field label={t('welcomeText')}><textarea className="input min-h-40" maxLength={3000} value={v.welcome} onChange={(e) => setV({ ...v, welcome: e.target.value })} /></Field>
      )}
      {tab === 'mail' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.notify} onChange={(e) => setV({ ...v, notify: e.target.checked })} /> {t('notifyNewOrders')}</label>
      )}
    </Dialog>
  );
}
