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
});
