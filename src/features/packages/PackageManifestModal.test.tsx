import { describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n/I18nContext";
import { PackageManifestModal } from "./PackageManifestModal";

describe("PackageManifestModal", () => {
  test("edits package manifest metadata and export rows", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <PackageManifestModal
          graphs={[
            {
              id: "graph-public",
              metadata: { name: "Public" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
            {
              id: "graph-helper",
              metadata: { name: "Helper" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ]}
          value={null}
          onClose={() => {}}
          onSave={onSave}
        />
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText("Package ID"), "team/app-lib");
    await user.type(screen.getByLabelText("Version"), "0.1.0");
    await user.type(screen.getByLabelText("Package name"), "App Lib");
    await user.click(screen.getByRole("button", { name: "Add export" }));
    await user.type(screen.getByLabelText("Export key 1"), "public_graph");
    await user.selectOptions(screen.getByLabelText("Export graph 1"), "graph-public");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      packageId: "team/app-lib",
      version: "0.1.0",
      name: "App Lib",
      description: "",
      exports: [
        {
          exportKey: "public_graph",
          graphId: "graph-public",
          displayName: "Public",
        },
      ],
    });
  });
});
