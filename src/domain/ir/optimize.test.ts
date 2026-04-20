import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import type { SemanticOutput } from "../graph/semantic";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "./lower";
import type { IRRelNode } from "./types";
import { optimizeOutput } from "./optimize";

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
    expect(optimized.predicateSql).toContain("AND");
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
          data: { outputName: "missing_input" },
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
});
