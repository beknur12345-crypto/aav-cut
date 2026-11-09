/**
 * Upgrades stored project documents to the current schema version.
 * v1 → v2: edge thicknesses stored as numbers become references to edgeband (EL) operations —
 * one EL operation is created per distinct thickness, so cutting sizes stay exactly the same.
 */
import { elParamsSchema, newId, SCHEMA_VERSION } from './project';

type Json = Record<string, unknown>;
const SIDES = ['t', 'b', 'l', 'r'] as const;
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599'];

export function migrateDoc(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const doc = structuredClone(raw) as Json;
  if (doc.schemaVersion === 1) {
    const ops = (Array.isArray(doc.operations) ? doc.operations : []) as Json[];
    const byThickness = new Map<number, string>();
    const newOps: Json[] = [];
    for (const op of ops) {
      for (const part of (Array.isArray(op.parts) ? op.parts : []) as Json[]) {
        const edges = (part.edges ?? {}) as Record<string, unknown>;
        const next: Record<string, string | null> = {};
        for (const side of SIDES) {
          const v = edges[side];
          if (typeof v === 'number' && v > 0) {
            let elId = byThickness.get(v);
            if (!elId) {
              elId = newId('op');
              byThickness.set(v, elId);
              const n = byThickness.size;
              newOps.push({
                type: 'EL', id: elId, code: '', name: `Edgeband ${v} mm`, print: true, standard: true, description: '', materialId: null,
                params: elParamsSchema.parse({ thickness: Math.min(20, v), symbol: String.fromCharCode(64 + Math.min(26, n)), color: COLORS[(n - 1) % COLORS.length] }),
              });
            }
            next[side] = elId;
          } else next[side] = typeof v === 'string' ? v : null;
        }
        part.edges = next;
        part.grooves ??= { t: null, b: null, l: null, r: null };
        part.surface ??= { front: null, back: null };
      }
      op.standard ??= true;
      op.description ??= '';
    }
    doc.operations = [...ops, ...newOps];
    doc.schemaVersion = 2;
  }
  // Future versions add their steps above; anything else is left for the schema to reject.
  void SCHEMA_VERSION;
  return doc;
}
