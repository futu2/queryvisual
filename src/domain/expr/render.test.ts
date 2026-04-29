import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";
import { renderExpressionSql } from "./render";
import type { HelperRegistry, ImportedHelperDefinition } from "../helpers/types";

function helperRegistry(): HelperRegistry {
  const add10: ImportedHelperDefinition = {
    id: "math:add10:import:0",
    name: "add10",
    moduleName: "math",
    expression: "$1 + $2 + 10",
    ast: parseExpression("$1 + $2 + 10", { allowPlaceholders: true }),
    arity: 2,
    returnType: "unknown",
    definingNodeId: "helpers",
    importerNodeId: "import",
    rowIndex: 0,
  };
  const doubleAdd10: ImportedHelperDefinition = {
    id: "math:doubleadd10:import:1",
    name: "doubleadd10",
    moduleName: "math",
    expression: "add10($1, $2) + add10($2, $1)",
    ast: parseExpression("add10($1, $2) + add10($2, $1)", {
      allowPlaceholders: true,
    }),
    arity: 2,
    returnType: "unknown",
    definingNodeId: "helpers",
    importerNodeId: "import",
    rowIndex: 1,
  };

  const helpers = [add10, doubleAdd10];

  return {
    helpers,
    diagnostics: [],
    resolveCall: (name) => {
      const helper = helpers.find(
        (candidate) =>
          name === candidate.name ||
          name === `${candidate.moduleName}.${candidate.name}`,
      );
      return helper ? { status: "resolved", helper } : { status: "unresolved" };
    },
  };
}

describe("renderExpressionSql helpers", () => {
  test("expands helper calls inline", () => {
    const sql = renderExpressionSql(parseExpression("add10(a, b)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("((a + b) + 10)");
  });

  test("leaves unresolved SQL functions unchanged", () => {
    const sql = renderExpressionSql(parseExpression("coalesce(a, 0)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("COALESCE(a, 0)");
  });

  test("expands nested helper calls", () => {
    const sql = renderExpressionSql(parseExpression("doubleadd10(a, b)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("(((a + b) + 10) + ((b + a) + 10))");
  });

  test("substitutes placeholders through nested helper arguments", () => {
    const sql = renderExpressionSql(parseExpression("doubleadd10(a + 1, b)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("((((a + 1) + b) + 10) + ((b + (a + 1)) + 10))");
  });
});
