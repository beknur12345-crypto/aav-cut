import 'server-only';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { emptyDoc, projectDocSchema, type ProjectDoc } from '@/domain/project';
import { migrateDoc } from '@/domain/migrate';

/** Loads a project the user owns; 404 otherwise (no information about other users' projects). */
export async function loadProject(userId: string, id: string) {
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const p = await db.project.findFirst({ where: { id, userId } });
  if (!p) notFound();
  const parsed = projectDocSchema.safeParse(migrateDoc(p.doc));
  if (!parsed.success) console.error(`Project ${p.id}: stored document failed validation`, parsed.error.issues.slice(0, 3));
  const doc: ProjectDoc = parsed.success ? parsed.data : emptyDoc();
  return {
    id: p.id,
    number: p.number,
    state: p.state,
    version: p.version,
    header: { name: p.name, currency: p.currency, orderDate: p.orderDate, readyDate: p.readyDate, notes: p.notes },
    doc,
  };
}
