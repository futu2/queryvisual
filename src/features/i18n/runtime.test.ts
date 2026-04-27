import { describe, expect, test } from "bun:test";
import {
  lookupMessage,
  normalizeLocale,
  resolveInitialLocale,
} from "./runtime";
import type { Locale } from "./types";

describe("i18n runtime", () => {
  test("normalizes browser locale values to supported locales", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-HK")).toBe("zh-CN");
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  test("prefers persisted locale over browser detection", () => {
    expect(
      resolveInitialLocale({
        storedLocale: "en",
        navigatorLanguage: "zh-CN",
      }),
    ).toBe("en");
  });

  test("falls back to English when a locale message is missing", () => {
    const catalog: Record<Locale, Partial<Record<"toolbar.saveJson", string>>> =
      {
        en: { "toolbar.saveJson": "Save JSON" },
        "zh-CN": {},
      };

    expect(lookupMessage(catalog, "zh-CN", "toolbar.saveJson")).toBe("Save JSON");
  });
});

