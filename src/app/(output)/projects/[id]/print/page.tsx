import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadProject } from '@/lib/load-project';
import { getT } from '@/lib/i18n/server';
import { BRAND } from '@/lib/brand';
import { cuttingSize, edgeRows, elOps, grooveRows, isResultCurrent, projectCost, surfaceRows, totalCount } from '@/domain/calc';
import { isSheetOp, type Operation, type ProjectDoc } from '@/domain/project';
import { CuttingMap } from '@/components/CuttingMap';
import { PrintButton } from '@/components/PrintButton';
import { formatMoney, formatNum } from '@/components/editor/format';
import type { TFunction } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Report' };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ op?: string; s?: string; m?: string; o?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { op: onlyOp, s: sectionsParam, m, o } = await searchParams;
  const ALL = ['summary', 'parts', 'maps', 'commands', 'offcuts', 'operations'];
  const sections = new Set(sectionsParam ? sectionsParam.split(',').filter((x) => ALL.includes(x)) : ALL);
  const margin = Math.min(40, Math.max(0, Number(m) || 10));
  const orientation = o === 'landscape' ? 'landscape' : 'portrait';
  const p = await loadProject(user.id, id);
  const { t, locale } = await getT();
  const cost = projectCost(p.doc);
  const ops = p.doc.operations.filter((o) => (onlyOp ? o.id === onlyOp : o.print));
  const n = (v: number, d = 2) => formatNum(v, locale, d);

  return (
    <div className="h-full overflow-auto bg-white">
      <style>{`@page { size: A4 ${orientation}; margin: ${margin}mm; }`}</style>
      <div className="mx-auto max-w-[1100px] p-8 text-[13px] text-black print:p-0">
        <div className="no-print mb-6 flex items-center justify-between border border-[#c4c4c4] bg-[#f4f4f4] p-3">
          <span className="text-sm">{t('printHint')}</span>
          <PrintButton label={t('print')} />
        </div>

        <header className="mb-5 flex items-start justify-between border-b-2 border-black pb-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#555]">{BRAND.name} · {t('cuttingReport')}</p>
            <h1 className="text-2xl font-bold">{p.header.name}</h1>
            <p>{t('orderId')} {p.number}{p.header.orderDate && ` · ${t('orderDate')}: ${p.header.orderDate}`}{p.header.readyDate && ` · ${t('readyDate')}: ${p.header.readyDate}`}</p>
          </div>
          <dl className="text-right">
            <dt className="text-xs text-[#555]">{t('cost')}</dt>
            <dd className="text-xl font-bold tabular-nums">{formatMoney(cost.cost, locale)} {p.header.currency}</dd>
            <dd className="text-xs text-[#555]">{t('costMaterials')} {formatMoney(cost.costMaterial, locale)} · {t('costOperations')} {formatMoney(cost.costOperation, locale)}</dd>
          </dl>
        </header>
        {p.header.notes && <p className="mb-4 whitespace-pre-wrap border border-[#c4c4c4] p-2">{p.header.notes}</p>}

        {sections.has('summary') && (<>
        <h2 className="mb-1 text-base font-bold">{t('operations')}</h2>
        <table className="gl-grid mb-6">
          <thead><tr><th>№</th><th>{t('type')}</th><th>{t('name')}</th><th>{t('costMaterialsShort')}</th><th>{t('costOperationsShort')}</th><th>{t('cost')}</th></tr></thead>
          <tbody>
            {ops.map((op, i) => {
              const c = cost.byOperation[op.id]!;
              return (
                <tr key={op.id}>
                  <td className="no">{i + 1}</td><td>{op.type}</td><td>{op.name}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.costMaterial, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.costOperation, locale)}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.cost, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>)}

        {ops.map((op) => <OpSection key={op.id} op={op} doc={p.doc} t={t} n={n} locale={locale} sections={sections} />)}

        <footer className="mt-8 border-t border-[#c4c4c4] pt-2 text-[11px] text-[#666]">
          {BRAND.name} · {new Date().toLocaleString(locale === 'en' ? 'en-GB' : locale)} · {t('cmdLegend')}
        </footer>
      </div>
    </div>
  );
}

function OpSection({ op, doc, t, n, locale, sections }: { op: Operation; doc: ProjectDoc; t: TFunction; n: (v: number, d?: number) => string; locale: string; sections: Set<string> }) {
  if (!isSheetOp(op) && op.type !== 'CL' && !sections.has('operations')) return null;
  const title = <h2 className="mb-1 border-b border-[#888] pb-0.5 text-base font-bold">({op.type}) {op.name}</h2>;
  const product = (pid: string | null) => doc.products.find((x) => x.id === pid)?.name ?? '';

  if (isSheetOp(op)) {
    const els = elOps(doc);
    const result = op.result;
    const current = isResultCurrent(op, doc);
    const sym = (ref: string | null) => (ref ? els.get(ref)?.params.symbol ?? '' : '');
    return (
      <section className="print-page mb-8">
        {title}
        <p className="mb-2 text-xs text-[#444]">
          {n(op.params.thickness, 1)} mm · {op.type === 'CN' ? `${t('millDiameter')} ${n(op.cn.millDiameter, 1)}` : `${t('sawThickness')} ${n(op.params.kerf, 1)}`} mm · {t('trimByLength')} {n(op.params.trimLength, 1)} · {t('trimByWidth')} {n(op.params.trimWidth, 1)} · {t('fixTexture')}: {op.params.fixTexture ? t('yes') : t('no')}
        </p>
        {sections.has('parts') && <table className="gl-grid mb-4 text-xs">
          <thead><tr><th>№</th><th>{t('name')}</th><th>{t('product')}</th><th>{t('colLength')}</th><th>{t('colWidth')}</th><th>{t('colTC')}</th><th>{t('colTxt')}</th><th>{t('colET')}</th><th>{t('colEB')}</th><th>{t('colEL')}</th><th>{t('colER')}</th></tr></thead>
          <tbody>
            {op.parts.map((part, i) => {
              const s = cuttingSize(part, doc, els);
              return (
                <tr key={part.id}>
                  <td className="no">{i + 1}</td><td>{part.name}</td><td>{product(part.productId)}</td>
                  <td className="text-right tabular-nums">{n(s.length, 1)}</td><td className="text-right tabular-nums">{n(s.width, 1)}</td>
                  <td className="text-right tabular-nums">{totalCount(part, doc.products)}</td><td className="text-center">{part.grain ? '✓' : ''}</td>
                  {(['t', 'b', 'l', 'r'] as const).map((sd) => <td key={sd} className="text-center font-bold">{sym(part.edges[sd])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>}
        {!sections.has('maps') && !sections.has('commands') && !sections.has('offcuts') ? null : !result ? (
          <p className="bg-[#fff3bf] p-2">{t('noCuttingYet')}</p>
        ) : (
          <>
            {!current && <p className="mb-2 bg-[#fff3bf] p-2">{t('resultOutdated')}</p>}
            {result.comment && <p className="mb-2 italic">“{result.comment}”</p>}
            <p className="mb-2"><b>{t('statSheets')}:</b> {result.sheetsUsed} · <b>F:</b> {n(result.fill * 100)} % · <b>LT:</b> {n(result.cutLength / 1000)} m</p>
            {result.patterns.map((pat, i) => (
              <div key={i} className="mb-6 break-inside-avoid">
                <p className="mb-1 text-xs font-bold">№: {i + 1}/{result.patterns.length} · S: {pat.length}/{pat.width} · C: {pat.count} · Cp: {pat.placements.length} · LT: {n(pat.cutLength / 1000)} · F: {n((pat.partsArea / (pat.length * pat.width)) * 100)}%</p>
                <div className={sections.has('maps') && sections.has('commands') ? 'grid grid-cols-[1fr_190px] gap-3' : ''}>
                  {sections.has('maps') && <CuttingMap pattern={pat} className="w-full" />}
                  {sections.has('commands') && <table className="gl-grid h-fit text-[11px]">
                    <thead><tr><th>№</th><th>{t('cmd')}</th><th>{t('size')}</th><th>C</th><th>P</th></tr></thead>
                    <tbody>
                      {pat.commands.map((c) => (
                        <tr key={c.no}><td>{c.no}</td><td className="text-center font-bold">{c.cmd}</td><td className="text-right">{c.cmd === 'R' ? '' : n(c.size, 1)}</td><td className="text-right">{c.cmd === 'R' ? '' : c.count}</td><td className="text-center">{c.partNo ?? ''}</td></tr>
                      ))}
                    </tbody>
                  </table>}
                </div>
                {sections.has('offcuts') && pat.offcuts.length > 0 && <p className="mt-1 text-[11px]">{t('legendOffcut')}: {pat.offcuts.map((o) => `${n(o.length, 1)}×${n(o.width, 1)}`).join(', ')}</p>}
              </div>
            ))}
          </>
        )}
      </section>
    );
  }

  if (op.type === 'CL') {
    const r = op.result;
    return (
      <section className="mb-8 break-inside-avoid">
        {title}
        <table className="gl-grid mb-3 text-xs">
          <thead><tr><th>№</th><th>{t('name')}</th><th>{t('product')}</th><th>{t('colLength')}</th><th>{t('colTC')}</th></tr></thead>
          <tbody>{op.parts.map((p, i) => <tr key={p.id}><td className="no">{i + 1}</td><td>{p.name}</td><td>{product(p.productId)}</td><td className="text-right">{n(p.length, 1)}</td><td className="text-right">{totalCount(p, doc.products)}</td></tr>)}</tbody>
        </table>
        {r ? (
          <>
            <p className="mb-1"><b>{t('bands')}:</b> {r.barsUsed} · <b>F:</b> {n(r.fill * 100)} % · <b>{t('cuts')}:</b> {r.cuts}</p>
            {r.patterns.map((pat, i) => (
              <p key={i} className="text-xs">№{i + 1} L:{pat.length} ×{pat.count}: {pat.pieces.map((pc) => `${pc.no}(${n(pc.length, 1)})`).join(' + ')}{pat.offcut > 0 && ` · ${t('legendOffcut')} ${n(pat.offcut, 1)}`}</p>
            ))}
          </>
        ) : <p className="bg-[#fff3bf] p-2">{t('noCuttingYet')}</p>}
      </section>
    );
  }

  if (op.type === 'EL' || op.type === 'GR' || op.type === 'SP') {
    const rows: { partNo: number; opName: string; name: string; a: string; b: string; c: string }[] =
      op.type === 'EL' ? edgeRows(doc, op).map((r) => ({ partNo: r.partNo, opName: r.opName, name: r.name, a: `${n(r.length, 1)}×${n(r.width, 1)}`, b: `L${r.pastL} W${r.pastW} ×${r.tc}`, c: `${n(r.edgeLength, 3)} m` }))
      : op.type === 'GR' ? grooveRows(doc, op).map((r) => ({ partNo: r.partNo, opName: r.opName, name: r.name, a: `${n(r.length, 1)}×${n(r.width, 1)}`, b: `${r.sides} ×${r.tc}`, c: `${n(r.grooveLength, 3)} m` }))
      : surfaceRows(doc, op).map((r) => ({ partNo: r.partNo, opName: r.opName, name: r.name, a: `${n(r.length, 1)}×${n(r.width, 1)}`, b: `${r.faces} ×${r.tc}`, c: `${n(r.area, 3)} m²` }));
    return (
      <section className="mb-8 break-inside-avoid">
        {title}
        {op.type === 'EL' && <p className="mb-1 text-xs">{t('symbol')}: <b style={{ color: op.params.color }}>{op.params.symbol}</b> · {t('thickness')} {n(op.params.thickness, 1)} mm · {t('width')} {n(op.params.width, 1)} mm</p>}
        <table className="gl-grid text-xs">
          <thead><tr><th>{t('good')}</th><th>{t('name')}</th><th>{t('size')}</th><th>{t('colQty')}</th><th>{t('total')}</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r.opName} · №{r.partNo}</td><td>{r.name}</td><td>{r.a}</td><td>{r.b}</td><td className="text-right">{r.c}</td></tr>)}</tbody>
        </table>
        {op.description && <p className="mt-1 whitespace-pre-wrap text-xs">{op.description}</p>}
      </section>
    );
  }

  if (op.type === 'O') {
    return (
      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-1 border-b border-[#888] pb-0.5 text-base font-bold">(O) {op.name || t('opO')} · {op.ownerId ? product(op.ownerId) : t('projectOwner')}</h2>
        <table className="gl-grid text-xs">
          <thead><tr><th>№</th><th>{t('code')}</th><th>{t('name')}</th><th>{t('unit')}</th><th>{t('colQty')}</th><th>{t('price')}</th><th>{t('total')}</th></tr></thead>
          <tbody>{op.materials.map((m, i) => <tr key={m.id}><td className="no">{i + 1}</td><td>{m.code}</td><td>{m.name}</td><td>{m.unit}</td><td className="text-right">{n(m.qty, 3)}</td><td className="text-right">{formatMoney(m.price, locale)}</td><td className="text-right">{formatMoney(m.qty * m.price, locale)}</td></tr>)}</tbody>
        </table>
        {op.description && <p className="mt-1 whitespace-pre-wrap text-xs">{op.description}</p>}
      </section>
    );
  }
  return null;
}
