import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n/I18nContext";
import { InstalledPackageList } from "./InstalledPackageList";

describe("InstalledPackageList", () => {
  test("renders installed package ids versions and export counts", () => {
    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <InstalledPackageList
          packages={[
            {
              packageId: "team/sales-lib",
              version: "1.2.0",
              metadata: { name: "Sales Lib" },
              exports: [
                {
                  exportKey: "daily_orders",
                  graphId: "pkg-graph",
                  displayName: "Daily Orders",
                },
                {
                  exportKey: "weekly_orders",
                  graphId: "pkg-graph-2",
                  displayName: "Weekly Orders",
                },
              ],
              graphs: [],
              dependencyRefs: [],
            },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("team/sales-lib")).toBeTruthy();
    expect(screen.getByText("1.2.0")).toBeTruthy();
    expect(screen.getByText("2 exports")).toBeTruthy();
  });
});
