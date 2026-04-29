import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import { I18nProvider } from "../i18n/I18nContext";
import { NodePalette } from "./NodePalette";

afterEach(cleanup);

function renderWithProviders(
  ui: ReactElement,
  options?: { navigatorLanguage?: string },
) {
  const navigatorLanguage = options?.navigatorLanguage ?? "en-US";

  return render(
    <I18nProvider
      deps={{
        navigatorLanguage,
        storage: {
          getItem: () => null,
          setItem: () => {},
        },
      }}
    >
      {ui}
    </I18nProvider>,
  );
}

function NodeLabelProbe() {
  const { state } = useDocumentContext();

  return (
    <ul>
      {state.document.nodes.map((node) => (
        <li key={node.id}>{node.label}</li>
      ))}
    </ul>
  );
}

function NodeModelProbe() {
  const { state } = useDocumentContext();

  return (
    <ul>
      {state.document.nodes.map((node) => (
        <li key={node.id} data-testid={`node-model-${node.kind}`}>
          {JSON.stringify({ kind: node.kind, data: node.data })}
        </li>
      ))}
    </ul>
  );
}

describe("NodePalette", () => {
  test("creates helper function and graph helper importer nodes", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <NodePalette />
        <NodeModelProbe />
      </DocumentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Helper Functions" }));
    await user.click(screen.getByRole("button", { name: "Import Graph Helpers" }));

    expect(screen.getByTestId("node-model-helperFunctions").textContent).toBe(
      JSON.stringify({
        kind: "helperFunctions",
        data: { moduleName: "", helpers: [{ name: "add10", expression: "$1 + 10" }] },
      }),
    );
    expect(screen.getByTestId("node-model-importGraphHelpers").textContent).toBe(
      JSON.stringify({
        kind: "importGraphHelpers",
        data: { graphId: "", moduleName: "" },
      }),
    );
  });

  test("localizes palette labels without translating created node labels", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <NodePalette />
        <NodeLabelProbe />
      </DocumentProvider>,
      { navigatorLanguage: "zh-CN" },
    );

    expect(screen.getByText("节点")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "图输入" }));

    expect(screen.getByText("Graph Input")).toBeTruthy();
  });
});
