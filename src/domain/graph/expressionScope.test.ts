import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { buildExpressionScope, resolveNodeSchema } from "./expressionScope";

describe("buildExpressionScope", () => {
  test("single-input scope exposes input.<col> and bare names for single-input nodes", () => {
    const document = createSampleDocument();

    const scope = buildExpressionScope(document, "select-orders");

    expect(scope.kind).toBe("single");
    expect(scope.flatTypes["input.total"]).toBe("float");
    expect(scope.flatTypes.total).toBe("float");
    expect(scope.ambiguousBareNames).toEqual({});

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("input.");
    expect(keys).toContain("input.total");
    expect(keys).toContain("total");

    const inputTotal = scope.suggestions.find(s => s.key === "input.total");
    expect(inputTotal?.type).toBe("float");
  });

  test("join scope exposes left/right qualified names and marks duplicate bare names as ambiguous", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Join Sample" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-orders",
          kind: "fromTable",
          label: "Orders",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { schemaName: "sales", tableName: "orders" },
            columns: { id: "int" },
          },
        },
        {
          id: "from-customers",
          kind: "fromTable",
          label: "Customers",
          position: { x: -200, y: 200 },
          data: {
            tableRef: { schemaName: "sales", tableName: "customers" },
            columns: { id: "int" },
          },
        },
        {
          id: "join-orders-customers",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 100 },
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
      ],
      edges: [
        {
          id: "edge-orders-join-left",
          source: "from-orders",
          sourceHandle: "out",
          target: "join-orders-customers",
          targetHandle: "left",
        },
        {
          id: "edge-customers-join-right",
          source: "from-customers",
          sourceHandle: "out",
          target: "join-orders-customers",
          targetHandle: "right",
        },
      ],
    };

    const scope = buildExpressionScope(document, "join-orders-customers");

    expect(scope.kind).toBe("join");
    expect(scope.flatTypes["left.id"]).toBe("int");
    expect(scope.flatTypes["right.id"]).toBe("int");
    expect(scope.flatTypes.id).toBeUndefined();
    expect(scope.ambiguousBareNames.id).toEqual(["left.id", "right.id"]);

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("left.");
    expect(keys).toContain("right.");
    expect(keys).not.toContain("id");
    expect(keys).toContain("left.id");
    expect(keys).toContain("right.id");

    const leftId = scope.suggestions.find(s => s.key === "left.id");
    const rightId = scope.suggestions.find(s => s.key === "right.id");
    expect(leftId?.type).toBe("int");
    expect(rightId?.type).toBe("int");
  });

  test("downstream single-input consumers of a join preserve ambiguity semantics (no reintroduced bare names)", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Downstream Join Sample" },
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
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "where-after-join",
          kind: "where",
          label: "Where",
          position: { x: 200, y: 100 },
          data: { predicate: "left.id = 1" },
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
          id: "edge-join-where",
          source: "join-1",
          sourceHandle: "out",
          target: "where-after-join",
          targetHandle: "in",
        },
      ],
    };

    const scope = buildExpressionScope(document, "where-after-join");

    expect(scope.kind).toBe("join");
    expect(scope.flatTypes["left.id"]).toBe("int");
    expect(scope.flatTypes["right.id"]).toBe("int");
    expect(scope.flatTypes.id).toBeUndefined();
    expect(scope.ambiguousBareNames.id).toEqual(["left.id", "right.id"]);

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("left.");
    expect(keys).toContain("right.");
    expect(keys).not.toContain("input.");
    expect(keys).not.toContain("id");
    expect(keys).toContain("left.id");
    expect(keys).toContain("right.id");
  });

  test("partially connected joins only suggest the connected side namespace", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Partial Join Sample" },
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
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 100 },
          data: { joinType: "inner", predicate: "true" },
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
      ],
    };

    const scope = buildExpressionScope(document, "join-1");
    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("left.");
    expect(keys).not.toContain("right.");
  });

  test("multi-hop downstream nodes preserve join semantics: join -> where -> sort", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Join Where Sort Sample" },
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
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 200, y: 100 },
          data: { predicate: "left.id = 1" },
        },
        {
          id: "sort-1",
          kind: "sort",
          label: "Sort",
          position: { x: 400, y: 100 },
          data: { items: [{ expression: "left.id", direction: "asc" }] },
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
          id: "edge-join-where",
          source: "join-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
        {
          id: "edge-where-sort",
          source: "where-1",
          sourceHandle: "out",
          target: "sort-1",
          targetHandle: "in",
        },
      ],
    };

    const scope = buildExpressionScope(document, "sort-1");

    expect(scope.kind).toBe("join");
    expect(scope.flatTypes["left.id"]).toBe("int");
    expect(scope.flatTypes["right.id"]).toBe("int");
    expect(scope.flatTypes.id).toBeUndefined();
    expect(scope.ambiguousBareNames.id).toEqual(["left.id", "right.id"]);

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("left.");
    expect(keys).toContain("right.");
    expect(keys).not.toContain("input.");
    expect(keys).not.toContain("id");
    expect(keys).toContain("left.id");
    expect(keys).toContain("right.id");
  });

  test("multi-hop downstream nodes preserve join semantics: join -> where -> select", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Join Where Select Sample" },
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
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 200, y: 100 },
          data: { predicate: "left.id = 1" },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 400, y: 100 },
          data: { mappings: [{ name: "x", expression: "left.id" }] },
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
      ],
    };

    const scope = buildExpressionScope(document, "select-1");

    expect(scope.kind).toBe("join");
    expect(scope.flatTypes["left.id"]).toBe("int");
    expect(scope.flatTypes["right.id"]).toBe("int");
    expect(scope.flatTypes.id).toBeUndefined();
    expect(scope.ambiguousBareNames.id).toEqual(["left.id", "right.id"]);

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("left.");
    expect(keys).toContain("right.");
    expect(keys).not.toContain("input.");
    expect(keys).not.toContain("id");
    expect(keys).toContain("left.id");
    expect(keys).toContain("right.id");
  });

  test("returns an empty scope kind for missing nodes and other safe-empty cases", () => {
    const document = createSampleDocument();
    const missing = buildExpressionScope(document, "missing-node");
    expect(missing.kind).toBe("empty");
    expect(missing.flatTypes).toEqual({});
    expect(missing.ambiguousBareNames).toEqual({});
    expect(missing.suggestions).toEqual([]);
  });
});

