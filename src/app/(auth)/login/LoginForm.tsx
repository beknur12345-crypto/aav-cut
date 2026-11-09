'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { login } from '@/app/actions/auth';
import { Ico } from '@/components/Ico';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ login: '', password: '', remember: true });

  return (
    <form
      className="space-y-2 text-sm"
      aria-label={t('loginTitle')}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await login(form);
          if (r.ok) router.replace('/projects');
          else setError(r.error);
        });
      }}
    >
      <p className="text-center text-[15px] text-[var(--gl-link)]">{t('registerIfNew')}</p>
      <p className="text-center"><Link href="/register" className="inline-flex items-center gap-1 text-[15px] text-[var(--gl-link)] hover:underline"><Ico name="user" size={15} /> {t('register')}</Link></p>
      {error && <p role="alert" className="border border-[#e5312b] bg-[#ffe3e3] px-2 py-1 text-[#a61e1e]">{t(error)}</p>}
      <label className="block pt-2">
        <span className="label">{t('loginIdOrEmail')}</span>
        <input className="input" name="login" autoComplete="username" required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">{t('password')}</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </label>
      <p className="pt-1 text-center"><Link className="text-[15px] text-[var(--gl-link)] hover:underline" href="/forgot">{t('forgotPassword')}</Link></p>
      <div className="flex justify-center pt-1">
        <button className="btn w-[120px] py-1.5" disabled={pending}>{pending && <Spinner />} {t('logIn')}</button>
      </div>
      <label className="flex items-center justify-center gap-1.5 pt-1">
        <input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
        {t('rememberMe')}
      </label>
    </form>
  );
}
