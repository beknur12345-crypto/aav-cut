import { describe, expect, it } from 'vitest';
import { buildLabels } from './labels';
import { buildZpl } from './zpl';
import { emptyDoc, newOperation, newPart, type LbOperation, type SheetOperation } from './project';

describe('ZPL labels', () => {
  it('writes one ^XA…^XZ block per label with a Code 128 barcode at the printer resolution', () => {
    const doc = emptyDoc();
    const cs = newOperation('CS', doc) as SheetOperation;
    cs.parts.push({ ...newPart(doc.products[0]!.id), length: 720, width: 560, qty: 2, name: 'Side ^~ evil' });
    const lb = newOperation('LB', doc) as LbOperation;
    lb.params.forEachPart = true;
    lb.params.dpi = 300;
    lb.params.zplHeader = '^MMT\n^XZ\nnot a command';
    doc.operations.push(cs, lb);
    const zpl = buildZpl(buildLabels(doc, lb, 7), lb, 'Kitchen', new Date('2026-11-09'));
    expect(zpl.match(/\^XA/g)).toHaveLength(2);
    expect(zpl.match(/\^XZ/g)).toHaveLength(2); // the header's own ^XZ was dropped
    expect(zpl).toContain(`^PW${Math.round((58 / 25.4) * 300)}`);
    expect(zpl).toContain('^BCN,');
    expect(zpl).toContain('^FDP7-1-1^FS');
    expect(zpl).toContain('^MMT');
    expect(zpl).not.toContain('not a command');
    expect(zpl).toContain('^FDSide evil^FS'); // control characters removed
  });
});
