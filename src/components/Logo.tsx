import { BRAND } from '@/lib/brand';

/** Our own mark: a sheet with two guillotine cuts, plus the product name in bold blue. */
export function Logo({ size = 28, withName = true, light = false }: { size?: number; withName?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect x="2" y="5" width="28" height="22" rx="2" fill={light ? '#fff' : '#3b7dd8'} />
        <path d="M13 5v22M13 16h17" stroke={light ? '#3b7dd8' : '#fff'} strokeWidth="2.4" />
        <rect x="16" y="19" width="11" height="5" fill="#ffa500" />
      </svg>
      {withName && (
        <span
          className={`font-extrabold tracking-tight ${light ? 'text-white' : 'text-[#3b7dd8]'}`}
          style={{ fontFamily: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif", fontSize: size * 1.1, lineHeight: 1 }}
        >
          {BRAND.name}
        </span>
      )}
    </span>
  );
}
