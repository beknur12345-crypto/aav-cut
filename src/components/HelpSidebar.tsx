'use client';
import { useI18n } from '@/lib/i18n/client';
import { DefaultBottom, SidebarSection, SideLink } from './shell/Sidebar';

export function HelpSidebar() {
  const { t } = useI18n();
  return (
    <>
      <SidebarSection title={t('help')} icon="help">
        <SideLink icon="book" label={t('quickStart')} href="/help#quick-start" />
        <SideLink icon="properties" label={t('shortcuts')} href="/help#shortcuts" />
        <SideLink icon="commands" label={t('tableOfCommands')} href="/help#commands" />
        <div className="h-3" />
        <SideLink icon="projects" label={t('projects')} href="/projects" />
      </SidebarSection>
      <DefaultBottom />
    </>
  );
}
