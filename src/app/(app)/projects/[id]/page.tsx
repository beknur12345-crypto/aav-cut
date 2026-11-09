import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadProject } from '@/lib/load-project';
import { ProjectEditor } from '@/components/editor/ProjectEditor';
import { db } from '@/lib/db';
import { parsePrefs } from '@/domain/prefs';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user.id, id);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { prefs: true } });
  return <ProjectEditor key={project.id} project={project} prefs={parsePrefs(row.prefs)} />;
}
