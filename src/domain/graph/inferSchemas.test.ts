import { describe, expect, test } from "bun:test";
import { createDefaultOutputListenerConfig } from "../document/outputListeners";
import { analyzeExpression } from "../expr/analyze";
import type { GraphDocument, GraphWorkspace } from "../document/types";
import { buildExpressionScope } from "./expressionScope";
import {
  inferDocumentSchemas,
  inferNodeSchemas,
  inferWorkspaceGraphSchemas,
} from "./inferSchemas";
import { validateOutput } from "./validate";

describe("inferDocumentSchemas", () => {
  test("infers boolean select outputs for downstream single-input predicates", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "select downstream parity" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 200, y: 0 },
          data: {
            mappings: [{ name: "is_positive", expression: "total > 0" }],
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 400, y: 0 },
          data: { predicate: "is_positive" },
        },
      ],
      edges: [
        {
          id: "e-in-select",
          source: "in",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "e-select-where",
          source: "select-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
      ],
    };

    const schemas = inferDocumentSchemas(document);
    const scope = buildExpressionScope(document, "where-1", { schemas });
    const analysis = analyzeExpression("is_positive", scope, {
      requireBoolean: true,
    });

    expect(schemas["select-1"]).toEqual({ is_positive: "boolean" });
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.type).toBe("boolean");
  });

  test("can infer only the edited node upstream slice for modal use", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "node scoped inference" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 200, y: 0 },
          data: {
            mappings: [{ name: "is_positive", expression: "total > 0" }],
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 400, y: 0 },
          data: { predicate: "is_positive" },
        },
        {
          id: "unrelated",
          kind: "select",
          label: "Other",
          position: { x: 200, y: 200 },
          data: {
            mappings: [{ name: "bad", expression: "(" }],
          },
        },
      ],
      edges: [
        {
          id: "e-in-select",
          source: "in",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "e-select-where",
          source: "select-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
      ],
    };

    const schemas = inferNodeSchemas(document, "where-1");
    const scope = buildExpressionScope(document, "where-1", { schemas });
    const analysis = analyzeExpression("is_positive", scope, {
      requireBoolean: true,
    });

    expect(schemas["select-1"]).toEqual({ is_positive: "boolean" });
    expect(schemas.unrelated).toBeUndefined();
    expect(analysis.diagnostics).toEqual([]);
  });

  test("infers boolean aggregation group outputs for downstream predicates", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "aggregation downstream parity" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "agg-1",
          kind: "aggregation",
          label: "Aggregate",
          position: { x: 200, y: 0 },
          data: {
            groupBy: [{ name: "is_positive", expression: "total > 0" }],
            aggregates: [{ name: "row_count", expression: "count(total)" }],
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 400, y: 0 },
          data: { predicate: "is_positive" },
        },
      ],
      edges: [
        {
          id: "e-in-agg",
          source: "in",
          sourceHandle: "out",
          target: "agg-1",
          targetHandle: "in",
        },
        {
          id: "e-agg-where",
          source: "agg-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
      ],
    };

    const schemas = inferDocumentSchemas(document);
    const scope = buildExpressionScope(document, "where-1", { schemas });
    const analysis = analyzeExpression("is_positive", scope, {
      requireBoolean: true,
    });

    expect(schemas["agg-1"]).toEqual({
      is_positive: "boolean",
      row_count: "int",
    });
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.type).toBe("boolean");
  });

  test("matches validateOutput schemas across a qualified join pipeline", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "schema parity pipeline" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "input-1",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: {
            columns: {
              customer_id: "int",
              total: "float",
              flag: "boolean",
            },
          },
        },
        {
          id: "table-1",
          kind: "fromTable",
          label: "Regions",
          position: { x: 0, y: 200 },
          data: {
            tableRef: { tableName: "regions" },
            columns: {
              customer_id: "int",
              region: "string",
            },
          },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 200, y: 100 },
          data: {
            joinType: "inner",
            predicate: "left.customer_id = right.customer_id",
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 400, y: 100 },
          data: { predicate: "flag = true" },
        },
        {
          id: "agg-1",
          kind: "aggregation",
          label: "Agg",
          position: { x: 600, y: 100 },
          data: {
            groupBy: [{ name: "region", expression: "region" }],
            aggregates: [{ name: "sum_total", expression: "sum(total)" }],
          },
        },
        {
          id: "sort-1",
          kind: "sort",
          label: "Sort",
          position: { x: 800, y: 100 },
          data: { items: [{ expression: "sum_total", direction: "desc" }] },
        },
        {
          id: "limit-1",
          kind: "limit",
          label: "Limit",
          position: { x: 1000, y: 100 },
          data: { count: 10, offset: 5 },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 1200, y: 100 },
          data: {
            outputName: "full_out",
            listeners: createDefaultOutputListenerConfig("full_out"),
          },
        },
      ],
      edges: [
        {
          id: "edge-input-join",
          source: "input-1",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-table-join",
          source: "table-1",
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
          id: "edge-where-agg",
          source: "where-1",
          sourceHandle: "out",
          target: "agg-1",
          targetHandle: "in",
        },
        {
          id: "edge-agg-sort",
          source: "agg-1",
          sourceHandle: "out",
          target: "sort-1",
          targetHandle: "in",
        },
        {
          id: "edge-sort-limit",
          source: "sort-1",
          sourceHandle: "out",
          target: "limit-1",
          targetHandle: "in",
        },
        {
          id: "edge-limit-output",
          source: "limit-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const inferred = inferDocumentSchemas(document);
    const validated = validateOutput(document, "output-1").schemas;

    expect(inferred).toMatchObject(validated);
    expect(inferred["agg-1"]).toEqual(validated["agg-1"]);
    expect(inferred["sort-1"]).toEqual(validated["sort-1"]);
    expect(inferred["output-1"]).toEqual(validated["output-1"]);
  });

  test("matches validateOutput structural invalid propagation downstream", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "invalid structure parity" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "left-1",
          kind: "graphInput",
          label: "Left 1",
          position: { x: 0, y: 0 },
          data: { columns: { id: "int" } },
        },
        {
          id: "left-2",
          kind: "graphInput",
          label: "Left 2",
          position: { x: 0, y: 120 },
          data: { columns: { id: "int" } },
        },
        {
          id: "right-1",
          kind: "graphInput",
          label: "Right",
          position: { x: 0, y: 240 },
          data: { columns: { id: "int" } },
        },
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 200, y: 120 },
          data: {
            joinType: "inner",
            predicate: "left.id = right.id",
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 400, y: 120 },
          data: { predicate: "id > 0" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 600, y: 120 },
          data: {
            outputName: "out",
            listeners: createDefaultOutputListenerConfig("out"),
          },
        },
      ],
      edges: [
        {
          id: "edge-left-1",
          source: "left-1",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-left-2",
          source: "left-2",
          sourceHandle: "out",
          target: "join-1",
          targetHandle: "left",
        },
        {
          id: "edge-right-1",
          source: "right-1",
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
          id: "edge-where-output",
          source: "where-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };

    const inferred = inferDocumentSchemas(document);
    const validated = validateOutput(document, "output-1").schemas;

    expect(inferred["join-1"]).toEqual(validated["join-1"]);
    expect(inferred["where-1"]).toEqual(validated["where-1"]);
    expect(inferred["output-1"]).toEqual(validated["output-1"]);
  });

  test("infers subgraph output schemas from referenced child graphs", () => {
    const childGraph = {
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
          id: "output-child",
          kind: "output" as const,
          label: "Output",
          position: { x: 260, y: 0 },
          data: {
            outputName: "child_out",
            listeners: createDefaultOutputListenerConfig("child_out"),
          },
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
          label: "Child graph",
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
          data: {
            outputName: "parent_out",
            listeners: createDefaultOutputListenerConfig("parent_out"),
          },
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
      graphs: [parentGraph, childGraph],
    };

    const schemas = inferWorkspaceGraphSchemas(workspace, "graph-parent");

    expect(schemas["subgraph-orders"]).toEqual({ total: "float" });
    expect(schemas["select-parent"]).toEqual({ gross_total: "float" });
  });

  test("fails closed for invalid subgraph wiring (no inferred child schema leak)", () => {
    const childGraph = {
      id: "graph-child",
      metadata: { name: "Child" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "child-input",
          kind: "graphInput" as const,
          label: "Child In",
          position: { x: 0, y: 0 },
          data: {
            inputName: "orders_in",
            columns: { total: "float" },
          },
        },
        {
          id: "output-child",
          kind: "output" as const,
          label: "Output",
          position: { x: 260, y: 0 },
          data: {
            outputName: "child_out",
            listeners: createDefaultOutputListenerConfig("child_out"),
          },
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
          data: {
            outputName: "parent_out",
            listeners: createDefaultOutputListenerConfig("parent_out"),
          },
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
      graphs: [parentGraph, childGraph],
    };

    const semantic = validateOutput(workspace, "graph-parent", "output-parent");
    expect(
      semantic.diagnostics.some(
        (diagnostic) => diagnostic.level === "error" && diagnostic.code === "subgraph.incompatible-input",
      ),
    ).toBe(true);

    const schemas = inferWorkspaceGraphSchemas(workspace, "graph-parent");

    // The subgraph output schema must not be inferred from the child's declared graphInput
    // when the parent does not satisfy required inputs.
    expect(schemas["subgraph-orders"]).toEqual({});
    expect(schemas["select-parent"]).toEqual({});
  });
});
