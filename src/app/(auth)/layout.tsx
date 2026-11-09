import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getT } from '@/lib/i18n/server';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/Logo';
import { Ico } from '@/components/Ico';
import { LanguageAccordion } from '@/components/shell/Sidebar';
import { LoginForm } from './login/LoginForm';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect('/projects');
  const { t } = await getT();
  const tiles: { title: string; items: string[] }[] = [
    { title: t('tileImport'), items: [t('tileImport1'), t('tileImport2'), t('tileImport3')] },
    { title: t('tileFunctions'), items: [t('featureOptimizer'), t('tileFunctions2'), t('tileFunctions3'), t('tileFunctions4'), t('featureCosts'), t('featureReports')] },
    { title: t('tileMachines'), items: [t('tileMachines1'), t('tileMachines2')] },
  ];
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[218px] shrink-0 flex-col border-r border-[#a4a4a4] bg-white">
        <Link href="/login" className="flex h-[70px] shrink-0 items-center justify-center border-b border-[#c4c4c4]"><Logo size={30} /></Link>
        <LanguageAccordion />
        <div className="gl-acc cursor-default" role="heading" aria-level={2}><Ico name="export" size={22} /> {t('logInBar')}</div>
        <div className="flex-1 overflow-y-auto px-2.5 py-3"><LoginForm /></div>
        <Link className="gl-acc" href="/help"><Ico name="help" size={22} /> {t('help')}</Link>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto bg-white">
        <header className="flex min-h-[70px] items-center border-b border-[#c4c4c4] bg-[#f0f0f0] px-4">
          <h1 className="text-[24px] font-bold leading-tight text-[#1d1d1d]" style={{ fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{t('heroTitle')}</h1>
        </header>
        <div className="mx-auto max-w-[800px] space-y-4 p-6">
          <div className="border border-[#a4a4a4] p-4 shadow-[2px_2px_0_#c9c9c9]">
            <p className="text-[19px] leading-snug"><b>{t('youWant')}</b> {t('youWantText')}</p>
            <p className="text-[19px] leading-snug"><b>{t('forYou')}</b> {BRAND.tagline}.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_1fr]">
            {tiles.map((tile) => (
              <section key={tile.title} className="border border-[#a4a4a4] shadow-[2px_2px_0_#c9c9c9]">
                <h2 className="border-b border-[#a4a4a4] bg-gradient-to-b from-[#e8f2ff] to-[#b9d6fb] py-1 text-center text-[17px] font-bold">{tile.title}</h2>
                <ul className="space-y-1 p-2 text-[13px]">
                  {tile.items.map((i) => <li key={i} className="flex gap-1.5"><span aria-hidden>■</span>{i}</li>)}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>
      {children}
    </div>
  );
}
