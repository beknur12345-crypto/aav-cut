/** Per-user settings stored as JSON on the user: postprocessors, XNC editor, order module. */
import { z } from 'zod';
import { DEFAULT_GCODE } from './export/postprocessors';
import { DEFAULT_XNC_CONSTRAINTS, DEFAULT_XNC_TOOLS } from './xnc';

const n = (min: number, max: number) => z.number().finite().min(min).max(max);

export const prefsSchema = z.object({
  postprocessor: z.object({
    prefixMachine: z.boolean().default(false),
    gcode: z.object({
      spindle: n(100, 60000).default(DEFAULT_GCODE.spindle),
      feed: n(10, 100000).default(DEFAULT_GCODE.feed),
      plungeFeed: n(10, 100000).default(DEFAULT_GCODE.plungeFeed),
      safeZ: n(1, 500).default(DEFAULT_GCODE.safeZ),
      tool: z.number().int().min(0).max(999).default(DEFAULT_GCODE.tool),
      decimals: z.number().int().min(0).max(4).default(DEFAULT_GCODE.decimals),
    }).prefault({}),
  }).prefault({}),
  xnc: z.object({
    tools: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().max(60), type: z.enum(['drill', 'mill']), diameter: n(0.5, 200), number: z.number().int().min(0).max(999) })).max(100).default(DEFAULT_XNC_TOOLS),
    constraints: z.object({
      minL: n(0, 100000).default(DEFAULT_XNC_CONSTRAINTS.minL), maxL: n(0, 100000).default(DEFAULT_XNC_CONSTRAINTS.maxL),
      minW: n(0, 100000).default(DEFAULT_XNC_CONSTRAINTS.minW), maxW: n(0, 100000).default(DEFAULT_XNC_CONSTRAINTS.maxW),
      minT: n(0, 1000).default(DEFAULT_XNC_CONSTRAINTS.minT), maxT: n(0, 1000).default(DEFAULT_XNC_CONSTRAINTS.maxT),
      holeEdgeDistance: n(0, 1000).default(DEFAULT_XNC_CONSTRAINTS.holeEdgeDistance),
    }).prefault({}),
  }).prefault({}),
  orders: z.object({
    enabled: z.boolean().default(false),
    manufacturer: z.string().trim().max(120).default(''),
    welcome: z.string().max(3000).default(''),
    notify: z.boolean().default(true),
    allowEdges: z.boolean().default(true),
  }).prefault({}),
});
export type Prefs = z.infer<typeof prefsSchema>;

/** Never throws: unknown or invalid stored values fall back to defaults. */
export function parsePrefs(raw: unknown): Prefs {
  const r = prefsSchema.safeParse(raw ?? {});
  return r.success ? r.data : prefsSchema.parse({});
}
