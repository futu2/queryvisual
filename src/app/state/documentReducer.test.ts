import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphDocument } from "../../domain/document/types";
import { createInitialEditorState, documentReducer } from "./documentReducer";

describe("documentReducer", () => {
  test("tracks the active output and open editor", () => {
    const initial = createInitialEditorState(createSampleDocument());
    const next = documentReducer(initial, {
      type: "open-node-editor",
      nodeId: "select-orders",
    });

    expect(initial.activeOutputId).toBe("output-orders");
    expect(next.editorNodeId).toBe("select-orders");
  });

  test("replaces the document and resets ui state", () => {
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
          data: { outputName: "b" },
        },
      ],
      edges: [],
    };

    const next = documentReducer(initial, {
      type: "replace-document",
      document: replacement,
    });

    expect(next.document).toEqual(replacement);
    expect(next.selectedNodeId).toBeNull();
    expect(next.editorNodeId).toBeNull();
    expect(next.activeOutputId).toBe("output-b");
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
});
