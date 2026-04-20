import { describe, expect, test } from "bun:test";
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
