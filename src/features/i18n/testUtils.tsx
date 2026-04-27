import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "./I18nContext";
import type { Locale } from "./types";

export function renderWithI18n(
  ui: ReactElement,
  options?: {
    navigatorLanguage?: string;
    storedLocale?: Locale | null;
  },
) {
  const navigatorLanguage = options?.navigatorLanguage ?? "en-US";
  const storedLocale = options?.storedLocale ?? null;

  return render(
    <I18nProvider
      deps={{
        navigatorLanguage,
        storage: {
          getItem: () => storedLocale,
          setItem: () => {},
        },
      }}
    >
      {ui}
    </I18nProvider>,
  );
}
