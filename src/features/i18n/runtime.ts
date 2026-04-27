import type { Locale, MessageKey, TranslationVars } from "./types";

export const I18N_STORAGE_KEY = "queryvisual.locale";

export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && value.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function resolveInitialLocale(params: {
  storedLocale?: string | null;
  navigatorLanguage?: string | null;
}): Locale {
  if (params.storedLocale === "en" || params.storedLocale === "zh-CN") {
    return params.storedLocale;
  }
  return normalizeLocale(params.navigatorLanguage);
}

export function interpolate(template: string, vars: TranslationVars = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(vars[key] ?? `{${key}}`),
  );
}

export function lookupMessage<
  TKey extends string,
  TCatalog extends Record<Locale, Partial<Record<TKey, string>>>,
>(catalog: TCatalog, locale: Locale, key: TKey) {
  return catalog[locale][key] ?? catalog.en[key] ?? key;
}

export function translateMessage(
  catalog: Record<Locale, Record<MessageKey, string>>,
  locale: Locale,
  key: MessageKey,
  vars?: TranslationVars,
) {
  return interpolate(lookupMessage(catalog, locale, key), vars);
}

