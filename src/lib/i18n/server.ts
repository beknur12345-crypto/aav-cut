import 'server-only';
import { cookies, headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { isLocale, makeT, MESSAGES, type Locale } from './index';

export const LOCALE_COOKIE = 'aav_locale';

export async function getLocale(): Promise<Locale> {
  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get('accept-language') ?? '';
  if (/^uk|,\s*uk/i.test(accept)) return 'uk';
  if (/^ru|,\s*ru/i.test(accept)) return 'ru';
  return 'en';
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(MESSAGES[locale]) };
}
