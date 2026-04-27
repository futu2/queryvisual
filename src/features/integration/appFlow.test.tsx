import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Dispatch } from "react";
import {
  AppLayout,
} from "../../App";
import {
  DocumentProvider,
  useDocumentContext,
} from "../../app/state/DocumentContext";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphWorkspace } from "../../domain/document/types";
import type { EditorAction } from "../../app/state/documentReducer";

let dispatch: Dispatch<EditorAction> | null = null;

function DispatchProbe() {
  dispatch = useDocumentContext().dispatch;
  return null;
}

function createWorkspaceWithChildBackedParentOutput(): GraphWorkspace {
  return {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-parent",
    graphs: [
      {
        id: "graph-parent",
        metadata: { name: "Parent" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "subgraph-child",
            kind: "subgraph",
            label: "Orders child",
            position: { x: 0, y: 0 },
            data: { graphId: "graph-child" },
          },
          {
            id: "select-parent",
            kind: "select",
            label: "Select",
            position: { x: 260, y: 0 },
            data: {
              mappings: [{ name: "gross_total", expression: "total" }],
            },
          },
          {
            id: "output-parent",
            kind: "output",
            label: "Output",
            position: { x: 520, y: 0 },
            data: {
              outputName: "parent_out",
              listeners: createDefaultOutputListenerConfig("parent_out"),
            },
          },
        ],
        edges: [
          {
            id: "edge-parent-select",
            source: "subgraph-child",
            sourceHandle: "out:output-child",
            target: "select-parent",
            targetHandle: "in",
          },
          {
            id: "edge-select-output",
            source: "select-parent",
            sourceHandle: "out",
            target: "output-parent",
            targetHandle: "in",
          },
        ],
      },
      {
        id: "graph-child",
        metadata: { name: "Orders Child" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "from-child",
            kind: "fromTable",
            label: "Orders",
            position: { x: 0, y: 0 },
            data: {
              tableRef: { schemaName: "sales", tableName: "orders" },
              columns: { total: "float" },
            },
          },
          {
            id: "output-child",
            kind: "output",
            label: "Output",
            position: { x: 260, y: 0 },
            data: {
              outputName: "orders_base",
              listeners: createDefaultOutputListenerConfig("orders_base"),
            },
          },
        ],
        edges: [
          {
            id: "edge-child-output",
            source: "from-child",
            sourceHandle: "out",
            target: "output-child",
            targetHandle: "in",
          },
        ],
      },
    ],
  };
}

afterEach(cleanup);

describe("App integration", () => {
  test("shows generated SQL for the sample output in the output node modal", async () => {
    render(
      <DocumentProvider>
        <DispatchProbe />
        <AppLayout />
      </DocumentProvider>,
    );

    expect(screen.queryByRole("tab", { name: "SQL" })).toBeNull();

    if (!dispatch) {
      throw new Error("Missing document dispatch");
    }

    await act(async () => {
      dispatch?.({ type: "select-node", nodeId: "output-orders" });
      dispatch?.({ type: "open-node-editor", nodeId: "output-orders" });
    });

    expect(await screen.findByRole("dialog", { name: "Edit output node" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.orders/i)).toBeTruthy();
  });

  test("shows updated parent SQL after editing the referenced child graph", async () => {
    render(
      <DocumentProvider initialWorkspace={createWorkspaceWithChildBackedParentOutput()}>
        <DispatchProbe />
        <AppLayout />
      </DocumentProvider>,
    );

    if (!dispatch) {
      throw new Error("Missing document dispatch");
    }

    await act(async () => {
      dispatch?.({ type: "select-node", nodeId: "output-parent" });
      dispatch?.({ type: "open-node-editor", nodeId: "output-parent" });
    });

    expect(await screen.findByRole("dialog", { name: "Edit output node" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.orders/i)).toBeTruthy();

    await act(async () => {
      dispatch?.({ type: "set-active-graph", graphId: "graph-child" });
      dispatch?.({
        type: "replace-node",
        node: {
          id: "from-child",
          kind: "fromTable",
          label: "Returns",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { schemaName: "sales", tableName: "returns" },
            columns: { total: "float" },
          },
        },
      });
      dispatch?.({ type: "set-active-graph", graphId: "graph-parent" });
      dispatch?.({ type: "select-node", nodeId: "output-parent" });
      dispatch?.({ type: "open-node-editor", nodeId: "output-parent" });
    });

    expect(await screen.findByRole("dialog", { name: "Edit output node" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.returns/i)).toBeTruthy();
  });
});
