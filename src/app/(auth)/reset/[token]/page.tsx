'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { resetPassword } from '@/app/actions/auth';
import { Dialog, ErrorText, Field, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

export default function ResetPage() {
  const { t } = useI18n();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [form, setForm] = useState({ password: '', repeat: '' });
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await resetPassword({ token, ...form });
    if (r.ok) router.replace('/projects');
    else setError(r.error);
  });
  return (
    <Dialog open title={t('resetTitle')} onClose={() => router.push('/login')} width={380}
      footer={<><button className="btn" disabled={pending} onClick={submit}>{pending && <Spinner />} {t('setPassword')}</button><button className="btn" onClick={() => router.push('/login')}>{t('cancel')}</button></>}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorText error={error} />
        <Field label={t('newPassword')} hint={t('passwordHint')}><input className="input" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label={t('repeatNewPassword')}><input className="input" type="password" autoComplete="new-password" required value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
