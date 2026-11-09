import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { SettingsForms } from '@/components/settings/SettingsForms';
import { db } from '@/lib/db';
import { parsePrefs } from '@/domain/prefs';

export const metadata: Metadata = { title: 'Settings' };

const OPEN = ['password', 'email', 'modes', 'prefs', 'postprocessors', 'xnc', 'orders'] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requireUser();
  const { open } = await searchParams;
  const initialOpen = OPEN.find((o) => o === open) ?? null;
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { prefs: true } });
  return <SettingsForms prefs={parsePrefs(row.prefs)} initialOpen={initialOpen} user={{ email: user.email, number: user.number, inputMode: user.inputMode, currency: user.currency }} />;
}
