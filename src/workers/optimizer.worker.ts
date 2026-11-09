/// <reference lib="webworker" />
import { optimize, type OptPart, type OptSettings, type OptStock } from '@/domain/optimizer';
import { optimizeLinear, type LinPart, type LinSettings, type LinStock } from '@/domain/optimizer/linear';

type Msg =
  | { kind: 'sheet'; parts: OptPart[]; stocks: OptStock[]; settings: OptSettings }
  | { kind: 'linear'; parts: LinPart[]; stocks: LinStock[]; settings: LinSettings };

// Runs the optimizers off the main thread so the editor stays responsive on large jobs.
self.onmessage = (e: MessageEvent<Msg>) => {
  try {
    const m = e.data;
    const result = m.kind === 'linear' ? optimizeLinear(m.parts, m.stocks, m.settings) : optimize(m.parts, m.stocks, m.settings);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
