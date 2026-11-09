const loc = (locale: string) => (locale === 'en' ? 'en-GB' : locale);

export function formatMoney(v: number, locale: string) {
  return v.toLocaleString(loc(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNum(v: number, locale: string, digits = 2) {
  return v.toLocaleString(loc(locale), { maximumFractionDigits: digits });
}
