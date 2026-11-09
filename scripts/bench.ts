// Compares our optimizer with the GibLab reference run on the same 28-part cabinet job.
import { optimize } from '../src/domain/optimizer';

const parts = [
  { id: 'side', no: 1, length: 720, width: 560, qty: 8, canRotate: false },
  { id: 'bottom', no: 2, length: 564, width: 560, qty: 4, canRotate: false },
  { id: 'rail', no: 3, length: 564, width: 100, qty: 8, canRotate: false },
  { id: 'shelf', no: 4, length: 562, width: 520, qty: 4, canRotate: false },
  { id: 'door', no: 5, length: 716, width: 596, qty: 4, canRotate: false },
];
const res = optimize(parts, [{ id: 's', length: 2750, width: 1830, qty: 1000, trimLength: 10, trimWidth: 10 }], {
  kerf: 4.4, initialDirection: 'any', maxRotations: 6, minOffcutLong: 400, minOffcutShort: 100,
});
const sheetArea = 2750 * 1830;
console.log('                 ours        GibLab');
console.log(`sheets           ${String(res.sheetsUsed).padEnd(12)}2`);
console.log(`total fill       ${(res.fill * 100).toFixed(2).padEnd(12)}77.66 %`);
res.patterns.forEach((p, i) => console.log(`sheet ${i + 1} fill     ${((p.partsArea / sheetArea) * 100).toFixed(2).padEnd(12)}${i === 0 ? '81.80' : '73.51'} %  (${p.placements.length} parts ×${p.count}, offcuts ${p.offcuts.map((o) => `${o.length.toFixed(0)}×${o.width.toFixed(0)}`).join(', ')})`));
console.log(`cut length (m)   ${(res.cutLength / 1000).toFixed(2).padEnd(12)}43.17`);
console.log(`time (ms)        ${res.durationMs}`);
