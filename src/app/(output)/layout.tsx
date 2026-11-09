import { requireUser } from '@/lib/auth/session';

/** Print-only pages (report, labels): no application chrome, just the document. */
export default async function OutputLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="h-full">{children}</div>;
}
