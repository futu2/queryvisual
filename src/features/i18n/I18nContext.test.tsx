import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, useI18n } from "./I18nContext";
import { I18N_STORAGE_KEY } from "./runtime";
import { renderWithI18n } from "./testUtils";

afterEach(() => {
  localStorage.clear();
  cleanup();
});

function Probe() {
  const { locale, setLocale, t } = useI18n();

  return (
    <>
      <div data-testid="locale">{locale}</div>
      <div>{t("app.canvasTitle")}</div>
      <button type="button" onClick={() => setLocale("en")}>
        Set English
      </button>
      <button type="button" onClick={() => setLocale("zh-CN")}>
        Set Chinese
      </button>
    </>
  );
}

describe("I18nProvider", () => {
  test("uses browser auto-detect when no override exists", () => {
    render(
      <I18nProvider deps={{ navigatorLanguage: "zh-HK" }}>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    expect(screen.getByText("画布")).toBeTruthy();
  });

  test("fails safe when default localStorage accessor throws", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    try {
      render(
        <I18nProvider deps={{ navigatorLanguage: "zh-HK" }}>
          <Probe />
        </I18nProvider>,
      );

      expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
      expect(screen.getByText("画布")).toBeTruthy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as unknown as Record<string, unknown>).localStorage;
      }
    }
  });

  test("persists manual locale override", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Set Chinese" }));

    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    expect(localStorage.getItem(I18N_STORAGE_KEY)).toBe("zh-CN");
  });

  test("fails safe when storage.getItem throws", () => {
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };

    render(
      <I18nProvider deps={{ navigatorLanguage: "zh-HK", storage }}>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    expect(screen.getByText("画布")).toBeTruthy();
  });

  test("still updates locale when storage.setItem throws", async () => {
    const user = userEvent.setup();
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US", storage }}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Set Chinese" }));
    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
  });

  test("does not close over stale storage after provider rerender", async () => {
    const user = userEvent.setup();
    const writesA: Array<[string, string]> = [];
    const writesB: Array<[string, string]> = [];

    const storageA: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => null,
      setItem: (key, value) => {
        writesA.push([key, String(value)]);
      },
    };

    const storageB: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => null,
      setItem: (key, value) => {
        writesB.push([key, String(value)]);
      },
    };

    const { rerender } = render(
      <I18nProvider deps={{ navigatorLanguage: "en-US", storage: storageA }}>
        <Probe />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider deps={{ navigatorLanguage: "en-US", storage: storageB }}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Set Chinese" }));

    expect(writesA.length).toBe(0);
    expect(writesB).toEqual([[I18N_STORAGE_KEY, "zh-CN"]]);
  });
});

describe("renderWithI18n", () => {
  test("can inject navigatorLanguage without forcing a stored override", () => {
    renderWithI18n(<Probe />, { navigatorLanguage: "zh-HK" });
    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
  });

  test("can inject storedLocale separately from navigatorLanguage", () => {
    renderWithI18n(<Probe />, {
      storedLocale: "en",
      navigatorLanguage: "zh-CN",
    });
    expect(screen.getByTestId("locale").textContent).toBe("en");
  });
});