describe("resolveNodeSchema", () => {
  test("returns an empty schema for missing nodes (safe)", () => {
    const document = createSampleDocument();

    expect(() => resolveNodeSchema(document, "missing-node")).not.toThrow();
    expect(resolveNodeSchema(document, "missing-node")).toEqual({});
  });

  test("forwards schemas through where/sort/limit/output and returns unknowns for select/aggregation outputs", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Schema Forwarding Sample" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-t",
          kind: "fromTable",
          label: "T",
          position: { x: -200, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int", total: "float" },
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "total > 0" },
        },
        {
          id: "sort-1",
          kind: "sort",
          label: "Sort",
          position: { x: 200, y: 0 },
          data: { items: [{ expression: "total", direction: "desc" }] },
        },
        {
          id: "limit-1",
          kind: "limit",
          label: "Limit",
          position: { x: 400, y: 0 },
          data: { count: 10, offset: null },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 600, y: 0 },
          data: { outputName: "out" },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 0, y: 200 },
          data: { mappings: [{ name: "x", expression: "total" }] },
        },
        {
          id: "aggregation-1",
          kind: "aggregation",
          label: "Agg",
          position: { x: 200, y: 200 },
          data: {
            groupBy: [{ name: "g", expression: "id" }],
            aggregates: [{ name: "cnt", expression: "count(1)" }],
          },
        },
      ],
      edges: [
        {
          id: "edge-from-where",
          source: "from-t",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
        {
          id: "edge-where-sort",
          source: "where-1",
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
        {
          id: "edge-from-select",
          source: "from-t",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "edge-from-aggregation",
          source: "from-t",
          sourceHandle: "out",
          target: "aggregation-1",
          targetHandle: "in",
        },
      ],
    };

    expect(resolveNodeSchema(document, "where-1")).toEqual({ id: "int", total: "float" });
    expect(resolveNodeSchema(document, "sort-1")).toEqual({ id: "int", total: "float" });
    expect(resolveNodeSchema(document, "limit-1")).toEqual({ id: "int", total: "float" });
    expect(resolveNodeSchema(document, "output-1")).toEqual({ id: "int", total: "float" });

    expect(resolveNodeSchema(document, "select-1")).toEqual({ x: "unknown" });
    expect(resolveNodeSchema(document, "aggregation-1")).toEqual({ g: "unknown", cnt: "unknown" });
  });
});

describe("namespace suggestions", () => {
  test("does not suggest input. for zero-input source nodes like fromTable/graphInput", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Zero Input Sample" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-t",
          kind: "fromTable",
          label: "T",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { tableName: "t" },
            columns: { id: "int" },
          },
        },
        {
          id: "graph-in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 200 },
          data: {
            columns: { id: "int" },
          },
        },
      ],
      edges: [],
    };

    const fromScope = buildExpressionScope(document, "from-t");
    const graphInputScope = buildExpressionScope(document, "graph-in");

    expect(fromScope.kind).toBe("empty");
    expect(fromScope.flatTypes).toEqual({});
    expect(fromScope.suggestions).toEqual([]);
    expect(fromScope.suggestions.map(s => s.key)).not.toContain("input.");

    expect(graphInputScope.kind).toBe("empty");
    expect(graphInputScope.flatTypes).toEqual({});
    expect(graphInputScope.suggestions).toEqual([]);
    expect(graphInputScope.suggestions.map(s => s.key)).not.toContain("input.");
  });

  test("returns an empty scope for single-input nodes with missing edges (safe)", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Missing Edge Sample" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "id = 1" },
        },
      ],
      edges: [],
    };

    const scope = buildExpressionScope(document, "where-1");
    expect(scope.kind).toBe("empty");
    expect(scope.flatTypes).toEqual({});
    expect(scope.suggestions).toEqual([]);
  });
});
