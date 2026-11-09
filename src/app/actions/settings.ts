'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { Prisma } from '@/generated/prisma/client';
import { INPUT_MODES } from '@/domain/project';
import { parsePrefs, prefsSchema, type Prefs } from '@/domain/prefs';
import { fail, ok, type ActionResult } from './types';

export async function updatePreferences(input: { inputMode?: string; currency?: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({ inputMode: z.enum(INPUT_MODES).optional(), currency: z.string().trim().min(1).max(8).optional() })
    .safeParse(input);
  if (!parsed.success) return fail('invalidInput');
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath('/settings');
  return ok(undefined);
}

const materialSchema = z.object({
  category: z.string().trim().min(1, 'required').max(100),
  code: z.string().trim().max(60),
  name: z.string().trim().min(1, 'required').max(200),
  unit: z.string().trim().min(1).max(10),
  price: z.number().finite().min(0).max(1e9),
  thickness: z.number().finite().min(0).max(500),
  length: z.number().finite().min(0).max(100000),
  width: z.number().finite().min(0).max(100000),
});
export type MaterialInput = z.infer<typeof materialSchema>;

export async function saveMaterial(input: { id: string | null; data: MaterialInput }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = materialSchema.safeParse(input.data);
  if (!parsed.success) return fail('invalidInput', parsed.error.issues[0]?.path.join('.'));
  if (input.id) {
    const res = await db.material.updateMany({ where: { id: z.string().max(40).parse(input.id), userId: user.id }, data: parsed.data });
    if (!res.count) return fail('notFound');
    revalidatePath('/settings/catalog');
    return ok({ id: input.id });
  }
  const m = await db.material.create({ data: { ...parsed.data, userId: user.id } });
  revalidatePath('/settings/catalog');
  return ok({ id: m.id });
}

export async function deleteMaterial(input: { id: string }): Promise<ActionResult> {
  const user = await requireUser();
  const res = await db.material.deleteMany({ where: { id: z.string().max(40).parse(input.id), userId: user.id } });
  if (!res.count) return fail('notFound');
  revalidatePath('/settings/catalog');
  return ok(undefined);
}

/** Shared catalog + the user's own materials, for the "Catalog of goods" picker. */
export async function listMaterials() {
  const user = await requireUser();
  const rows = await db.material.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map((m) => ({ ...m, price: Number(m.price), own: m.userId === user.id, createdAt: m.createdAt.toISOString() }));
}

export async function getPrefs() {
  const user = await requireUser();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { prefs: true } });
  return parsePrefs(row.prefs);
}

/** Replaces one section of the user's preferences (postprocessor, xnc or orders). */
export async function updatePrefs(input: { section: 'postprocessor' | 'xnc' | 'orders'; data: unknown }): Promise<ActionResult<Prefs>> {
  const user = await requireUser();
  const section = z.enum(['postprocessor', 'xnc', 'orders']).parse(input.section);
  const current = parsePrefs((await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { prefs: true } })).prefs);
  const next = prefsSchema.safeParse({ ...current, [section]: input.data });
  if (!next.success) return fail('invalidInput', next.error.issues[0]?.path.join('.'));
  await db.user.update({ where: { id: user.id }, data: { prefs: next.data as unknown as Prisma.InputJsonValue } });
  revalidatePath('/settings');
  return ok(next.data);
}
