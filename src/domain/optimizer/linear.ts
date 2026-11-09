/**
 * One-dimensional cutting-stock optimizer for band (linear) cutting: cuts part lengths from
 * stock bars/bands with saw kerf and end trimming. Several greedy strategies (first-fit and
 * best-fit decreasing, plus a subset-sum fill per bar) compete and the plan with the fewest
 * stock metres wins. Identical bars are grouped into patterns.
 */

export interface LinPart { id: string; no: number; length: number; qty: number }
export interface LinStock { id: string; length: number; qty: number }
export interface LinSettings { kerf: number; trim: number; minOffcut: number; timeBudgetMs?: number }

export interface LinPattern {
  stockId: string;
  length: number;
  count: number;
  pieces: { partId: string; no: number; x: number; length: number }[];
  /** Reusable leftover at the end of the bar (≥ minOffcut), mm. */
  offcut: number;
  /** Leftover too short to reuse, mm. */
  waste: number;
}

export interface LinResult {
  patterns: LinPattern[];
  unplaced: { partId: string; qty: number }[];
  barsUsed: number;
  stockLength: number;
  partsLength: number;
  cuts: number;
  fill: number;
  durationMs: number;
}

type Item = { partId: string; no: number; length: number };

/** Usable length of a bar after trimming both ends (trim includes the saw kerf). */
const usable = (s: LinStock, st: LinSettings) => s.length - 2 * st.trim;

/** Best subset of items (by total length) that fits `cap`, with kerf between pieces. Bounded DP on 1 mm grid. */
function bestFill(items: Item[], cap: number, kerf: number): number[] {
  const C = Math.floor(cap + kerf);
  if (C <= 0) return [];
  // Each piece consumes length + kerf; the bar gets one extra kerf so the last piece needs no cut.
  const w = items.map((it) => Math.ceil(it.length + kerf - 1e-9));
  if (items.length * C > 4_000_000) return []; // too big for DP: caller falls back to greedy
  const reach = new Int32Array(C + 1).fill(-1);
  const from = new Int32Array(C + 1).fill(-1);
  reach[0] = -2;
  for (let i = 0; i < items.length; i++) {
    const wi = w[i]!;
    for (let c = C; c >= wi; c--) {
      if (reach[c] === -1 && reach[c - wi] !== -1 && reach[c - wi] !== i) {
        reach[c] = i;
        from[c] = c - wi;
      }
    }
  }
  let best = C;
  while (best > 0 && reach[best] === -1) best--;
  const chosen: number[] = [];
  for (let c = best; c > 0 && reach[c]! >= 0; c = from[c]!) chosen.push(reach[c]!);
  return chosen;
}

export function optimizeLinear(parts: LinPart[], stocks: LinStock[], settings: LinSettings): LinResult {
  const t0 = Date.now();
  const strategies = ['dp', 'bfd', 'ffd'] as const;
  let best: LinResult | null = null;
  for (const s of strategies) {
    const r = run(parts, stocks, settings, s);
    if (!best || r.unplaced.length < best.unplaced.length || (r.unplaced.length === best.unplaced.length && r.stockLength < best.stockLength - 1e-6)) best = r;
  }
  return { ...best!, durationMs: Date.now() - t0 };
}

function run(parts: LinPart[], stocks: LinStock[], st: LinSettings, strategy: 'dp' | 'bfd' | 'ffd'): LinResult {
  const k = st.kerf;
  const remaining: Item[] = [];
  const unplacedMap = new Map<string, number>();
  for (const p of parts) {
    if (p.qty <= 0 || p.length <= 0) continue;
    const fits = stocks.some((s) => s.qty > 0 && p.length <= usable(s, st));
    for (let i = 0; i < p.qty; i++) {
      if (fits) remaining.push({ partId: p.id, no: p.no, length: p.length });
      else unplacedMap.set(p.id, (unplacedMap.get(p.id) ?? 0) + 1);
    }
  }
  remaining.sort((a, b) => b.length - a.length);
  const stockLeft = new Map(stocks.map((s) => [s.id, s.qty]));
  const bars: { stock: LinStock; items: Item[] }[] = [];

  while (remaining.length) {
    let pick: { stock: LinStock; idx: number[] } | null = null;
    let pickScore = -1;
    for (const stock of stocks) {
      if ((stockLeft.get(stock.id) ?? 0) <= 0) continue;
      const cap = usable(stock, st);
      if (cap <= 0) continue;
      let idx: number[] = [];
      if (strategy === 'dp') idx = bestFill(remaining.slice(0, 400), cap, k);
      if (!idx.length) {
        // Greedy: first-fit (longest first) or best-fit (fill tightest).
        let used = -k;
        const order = remaining.map((_, i) => i);
        if (strategy === 'bfd') order.sort((a, b) => remaining[b]!.length - remaining[a]!.length);
        for (const i of order) {
          if (used + k + remaining[i]!.length <= cap + 1e-9) {
            idx.push(i);
            used += k + remaining[i]!.length;
          }
        }
      }
      if (!idx.length) continue;
      const len = idx.reduce((a, i) => a + remaining[i]!.length, 0);
      const all = idx.length === remaining.length;
      // Prefer the bar with the highest utilisation; for the last bar, the shortest stock that holds everything.
      const score = all ? 2 - stock.length / 1e9 : len / stock.length;
      if (score > pickScore) {
        pickScore = score;
        pick = { stock, idx };
      }
    }
    if (!pick) break;
    const chosen = new Set(pick.idx);
    bars.push({ stock: pick.stock, items: pick.idx.map((i) => remaining[i]!).sort((a, b) => b.length - a.length) });
    for (let i = remaining.length - 1; i >= 0; i--) if (chosen.has(i)) remaining.splice(i, 1);
    stockLeft.set(pick.stock.id, (stockLeft.get(pick.stock.id) ?? 0) - 1);
  }
  for (const it of remaining) unplacedMap.set(it.partId, (unplacedMap.get(it.partId) ?? 0) + 1);

  // Group identical bars into patterns.
  const patterns: LinPattern[] = [];
  const keyOf = (b: (typeof bars)[number]) => `${b.stock.id}|${b.items.map((i) => i.partId).join(',')}`;
  const index = new Map<string, LinPattern>();
  let cuts = 0;
  for (const b of bars) {
    const key = keyOf(b);
    const existing = index.get(key);
    const pieceCuts = b.items.length + (st.trim > 0 ? 2 : 0);
    cuts += pieceCuts;
    if (existing) {
      existing.count++;
      continue;
    }
    let x = st.trim;
    const pieces = b.items.map((it) => {
      const piece = { partId: it.partId, no: it.no, x, length: it.length };
      x += it.length + k;
      return piece;
    });
    const left = Math.max(0, b.stock.length - st.trim - (x - k));
    const reusable = left - k >= st.minOffcut ? left - k : 0;
    const pattern: LinPattern = { stockId: b.stock.id, length: b.stock.length, count: 1, pieces, offcut: reusable, waste: reusable ? 0 : left };
    index.set(key, pattern);
    patterns.push(pattern);
  }
  const stockLength = bars.reduce((a, b) => a + b.stock.length, 0);
  const partsLength = bars.reduce((a, b) => a + b.items.reduce((s, i) => s + i.length, 0), 0);
  return {
    patterns,
    unplaced: [...unplacedMap].map(([partId, qty]) => ({ partId, qty })),
    barsUsed: bars.length,
    stockLength,
    partsLength,
    cuts,
    fill: stockLength ? partsLength / stockLength : 0,
    durationMs: 0,
  };
}
