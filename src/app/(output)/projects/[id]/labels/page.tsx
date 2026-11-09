import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadProject } from '@/lib/load-project';
import { getT } from '@/lib/i18n/server';
import { buildLabels } from '@/domain/labels';
import { Barcode } from '@/components/Barcode';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Labels' };

export default async function LabelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ op?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { op: opId } = await searchParams;
  const project = await loadProject(user.id, id);
  const lb = project.doc.operations.find((o) => o.id === opId && o.type === 'LB');
  if (!lb || lb.type !== 'LB') notFound();
  const { t } = await getT();
  const p = lb.params;
  const labels = buildLabels(project.doc, lb, project.number);
  const has = (f: (typeof p.fields)[number]) => p.fields.includes(f);
  const a4 = p.printer === 'a4';
  const perPage = a4 ? p.columns * p.rows : 1;
  const pages = Array.from({ length: Math.ceil(labels.length / perPage) }, (_, i) => labels.slice(i * perPage, (i + 1) * perPage));
  const pageCss = a4 ? `@page { size: A4; margin: ${p.pageMargin ? '8mm' : '0'}; }` : `@page { size: ${p.labelWidth}mm ${p.labelHeight}mm; margin: 0; }`;

  return (
    <div className="h-full overflow-auto bg-[#e9e9e9] print:bg-white">
      <style>{pageCss}</style>
      <div className="no-print flex items-center justify-between border-b border-[#c4c4c4] bg-white p-3">
        <span className="text-sm">{t('labelsCount', { count: labels.length })} · {project.header.name}</span>
        <PrintButton label={t('print')} />
      </div>
      {labels.length === 0 && <p className="p-8 text-center">{t('noLabels')}</p>}
      <div className="flex flex-col items-center gap-6 py-6 print:block print:p-0">
        {pages.map((page, pi) => (
          <div
            key={pi}
            className="print-page bg-white shadow print:shadow-none"
            style={a4 ? { width: '210mm', minHeight: '297mm', padding: p.pageMargin ? '8mm' : 0, display: 'grid', gridTemplateColumns: `repeat(${p.columns}, ${p.labelWidth}mm)`, gridAutoRows: `${p.labelHeight}mm`, gap: `${p.gap}mm`, alignContent: 'start' } : { width: `${p.labelWidth}mm`, height: `${p.labelHeight}mm` }}
            data-testid="label-page"
          >
            {page.map((l) => (
              <div key={l.key} className="overflow-hidden p-[1.5mm] text-[8pt] leading-tight" style={{ width: `${p.labelWidth}mm`, height: `${p.labelHeight}mm`, border: p.borders === 'perimeter' ? '0.2mm solid #000' : 'none' }}>
                {has('barcode') && <Barcode value={l.barcode} height={30} />}
                {has('project') && <div className="truncate font-bold">{project.header.name}</div>}
                {has('product') && l.product && <div className="truncate">{l.product}</div>}
                {has('material') && <div className="truncate">{l.material}</div>}
                {has('name') && <div className="truncate text-[9pt] font-bold">{l.name}</div>}
                {has('size') && <div className="text-[10pt] font-bold">{l.length} × {l.width}</div>}
                {has('edges') && l.edges && <div>{t('edges')}: {l.edges}</div>}
                {has('qty') && <div>{t('colQty')}: {l.qtyText}</div>}
                {has('number') && <div>№ {l.number}</div>}
                {has('date') && <div>{new Date().toLocaleDateString()}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
