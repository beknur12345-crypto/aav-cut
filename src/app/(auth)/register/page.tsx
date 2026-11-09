'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { register } from '@/app/actions/auth';
import { Dialog, ErrorText, Field, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ email: '', password: '', repeat: '' });
  const submit = () => start(async () => {
    const r = await register(form);
    if (r.ok) router.replace('/projects');
    else setError(r.error);
  });
  return (
    <Dialog open title={t('registerTitle')} onClose={() => router.push('/login')} width={380}
      footer={<><button className="btn" disabled={pending} onClick={submit}>{pending && <Spinner />} {t('register')}</button><button className="btn" onClick={() => router.push('/login')}>{t('cancel')}</button></>}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorText error={error} />
        <Field label={t('email')}><input className="input" type="email" name="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={t('password')} hint={t('passwordHint')}><input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label={t('repeatPassword')}><input className="input" type="password" name="repeat" autoComplete="new-password" required value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
