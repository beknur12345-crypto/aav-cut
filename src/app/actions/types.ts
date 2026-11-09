import type { MessageKey } from '@/lib/i18n';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: MessageKey; field?: string };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: MessageKey, field?: string): ActionResult<never> => ({ ok: false, error, field });
