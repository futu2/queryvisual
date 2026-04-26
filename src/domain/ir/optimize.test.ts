import { describe, expect, test } from "bun:test";
import { createDefaultOutputListenerConfig } from "../document/outputListeners";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import type { SemanticOutput } from "../graph/semantic";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "./lower";
import type { IRRelNode } from "./types";
import { optimizeOutput } from "./optimize";

function outputData(outputName: string) {
  return {
    outputName,
    listeners: createDefaultOutputListenerConfig(outputName),
  };
}

describe("optimizeOutput", () => {
  test("merges adjacent filters into one predicate", () => {
    const ir: IRRelNode = {
      kind: "filter",
      predicateSql: "status = 'paid'",
      input: {
        kind: "filter",
        predicateSql: "total > 0",
        input: {
          kind: "scan",
          tableSql: "sales.orders",
          schema: {
            order_id: "int",
            total: "float",
            status: "string",
          },
        },
      },
    };

    const optimized = optimizeOutput(ir);

    expect(optimized.kind).toBe("filter");
    expect(optimized.predicateSql).toBe("(total > 0) AND (status = 'paid')");
    expect(optimized.input.kind).toBe("scan");
    if (optimized.input.kind === "scan") {
      expect(optimized.input.tableSql).toBe("sales.orders");
    }
  });
});

describe("lowerOutputToIr", () => {
  test("successfully lowers the sample output", () => {
    const semantic = validateOutput(createSampleDocument(), "output-orders");

    const lowered = lowerOutputToIr(semantic);

    expect(lowered).not.toBeNull();
    expect(lowered?.kind).toBe("project");
    if (lowered?.kind === "project") {
      expect(lowered.input.kind).toBe("scan");
      expect(lowered.projections).toHaveLength(2);
    }
  });

  test("returns null for an invalid output id instead of throwing", () => {
    const semantic = validateOutput(createSampleDocument(), "missing-output");

    expect(() => lowerOutputToIr(semantic)).not.toThrow();
    expect(lowerOutputToIr(semantic)).toBeNull();
  });

  test("returns null for semantic outputs with expression diagnostics", () => {
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

    const semantic = validateOutput(invalid, "output-orders");
    expect(semantic.diagnostics.some((diagnostic) => diagnostic.level === "error")).toBe(true);

    expect(() => lowerOutputToIr(semantic)).not.toThrow();
    expect(lowerOutputToIr(semantic)).toBeNull();
  });

  test("returns null when a single-input path is missing", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "missing-input" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "status = 'paid'" },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: outputData("missing_input"),
        },
      ],
      edges: [
        {
          id: "edge-where-output",
          source: "where-1",
          sourceHandle: "out",
          target: "output-1",
          targetHandle: "in",
        },
      ],
    };
    const nodesById = Object.fromEntries(document.nodes.map((node) => [node.id, node]));
    const semantic: SemanticOutput = {
      document,
      outputId: "output-1",
      outputName: "missing_input",
      orderedNodes: document.nodes,
      nodesById,
      schemas: {
        "where-1": {},
        "output-1": {},
      },
      diagnostics: [],
    };

    expect(() => lowerOutputToIr(semantic)).not.toThrow();
    expect(lowerOutputToIr(semantic)).toBeNull();
  });

  test("returns null for cyclic inputs instead of overflowing the stack", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "cycle" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "flag = true" },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 200, y: 0 },
          data: { mappings: [{ name: "flag", expression: "flag" }] },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 400, y: 0 },
          data: outputData("cycle_out"),
        },
      ],
      edges: [
        {
          id: "edge-where-select",
          source: "where-1",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "edge-select-where",
          source: "select-1",
          sourceHandle: "out",
          target: "where-1",
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

    const semantic = validateOutput(document, "output-1");
    expect(semantic.diagnostics).toHaveLength(0);
    expect(() => lowerOutputToIr(semantic)).not.toThrow();
    expect(lowerOutputToIr(semantic)).toBeNull();
  });

  test("successfully lowers graphInput join where aggregation sort and limit nodes", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "full-lowering" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "input-1",
          kind: "graphInput",
          label: "OrdersIn",
          position: { x: -300, y: 0 },
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
          label: "Customers",
          position: { x: -300, y: 200 },
          data: {
            tableRef: { schemaName: "sales", tableName: "customers" },
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
          position: { x: -100, y: 100 },
          data: {
            joinType: "inner",
            predicate: "left.customer_id = right.customer_id",
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 100, y: 100 },
          data: {
            predicate: "flag = true",
          },
        },
        {
          id: "agg-1",
          kind: "aggregation",
          label: "Agg",
          position: { x: 300, y: 100 },
          data: {
            groupBy: [{ name: "region", expression: "region" }],
            aggregates: [{ name: "sum_total", expression: "sum(total)" }],
          },
        },
        {
          id: "sort-1",
          kind: "sort",
          label: "Sort",
          position: { x: 500, y: 100 },
          data: {
            items: [{ expression: "sum_total", direction: "desc" }],
          },
        },
        {
          id: "limit-1",
          kind: "limit",
          label: "Limit",
          position: { x: 700, y: 100 },
          data: { count: 10, offset: 5 },
        },
        {
          id: "output-1",
          kind: "output",
          label: "Output",
          position: { x: 900, y: 100 },
          data: outputData("full_out"),
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

    const semantic = validateOutput(document, "output-1");
    expect(semantic.diagnostics).toHaveLength(0);

    const lowered = lowerOutputToIr(semantic);
    expect(lowered?.kind).toBe("limit");
    if (!lowered || lowered.kind !== "limit") return;
    expect(lowered.count).toBe(10);
    expect(lowered.offset).toBe(5);
    expect(lowered.input.kind).toBe("sort");
    if (lowered.input.kind !== "sort") return;
    expect(lowered.input.items[0]?.direction).toBe("desc");
    expect(lowered.input.input.kind).toBe("aggregate");
    if (lowered.input.input.kind !== "aggregate") return;
    expect(lowered.input.input.groupBy[0]?.alias).toBe("region");
    expect(lowered.input.input.aggregates[0]?.alias).toBe("sum_total");
    expect(lowered.input.input.input.kind).toBe("filter");
    if (lowered.input.input.input.kind !== "filter") return;
    expect(lowered.input.input.input.input.kind).toBe("join");
    if (lowered.input.input.input.input.kind !== "join") return;
    expect(lowered.input.input.input.input.joinType).toBe("inner");
    expect(lowered.input.input.input.input.left.kind).toBe("input");
    if (lowered.input.input.input.input.left.kind === "input") {
      expect(lowered.input.input.input.input.left.name).toBe("OrdersIn");
    }
    expect(lowered.input.input.input.input.right.kind).toBe("scan");
  });
});
