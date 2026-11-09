import { requireUser } from '@/lib/auth/session';
import { UiProvider } from '@/components/ui';
import { SidebarFrame } from '@/components/shell/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <UiProvider>
      <div className="flex h-full min-h-0">
        <SidebarFrame user={{ number: user.number, email: user.email }} />
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--gl-bg)]">{children}</div>
      </div>
    </UiProvider>
  );
}
