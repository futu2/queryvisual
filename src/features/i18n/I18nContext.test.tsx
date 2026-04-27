import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, useI18n } from "./I18nContext";
import { I18N_STORAGE_KEY } from "./runtime";

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
});

