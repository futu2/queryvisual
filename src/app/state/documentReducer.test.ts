import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphDocument } from "../../domain/document/types";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import {
  createInitialEditorState,
  documentReducer,
  getActiveGraph,
} from "./documentReducer";

describe("documentReducer", () => {
  test("creates initial editor state from a sample workspace", () => {
    const state = createInitialEditorState(createSampleWorkspace());

    expect(state.activeGraphId).toBe(state.workspace.entryGraphId);
    expect(getActiveGraph(state)?.id).toBe(state.workspace.entryGraphId);
  });

  test("tracks open editor state", () => {
    const initial = createInitialEditorState(createSampleDocument());
    const next = documentReducer(initial, {
      type: "open-node-editor",
      nodeId: "select-orders",
    });

    expect(next.editorNodeId).toBe("select-orders");
  });

  test("replaces the document and resets only selection plus open editor state", () => {
    const initial = {
      ...createInitialEditorState(createSampleDocument()),
      selectedNodeId: "select-orders",
      editorNodeId: "select-orders",
    };
    const replacement: GraphDocument = {
      version: 1,
      metadata: { name: "replacement" },
      viewport: { x: 10, y: 20, zoom: 0.8 },
      nodes: [
        {
          id: "output-b",
          kind: "output",
          label: "Output B",
          position: { x: 0, y: 0 },
          data: {
            outputName: "b",
            listeners: createDefaultOutputListenerConfig("b"),
          },
        },
      ],
      edges: [],
    };

    const next = documentReducer(initial, {
      type: "replace-document",
      document: replacement,
    });

    expect(next.workspace.entryGraphId).toBe("graph-main");
    expect(next.document).toEqual({
      id: "graph-main",
      metadata: replacement.metadata,
      viewport: replacement.viewport,
      nodes: replacement.nodes,
      edges: replacement.edges,
    });
    expect(next.selectedNodeId).toBeNull();
    expect(next.editorNodeId).toBeNull();
    expect("activeOutputId" in next).toBe(false);
  });

  test("replace-workspace resets selection and switches the active graph", () => {
    const state = {
      ...createInitialEditorState(createSampleWorkspace()),
      selectedNodeId: "from-orders",
      editorNodeId: "from-orders",
    };

    const next = documentReducer(state, {
      type: "replace-workspace",
      workspace: {
        version: 2,
        metadata: { name: "Replacement" },
        entryGraphId: "graph-b",
        graphs: [
          {
            id: "graph-b",
            metadata: { name: "B" },
            viewport: { x: 10, y: 20, zoom: 0.8 },
            nodes: [],
            edges: [],
          },
        ],
      },
    });

    expect(next.activeGraphId).toBe("graph-b");
    expect(next.selectedNodeId).toBeNull();
    expect(next.editorNodeId).toBeNull();
  });

  test("upserts edges by id", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "upsert-edge",
      edge: {
        id: "edge-select-output",
        source: "from-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    });

    expect(next.document.edges).toHaveLength(initial.document.edges.length);
    expect(next.document.edges.find((edge) => edge.id === "edge-select-output")?.source).toBe(
      "from-orders",
    );
  });

  test("replaces any existing edge on the same target handle", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "upsert-edge",
      edge: {
        id: "edge-from-orders-output",
        source: "from-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    });

    const outputInputEdges = next.document.edges.filter(
      (edge) => edge.target === "output-orders" && edge.targetHandle === "in",
    );

    expect(outputInputEdges).toHaveLength(1);
    expect(outputInputEdges[0]?.source).toBe("from-orders");
  });

  test("deletes exactly one edge by id", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "delete-edge",
      edgeId: "edge-select-output",
    });

    expect(next.document.edges).toHaveLength(initial.document.edges.length - 1);
    expect(next.document.edges.some((edge) => edge.id === "edge-select-output")).toBe(false);
    expect(next.document.edges.some((edge) => edge.id === "edge-from-select")).toBe(true);
  });

  test("throws on unknown runtime actions", () => {
    const initial = createInitialEditorState(createSampleDocument());

    expect(() =>
      documentReducer(initial, { type: "unknown-action" } as never),
    ).toThrow("Unknown action");
  });

  test("updates the stored viewport", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "set-viewport",
      viewport: { x: 120, y: 64, zoom: 0.75 },
    });

    expect(next.document.viewport).toEqual({ x: 120, y: 64, zoom: 0.75 });
  });

  test("initial state no longer includes active output state", () => {
    const initial = createInitialEditorState(createSampleDocument());
    expect("activeOutputId" in initial).toBe(false);
  });
});
