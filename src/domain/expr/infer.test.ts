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

  test("infers coalesce using all arguments", () => {
    const type = inferExpressionType(
      parseExpression("coalesce(null, total)"),
      scope,
    );
    expect(type).toBe("float");
  });

  test("infers case branches and else with numeric unification", () => {
    const type = inferExpressionType(
      parseExpression("case when true then 1 else 2.5 end"),
      scope,
    );
    expect(type).toBe("float");
  });

  test("infers case with null branch and numeric else", () => {
    const type = inferExpressionType(
      parseExpression("case when true then null else total end"),
      scope,
    );
    expect(type).toBe("float");
  });

  test("infers invalid arithmetic as unknown", () => {
    const type = inferExpressionType(parseExpression("status + 1"), scope);
    expect(type).toBe("unknown");
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

  test("renders not-equal as ANSI <>", () => {
    const sql = renderExpressionSql(parseExpression("status != 'paid'"));
    expect(sql).toBe("(status <> 'paid')");
  });
});
