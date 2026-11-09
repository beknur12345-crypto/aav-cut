'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { changeEmail, changePassword } from '@/app/actions/auth';
import { updatePreferences } from '@/app/actions/settings';
import { INPUT_MODES, type InputMode } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Dialog, ErrorText, Field, Spinner, useUi } from '../ui';
import { DefaultBottom, SidebarSection, SideLink } from '../shell/Sidebar';
import { INPUT_MODE_KEYS } from '../editor/labels';
import type { Prefs } from '@/domain/prefs';
import { OrderSettings, PostprocessorSettings, XncSettings } from './AdvancedSettings';

type Open = null | 'password' | 'email' | 'modes' | 'prefs' | 'postprocessors' | 'xnc' | 'orders';

export function SettingsSidebar({ onOpen }: { onOpen?: (o: Open) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const go = (o: Open) => (onOpen ? onOpen(o) : router.push(`/settings?open=${o}`));
  return (
    <>
      <SidebarSection title={t('settings')} icon="settings">
        <SideLink label={t('changePassword')} onClick={() => go('password')} testId="sb-change-password" />
        <SideLink label={t('changeEmailAccount')} onClick={() => go('email')} />
        <SideLink icon="parts" label={t('inputModesParts')} onClick={() => go('modes')} />
        <SideLink icon="properties" label={t('preferences')} onClick={() => go('prefs')} />
        <SideLink icon="catalog" label={t('catalogOfGoods')} href="/settings/catalog" />
        <SideLink icon="commands" label={t('postprocessors')} onClick={() => go('postprocessors')} />
        <SideLink icon="opXNC" label={t('xncEditor')} onClick={() => go('xnc')} />
        <div className="h-3" />
        <SideLink icon="export" label={t('saveDataToDisk')} onClick={() => { const a = document.createElement('a'); a.href = '/api/export'; a.download = ''; a.click(); }} />
        <div className="h-3" />
        <SideLink icon="ordered" label={t('moduleOrders')} onClick={() => go('orders')} testId="sb-module-orders" />
        <div className="h-3" />
        <SideLink icon="projects" label={t('projects')} href="/projects" />
      </SidebarSection>
      <DefaultBottom />
    </>
  );
}

export function SettingsForms({ user, initialOpen, prefs: initialAdv }: { user: { email: string; number: number; inputMode: string; currency: string }; initialOpen: Open; prefs: Prefs }) {
  const { t } = useI18n();
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(initialOpen);
  const [adv, setAdv] = useState(initialAdv);
  const [pw, setPw] = useState({ current: '', password: '', repeat: '' });
  const [pwError, setPwError] = useState<MessageKey | null>(null);
  const [mail, setMail] = useState({ password: '', email: '' });
  const [mailError, setMailError] = useState<MessageKey | null>(null);
  const [prefs, setPrefs] = useState({ inputMode: user.inputMode as InputMode, currency: user.currency });
  const [pending, start] = useTransition();
  const pwForm = useRef<HTMLFormElement>(null);
  const mailForm = useRef<HTMLFormElement>(null);
  const close = () => setOpen(null);

  const savePrefs = () => start(async () => {
    const r = await updatePreferences(prefs);
    ui.toast(r.ok ? t('saved') : t(r.error), r.ok ? 'ok' : 'error');
    if (r.ok) close();
    router.refresh();
  });

  return (
    <div className="h-full">
      <SettingsSidebar onOpen={setOpen} />
      <div className="p-4 text-sm text-[#555]">ID {user.number} · {user.email}</div>

      <Dialog open={open === 'password'} onClose={close} title={t('changePassword')} width={380}
        footer={<><button className="btn" disabled={pending} onClick={() => pwForm.current?.requestSubmit()}>{pending && <Spinner />} {t('replace')}</button><button className="btn" onClick={close}>{t('cancel')}</button></>}>
        <form ref={pwForm} className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await changePassword(pw);
            if (r.ok) { setPw({ current: '', password: '', repeat: '' }); setPwError(null); ui.toast(t('passwordChanged')); close(); }
            else setPwError(r.error);
          });
        }}>
          <ErrorText error={pwError} />
          <Field label={t('oldPassword')}><input className="input" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t('newPassword')}><input className="input" type="password" autoComplete="new-password" required minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
          <Field label={t('repeatNewPassword')}><input className="input" type="password" autoComplete="new-password" required value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} /></Field>
        </form>
      </Dialog>

      <Dialog open={open === 'email'} onClose={close} title={t('changeEmailAccount')} width={380}
        footer={<><button className="btn" disabled={pending} onClick={() => mailForm.current?.requestSubmit()}>{pending && <Spinner />} {t('replace')}</button><button className="btn" onClick={close}>{t('cancel')}</button></>}>
        <form ref={mailForm} className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await changeEmail(mail);
            if (r.ok) { setMail({ password: '', email: '' }); setMailError(null); ui.toast(t('emailChanged')); close(); router.refresh(); }
            else setMailError(r.error);
          });
        }}>
          <ErrorText error={mailError} />
          <Field label={t('password')}><input className="input" type="password" autoComplete="current-password" required value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} /></Field>
          <Field label={t('newEmail')}><input className="input" type="email" autoComplete="email" required value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} /></Field>
        </form>
      </Dialog>

      <Dialog open={open === 'modes'} onClose={close} title={t('inputModesParts')} width={460}
        footer={<><button className="btn" disabled={pending} onClick={savePrefs}>{t('ok')}</button><button className="btn" onClick={close}>{t('cancel')}</button></>}>
        <fieldset className="space-y-1.5">
          {INPUT_MODES.map((m) => (
            <label key={m} className="flex items-start gap-2 text-sm">
              <input type="radio" name="mode" className="mt-1" checked={prefs.inputMode === m} onChange={() => setPrefs({ ...prefs, inputMode: m })} />
              {t(INPUT_MODE_KEYS[m])}
            </label>
          ))}
        </fieldset>
      </Dialog>

      {open === 'postprocessors' && <PostprocessorSettings open onClose={close} prefs={adv} onSaved={setAdv} />}
      {open === 'xnc' && <XncSettings open onClose={close} prefs={adv} onSaved={setAdv} />}
      {open === 'orders' && <OrderSettings open onClose={close} prefs={adv} onSaved={setAdv} userNumber={user.number} />}

      <Dialog open={open === 'prefs'} onClose={close} title={t('preferences')} width={380}
        footer={<><button className="btn" disabled={pending} onClick={savePrefs}>{t('ok')}</button><button className="btn" onClick={close}>{t('cancel')}</button></>}>
        <Field label={t('defaultCurrency')}><input className="input" maxLength={8} value={prefs.currency} onChange={(e) => setPrefs({ ...prefs, currency: e.target.value })} /></Field>
      </Dialog>
    </div>
  );
}
