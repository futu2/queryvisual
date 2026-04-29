import type { HelperRegistry } from "../helpers/types";
import type { Expr } from "./ast";

export type RenderExpressionSqlOptions = {
  helpers?: HelperRegistry;
  placeholders?: Record<number, Expr>;
  expansionStack?: string[];
};

function renderLiteral(value: string | number | boolean | null) {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function substitutePlaceholders(expr: Expr, replacements: Record<number, Expr>): Expr {
  switch (expr.kind) {
    case "literal":
    case "column":
      return expr;
    case "placeholder":
      return replacements[expr.index] ?? expr;
    case "unary":
      return {
        ...expr,
        expression: substitutePlaceholders(expr.expression, replacements),
      };
    case "binary":
      return {
        ...expr,
        left: substitutePlaceholders(expr.left, replacements),
        right: substitutePlaceholders(expr.right, replacements),
      };
    case "call":
      return {
        ...expr,
        args: expr.args.map((arg) => substitutePlaceholders(arg, replacements)),
      };
    case "case":
      return {
        ...expr,
        branches: expr.branches.map((branch) => ({
          when: substitutePlaceholders(branch.when, replacements),
          then: substitutePlaceholders(branch.then, replacements),
        })),
        elseExpression: expr.elseExpression
          ? substitutePlaceholders(expr.elseExpression, replacements)
          : null,
      };
    case "cast":
      return {
        ...expr,
        expression: substitutePlaceholders(expr.expression, replacements),
      };
  }
}

export function renderExpressionSql(
  expr: Expr,
  options: RenderExpressionSqlOptions = {},
): string {
  switch (expr.kind) {
    case "literal":
      return renderLiteral(expr.value);
    case "placeholder": {
      const replacement = options.placeholders?.[expr.index];
      return replacement ? renderExpressionSql(replacement, options) : `$${expr.index}`;
    }
    case "column":
      return expr.path.join(".");
    case "unary":
      return expr.op === "not"
        ? `(NOT ${renderExpressionSql(expr.expression, options)})`
        : `(-${renderExpressionSql(expr.expression, options)})`;
    case "binary": {
      const operator = expr.op === "!=" ? "<>" : expr.op.toUpperCase();
      return `(${renderExpressionSql(expr.left, options)} ${operator} ${renderExpressionSql(expr.right, options)})`;
    }
    case "call": {
      const resolution = options.helpers?.resolveCall(expr.name);
      if (resolution?.status === "resolved" && resolution.helper.ast) {
        const expansionStack = options.expansionStack ?? [];
        if (!expansionStack.includes(resolution.helper.id)) {
          const parentPlaceholders = options.placeholders ?? {};
          const placeholders = Object.fromEntries(
            expr.args.map((arg, index) => [
              index + 1,
              substitutePlaceholders(arg, parentPlaceholders),
            ]),
          );

          return renderExpressionSql(resolution.helper.ast, {
            ...options,
            placeholders,
            expansionStack: [...expansionStack, resolution.helper.id],
          });
        }
      }

      return `${expr.name.toUpperCase()}(${expr.args
        .map((arg) => renderExpressionSql(arg, options))
        .join(", ")})`;
    }
    case "case":
      return [
        "CASE",
        ...expr.branches.map(
          (branch) =>
            `WHEN ${renderExpressionSql(branch.when, options)} THEN ${renderExpressionSql(branch.then, options)}`,
        ),
        expr.elseExpression
          ? `ELSE ${renderExpressionSql(expr.elseExpression, options)}`
          : "",
        "END",
      ]
        .filter(Boolean)
        .join(" ");
    case "cast":
      return `CAST(${renderExpressionSql(expr.expression, options)} AS ${expr.to.toUpperCase()})`;
  }
}
