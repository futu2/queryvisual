import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, AppLayout } from "./App";
import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { createSampleDocument } from "./domain/document/sample";
import { createDefaultOutputListenerConfig } from "./domain/document/outputListeners";

afterEach(cleanup);

function OutputSelectionProbe() {
  const { dispatch } = useDocumentContext();

  return (
    <button
      type="button"
      data-testid="activate-alt-output"
      onClick={() => {
        dispatch({ type: "select-node", nodeId: "output-alt" });
        dispatch({ type: "open-node-editor", nodeId: "output-alt" });
      }}
    >
      Activate alt output
    </button>
  );
}

describe("App", () => {
  test("renders the QueryVisual shell", () => {
    render(<App />);

    expect(screen.getByText("QueryVisual")).toBeTruthy();
    expect(screen.getByText("Canvas")).toBeTruthy();
    expect(screen.getByText("Outputs")).toBeTruthy();
  });

  test("syncs active debug output when selected or opened node is an output", async () => {
    const user = userEvent.setup();
    const sample = createSampleDocument();

    const twoOutputDocument = {
      ...sample,
      nodes: [
        ...sample.nodes,
        {
          id: "output-alt",
          kind: "output" as const,
          label: "Alt Output",
          position: { x: 720, y: 260 },
          data: {
            outputName: "alt_out",
            listeners: createDefaultOutputListenerConfig("alt_out"),
          },
        },
      ],
      edges: [
        ...sample.edges,
        {
          id: "edge-select-output-alt",
          source: "select-orders",
          sourceHandle: "out" as const,
          target: "output-alt",
          targetHandle: "in" as const,
        },
      ],
    };

    render(
      <DocumentProvider initialDocument={twoOutputDocument}>
        <AppLayout />
        <OutputSelectionProbe />
      </DocumentProvider>,
    );

    const ordersButton = screen.getByRole("button", { name: "orders_report" });
    const altButton = screen.getByRole("button", { name: "alt_out" });

    expect(ordersButton.className).toContain("solid-button");
    expect(altButton.className).toContain("ghost-button");

    await user.click(screen.getByTestId("activate-alt-output"));

    await waitFor(() => {
      expect(altButton.className).toContain("solid-button");
      expect(ordersButton.className).toContain("ghost-button");
    });
  });
});
