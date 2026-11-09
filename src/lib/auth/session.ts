import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/lib/db';
import { hashToken, newToken } from './tokens';

export const SESSION_COOKIE = 'aav_session';
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // browser session ("remember me" off)
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // "remember me" on

export async function createSession(userId: string, remember: boolean) {
  const token = newToken();
  const ttl = remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const ua = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  await db.$transaction([
    // Housekeeping: drop this user's expired sessions.
    db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }),
    db.session.create({ data: { id: hashToken(token), userId, expiresAt, userAgent: ua } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, number: true, email: true, locale: true, inputMode: true, currency: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Ends every session of a user except, optionally, the current one (after a password change). */
export async function revokeOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId, ...(token ? { NOT: { id: hashToken(token) } } : {}) } });
}
