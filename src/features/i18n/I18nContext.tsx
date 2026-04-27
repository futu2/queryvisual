import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { messagesByLocale } from "./messages";
import {
  I18N_STORAGE_KEY,
  resolveInitialLocale,
  translateMessage,
} from "./runtime";
import type { Locale, MessageKey, TranslationVars } from "./types";

type I18nDeps = {
  navigatorLanguage?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  deps,
}: {
  children: ReactNode;
  deps?: I18nDeps;
}) {
  const storage = deps?.storage ?? localStorage;
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale({
      storedLocale: storage.getItem(I18N_STORAGE_KEY),
      navigatorLanguage: deps?.navigatorLanguage ?? navigator.language,
    }),
  );

  const setLocale = (nextLocale: Locale) => {
    storage.setItem(I18N_STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translateMessage(messagesByLocale, locale, key, vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("I18nContext is missing");
  }
  return value;
}

