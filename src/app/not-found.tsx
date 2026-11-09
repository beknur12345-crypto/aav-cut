import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="text-slate-600">{t('notFoundText')}</p>
      <Link className="btn btn-primary" href="/projects">{t('backToProjects')}</Link>
    </main>
  );
}
