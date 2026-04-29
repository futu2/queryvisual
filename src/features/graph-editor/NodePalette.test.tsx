import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import type { NodeKind } from "../../domain/document/types";
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

function PlacementProbe() {
  const [pendingKind, setPendingKind] = useState<NodeKind | null>(null);

  return (
    <>
      <NodePalette
        pendingKind={pendingKind}
        onRequestNodePlacement={(request) => setPendingKind(request.kind)}
      />
      <span data-testid="pending-kind">{pendingKind ?? "null"}</span>
    </>
  );
}

describe("NodePalette", () => {
  test("requests helper function and graph helper importer placement without creating nodes immediately", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <PlacementProbe />
        <NodeModelProbe />
      </DocumentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Helper Functions" }));

    expect(screen.getByTestId("pending-kind").textContent).toBe("helperFunctions");
    expect(screen.queryByTestId("node-model-helperFunctions")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Import Graph Helpers" }));

    expect(screen.getByTestId("pending-kind").textContent).toBe("importGraphHelpers");
    expect(screen.queryByTestId("node-model-importGraphHelpers")).toBeNull();
  });

  test("localizes palette labels without translating created node labels", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <PlacementProbe />
        <NodeLabelProbe />
      </DocumentProvider>,
      { navigatorLanguage: "zh-CN" },
    );

    expect(screen.getByText("节点")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "图输入" }));

    expect(screen.getByTestId("pending-kind").textContent).toBe("graphInput");
    expect(screen.queryByText("Graph Input")).toBeNull();
  });
});
