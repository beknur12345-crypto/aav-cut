'use client';
import { useI18n } from '@/lib/i18n/client';

export default function ErrorPage({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  const { t } = useI18n();
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('errorTitle')}</h1>
      <p className="text-slate-600">{t('errorText')}</p>
      {error.digest && <code className="text-xs text-slate-400">{error.digest}</code>}
      <button className="btn btn-primary" onClick={reset}>{t('tryAgain')}</button>
    </main>
  );
}
