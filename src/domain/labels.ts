/** Builds the list of labels to print for a labels (LB) operation. */
import { cuttingSize, elOps, totalCount } from './calc';
import { isSheetOp, type LbOperation, type ProjectDoc } from './project';

export interface LabelData {
  key: string;
  barcode: string;
  kind: 'part' | 'offcut';
  material: string;
  product: string;
  name: string;
  length: number;
  width: number;
  edges: string;
  qtyText: string;
  number: string;
}

export function buildLabels(doc: ProjectDoc, lb: LbOperation, projectNumber: number): LabelData[] {
  const p = lb.params;
  const els = elOps(doc);
  const out: LabelData[] = [];
  const sym = (id: string | null) => (id ? els.get(id)?.params.symbol ?? '–' : '–');
  doc.operations.forEach((op, oi) => {
    if (!isSheetOp(op)) return;
    if (p.printParts && p.source !== 'offcuts') {
      op.parts.forEach((part, pi) => {
        const tc = totalCount(part, doc.products);
        if (p.onlyQtyAboveZero && tc <= 0) return;
        const s = cuttingSize(part, doc, els);
        const base = {
          kind: 'part' as const, material: op.name, product: doc.products.find((x) => x.id === part.productId)?.name ?? '', name: part.name, length: s.length, width: s.width,
          edges: `${sym(part.edges.t)} / ${sym(part.edges.b)} / ${sym(part.edges.l)} / ${sym(part.edges.r)}`, number: `${oi + 1}.${pi + 1}`,
        };
        const code = `P${projectNumber}-${oi + 1}-${pi + 1}`;
        const copies = p.forEachPart ? tc : 1;
        for (let k = 1; k <= copies; k++) out.push({ ...base, key: `${code}-${k}`, barcode: code, qtyText: p.forEachPart ? `${k}/${tc}` : String(tc) });
      });
    }
    if (p.printOffcuts && p.source !== 'parts' && op.result) {
      op.result.patterns.forEach((pat, si) => {
        pat.offcuts.forEach((o, ci) => {
          const copies = p.forEachOffcut ? pat.count : 1;
          const code = `O${projectNumber}-${oi + 1}-${si + 1}-${ci + 1}`;
          for (let k = 1; k <= copies; k++)
            out.push({ key: `${code}-${k}`, barcode: code, kind: 'offcut', material: op.name, product: '', name: 'Offcut', length: Math.round(o.length * 10) / 10, width: Math.round(o.width * 10) / 10, edges: '', qtyText: p.forEachOffcut ? `${k}/${pat.count}` : String(pat.count), number: `${oi + 1}.S${si + 1}` });
        });
      });
    }
  });
  return out;
}
