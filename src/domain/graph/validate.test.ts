import { describe, expect, test } from "bun:test";
import { createDefaultOutputListenerConfig } from "../document/outputListeners";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument, GraphWorkspace } from "../document/types";
import { validateOutput } from "./validate";

function outputData(outputName: string) {
  return {
    outputName,
    listeners: createDefaultOutputListenerConfig(outputName),
  };
}

function createWorkspaceWithIncompatibleSubgraphInput(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input",
        kind: "graphInput" as const,
        label: "Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { order_id: "int", total: "float" },
        },
      },
      {
        id: "child-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-in-out",
        source: "child-input",
        sourceHandle: "out",
        target: "child-output",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          // Missing required child column `total`.
          columns: { order_id: "int" },
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
        source: "from-parent",
        sourceHandle: "out",
        target: "subgraph-orders",
        targetHandle: "in:child-input",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-orders",
        sourceHandle: "out:child-output",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Incompatible Input Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithCycle(): GraphWorkspace {
  const graphA = {
    id: "graph-a",
    metadata: { name: "A" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "subgraph-a",
        kind: "subgraph" as const,
        label: "B",
        position: { x: 0, y: 0 },
        data: { graphId: "graph-b" },
      },
      {
        id: "output-a",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("out_a"),
      },
    ],
    edges: [
      {
        id: "edge-a-out",
        source: "subgraph-a",
        sourceHandle: "out:output-b",
        target: "output-a",
        targetHandle: "in",
      },
    ],
  };

  const graphB = {
    id: "graph-b",
    metadata: { name: "B" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "subgraph-b",
        kind: "subgraph" as const,
        label: "A",
        position: { x: 0, y: 0 },
        data: { graphId: "graph-a" },
      },
      {
        id: "output-b",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("out_b"),
      },
    ],
    edges: [
      {
        id: "edge-b-out",
        source: "subgraph-b",
        sourceHandle: "out:output-a",
        target: "output-b",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Cyclic Workspace" },
    entryGraphId: "graph-a",
    graphs: [graphA, graphB],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithUnusedChildInput(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input-used",
        kind: "graphInput" as const,
        label: "Used Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "used_in",
          columns: { order_id: "int" },
        },
      },
      {
        id: "child-input-unused",
        kind: "graphInput" as const,
        label: "Unused Input",
        position: { x: 0, y: 200 },
        data: {
          inputName: "unused_in",
          columns: { customer_id: "int" },
        },
      },
      {
        id: "child-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-used-out",
        source: "child-input-used",
        sourceHandle: "out",
        target: "child-output",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          columns: { order_id: "int" },
        },
      },
      {
        id: "subgraph-child",
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
        id: "edge-parent-subgraph-used",
        source: "from-parent",
        sourceHandle: "out",
        target: "subgraph-child",
        targetHandle: "in:child-input-used",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-child",
        sourceHandle: "out:child-output",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Unused Child Input Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithDuplicateChildInputNames(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input-a",
        kind: "graphInput" as const,
        label: "Input A",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { order_id: "int" },
        },
      },
      {
        id: "child-input-b",
        kind: "graphInput" as const,
        label: "Input B",
        position: { x: 0, y: 200 },
        data: {
          inputName: "orders_in",
          columns: { order_id: "int" },
        },
      },
      {
        id: "child-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-used-out",
        source: "child-input-a",
        sourceHandle: "out",
        target: "child-output",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          columns: { order_id: "int" },
        },
      },
      {
        id: "subgraph-child",
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
        id: "edge-parent-subgraph-used",
        source: "from-parent",
        sourceHandle: "out",
        target: "subgraph-child",
        targetHandle: "in:child-input-a",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-child",
        sourceHandle: "out:child-output",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Duplicate Child Input Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithDuplicateChildOutputNames(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input",
        kind: "graphInput" as const,
        label: "Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { order_id: "int" },
        },
      },
      {
        id: "child-output-a",
        kind: "output" as const,
        label: "Output A",
        position: { x: 260, y: 0 },
        data: outputData("child_out"),
      },
      {
        id: "child-output-b",
        kind: "output" as const,
        label: "Output B",
        position: { x: 260, y: 200 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-in-out-a",
        source: "child-input",
        sourceHandle: "out",
        target: "child-output-a",
        targetHandle: "in",
      },
      {
        id: "edge-in-out-b",
        source: "child-input",
        sourceHandle: "out",
        target: "child-output-b",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          columns: { order_id: "int" },
        },
      },
      {
        id: "subgraph-child",
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
        id: "edge-parent-subgraph-used",
        source: "from-parent",
        sourceHandle: "out",
        target: "subgraph-child",
        targetHandle: "in:child-input",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-child",
        sourceHandle: "out:child-output-a",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Duplicate Child Output Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithChildDiagnosticContext(): GraphWorkspace {
  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input",
        kind: "graphInput" as const,
        label: "Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { total: "float" },
        },
      },
      {
        id: "child-select",
        kind: "select" as const,
        label: "Select",
        position: { x: 260, y: 0 },
        data: {
          mappings: [{ name: "broken", expression: "(" }],
        },
      },
      {
        id: "child-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-in-select",
        source: "child-input",
        sourceHandle: "out",
        target: "child-select",
        targetHandle: "in",
      },
      {
        id: "edge-select-out",
        source: "child-select",
        sourceHandle: "out",
        target: "child-output",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          columns: { total: "float" },
        },
      },
      {
        id: "subgraph-child",
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
        id: "edge-parent-subgraph-used",
        source: "from-parent",
        sourceHandle: "out",
        target: "subgraph-child",
        targetHandle: "in:child-input",
      },
      {
        id: "edge-subgraph-output",
        source: "subgraph-child",
        sourceHandle: "out:child-output",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Child Diagnostics Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

function createWorkspaceWithNestedChildDiagnosticContext(): GraphWorkspace {
  const grandchildGraph = {
    id: "graph-grandchild",
    metadata: { name: "Grandchild" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "grandchild-input",
        kind: "graphInput" as const,
        label: "Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "orders_in",
          columns: { total: "float" },
        },
      },
      {
        id: "grandchild-select",
        kind: "select" as const,
        label: "Select",
        position: { x: 260, y: 0 },
        data: {
          mappings: [{ name: "broken", expression: "(" }],
        },
      },
      {
        id: "grandchild-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("grandchild_out"),
      },
    ],
    edges: [
      {
        id: "edge-in-select",
        source: "grandchild-input",
        sourceHandle: "out",
        target: "grandchild-select",
        targetHandle: "in",
      },
      {
        id: "edge-select-out",
        source: "grandchild-select",
        sourceHandle: "out",
        target: "grandchild-output",
        targetHandle: "in",
      },
    ],
  };

  const childGraph = {
    id: "graph-child",
    metadata: { name: "Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "child-input",
        kind: "graphInput" as const,
        label: "Input",
        position: { x: 0, y: 0 },
        data: {
          inputName: "child_in",
          columns: { total: "float" },
        },
      },
      {
        id: "child-subgraph",
        kind: "subgraph" as const,
        label: "Grandchild graph",
        position: { x: 260, y: 0 },
        data: { graphId: "graph-grandchild" },
      },
      {
        id: "child-output",
        kind: "output" as const,
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("child_out"),
      },
    ],
    edges: [
      {
        id: "edge-child-input-subgraph",
        source: "child-input",
        sourceHandle: "out",
        target: "child-subgraph",
        targetHandle: "in:grandchild-input",
      },
      {
        id: "edge-child-subgraph-output",
        source: "child-subgraph",
        sourceHandle: "out:grandchild-output",
        target: "child-output",
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
        id: "from-parent",
        kind: "fromTable" as const,
        label: "T",
        position: { x: -260, y: 0 },
        data: {
          tableRef: { tableName: "t" },
          columns: { total: "float" },
        },
      },
      {
        id: "parent-subgraph",
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
        source: "from-parent",
        sourceHandle: "out",
        target: "parent-subgraph",
        targetHandle: "in:child-input",
      },
      {
        id: "edge-parent-subgraph-output",
        source: "parent-subgraph",
        sourceHandle: "out:child-output",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Nested Child Diagnostics Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph, grandchildGraph],
    installedPackages: [],
    packageManifest: null,
  };
}

