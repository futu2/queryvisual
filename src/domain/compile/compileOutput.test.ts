import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { compileOutput } from "./compileOutput";

describe("compileOutput", () => {
  test("returns semantic, ir, optimizedIr, and sql", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");

    expect(result.semantic.outputName).toBe("orders_report");
    expect(result.ir).not.toBeNull();
    expect(result.optimizedIr).not.toBeNull();
    expect(result.sql).toContain("SELECT");
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
});
