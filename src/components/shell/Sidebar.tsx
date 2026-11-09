'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { logout, setLocale } from '@/app/actions/auth';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';
import { Ico, type IcoName } from '../Ico';
import { Logo } from '../Logo';

const FLAGS: Record<string, string> = { en: '🇬🇧', uk: '🇺🇦', ru: '🇷🇺' };

/** Language accordion bar (collapsed by default), as on every screen. */
export function LanguageAccordion() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div>
      <button className="gl-acc" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="text-xl leading-none" aria-hidden>{FLAGS[locale]}</span>
        {t('language')}
      </button>
      {open && (
        <div className="py-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              className="gl-link items-center"
              disabled={pending || l === locale}
              onClick={() => start(async () => { await setLocale(l); router.refresh(); setOpen(false); })}
            >
              <span aria-hidden>{FLAGS[l]}</span> {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarFrame({ user, children }: { user?: { number: number; email: string }; children?: React.ReactNode }) {
  return (
    <aside className="no-print flex w-[218px] shrink-0 flex-col border-r border-[#a4a4a4] bg-white">
      <Link href={user ? '/projects' : '/login'} className="flex h-[70px] shrink-0 items-center justify-center border-b border-[#c4c4c4]">
        <Logo size={30} />
      </Link>
      {user && (
        <div className="space-y-0.5 px-2 py-1.5 text-[13px]" data-testid="account-box">
          <div className="flex items-center gap-2"><Ico name="user" size={15} /> {user.number}</div>
          <div className="flex items-center gap-2 truncate" title={user.email}><Ico name="email" size={15} /> <span className="truncate">{user.email}</span></div>
        </div>
      )}
      <LanguageAccordion />
      <div id="sb-section" className="flex min-h-0 flex-1 flex-col overflow-y-auto" />
      <div id="sb-bottom" className="shrink-0" />
      {children}
    </aside>
  );
}

const noSubscribe = () => () => {};
/** The sidebar slot element (null during server rendering). */
function usePortalTarget(id: string) {
  return useSyncExternalStore(noSubscribe, () => document.getElementById(id), () => null);
}

/** A page's own accordion section (title bar + links), rendered into the sidebar. */
export function SidebarSection({ title, icon, children }: { title: string; icon: IcoName; children: React.ReactNode }) {
  const target = usePortalTarget('sb-section');
  if (!target) return null;
  return createPortal(
    <>
      <div className="gl-acc cursor-default" role="heading" aria-level={2}>
        <Ico name={icon} size={22} /> {title}
      </div>
      <nav aria-label={title} className="flex flex-col py-2">{children}</nav>
    </>,
    target,
  );
}

/** Bottom accordion bars of a page (e.g. Print report · Settings · Close project · Help). */
export function SidebarBottom({ children }: { children: React.ReactNode }) {
  const target = usePortalTarget('sb-bottom');
  if (!target) return null;
  return createPortal(children, target);
}

export function SideLink({ icon, label, onClick, href, disabled, testId }: { icon?: IcoName; label: string; onClick?: () => void; href?: string; disabled?: boolean; testId?: string }) {
  const content = (
    <>
      {icon ? <Ico name={icon} size={16} /> : <span className="w-4" />}
      <span>{label}</span>
    </>
  );
  if (href && !disabled) return <Link className="gl-link" href={href} data-testid={testId}>{content}</Link>;
  return <button className="gl-link" onClick={onClick} disabled={disabled} data-testid={testId}>{content}</button>;
}

export function SideBar({ icon, label, onClick, href }: { icon: IcoName; label: string; onClick?: () => void; href?: string }) {
  const content = (<><Ico name={icon} size={22} /> {label}</>);
  return href ? <Link className="gl-acc" href={href}>{content}</Link> : <button className="gl-acc" onClick={onClick}>{content}</button>;
}

export function LogoutBar() {
  const { t } = useI18n();
  return (
    <form action={logout}>
      <button className="gl-acc"><Ico name="logout" size={22} /> {t('logOut')}</button>
    </form>
  );
}

/** Bottom bars used on pages without their own: Settings · Logout · Help. */
export function DefaultBottom() {
  const { t } = useI18n();
  return (
    <SidebarBottom>
      <SideBar icon="settings" label={t('settings')} href="/settings" />
      <LogoutBar />
      <SideBar icon="help" label={t('help')} href="/help" />
    </SidebarBottom>
  );
}
