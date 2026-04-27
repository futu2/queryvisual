import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { flushSync } from "react-dom";
import { DocumentProvider, useDocumentContext } from "./app/state/DocumentContext";
import type { GraphWorkspace } from "./domain/document/types";
import { createSampleWorkspace } from "./domain/workspace/sample";
import { App, AppLayout } from "./App";

afterEach(cleanup);

describe("App", () => {
  function EditorOpenProbe() {
    const { dispatch } = useDocumentContext();

    return (
      <button
        type="button"
        onClick={() => {
          dispatch({ type: "select-node", nodeId: "from-orders" });
          dispatch({ type: "open-node-editor", nodeId: "from-orders" });
        }}
      >
        Open from-orders editor
      </button>
    );
  }

  test("renders the QueryVisual shell without an Outputs panel", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("QueryVisual")).toBeTruthy();
    expect(screen.getByText("Canvas")).toBeTruthy();
    expect(screen.queryByText("Outputs")).toBeNull();
  });

  test("renders from the active graph in the initial workspace", async () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-b",
      graphs: [
        {
          id: "graph-a",
          metadata: { name: "Alpha Graph" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-b",
          metadata: { name: "Beta Graph" },
          viewport: { x: 10, y: 20, zoom: 0.8 },
          nodes: [],
          edges: [],
        },
      ],
    };

    await act(async () => {
      render(<App initialWorkspace={workspace} />);
    });

    expect(screen.getByRole("button", { name: "Open Alpha Graph" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByLabelText("Graph name Beta Graph")).toBeTruthy();
  });

  test("graph catalog new graph still uses discard confirmation after dirty editor opens", async () => {
    await act(async () => {
      render(
        <DocumentProvider initialWorkspace={createSampleWorkspace()}>
          <AppLayout />
          <EditorOpenProbe />
        </DocumentProvider>,
      );
    });

    flushSync(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Open from-orders editor" }),
      );
    });

    const nodeNameInput = screen.getByLabelText("Node name") as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("Missing HTMLInputElement value setter");
    }
    valueSetter.call(nodeNameInput, "Dirty Orders");
    nodeNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    (screen.getByRole("button", { name: "New graph" }) as HTMLButtonElement).click();
    await act(async () => {});

    expect(
      await screen.findByRole("dialog", { name: "Discard changes?" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Graph name Graph 2")).toBeNull();
  });
});
