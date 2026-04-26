import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { compileOutput } from "./compileOutput";

describe("compileOutput", () => {
  test("returns semantic, ir, optimizedIr, and sql", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");

    expect(result.semantic.outputName).toBe("orders_report");
    expect(result.ir).not.toBeNull();
    expect(result.optimizedIr).not.toBeNull();
    expect(result.sql).toContain("SELECT");
  });

  test("returns empty sql when semantic errors prevent lowering", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: createSampleDocument().nodes.map((node) =>
        node.id === "select-orders"
          ? {
              ...node,
              data: {
                mappings: [{ name: "broken", expression: "(" }],
              },
            }
          : node,
      ),
    };

    const result = compileOutput(invalid, "output-orders");

    expect(result.semantic.diagnostics.some((diagnostic) => diagnostic.level === "error")).toBe(
      true,
    );
    expect(result.ir).toBeNull();
    expect(result.optimizedIr).toBeNull();
    expect(result.sql).toBe("");
  });

  test("emits a blocking diagnostic when a reachable subgraph node is encountered", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Subgraph safety" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "subgraph-1",
          kind: "subgraph",
          label: "Child graph",
          position: { x: 0, y: 0 },
          data: { graphId: "graph-child" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 260, y: 0 },
          data: {
            outputName: "out",
            listeners: {
              copyToClipboard: false,
              logToConsole: false,
              saveToLocalStorage: { enabled: false, key: "key" },
            },
          },
        },
      ],
      edges: [
        {
          id: "edge-subgraph-output",
          source: "subgraph-1",
          sourceHandle: "out:child-output-1",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = compileOutput(document, "output-1");

    expect(
      result.semantic.diagnostics.some(
        (diagnostic) =>
          diagnostic.level === "error" &&
          diagnostic.code === "subgraph.unsupported" &&
          diagnostic.ref?.nodeId === "subgraph-1",
      ),
    ).toBe(true);
    expect(result.ir).toBeNull();
    expect(result.optimizedIr).toBeNull();
    expect(result.sql).toBe("");
  });
});
