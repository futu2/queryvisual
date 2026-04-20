import type { ColumnType } from "../schema/types";
import type { Expr } from "./ast";

export type ExprScope = Record<string, ColumnType>;

const numericOperators = new Set(["+", "-", "*", "/"]);
const booleanOperators = new Set(["and", "or"]);
const comparisonOperators = new Set(["=", "!=", ">", ">=", "<", "<="]);

export function inferExpressionType(expr: Expr, scope: ExprScope): ColumnType {
  switch (expr.kind) {
    case "literal":
      if (expr.value === null) return "null";
      if (typeof expr.value === "boolean") return "boolean";
      if (typeof expr.value === "number")
        return Number.isInteger(expr.value) ? "int" : "float";
      return "string";
    case "column": {
      const key = expr.path.join(".");
      return scope[key] ?? scope[expr.path.at(-1) ?? ""] ?? "unknown";
    }
    case "unary":
      return expr.op === "not"
        ? "boolean"
        : inferExpressionType(expr.expression, scope);
    case "binary":
      if (booleanOperators.has(expr.op)) return "boolean";
      if (comparisonOperators.has(expr.op)) return "boolean";
      if (numericOperators.has(expr.op)) {
        const left = inferExpressionType(expr.left, scope);
        const right = inferExpressionType(expr.right, scope);
        return left === "float" || right === "float" ? "float" : "int";
      }
      return "unknown";
    case "call":
      switch (expr.name) {
        case "count":
          return "int";
        case "sum":
        case "avg":
          return "float";
        case "coalesce":
          return expr.args.length
            ? inferExpressionType(expr.args[0], scope)
            : "unknown";
        default:
          return "unknown";
      }
    case "case":
      return expr.branches.length
        ? inferExpressionType(expr.branches[0].then, scope)
        : expr.elseExpression
          ? inferExpressionType(expr.elseExpression, scope)
          : "unknown";
    case "cast":
      return expr.to;
  }
}
