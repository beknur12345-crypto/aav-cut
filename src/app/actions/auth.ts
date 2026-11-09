'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { emailSchema, hashPassword, passwordSchema, verifyAgainstDummy, verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, requireUser, revokeOtherSessions } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/auth/rate-limit';
import { hashToken, newToken } from '@/lib/auth/tokens';
import { appUrl, sendMail } from '@/lib/mail';
import { isLocale, isMessageKey } from '@/lib/i18n';
import { getT, LOCALE_COOKIE } from '@/lib/i18n/server';
import { fail, ok, type ActionResult } from './types';

const MINUTE = 60_000;

function firstError(e: z.ZodError): ActionResult<never> {
  const issue = e.issues[0];
  const msg = issue?.message;
  return fail(isMessageKey(msg) ? msg : 'invalidInput', issue?.path.join('.'));
}

const loginSchema = z.object({ login: z.string().trim().min(1, 'required').max(254), password: z.string().min(1, 'required').max(200), remember: z.boolean() });

export async function login(input: z.infer<typeof loginSchema>): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { login, password, remember } = parsed.data;
  const ip = await clientIp();
  // Limits brute force per account and per address.
  if (!(await rateLimit(`login:ip:${ip}`, 30, 15 * MINUTE)) || !(await rateLimit(`login:acct:${login.toLowerCase()}`, 10, 15 * MINUTE)))
    return fail('tooManyAttempts');

  // Users can sign in with their email or their account number.
  const asNumber = /^\d{1,9}$/.test(login) ? Number(login) : null;
  const user = await db.user.findFirst({ where: asNumber !== null ? { number: asNumber } : { email: login.toLowerCase() } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !valid) return fail('invalidCredentials');
  await createSession(user.id, remember);
  return ok(undefined);
}

const registerSchema = z
  .object({ email: emailSchema, password: passwordSchema, repeat: z.string() })
  .refine((v) => v.password === v.repeat, { message: 'passwordsDoNotMatch', path: ['repeat'] });

export async function register(input: z.infer<typeof registerSchema>): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  if (!(await rateLimit(`register:${await clientIp()}`, 10, 60 * MINUTE))) return fail('tooManyAttempts');
  const { email, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return fail('emailTaken', 'email');
  const { locale } = await getT();
  const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password), locale } });
  await createSession(user.id, true);
  return ok(undefined);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = z.object({ email: emailSchema }).safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  if (!(await rateLimit(`reset:${await clientIp()}`, 5, 15 * MINUTE))) return fail('tooManyAttempts');
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Same response whether or not the account exists, so emails cannot be enumerated.
  if (user) {
    const token = newToken();
    await db.passwordResetToken.create({ data: { id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * MINUTE) } });
    const { t } = await getT();
    await sendMail(user.email, t('resetEmailSubject'), t('resetEmailBody', { link: appUrl(`/reset/${token}`) }));
  }
  return ok(undefined);
}

const resetSchema = z
  .object({ token: z.string().min(10).max(200), password: passwordSchema, repeat: z.string() })
  .refine((v) => v.password === v.repeat, { message: 'passwordsDoNotMatch', path: ['repeat'] });

export async function resetPassword(input: z.infer<typeof resetSchema>): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const id = hashToken(parsed.data.token);
  const row = await db.passwordResetToken.findUnique({ where: { id } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return fail('resetLinkInvalid');
  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction([
    db.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  await createSession(row.userId, false);
  return ok(undefined);
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, 'required'), password: passwordSchema, repeat: z.string() })
  .refine((v) => v.password === v.repeat, { message: 'passwordsDoNotMatch', path: ['repeat'] });

export async function changePassword(input: z.infer<typeof changePasswordSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  if (!(await rateLimit(`chpw:${user.id}`, 10, 15 * MINUTE))) return fail('tooManyAttempts');
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.current, full.passwordHash))) return fail('wrongPassword', 'current');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
  await revokeOtherSessions(user.id);
  return ok(undefined);
}

export async function changeEmail(input: { password: string; email: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ password: z.string().min(1, 'required'), email: emailSchema }).safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  if (!(await rateLimit(`chmail:${user.id}`, 10, 15 * MINUTE))) return fail('tooManyAttempts');
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.password, full.passwordHash))) return fail('wrongPassword', 'password');
  if (await db.user.findFirst({ where: { email: parsed.data.email, NOT: { id: user.id } } })) return fail('emailTaken', 'email');
  await db.user.update({ where: { id: user.id }, data: { email: parsed.data.email } });
  return ok(undefined);
}

/** Works signed in (saved to the account) and signed out (cookie only). */
export async function setLocale(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return fail('invalidInput');
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
  const { getCurrentUser } = await import('@/lib/auth/session');
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  return ok(undefined);
}

