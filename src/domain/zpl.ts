/** ZPL II output for label printers (Zebra and compatibles). */
import type { LabelData } from './labels';
import type { LbOperation } from './project';

/** ^FD data may not contain the ZPL control characters ^ and ~ (they would start new commands). */
const fd = (s: string) => s.replace(/[\^~\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

export function buildZpl(labels: LabelData[], lb: LbOperation, projectName: string, date = new Date()): string {
  const p = lb.params;
  const dots = (mm: number) => Math.round((mm / 25.4) * p.dpi);
  const has = (f: (typeof p.fields)[number]) => p.fields.includes(f);
  const header = p.zplHeader.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('^') && !/^\^X[AZ]/.test(l));
  const fontH = dots(3);
  const out: string[] = [];
  for (const l of labels) {
    const lines: string[] = ['^XA', '^CI28', `^PW${dots(p.labelWidth)}`, `^LL${dots(p.labelHeight)}`, ...header];
    let y = dots(1.5);
    const x = dots(1.5);
    const text = (s: string, scale = 1) => {
      lines.push(`^FO${x},${y}^A0N,${Math.round(fontH * scale)},${Math.round(fontH * scale)}^FD${fd(s)}^FS`);
      y += Math.round(fontH * scale * 1.2);
    };
    if (has('barcode')) {
      lines.push(`^FO${x},${y}^BY2^BCN,${dots(8)},Y,N,N^FD${fd(l.barcode)}^FS`);
      y += dots(12);
    }
    if (has('project')) text(projectName);
    if (has('product') && l.product) text(l.product);
    if (has('material')) text(l.material);
    if (has('name')) text(l.name, 1.2);
    if (has('size')) text(`${l.length} x ${l.width}`, 1.4);
    if (has('edges') && l.edges) text(l.edges);
    if (has('qty')) text(`Qty ${l.qtyText}`);
    if (has('number')) text(`No ${l.number}`);
    if (has('date')) text(date.toISOString().slice(0, 10));
    lines.push('^XZ');
    out.push(lines.join('\n'));
  }
  return out.join('\n') + '\n';
}
