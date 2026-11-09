'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { requestPasswordReset } from '@/app/actions/auth';
import { Dialog, ErrorText, Field, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

export default function ForgotPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const close = () => router.push('/login');
  const submit = () => start(async () => {
    const r = await requestPasswordReset({ email });
    if (r.ok) setSent(true);
    else setError(r.error);
  });
  return (
    <Dialog open title={sent ? t('checkEmailTitle') : t('forgotTitle')} onClose={close} width={400}
      footer={sent ? <button className="btn" onClick={close}>{t('ok')}</button> : <><button className="btn" disabled={pending} onClick={submit}>{pending && <Spinner />} {t('continue')}</button><button className="btn" onClick={close}>{t('cancel')}</button></>}>
      {sent ? (
        <p className="text-sm">{t('checkEmailText')}</p>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p className="text-sm text-[#444]">{t('forgotText')}</p>
          <ErrorText error={error} />
          <Field label={t('emailUsedAtRegistration')}><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Dialog>
  );
}
