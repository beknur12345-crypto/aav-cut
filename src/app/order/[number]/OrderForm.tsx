'use client';
import { useState, useTransition } from 'react';
import { submitOrder, type getOrderForm } from '@/app/actions/orders';
import { Ico } from '@/components/Ico';
import { Logo } from '@/components/Logo';
import { NumberInput, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

type Form = NonNullable<Awaited<ReturnType<typeof getOrderForm>>>;
type Row = { key: number; materialId: string; length: number; width: number; qty: number; name: string; grain: boolean; edges: { t: number; b: number; l: number; r: number } };
const EDGE_OPTIONS = [0, 0.4, 0.8, 1, 2];

export function OrderForm({ userNumber, form }: { userNumber: number; form: Form }) {
  const { t } = useI18n();
  const first = form.materials[0]?.id ?? '';
  const blank = (key: number): Row => ({ key, materialId: first, length: 0, width: 0, qty: 1, name: '', grain: true, edges: { t: 0, b: 0, l: 0, r: 0 } });
  const [rows, setRows] = useState<Row[]>([blank(1)]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', comment: '' });
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () =>
    start(async () => {
      setError(null);
      const parts = rows.filter((r) => r.length > 0 && r.width > 0).map((r) => ({ materialId: r.materialId, length: r.length, width: r.width, qty: r.qty, name: r.name, grain: r.grain, edges: r.edges }));
      const res = await submitOrder({ userNumber, customer, website, parts });
      if (res.ok) setDone(res.data.orderNumber);
      else setError(res.error);
    });

  return (
    <div className="flex h-full flex-col overflow-auto bg-[var(--gl-bg)]">
      <header className="flex min-h-[64px] items-center gap-4 border-b border-[#a4a4a4] bg-gradient-to-b from-[#fafafa] to-[#d6d6d6] px-4">
        <Logo size={26} withName={!form.manufacturer} />
        <h1 className="text-[22px] font-bold" style={{ fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{form.manufacturer || t('onlineOrder')}</h1>
      </header>
      <main className="mx-auto w-full max-w-5xl space-y-3 p-4">
        {done !== null ? (
          <section className="border border-[#a4a4a4] bg-white p-6 text-center" data-testid="order-done">
            <p className="text-xl font-bold">{t('orderThanks', { number: done })}</p>
            <p className="mt-2 text-[#444]">{t('orderThanksText')}</p>
          </section>
        ) : (
          <>
            {form.welcome && <section className="whitespace-pre-wrap border border-[#a4a4a4] bg-white p-3 text-sm">{form.welcome}</section>}
            <section className="border border-[#a4a4a4] bg-white">
              <h2 className="gl-tabbar !min-h-[30px] text-[16px]">{t('yourContacts')}</h2>
              <div className="grid gap-3 p-3 sm:grid-cols-3">
                {(['name', 'phone', 'email'] as const).map((k) => (
                  <label key={k} className="block text-sm"><span className="label">{t(k === 'name' ? 'customerName' : k === 'phone' ? 'phone1' : 'email')}{k !== 'email' && ' *'}</span>
                    <input className="input" type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'} maxLength={k === 'email' ? 254 : 120} value={customer[k]} onChange={(e) => setCustomer({ ...customer, [k]: e.target.value })} data-testid={`order-${k}`} />
                  </label>
                ))}
                <label className="block text-sm sm:col-span-3"><span className="label">{t('comment')}</span>
                  <textarea className="input min-h-16" maxLength={2000} value={customer.comment} onChange={(e) => setCustomer({ ...customer, comment: e.target.value })} />
                </label>
                {/* Honeypot for bots: hidden from people and assistive technology. */}
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </section>
            <section className="border border-[#a4a4a4] bg-white">
              <h2 className="gl-tabbar !min-h-[30px] text-[16px]">{t('parts')}</h2>
              <div className="overflow-auto">
                <table className="gl-grid text-sm" data-testid="order-parts">
                  <thead>
                    <tr><th>№</th><th>{t('material')}</th><th>{t('colLength')}</th><th>{t('colWidth')}</th><th>{t('colQty')}</th><th>{t('name')}</th><th>{t('colTxt')}</th>{form.allowEdges && <th>{t('edgesMm')}</th>}<th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.key}>
                        <td className="no">{i + 1}</td>
                        <td>
                          <select aria-label={t('material')} className="input !py-0" value={r.materialId} onChange={(e) => setRow(i, { materialId: e.target.value })}>
                            {form.materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.length}×{m.width})</option>)}
                          </select>
                        </td>
                        <td><NumberInput aria-label={t('colLength')} className="!w-24 !py-0" value={r.length} min={0} max={10000} onChange={(v) => setRow(i, { length: v })} data-testid={`order-length-${i}`} /></td>
                        <td><NumberInput aria-label={t('colWidth')} className="!w-24 !py-0" value={r.width} min={0} max={10000} onChange={(v) => setRow(i, { width: v })} data-testid={`order-width-${i}`} /></td>
                        <td><NumberInput aria-label={t('colQty')} className="!w-16 !py-0" value={r.qty} min={1} max={10000} onChange={(v) => setRow(i, { qty: Math.round(v) })} /></td>
                        <td><input aria-label={t('name')} className="input !py-0" maxLength={200} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} /></td>
                        <td className="text-center"><input type="checkbox" aria-label={t('colTxt')} checked={r.grain} onChange={(e) => setRow(i, { grain: e.target.checked })} /></td>
                        {form.allowEdges && (
                          <td className="whitespace-nowrap">
                            {(['t', 'b', 'l', 'r'] as const).map((s) => (
                              <select key={s} aria-label={`${t('edges')} ${s.toUpperCase()}`} title={s.toUpperCase()} className="input !inline-block !w-14 !px-0.5 !py-0" value={r.edges[s]} onChange={(e) => setRow(i, { edges: { ...r.edges, [s]: Number(e.target.value) } })}>
                                {EDGE_OPTIONS.map((o) => <option key={o} value={o}>{o || '–'}</option>)}
                              </select>
                            ))}
                          </td>
                        )}
                        <td><button className="icon-btn" aria-label={t('delete')} title={t('delete')} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}><Ico name="delete" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-2">
                <button className="gl-link w-auto items-center" disabled={rows.length >= 500} onClick={() => setRows((rs) => [...rs, { ...blank(Date.now()), materialId: rs[rs.length - 1]?.materialId ?? first }])} data-testid="order-add-row"><Ico name="add" /> {t('addPart')}</button>
              </div>
            </section>
            {error && <p role="alert" className="border border-[#e5312b] bg-[#ffe3e3] p-2 text-sm text-[#a61e1e]">{t(error)}</p>}
            <div className="flex justify-end"><button className="btn px-6 py-1.5 font-bold" disabled={pending} onClick={submit} data-testid="order-submit">{pending && <Spinner />} {t('sendOrder')}</button></div>
          </>
        )}
      </main>
    </div>
  );
}
