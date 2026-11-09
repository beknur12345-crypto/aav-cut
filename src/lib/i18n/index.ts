import { en } from './en';
import { uk } from './uk';
import { ru } from './ru';

export const LOCALES = ['en', 'uk', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', uk: 'Українська', ru: 'Русский' };
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const MESSAGES: Record<Locale, Messages> = { en, uk, ru };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(messages: Messages): TFunction {
  return (key, vars) => {
    let s = messages[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Server actions return message keys for errors, so the client shows them in the user's language. */
export function isMessageKey(v: unknown): v is MessageKey {
  return typeof v === 'string' && v in en;
}
