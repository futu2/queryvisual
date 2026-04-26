import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import type { GraphNode } from "../../domain/document/types";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import {
  NodeEditorModal,
  type NodeEditorModalHandle,
} from "../graph-editor/NodeEditorModal";
import { GraphCatalog } from "./GraphCatalog";

afterEach(cleanup);

function getGraphRowByName(name: string) {
  const input = screen.getByDisplayValue(name);
  const row = input.closest('[data-testid^="graph-catalog-item-"]');
  if (!row) {
    throw new Error(`Missing row for graph ${name}`);
  }

  return row as HTMLElement;
}

function CatalogWithEditorGuardHarness() {
  const { state, dispatch } = useDocumentContext();
  const editorRef = useRef<NodeEditorModalHandle | null>(null);
  const initialNodeId = state.document.nodes[0]?.id ?? null;
  const editedNode =
    state.document.nodes.find((node) => node.id === state.editorNodeId) ?? null;

  useEffect(() => {
    if (!initialNodeId) {
      return;
    }

    dispatch({ type: "select-node", nodeId: initialNodeId });
    dispatch({ type: "open-node-editor", nodeId: initialNodeId });
  }, [dispatch, initialNodeId]);

  const runGraphMutation = (action: () => void) => {
    if (editedNode && editorRef.current) {
      editorRef.current.requestClose(action);
      return;
    }

    action();
  };

  return (
    <>
      <GraphCatalog runGraphMutation={runGraphMutation} />
      {editedNode ? (
        <NodeEditorModal
          ref={editorRef}
          node={editedNode as GraphNode}
          onClose={() => dispatch({ type: "open-node-editor", nodeId: null })}
          onSave={(node) => {
            dispatch({ type: "replace-node", node });
            dispatch({ type: "open-node-editor", nodeId: null });
          }}
        />
      ) : null}
    </>
  );
}

describe("GraphCatalog", () => {
  test("creates, renames, and switches graphs through the catalog", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <GraphCatalog />
      </DocumentProvider>,
    );

    expect(screen.getByLabelText("Graph name Orders Sample")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "New graph" }));

    const newGraphNameInput = screen.getByLabelText(
      "Graph name Graph 2",
    ) as HTMLInputElement;
    await user.clear(newGraphNameInput);
    await user.type(newGraphNameInput, "Segmented Revenue");

    expect(screen.getByRole("button", { name: "Delete Orders Sample" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Segmented Revenue" })).toBeTruthy();
    const newGraphRow = getGraphRowByName("Segmented Revenue");
    expect(within(newGraphRow).getByText("Active")).toBeTruthy();

    const originalGraphRow = getGraphRowByName("Orders Sample");
    await user.click(
      within(originalGraphRow).getByRole("button", { name: "Open Orders Sample" }),
    );
    expect(within(originalGraphRow).getByText("Active")).toBeTruthy();

    const renamedRow = getGraphRowByName("Segmented Revenue");
    await user.click(
      within(renamedRow).getByRole("button", { name: "Open Segmented Revenue" }),
    );
    expect(within(renamedRow).getByText("Active")).toBeTruthy();
  });

  test("new graph action prompts discard confirmation when node editor is dirty", async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(
        <DocumentProvider initialWorkspace={createSampleWorkspace()}>
          <CatalogWithEditorGuardHarness />
        </DocumentProvider>,
      );
    });

    await user.clear(await screen.findByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Dirty orders");
    await user.click(screen.getByRole("button", { name: "New graph" }));

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(screen.queryByLabelText("Graph name Graph 2")).toBeNull();
  });
});
