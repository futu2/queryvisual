import type { Expr } from "./ast";

function renderLiteral(value: string | number | boolean | null) {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function renderExpressionSql(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      return renderLiteral(expr.value);
    case "column":
      return expr.path.join(".");
    case "unary":
      return expr.op === "not"
        ? `(NOT ${renderExpressionSql(expr.expression)})`
        : `(-${renderExpressionSql(expr.expression)})`;
    case "binary":
      return `(${renderExpressionSql(expr.left)} ${expr.op.toUpperCase()} ${renderExpressionSql(expr.right)})`;
    case "call":
      return `${expr.name.toUpperCase()}(${expr.args.map(renderExpressionSql).join(", ")})`;
    case "case":
      return [
        "CASE",
        ...expr.branches.map(
          branch =>
            `WHEN ${renderExpressionSql(branch.when)} THEN ${renderExpressionSql(branch.then)}`,
        ),
        expr.elseExpression
          ? `ELSE ${renderExpressionSql(expr.elseExpression)}`
          : "",
        "END",
      ]
        .filter(Boolean)
        .join(" ");
    case "cast":
      return `CAST(${renderExpressionSql(expr.expression)} AS ${expr.to.toUpperCase()})`;
  }
}
