import { describe, expect, test } from "bun:test";
import type { ExpressionScope } from "../graph/expressionScope";
import { analyzeExpression } from "./analyze";

function singleScope(): ExpressionScope {
  return {
    kind: "single",
    flatTypes: {
      "input.total": "float",
      total: "float",
      "input.status": "string",
      status: "string",
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

function emptyScope(): ExpressionScope {
  return {
    kind: "empty",
    flatTypes: {},
    ambiguousBareNames: {},
    suggestions: [],
  };
}

describe("analyzeExpression", () => {
  test("reports unknown bare column reference in a single scope", () => {
    const result = analyzeExpression("missing", singleScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.unknown-column");
    expect(result.diagnostics[0]?.message).toBe(
      'Unknown column "missing" in input scope.',
    );
    expect(result.type).toBe("unknown");
  });

  test("reports ambiguous bare join column reference", () => {
    const result = analyzeExpression("id = 1", joinScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.ambiguous-column");
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
    expect(result.diagnostics[0]?.code).toBe("expr.parse-error");
    expect(result.diagnostics[0]?.message).toBe("Expression could not be parsed.");
    expect(result.type).toBe("unknown");
  });

  test("requireBoolean reports predicate not boolean", () => {
    const result = analyzeExpression("1 + 2", singleScope(), {
      requireBoolean: true,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.non-boolean");
    expect(result.type).toBe("int");
  });

  test("unknown column messages use the empty-scope wording for empty scopes", () => {
    const result = analyzeExpression("missing", emptyScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.unknown-column");
    expect(result.diagnostics[0]?.message).toBe(
      'Unknown column "missing" in scope.',
    );
  });

  test("requireBoolean still fails when inferred type is unknown and there are no other diagnostics", () => {
    const result = analyzeExpression("total + status", singleScope(), {
      requireBoolean: true,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.non-boolean");
    expect(result.type).toBe("unknown");
  });

  test("does not return a concrete type when a qualified column reference is unknown", () => {
    const result = analyzeExpression("foo.total + 1", singleScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.unknown-column");
    expect(result.diagnostics[0]?.message).toBe(
      'Unknown column "foo.total" in input scope.',
    );
    expect(result.type).toBe("unknown");
  });

  test("dedupes repeated unknown column diagnostics for the same reference", () => {
    const result = analyzeExpression("missing + missing", singleScope());

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("expr.unknown-column");
    expect(result.diagnostics[0]?.message).toBe(
      'Unknown column "missing" in input scope.',
    );
  });
});
