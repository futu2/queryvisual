import {
  createContext,
  useCallback,
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

function safeStorageGetItem(
  storage: Pick<Storage, "getItem">,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSetItem(
  storage: Pick<Storage, "setItem">,
  key: string,
  value: string,
) {
  try {
    storage.setItem(key, value);
  } catch {
    // Fail safe: locale changes should still update React state even if persistence is blocked.
  }
}

function resolveDefaultStorage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    return localStorage;
  } catch {
    // Fail safe: environments with blocked storage access should still render.
    return {
      getItem: () => null,
      setItem: () => {},
    };
  }
}

function resolveDefaultNavigatorLanguage(): string | null {
  try {
    if (typeof navigator === "undefined") {
      return null;
    }
    return navigator.language;
  } catch {
    return null;
  }
}

export function I18nProvider({
  children,
  deps,
}: {
  children: ReactNode;
  deps?: I18nDeps;
}) {
  const storage = deps?.storage ?? resolveDefaultStorage();
  const navigatorLanguage =
    deps?.navigatorLanguage ??
    resolveDefaultNavigatorLanguage();
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale({
      storedLocale: safeStorageGetItem(storage, I18N_STORAGE_KEY),
      navigatorLanguage,
    }),
  );

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      safeStorageSetItem(storage, I18N_STORAGE_KEY, nextLocale);
      setLocaleState(nextLocale);
    },
    [storage],
  );

  const t = useCallback(
    (key: MessageKey, vars?: TranslationVars) =>
      translateMessage(messagesByLocale, locale, key, vars),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
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
