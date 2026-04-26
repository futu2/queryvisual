import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument, GraphWorkspace } from "../document/types";
import { createDefaultOutputListenerConfig } from "../document/outputListeners";
import { compileOutput } from "./compileOutput";

function outputData(outputName: string) {
  return {
    outputName,
    listeners: createDefaultOutputListenerConfig(outputName),
  };
}

function createWorkspaceWithComposedParent(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Orders Package" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "from-orders",
        kind: "fromTable" as const,
        label: "Orders",
        position: { x: 0, y: 0 },
        data: {
          tableRef: { schemaName: "sales", tableName: "orders" },
          columns: { order_id: "int", total: "float" },
        },
      },
      {
        id: "output-child",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("orders_base"),
      },
    ],
    edges: [
      {
        id: "edge-child",
        source: "from-orders",
        sourceHandle: "out",
        target: "output-child",
        targetHandle: "in",
      },
    ],
  };

  const parentGraph = {
    id: "graph-parent",
    metadata: { name: "Parent" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "subgraph-orders",
        kind: "subgraph" as const,
        label: "Orders",
        position: { x: 0, y: 0 },
        data: { graphId: "graph-child" },
      },
      {
        id: "select-parent",
        kind: "select" as const,
        label: "Select",
        position: { x: 260, y: 0 },
        data: { mappings: [{ name: "gross_total", expression: "total" }] },
      },
      {
        id: "output-parent",
        kind: "output" as const,
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("parent_out"),
      },
    ],
    edges: [
      {
        id: "edge-subgraph-select",
        source: "subgraph-orders",
        sourceHandle: "out:output-child",
        target: "select-parent",
        targetHandle: "in",
      },
      {
        id: "edge-select-out",
        source: "select-parent",
        sourceHandle: "out",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Composed Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
  };
}

describe("compileOutput", () => {
  test("returns semantic, ir, optimizedIr, and sql", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");

    expect(result.semantic.outputName).toBe("orders_report");
    expect(result.ir).not.toBeNull();
    expect(result.optimizedIr).not.toBeNull();
    expect(result.sql).toContain("SELECT");
  });

  test("compiles a parent output that references a child graph", () => {
    const workspace = createWorkspaceWithComposedParent();

    const result = compileOutput(workspace, "graph-parent", "output-parent");

    expect(result.semantic.diagnostics).toHaveLength(0);
    expect(result.sql).toContain("FROM sales.orders");
    expect(result.sql).toContain("gross_total");
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
});
