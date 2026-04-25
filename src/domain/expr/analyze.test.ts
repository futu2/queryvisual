import { describe, expect, test } from "bun:test";
import type { ExpressionScope } from "../graph/expressionScope";
import { analyzeExpression } from "./analyze";

function singleScope(): ExpressionScope {
  return {
    kind: "single",
    flatTypes: {
      "input.total": "float",
      total: "float",
    },
    ambiguousBareNames: {},
    suggestions: [],
  };
}

function joinScope(): ExpressionScope {
  return {
    kind: "join",
    flatTypes: {
      "left.id": "int",
      "right.id": "int",
    },
    ambiguousBareNames: {
      id: ["left.id", "right.id"],
    },
    suggestions: [],
  };
}

describe("analyzeExpression", () => {
  test("reports unknown bare column reference in a single scope", () => {
    const result = analyzeExpression("missing", singleScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("unknown_column");
    expect(result.diagnostics[0]?.message).toBe(
      'Unknown column "missing" in input scope.',
    );
  });

  test("reports ambiguous bare join column reference", () => {
    const result = analyzeExpression("id = 1", joinScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("ambiguous_column");
    expect(result.diagnostics[0]?.message).toBe(
      'Ambiguous column "id"; use left.id or right.id.',
    );
  });

  test("qualified join names infer boolean when requireBoolean: true", () => {
    const result = analyzeExpression("left.id = right.id", joinScope(), {
      requireBoolean: true,
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("boolean");
  });

  test("malformed syntax becomes a parse diagnostic", () => {
    const result = analyzeExpression("1 $ 2", singleScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("parse_error");
  });

  test("requireBoolean reports predicate not boolean", () => {
    const result = analyzeExpression("1 + 2", singleScope(), {
      requireBoolean: true,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("predicate_not_boolean");
    expect(result.diagnostics[0]?.message).toBe("Predicate must be boolean.");
  });
});

