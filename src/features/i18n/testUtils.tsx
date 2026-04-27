import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "./I18nContext";
import type { Locale } from "./types";

export function renderWithI18n(ui: ReactElement, options?: { locale?: Locale }) {
  return render(
    <I18nProvider
      deps={{
        navigatorLanguage: options?.locale === "zh-CN" ? "zh-CN" : "en-US",
        storage: {
          getItem: () => options?.locale ?? null,
          setItem: () => {},
        },
      }}
    >
      {ui}
    </I18nProvider>,
  );
}

