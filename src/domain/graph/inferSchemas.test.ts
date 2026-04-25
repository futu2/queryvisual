import { describe, expect, test } from "bun:test";
import { analyzeExpression } from "../expr/analyze";
import type { GraphDocument } from "../document/types";
import { buildExpressionScope } from "./expressionScope";
import { inferDocumentSchemas, inferNodeSchemas } from "./inferSchemas";
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
          data: { outputName: "full_out" },
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
          data: { outputName: "out" },
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
});