describe("validateOutput", () => {
  test("validates the sample output without errors", () => {
    const document = createSampleDocument();
    const result = validateOutput(document, "output-orders");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.outputName).toBe("orders_report");
    expect(result.schemas["select-orders"].gross_total).toBe("float");
  });

  test("reports unknown select columns with select.unknown-column and correct field path", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Unknown Select Column" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-1",
          kind: "fromTable",
          label: "T",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int" },
          },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 0, y: 0 },
          data: { mappings: [{ name: "x", expression: "missing" }] },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-from-select",
          source: "from-1",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "edge-select-output",
          source: "select-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    const unknown = result.diagnostics.find(diagnostic => diagnostic.code === "select.unknown-column");
    expect(unknown).toBeDefined();
    expect(unknown?.ref?.nodeId).toBe("select-1");
    expect(unknown?.ref?.field).toBe("mappings.0.expression");
  });

  test("accepts package-target subgraphs when the installed export exists", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Package Targets Supported" },
      entryGraphId: "graph-parent",
      graphs: [
        {
          id: "graph-parent",
          metadata: { name: "Parent" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "subgraph-1",
              kind: "subgraph" as const,
              label: "Pkg Target",
              position: { x: 0, y: 0 },
              data: {
                graphId: "graph-child",
                target: {
                  kind: "package",
                  packageId: "com.acme/orders",
                  version: "1.0.0",
                  exportKey: "orders_report",
                },
              },
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
              id: "edge-subgraph-output",
              source: "subgraph-1",
              sourceHandle: "out:child-output",
              target: "output-parent",
              targetHandle: "in",
            },
          ],
        },
      ],
      installedPackages: [
        {
          packageId: "com.acme/orders",
          version: "1.0.0",
          metadata: { name: "Orders" },
          exports: [
            {
              exportKey: "orders_report",
              graphId: "graph-child",
              displayName: "Orders Report",
            },
          ],
          graphs: [
            {
              id: "graph-child",
              metadata: { name: "Child" },
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
                  id: "child-output",
                  kind: "output" as const,
                  label: "Output",
                  position: { x: 260, y: 0 },
                  data: outputData("child_out"),
                },
              ],
              edges: [
                {
                  id: "edge-child",
                  source: "from-orders",
                  sourceHandle: "out",
                  target: "child-output",
                  targetHandle: "in",
                },
              ],
            },
          ],
          dependencyRefs: [],
        },
      ],
      packageManifest: null,
    };

    const result = validateOutput(workspace, "graph-parent", "output-parent");
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "subgraph.unsupported-package-target",
      ),
    ).toBe(false);
    expect(result.diagnostics).toHaveLength(0);
  });

  test("rejects same-node select mapping references as unknown columns (still select.unknown-column)", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Same Node Reference" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-1",
          kind: "fromTable",
          label: "T",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int" },
          },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 0, y: 0 },
          data: {
            mappings: [
              { name: "x", expression: "id" },
              { name: "y", expression: "x" },
            ],
          },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-from-select",
          source: "from-1",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "edge-select-output",
          source: "select-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    const unknown = result.diagnostics.find(diagnostic => diagnostic.code === "select.unknown-column");
    expect(unknown).toBeDefined();
    expect(unknown?.ref?.nodeId).toBe("select-1");
    expect(unknown?.ref?.field).toBe("mappings.1.expression");
  });

  test("reports ambiguous bare join references with join.ambiguous-column", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Ambiguous Join Column" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-left",
          kind: "fromTable",
          label: "Left",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "left_table" },
            columns: { id: "int" },
          },
        },
        {
          id: "from-right",
          kind: "fromTable",
          label: "Right",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { tableName: "right_table" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 100 },
          data: { joinType: "inner", predicate: "id = 1" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 100 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-left-join",
          source: "from-left",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-right-join",
          source: "from-right",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "right",
        },
        {
          id: "edge-join-output",
          source: "join-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    const ambiguous = result.diagnostics.find(
      diagnostic => diagnostic.code === "join.ambiguous-column",
    );
    expect(ambiguous).toBeDefined();
    expect(ambiguous?.ref?.nodeId).toBe("join-1");
    expect(ambiguous?.ref?.field).toBe("predicate");
  });

  test("rejects a parent subgraph input when required child columns are missing", () => {
    const workspace = createWorkspaceWithIncompatibleSubgraphInput();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.level === "error" &&
          diagnostic.code === "subgraph.incompatible-input" &&
          diagnostic.ref?.nodeId === "subgraph-orders",
      ),
    ).toBe(true);
  });

  test("rejects graph dependency cycles", () => {
    const workspace = createWorkspaceWithCycle();

    const result = validateOutput(workspace, "graph-a", "output-a");

    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.level === "error" && diagnostic.code === "subgraph.cycle",
      ),
    ).toBe(true);
  });

  test("does not require wiring unused child graph inputs for the selected child output", () => {
    const workspace = createWorkspaceWithUnusedChildInput();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    expect(result.diagnostics).toEqual([]);
  });

  test("rejects duplicate child graphInput.inputName values", () => {
    const workspace = createWorkspaceWithDuplicateChildInputNames();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.level === "error" &&
          diagnostic.code === "subgraph.duplicate-child-input-name" &&
          diagnostic.ref?.nodeId === "subgraph-child",
      ),
    ).toBe(true);
  });

  test("rejects duplicate child output.outputName values", () => {
    const workspace = createWorkspaceWithDuplicateChildOutputNames();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.level === "error" &&
          diagnostic.code === "subgraph.duplicate-child-output-name" &&
          diagnostic.ref?.nodeId === "subgraph-child",
      ),
    ).toBe(true);
  });

  test("preserves child diagnostic context when a child validation error is surfaced through a parent subgraph", () => {
    const workspace = createWorkspaceWithChildDiagnosticContext();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    const propagated = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.level === "error" &&
        diagnostic.code === "select.invalid-expression" &&
        diagnostic.ref?.nodeId === "subgraph-child",
    );
    expect(propagated).toBeDefined();
    expect(propagated?.context?.child?.graphId).toBe("graph-child");
    expect(propagated?.context?.child?.nodeId).toBe("child-select");
    expect(propagated?.context?.child?.field).toBe("mappings.0.expression");
  });

  test("preserves nested child diagnostic provenance beyond one hop", () => {
    const workspace = createWorkspaceWithNestedChildDiagnosticContext();

    const result = validateOutput(workspace, "graph-parent", "output-parent");

    const propagated = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.level === "error" &&
        diagnostic.code === "select.invalid-expression" &&
        diagnostic.ref?.nodeId === "parent-subgraph",
    );
    expect(propagated).toBeDefined();
    expect(propagated?.context?.child?.graphId).toBe("graph-grandchild");
    expect(propagated?.context?.child?.nodeId).toBe("grandchild-select");
    expect(propagated?.context?.child?.field).toBe("mappings.0.expression");

    // Optional chain should include the intermediate child hop.
    expect(propagated?.context?.chain?.map((entry) => entry.graphId)).toEqual([
      "graph-child",
      "graph-grandchild",
    ]);
  });

  test("reports a missing join input", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "from-orders",
          kind: "fromTable",
          label: "Orders",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { schemaName: "sales", tableName: "orders" },
            columns: {
              order_id: "int",
              customer_id: "int",
            },
          },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 0 },
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "output-join",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("bad_join"),
        },
      ],
      edges: [
        {
          id: "edge-from-join-left",
          source: "from-orders",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-join-output",
          source: "join-1",
          sourceHandle: "out",
          target: "output-join",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-join");

    expect(
      result.diagnostics.some(diagnostic => diagnostic.code === "join.missing-input"),
    ).toBe(true);
  });

  test("returns output.invalid instead of throwing for a missing output id", () => {
    const document = createSampleDocument();

    expect(() => validateOutput(document, "missing-output")).not.toThrow();

    const result = validateOutput(document, "missing-output");
    expect(result.outputName).toBe("missing-output");
    const outputInvalid = result.diagnostics.find(
      diagnostic => diagnostic.code === "output.invalid",
    );
    expect(outputInvalid).toBeDefined();
    expect(outputInvalid?.ref?.nodeId).toBe("missing-output");
  });

  test("does not throw on malformed expressions and reports diagnostics", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "left-table",
          kind: "fromTable",
          label: "Left",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "left_table" },
            columns: { id: "int", total: "float" },
          },
        },
        {
          id: "right-table",
          kind: "fromTable",
          label: "Right",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { tableName: "right_table" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 100 },
          data: { joinType: "inner", predicate: "(" },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 200, y: 100 },
          data: { predicate: "(" },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 400, y: 100 },
          data: { mappings: [{ name: "broken", expression: "(" }] },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 600, y: 100 },
          data: outputData("bad_exprs"),
        },
      ],
      edges: [
        {
          id: "edge-left-join",
          source: "left-table",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-right-join",
          source: "right-table",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "right",
        },
        {
          id: "edge-join-where",
          source: "join-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
        {
          id: "edge-where-select",
          source: "where-1",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "edge-select-output",
          source: "select-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    expect(() => validateOutput(invalid, "output-1")).not.toThrow();

    const result = validateOutput(invalid, "output-1");
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "join.invalid-expression")).toBe(
      true,
    );
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "where.invalid-expression")).toBe(
      true,
    );
    expect(
      result.diagnostics.some(diagnostic => diagnostic.code === "select.invalid-expression"),
    ).toBe(true);
  });

  test("reports duplicate single-input edges", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "left-1",
          kind: "fromTable",
          label: "Left 1",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t1" },
            columns: { id: "int" },
          },
        },
        {
          id: "left-2",
          kind: "fromTable",
          label: "Left 2",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { tableName: "t2" },
            columns: { id: "int" },
          },
        },
        {
          id: "where-dup",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 100 },
          data: { predicate: "id = 1" },
        },
        {
          id: "output-dup",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 100 },
          data: outputData("dup_input"),
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "left-1",
          sourceHandle: "out",
          target: "where-dup",
          targetHandle: "in",
        },
        {
          id: "edge-2",
          source: "left-2",
          sourceHandle: "out",
          target: "where-dup",
          targetHandle: "in",
        },
        {
          id: "edge-3",
          source: "where-dup",
          sourceHandle: "out",
          target: "output-dup",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-dup");
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "where.duplicate-input")).toBe(
      true,
    );
    // Structural diagnostics should stand alone; do not leak analyzer errors when wiring is invalid.
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "where.unknown-column")).toBe(
      false,
    );
  });

  test("does not leak analyzer diagnostics downstream of a join with duplicate-side wiring", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Downstream Of Duplicate Join Side" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "left-a",
          kind: "fromTable",
          label: "Left A",
          position: { x: -300, y: 0 },
          data: {
            tableRef: { tableName: "left_a" },
            columns: { id: "int" },
          },
        },
        {
          id: "left-b",
          kind: "fromTable",
          label: "Left B",
          position: { x: -300, y: 200 },
          data: {
            tableRef: { tableName: "left_b" },
            columns: { id: "int" },
          },
        },
        {
          id: "right-a",
          kind: "fromTable",
          label: "Right A",
          position: { x: -300, y: 400 },
          data: {
            tableRef: { tableName: "right_a" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-dup",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 200 },
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "where-after",
          kind: "where",
          label: "Where",
          position: { x: 200, y: 200 },
          data: { predicate: "left.id = right.id" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 400, y: 200 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-left-a-join",
          source: "left-a",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "left",
        },
        {
          id: "edge-left-b-join",
          source: "left-b",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "left",
        },
        {
          id: "edge-right-a-join",
          source: "right-a",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "right",
        },
        {
          id: "edge-join-where",
          source: "join-dup",
          sourceHandle: "out",
          target: "where-after",
          targetHandle: "in",
        },
        {
          id: "edge-where-output",
          source: "where-after",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    expect(
      result.diagnostics.some(diagnostic => diagnostic.code === "join.duplicate-left-input"),
    ).toBe(true);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "where.unknown-column")).toBe(
      false,
    );
  });

  test("does not leak analyzer diagnostics downstream of a where with duplicate single-input wiring", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Downstream Of Duplicate Where Input" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-1",
          kind: "fromTable",
          label: "T1",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t1" },
            columns: { id: "int" },
          },
        },
        {
          id: "from-2",
          kind: "fromTable",
          label: "T2",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { tableName: "t2" },
            columns: { id: "int" },
          },
        },
        {
          id: "where-dup",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 100 },
          data: { predicate: "id = 1" },
        },
        {
          id: "select-after",
          kind: "select",
          label: "Select",
          position: { x: 200, y: 100 },
          data: { mappings: [{ name: "x", expression: "id" }] },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 400, y: 100 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "from-1",
          sourceHandle: "out",
          target: "where-dup",
          targetHandle: "in",
        },
        {
          id: "edge-2",
          source: "from-2",
          sourceHandle: "out",
          target: "where-dup",
          targetHandle: "in",
        },
        {
          id: "edge-where-select",
          source: "where-dup",
          sourceHandle: "out",
          target: "select-after",
          targetHandle: "in",
        },
        {
          id: "edge-select-output",
          source: "select-after",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "where.duplicate-input")).toBe(
      true,
    );
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "select.unknown-column")).toBe(
      false,
    );
  });

  test("reports non-boolean join predicates", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "left-table",
          kind: "fromTable",
          label: "Left",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "left_table" },
            columns: { id: "int" },
          },
        },
        {
          id: "right-table",
          kind: "fromTable",
          label: "Right",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { tableName: "right_table" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 100 },
          data: { joinType: "inner", predicate: "1 + 1" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 100 },
          data: outputData("bad_join_predicate"),
        },
      ],
      edges: [
        {
          id: "edge-left-join",
          source: "left-table",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-right-join",
          source: "right-table",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "right",
        },
        {
          id: "edge-join-output",
          source: "join-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "join.non-boolean")).toBe(
      true,
    );
  });

  test("reports duplicate join-side inputs", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "left-a",
          kind: "fromTable",
          label: "Left A",
          position: { x: -300, y: 0 },
          data: {
            tableRef: { tableName: "left_a" },
            columns: { id: "int" },
          },
        },
        {
          id: "left-b",
          kind: "fromTable",
          label: "Left B",
          position: { x: -300, y: 200 },
          data: {
            tableRef: { tableName: "left_b" },
            columns: { id: "int" },
          },
        },
        {
          id: "right-a",
          kind: "fromTable",
          label: "Right A",
          position: { x: -300, y: 400 },
          data: {
            tableRef: { tableName: "right_a" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-dup",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 200 },
          data: { joinType: "inner", predicate: "left_a.id = right_a.id" },
        },
        {
          id: "output-dup-join",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 200 },
          data: outputData("dup_join_input"),
        },
      ],
      edges: [
        {
          id: "edge-left-a-join",
          source: "left-a",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "left",
        },
        {
          id: "edge-left-b-join",
          source: "left-b",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "left",
        },
        {
          id: "edge-right-a-join",
          source: "right-a",
          sourceHandle: "out",
          target: "join-dup",
          targetHandle: "right",
        },
        {
          id: "edge-join-output",
          source: "join-dup",
          sourceHandle: "out",
          target: "output-dup-join",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-dup-join");
    expect(
      result.diagnostics.some(diagnostic => diagnostic.code === "join.duplicate-left-input"),
    ).toBe(true);
    // Structural diagnostics should stand alone; do not leak analyzer errors when wiring is invalid.
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "join.unknown-column")).toBe(
      false,
    );
  });

  test("uses correct field path refs for sort item expressions", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Sort Field Refs" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-1",
          kind: "fromTable",
          label: "T",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int" },
          },
        },
        {
          id: "sort-1",
          kind: "sort",
          label: "Sort",
          position: { x: 0, y: 0 },
          data: { items: [{ expression: "(", direction: "asc" }] },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-from-sort",
          source: "from-1",
          sourceHandle: "out",
          target: "sort-1",
          targetHandle: "in",
        },
        {
          id: "edge-sort-output",
          source: "sort-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    const diag = result.diagnostics.find(d => d.code === "sort.invalid-expression");
    expect(diag).toBeDefined();
    expect(diag?.ref?.nodeId).toBe("sort-1");
    expect(diag?.ref?.field).toBe("items.0.expression");
  });

  test("uses correct field path refs for aggregation groupBy expressions", () => {
    const invalid: GraphDocument = {
      version: 1,
      metadata: { name: "Aggregation Field Refs" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-1",
          kind: "fromTable",
          label: "T",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int" },
          },
        },
        {
          id: "agg-1",
          kind: "aggregation",
          label: "Agg",
          position: { x: 0, y: 0 },
          data: {
            groupBy: [{ name: "g", expression: "(" }],
            aggregates: [{ name: "c", expression: "count(1)" }],
          },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("out"),
        },
      ],
      edges: [
        {
          id: "edge-from-agg",
          source: "from-1",
          sourceHandle: "out",
          target: "agg-1",
          targetHandle: "in",
        },
        {
          id: "edge-agg-output",
          source: "agg-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-1");
    const diag = result.diagnostics.find(d => d.code === "aggregation.invalid-expression");
    expect(diag).toBeDefined();
    expect(diag?.ref?.nodeId).toBe("agg-1");
    expect(diag?.ref?.field).toBe("groupBy.0.expression");
  });

  test("reports a missing installed package export target", () => {
    const workspace: GraphWorkspace = {
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
              id: "subgraph-orders",
              kind: "subgraph",
              label: "Package graph",
              position: { x: 0, y: 0 },
              data: {
                graphId: "pkg-graph",
                target: {
                  kind: "package",
                  packageId: "team/sales-lib",
                  version: "1.2.0",
                  exportKey: "daily_orders",
                },
              },
            },
            {
              id: "output-parent",
              kind: "output",
              label: "Output",
              position: { x: 260, y: 0 },
              data: outputData("parent_out"),
            },
          ],
          edges: [
            {
              id: "edge-subgraph-output",
              source: "subgraph-orders",
              sourceHandle: "out:output-child",
              target: "output-parent",
              targetHandle: "in",
            },
          ],
        },
      ],
      installedPackages: [],
      packageManifest: null,
    };

    const semantic = validateOutput(workspace, "graph-parent", "output-parent");

    expect(
      semantic.diagnostics.some(
        (diagnostic) =>
          diagnostic.level === "error" &&
          diagnostic.code === "subgraph.missing-package-export",
      ),
    ).toBe(true);
  });
});
