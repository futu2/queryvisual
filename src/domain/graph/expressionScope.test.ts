import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { buildExpressionScope } from "./expressionScope";

describe("buildExpressionScope", () => {
  test("single-input scope exposes input.<col> and bare names for single-input nodes", () => {
    const document = createSampleDocument();

    const scope = buildExpressionScope(document, "select-orders");

    expect(scope.kind).toBe("single");
    expect(scope.flatTypes["input.total"]).toBe("float");
    expect(scope.flatTypes.total).toBe("float");
    expect(scope.ambiguousBareNames).toEqual({});

    const keys = scope.suggestions.map(s => s.key);
    expect(keys).toContain("input.total");
    expect(keys).toContain("total");
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
    expect(keys).not.toContain("id");
    expect(keys).toContain("left.id");
    expect(keys).toContain("right.id");
  });
});

