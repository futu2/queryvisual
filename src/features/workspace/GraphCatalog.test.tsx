import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, type ReactElement } from "react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import type { GraphNode } from "../../domain/document/types";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import { I18nProvider } from "../i18n/I18nContext";
import {
  NodeEditorModal,
  type NodeEditorModalHandle,
} from "../graph-editor/NodeEditorModal";
import { GraphCatalog } from "./GraphCatalog";

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

function createWorkspaceWithSecondaryGraph() {
  const workspace = createSampleWorkspace();

  return {
    ...workspace,
    graphs: [
      ...workspace.graphs,
      {
        id: "graph-secondary",
        metadata: { name: "Secondary Graph" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
  };
}

function createWorkspaceWithReferencedChildGraph() {
  const workspace = createSampleWorkspace();

  return {
    ...workspace,
    graphs: [
      {
        ...workspace.graphs[0]!,
        nodes: [
          ...workspace.graphs[0]!.nodes,
          {
            id: "subgraph-child",
            kind: "subgraph" as const,
            label: "Orders child",
            position: { x: 700, y: 80 },
            data: { graphId: "graph-child" },
          },
        ],
      },
      {
        id: "graph-child",
        metadata: { name: "Orders Child" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
  };
}

describe("GraphCatalog", () => {
  test("creates, renames, and switches graphs through the catalog", async () => {
    const user = userEvent.setup();

    renderWithProviders(
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
      renderWithProviders(
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

  test("deleting an inactive graph bypasses discard confirmation and keeps dirty editor open", async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders(
        <DocumentProvider initialWorkspace={createWorkspaceWithSecondaryGraph()}>
          <CatalogWithEditorGuardHarness />
        </DocumentProvider>,
      );
    });

    await user.clear(await screen.findByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Dirty orders");
    await user.click(screen.getByRole("button", { name: "Delete Secondary Graph" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(screen.queryByLabelText("Graph name Secondary Graph")).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Dirty orders",
    );
  });

  test("blocks deleting a graph that is still referenced by a subgraph node", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createWorkspaceWithReferencedChildGraph()}>
        <GraphCatalog />
      </DocumentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete Orders Child" }));

    expect(screen.getByText("Graph is still referenced.")).toBeTruthy();
    expect(screen.getByLabelText("Graph name Orders Child")).toBeTruthy();
  });

  test("localizes visible chrome but keeps graph names as user content", () => {
    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <GraphCatalog />
      </DocumentProvider>,
      { navigatorLanguage: "zh-CN" },
    );

    expect(screen.getByText("查询图")).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建图" })).toBeTruthy();
    expect(screen.getByLabelText("图名称 Orders Sample")).toBeTruthy();
  });
});
