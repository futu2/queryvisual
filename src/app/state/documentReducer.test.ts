import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphDocument } from "../../domain/document/types";
import { DocumentProvider, useDocumentContext } from "./DocumentContext";
import { createInitialEditorState, documentReducer } from "./documentReducer";

afterEach(cleanup);

function ActiveOutputProbe() {
  const { state } = useDocumentContext();
  return createElement(
    "span",
    { "data-testid": "active-output" },
    state.activeOutputId ?? "none",
  );
}

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

  test("keeps the current active output when given a non-output node id", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "set-active-output",
      nodeId: "select-orders",
    });

    expect(next.activeOutputId).toBe("output-orders");
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

  test("replaces provider state when initialDocument changes", () => {
    const replacement: GraphDocument = {
      version: 1,
      metadata: { name: "replacement" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "output-next",
          kind: "output",
          label: "Output",
          position: { x: 0, y: 0 },
          data: { outputName: "replacement_out" },
        },
      ],
      edges: [],
    };

    const { rerender } = render(
      createElement(
        DocumentProvider,
        { initialDocument: createSampleDocument() },
        createElement(ActiveOutputProbe),
      ),
    );

    expect(screen.getByTestId("active-output").textContent).toBe("output-orders");

    rerender(
      createElement(
        DocumentProvider,
        { initialDocument: replacement },
        createElement(ActiveOutputProbe),
      ),
    );

    expect(screen.getByTestId("active-output").textContent).toBe("output-next");
  });
});
