import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";
import { inferExpressionType } from "./infer";
import { renderExpressionSql } from "./render";

const scope = {
  order_id: "int",
  total: "float",
  status: "string",
} as const;

describe("inferExpressionType", () => {
  test("infers arithmetic expressions as float", () => {
    const type = inferExpressionType(parseExpression("total * 1.2"), scope);
    expect(type).toBe("float");
  });

  test("infers comparisons as boolean", () => {
    const type = inferExpressionType(parseExpression("status = 'paid'"), scope);
    expect(type).toBe("boolean");
  });
});

describe("renderExpressionSql", () => {
  test("renders case expressions to ANSI SQL", () => {
    const sql = renderExpressionSql(
      parseExpression("case when status = 'paid' then total else 0 end"),
    );
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("ELSE 0 END");
  });
});
