import { encodeCode128B } from '@/domain/code128';

/** Code 128 barcode: bars as SVG (crisp at any size), human-readable text below as normal text. */
export function Barcode({ value, height = 28, showText = true }: { value: string; height?: number; showText?: boolean }) {
  let modules: number[];
  try {
    modules = encodeCode128B(value);
  } catch {
    return <span className="text-xs text-red-600">{value}</span>;
  }
  const total = modules.reduce((a, b) => a + b, 0) + 20; // 10-module quiet zones
  let x = 10;
  const bars: { x: number; w: number }[] = [];
  modules.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <div className="leading-none">
      <svg viewBox={`0 0 ${total} 24`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={value}>
        {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={24} fill="#000" />)}
      </svg>
      {showText && <div className="text-center font-mono text-[7pt] tracking-wider">{value}</div>}
    </div>
  );
}
