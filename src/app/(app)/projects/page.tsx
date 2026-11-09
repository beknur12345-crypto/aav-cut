import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ProjectsBrowser } from '@/components/projects/ProjectsBrowser';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const user = await requireUser();
  const { folder } = await searchParams;
  const allFolders = await db.folder.findMany({ where: { userId: user.id }, select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } });
  const current = folder ? allFolders.find((f) => f.id === folder) ?? null : null;
  const folderId = current?.id ?? null;
  const projects = await db.project.findMany({
    where: { userId: user.id, folderId },
    select: { id: true, number: true, name: true, state: true, cost: true, currency: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  // Breadcrumb path from the root to the current folder.
  const crumbs: { id: string; name: string }[] = [];
  for (let f = current; f; f = allFolders.find((x) => x.id === f!.parentId) ?? null) crumbs.unshift({ id: f.id, name: f.name });
  return (
    <ProjectsBrowser
      key={folderId ?? 'root'}
      folderId={folderId}
      crumbs={crumbs}
      allFolders={allFolders}
      folders={allFolders.filter((f) => f.parentId === folderId)}
      projects={projects.map((p) => ({ ...p, cost: Number(p.cost), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))}
    />
  );
}
