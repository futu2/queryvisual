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

function createWorkspaceWithSubgraphInputInlining(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input",
        kind: "graphInput" as const,
        label: "Orders In",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { order_id: "int", total: "float" },
        },
      },
      {
        id: "output-child",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-child",
        source: "child-input",
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
        id: "from-orders",
        kind: "fromTable" as const,
        label: "Orders",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { schemaName: "sales", tableName: "orders" },
          columns: { order_id: "int", total: "float" },
        },
      },
      {
        id: "subgraph-orders",
        kind: "subgraph" as const,
        label: "Child graph",
        position: { x: 0, y: 0 },
        data: { graphId: "graph-child" },
      },
      {
        id: "output-parent",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("parent_out"),
      },
    ],
    edges: [
      {
        id: "edge-parent-subgraph-input",
        source: "from-orders",
        sourceHandle: "out",
        target: "subgraph-orders",
        targetHandle: "in:child-input",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-orders",
        sourceHandle: "out:output-child",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Inlining Workspace" },
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

  test("inlines the parent relation into child graphInput nodes (no FROM \"orders_in\")", () => {
    const workspace = createWorkspaceWithSubgraphInputInlining();

    const result = compileOutput(workspace, "graph-parent", "output-parent");

    expect(result.semantic.diagnostics).toHaveLength(0);
    expect(result.sql).toContain("FROM sales.orders");
    expect(result.sql).not.toContain('"orders_in"');
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

  test("expands imported helper calls in compiled SQL", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "helper sql" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "orders",
          kind: "fromTable",
          label: "Orders",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { tableName: "orders" },
            columns: { total: "float", tax: "float" },
          },
        },
        {
          id: "helpers",
          kind: "helperFunctions",
          label: "Helpers",
          position: { x: 0, y: 160 },
          data: { helpers: [{ name: "add10", expression: "$1 + $2 + 10" }] },
        },
        {
          id: "import",
          kind: "importHelperFunctions",
          label: "Import Helpers",
          position: { x: 180, y: 160 },
          data: { moduleName: "math" },
        },
        {
          id: "select",
          kind: "select",
          label: "Select",
          position: { x: 260, y: 0 },
          data: { mappings: [{ name: "gross", expression: "math.add10(total, tax)" }] },
        },
        {
          id: "output",
          kind: "output",
          label: "Output",
          position: { x: 520, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "e-orders-select",
          source: "orders",
          sourceHandle: "out",
          target: "select",
          targetHandle: "in",
        },
        {
          id: "e-select-output",
          source: "select",
          sourceHandle: "out",
          target: "output",
          targetHandle: "in",
        },
        {
          id: "e-helper-import",
          source: "helpers",
          sourceHandle: "out",
          target: "import",
          targetHandle: "in",
        },
      ],
    };

    const result = compileOutput(document, "output");

    expect(result.semantic.diagnostics).toEqual([]);
    expect(result.sql).toContain('((total + tax) + 10) AS "gross"');
  });

  test("expands helper calls imported from another local graph", () => {
    const helperGraph = {
      id: "graph-helpers",
      metadata: { name: "Helper Library" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "helpers",
          kind: "helperFunctions" as const,
          label: "Helpers",
          position: { x: 0, y: 0 },
          data: {
            moduleName: "math",
            helpers: [{ name: "add10", expression: "$1 + 10" }],
          },
        },
      ],
      edges: [],
    };

    const consumerGraph = {
      id: "graph-consumer",
      metadata: { name: "Consumer" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "orders",
          kind: "fromTable" as const,
          label: "Orders",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { tableName: "orders" },
            columns: { total: "float" },
          },
        },
        {
          id: "import-helpers",
          kind: "importGraphHelpers" as const,
          label: "Import Graph Helpers",
          position: { x: 0, y: 160 },
          data: { graphId: "graph-helpers", moduleName: "lib" },
        },
        {
          id: "select",
          kind: "select" as const,
          label: "Select",
          position: { x: 260, y: 0 },
          data: { mappings: [{ name: "gross", expression: "lib.add10(total)" }] },
        },
        {
          id: "output",
          kind: "output" as const,
          label: "Output",
          position: { x: 520, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        { id: "e-orders-select", source: "orders", sourceHandle: "out", target: "select", targetHandle: "in" },
        { id: "e-select-output", source: "select", sourceHandle: "out", target: "output", targetHandle: "in" },
      ],
    };

    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-consumer",
      graphs: [consumerGraph, helperGraph],
      installedPackages: [],
      packageManifest: null,
    };

    const result = compileOutput(workspace, "graph-consumer", "output");

    expect(result.semantic.diagnostics).toEqual([]);
    expect(result.sql).toContain('(total + 10) AS "gross"');
  });

  test("expands helper calls imported from an installed package graph export", () => {
    const packageGraph = {
      id: "pkg-helper-graph",
      metadata: { name: "Package Helpers" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "helpers",
          kind: "helperFunctions" as const,
          label: "Helpers",
          position: { x: 0, y: 0 },
          data: {
            moduleName: "math",
            helpers: [{ name: "add10", expression: "$1 + 10" }],
          },
        },
      ],
      edges: [],
    };

    const consumerGraph = {
      id: "graph-consumer",
      metadata: { name: "Consumer" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "orders",
          kind: "fromTable" as const,
          label: "Orders",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { tableName: "orders" },
            columns: { total: "float" },
          },
        },
        {
          id: "import-helpers",
          kind: "importGraphHelpers" as const,
          label: "Import Graph Helpers",
          position: { x: 0, y: 160 },
          data: {
            graphId: "pkg-helper-graph",
            target: {
              kind: "package" as const,
              packageId: "team/helper-lib",
              version: "1.0.0",
              exportKey: "helpers",
            },
            moduleName: "pkg",
          },
        },
        {
          id: "select",
          kind: "select" as const,
          label: "Select",
          position: { x: 260, y: 0 },
          data: { mappings: [{ name: "gross", expression: "pkg.add10(total)" }] },
        },
        {
          id: "output",
          kind: "output" as const,
          label: "Output",
          position: { x: 520, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        { id: "e-orders-select", source: "orders", sourceHandle: "out", target: "select", targetHandle: "in" },
        { id: "e-select-output", source: "select", sourceHandle: "out", target: "output", targetHandle: "in" },
      ],
    };

    const result = compileOutput(
      {
        version: 2,
        metadata: { name: "Workspace" },
        entryGraphId: "graph-consumer",
        graphs: [consumerGraph],
        installedPackages: [
          {
            packageId: "team/helper-lib",
            version: "1.0.0",
            metadata: { name: "Helper Lib" },
            exports: [
              {
                exportKey: "helpers",
                graphId: "pkg-helper-graph",
                displayName: "Helpers",
              },
            ],
            graphs: [packageGraph],
            dependencyRefs: [],
          },
        ],
        packageManifest: null,
      },
      "graph-consumer",
      "output",
    );

    expect(result.semantic.diagnostics).toEqual([]);
    expect(result.sql).toContain('(total + 10) AS "gross"');
  });

  test("compiles a parent output that references an installed package export", () => {
    const packageGraph = {
      id: "pkg-graph",
      metadata: { name: "Daily Orders" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-orders",
          kind: "fromTable" as const,
          label: "Orders",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { schemaName: "sales", tableName: "orders" },
            columns: { total: "float" },
          },
        },
        {
          id: "output-child",
          kind: "output" as const,
          label: "Output",
          position: { x: 260, y: 0 },
          data: outputData("daily_orders"),
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
          label: "Package graph",
          position: { x: 0, y: 0 },
          data: {
            graphId: "pkg-graph",
            target: {
              kind: "package" as const,
              packageId: "team/sales-lib",
              version: "1.2.0",
              exportKey: "daily_orders",
            },
          },
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

    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-parent",
      graphs: [parentGraph],
      installedPackages: [
        {
          packageId: "team/sales-lib",
          version: "1.2.0",
          metadata: { name: "Sales Lib" },
          exports: [
            {
              exportKey: "daily_orders",
              graphId: "pkg-graph",
              displayName: "Daily Orders",
            },
          ],
          graphs: [packageGraph],
          dependencyRefs: [],
        },
      ],
      packageManifest: null,
    };

    const result = compileOutput(workspace, "graph-parent", "output-parent");

    expect(result.semantic.diagnostics).toHaveLength(0);
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("FROM sales.orders");
    expect(result.sql).toContain("gross_total");
  });
});
