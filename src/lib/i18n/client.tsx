'use client';
import { createContext, useContext, useMemo } from 'react';
import { makeT, MESSAGES, type Locale, type TFunction } from './index';

const Ctx = createContext<{ locale: Locale; t: TFunction }>({ locale: 'en', t: makeT(MESSAGES.en) });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(MESSAGES[locale]) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
