'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { emptyDoc, PROJECT_STATES, projectDocSchema, projectHeaderSchema, type InputMode, type ProjectDoc } from '@/domain/project';
import { projectCost } from '@/domain/calc';
import { migrateDoc } from '@/domain/migrate';
import { fail, ok, type ActionResult } from './types';

const idSchema = z.string().min(1).max(40);
const nameSchema = z.string().trim().min(1, 'required').max(200);

async function ownedFolder(userId: string, folderId: string | null) {
  if (!folderId) return null;
  const f = await db.folder.findFirst({ where: { id: folderId, userId } });
  if (!f) throw new Error('Folder not found');
  return f;
}

export async function createProject(input: { name?: string; folderId: string | null }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const folderId = idSchema.nullable().parse(input.folderId);
  await ownedFolder(user.id, folderId);
  const name = nameSchema.safeParse(input.name ?? 'New project');
  if (!name.success) return fail('required', 'name');
  const doc = emptyDoc(user.inputMode as InputMode);
  const p = await db.project.create({
    data: { userId: user.id, folderId, name: name.data, currency: user.currency, doc: doc as unknown as Prisma.InputJsonValue },
  });
  revalidatePath('/projects');
  return ok({ id: p.id });
}

export async function createFolder(input: { name: string; parentId: string | null }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parentId = idSchema.nullable().parse(input.parentId);
  await ownedFolder(user.id, parentId);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail('required', 'name');
  const f = await db.folder.create({ data: { userId: user.id, parentId, name: name.data } });
  revalidatePath('/projects');
  return ok({ id: f.id });
}

const itemsSchema = z.array(z.object({ kind: z.enum(['project', 'folder']), id: idSchema })).min(1).max(500);
type Items = z.infer<typeof itemsSchema>;

function split(items: Items) {
  return { projectIds: items.filter((i) => i.kind === 'project').map((i) => i.id), folderIds: items.filter((i) => i.kind === 'folder').map((i) => i.id) };
}

export async function renameItem(input: { kind: 'project' | 'folder'; id: string; name: string }): Promise<ActionResult> {
  const user = await requireUser();
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail('required', 'name');
  const id = idSchema.parse(input.id);
  const res =
    input.kind === 'project'
      ? await db.project.updateMany({ where: { id, userId: user.id }, data: { name: name.data } })
      : await db.folder.updateMany({ where: { id, userId: user.id }, data: { name: name.data } });
  if (!res.count) return fail('notFound');
  revalidatePath('/projects');
  return ok(undefined);
}

export async function deleteItems(input: Items): Promise<ActionResult> {
  const user = await requireUser();
  const { projectIds, folderIds } = split(itemsSchema.parse(input));
  // Deleting a folder deletes everything inside it (sub-folders cascade in the database; projects explicitly).
  const allFolders = await descendantFolders(user.id, folderIds);
  await db.$transaction([
    db.project.deleteMany({ where: { userId: user.id, OR: [{ id: { in: projectIds } }, { folderId: { in: allFolders } }] } }),
    db.folder.deleteMany({ where: { userId: user.id, id: { in: folderIds } } }),
  ]);
  revalidatePath('/projects');
  return ok(undefined);
}

async function descendantFolders(userId: string, roots: string[]): Promise<string[]> {
  const all = await db.folder.findMany({ where: { userId }, select: { id: true, parentId: true } });
  const out = new Set(roots.filter((r) => all.some((f) => f.id === r)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return [...out];
}

export async function moveItems(input: { items: Items; folderId: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  const { projectIds, folderIds } = split(itemsSchema.parse(input.items));
  const target = idSchema.nullable().parse(input.folderId);
  await ownedFolder(user.id, target);
  if (target && (await descendantFolders(user.id, folderIds)).includes(target)) return fail('cannotMoveIntoItself');
  await db.$transaction([
    db.project.updateMany({ where: { userId: user.id, id: { in: projectIds } }, data: { folderId: target } }),
    db.folder.updateMany({ where: { userId: user.id, id: { in: folderIds } }, data: { parentId: target } }),
  ]);
  revalidatePath('/projects');
  return ok(undefined);
}

export async function copyProjects(input: { ids: string[] }): Promise<ActionResult> {
  const user = await requireUser();
  const ids = z.array(idSchema).min(1).max(100).parse(input.ids);
  const src = await db.project.findMany({ where: { userId: user.id, id: { in: ids } } });
  for (const p of src) {
    await db.project.create({
      data: {
        userId: user.id, folderId: p.folderId, name: `${p.name} (copy)`.slice(0, 200), currency: p.currency,
        orderDate: p.orderDate, readyDate: p.readyDate, notes: p.notes, doc: p.doc as Prisma.InputJsonValue, cost: p.cost,
      },
    });
  }
  revalidatePath('/projects');
  return ok(undefined);
}

export async function setProjectState(input: { ids: string[]; state: (typeof PROJECT_STATES)[number] }): Promise<ActionResult> {
  const user = await requireUser();
  const ids = z.array(idSchema).min(1).max(500).parse(input.ids);
  const state = z.enum(PROJECT_STATES).parse(input.state);
  await db.project.updateMany({ where: { userId: user.id, id: { in: ids } }, data: { state } });
  revalidatePath('/projects');
  return ok(undefined);
}

/**
 * Saves the whole project. `version` implements optimistic locking: if the project was saved
 * elsewhere in the meantime, the save is rejected instead of silently overwriting.
 */
export async function saveProject(input: { id: string; version: number; header: unknown; doc: unknown }): Promise<ActionResult<{ version: number; cost: number }>> {
  const user = await requireUser();
  const id = idSchema.parse(input.id);
  const version = z.number().int().min(1).parse(input.version);
  const header = projectHeaderSchema.safeParse(input.header);
  if (!header.success) return fail('invalidInput', header.error.issues[0]?.path.join('.'));
  const doc = projectDocSchema.safeParse(input.doc);
  if (!doc.success) {
    console.warn('saveProject: invalid document', doc.error.issues.slice(0, 3));
    return fail('invalidInput');
  }
  const cost = projectCost(doc.data).cost;
  const res = await db.project.updateMany({
    where: { id, userId: user.id, version },
    data: { ...header.data, doc: doc.data as unknown as Prisma.InputJsonValue, cost, version: { increment: 1 } },
  });
  if (!res.count) {
    const exists = await db.project.count({ where: { id, userId: user.id } });
    return fail(exists ? 'saveConflict' : 'notFound');
  }
  return ok({ version: version + 1, cost });
}

export async function importProject(input: { folderId: string | null; file: unknown }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const folderId = idSchema.nullable().parse(input.folderId);
  await ownedFolder(user.id, folderId);
  const file = input.file as { doc?: unknown } | null;
  const parsed = z
    .object({ format: z.literal('aav-cut-project'), header: projectHeaderSchema, doc: projectDocSchema })
    .safeParse(file && typeof file === 'object' ? { ...file, doc: migrateDoc(file.doc) } : file);
  if (!parsed.success) return fail('importInvalid');
  const { header, doc } = parsed.data;
  const p = await db.project.create({
    data: { userId: user.id, folderId, ...header, doc: doc as unknown as Prisma.InputJsonValue, cost: projectCost(doc as ProjectDoc).cost },
  });
  revalidatePath('/projects');
  return ok({ id: p.id });
}
