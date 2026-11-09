import type { CuttingResult } from '@/domain/project';

type Pattern = CuttingResult['patterns'][number];

/**
 * Scale drawing of one sheet: parts (orange, numbered, with sizes on their edges), reusable
 * offcuts (violet), waste (grey) and cut lines. Pure SVG: same output on screen, in thumbnails
 * and in the printed report.
 */
export function CuttingMap({
  pattern, labels = true, className, title, selected, onPartClick, onFreeClick,
}: {
  pattern: Pattern; labels?: boolean; className?: string; title?: string;
  /** Edit nesting: highlighted placement index and click handlers. */
  selected?: number | null;
  onPartClick?: (index: number) => void;
  onFreeClick?: (x: number, y: number) => void;
}) {
  const free = onFreeClick ? { onClick: (e: React.MouseEvent<SVGRectElement>) => { const r = e.currentTarget; onFreeClick(Number(r.getAttribute('x')) + 0.5, Number(r.getAttribute('y')) + 0.5); }, style: { cursor: 'copy' } } : {};
  const { length: L, width: W } = pattern;
  const font = Math.max(L, W) / 62;
  const stroke = Math.max(L, W) / 700;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  /** Approximate rendered width of a label, so labels are drawn only where they fit. */
  const textW = (v: number) => fmt(v).length * font * 0.62 + font * 0.5;
  return (
    <svg viewBox={`0 0 ${L} ${W}`} className={className} role="img" aria-label={title} preserveAspectRatio="xMidYMin meet">
      {/* Labels never capture clicks: clicking a part's number selects the part. */}
      <style>{"text{pointer-events:none}"}</style>
      {title && <title>{title}</title>}
      <rect x={0} y={0} width={L} height={W} fill="var(--gl-waste, #c9c9c9)" stroke="#333" strokeWidth={stroke} />
      {onFreeClick && pattern.waste.map((r, i) => (
        <rect key={`w${i}`} x={r.x} y={r.y} width={r.length} height={r.width} fill="var(--gl-waste, #c9c9c9)" stroke="#888" strokeWidth={stroke / 2} {...free} />
      ))}
      {pattern.offcuts.map((r, i) => (
        <g key={`o${i}`}>
          <rect x={r.x} y={r.y} width={r.length} height={r.width} fill="var(--gl-offcut, #a3abff)" stroke="#333" strokeWidth={stroke} {...free} />
          {labels && r.length > textW(r.length) && r.width > font * 1.3 && (
            <text x={r.x + r.length - font * 0.3} y={r.y + r.width - font * 0.35} fontSize={font} fontWeight={700} textAnchor="end" fill="#111">{fmt(r.length)}</text>
          )}
          {labels && r.width > textW(r.width) + font * 1.3 && r.length > font * 1.3 && (
            <text x={r.x + r.length - font * 0.3} y={r.y + font * 1.1} fontSize={font} fontWeight={700} textAnchor="end" fill="#111" writingMode="tb">{fmt(r.width)}</text>
          )}
        </g>
      ))}
      {pattern.placements.map((p, i) => {
        const big = Math.min(font * 1.15, p.width / 2.2, p.length / 3);
        return (
          <g key={`p${i}`}>
            <rect
              x={p.x} y={p.y} width={p.length} height={p.width}
              fill={selected === i ? '#ff6b00' : 'var(--gl-part, #ffa500)'} stroke={selected === i ? '#c0141b' : '#333'} strokeWidth={selected === i ? stroke * 4 : stroke}
              onClick={onPartClick ? () => onPartClick(i) : undefined} style={onPartClick ? { cursor: 'pointer' } : undefined} data-part={p.no}
            />
            {labels && (
              <>
                <text x={p.x + p.length / 2} y={p.y + p.width / 2} fontSize={big} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#111">
                  {p.no}{p.rotated ? '↻' : ''}
                </text>
                {p.length > textW(p.length) && p.width > font * 1.4 && (
                  <text x={p.x + font * 0.25} y={p.y + p.width - font * 0.3} fontSize={font} fontWeight={700} fill="#111">{fmt(p.length)}</text>
                )}
                {p.width > textW(p.width) + font * 1.3 && p.length > font * 1.4 && (
                  <text x={p.x + p.length - font * 0.35} y={p.y + font * 0.25} fontSize={font} fontWeight={700} fill="#111" writingMode="tb" textAnchor="start">{fmt(p.width)}</text>
                )}
              </>
            )}
          </g>
        );
      })}
      {labels &&
        pattern.cuts.filter((c) => c.trim).map((c, i) => (
          <line key={`c${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="#555" strokeWidth={stroke} strokeDasharray={`${font / 2} ${font / 3}`} />
        ))}
    </svg>
  );
}
