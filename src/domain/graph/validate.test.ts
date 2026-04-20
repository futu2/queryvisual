import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { validateOutput } from "./validate";

describe("validateOutput", () => {
  test("validates the sample output without errors", () => {
    const document = createSampleDocument();
    const result = validateOutput(document, "output-orders");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.outputName).toBe("orders_report");
    expect(result.schemas["select-orders"].gross_total).toBe("float");
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
          data: { outputName: "bad_join" },
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
          data: { outputName: "bad_exprs" },
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
          data: { outputName: "dup_input" },
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
          data: { outputName: "bad_join_predicate" },
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
          data: { outputName: "dup_join_input" },
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
  });
});
