import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** "Save the data to a local disk": every project of the signed-in user as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const [projects, folders, materials] = await Promise.all([
    db.project.findMany({ where: { userId: user.id }, orderBy: { number: 'asc' } }),
    db.folder.findMany({ where: { userId: user.id }, select: { id: true, name: true, parentId: true } }),
    db.material.findMany({ where: { userId: user.id } }),
  ]);
  const body = {
    format: 'aav-cut-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders,
    materials: materials.map((m) => ({ ...m, price: Number(m.price), userId: undefined })),
    projects: projects.map((p) => ({
      format: 'aav-cut-project', folderId: p.folderId, number: p.number, state: p.state,
      header: { name: p.name, currency: p.currency, orderDate: p.orderDate, readyDate: p.readyDate, notes: p.notes }, doc: p.doc,
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="aav-cut-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
