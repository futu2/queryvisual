import type { ColumnType } from "../schema/types";
import type { ExpressionScope } from "../graph/expressionScope";
import type { Expr } from "./ast";
import { inferExpressionType } from "./infer";
import { parseExpression } from "./parser";

export type AnalyzeExpressionOptions = {
  requireBoolean?: boolean;
};

export type ExpressionAnalysisDiagnosticCode =
  | "expr.parse-error"
  | "expr.unknown-column"
  | "expr.ambiguous-column"
  | "expr.non-boolean";

export type ExpressionAnalysisDiagnostic = {
  code: ExpressionAnalysisDiagnosticCode;
  message: string;
  // Optional structured fields for future UI/UX use.
  column?: string;
  alternatives?: string[];
};

export type ExpressionAnalysis = {
  ast: Expr | null;
  type: ColumnType;
  diagnostics: ExpressionAnalysisDiagnostic[];
};

function collectColumnPaths(expr: Expr, out: string[][]) {
  switch (expr.kind) {
    case "column":
      out.push(expr.path);
      return;
    case "literal":
      return;
    case "unary":
      collectColumnPaths(expr.expression, out);
      return;
    case "binary":
      collectColumnPaths(expr.left, out);
      collectColumnPaths(expr.right, out);
      return;
    case "call":
      for (const arg of expr.args) collectColumnPaths(arg, out);
      return;
    case "case":
      for (const branch of expr.branches) {
        collectColumnPaths(branch.when, out);
        collectColumnPaths(branch.then, out);
      }
      if (expr.elseExpression) collectColumnPaths(expr.elseExpression, out);
      return;
    case "cast":
      collectColumnPaths(expr.expression, out);
      return;
  }
}

function unknownColumnMessage(scope: ExpressionScope, name: string) {
  if (scope.kind === "join") {
    return `Unknown column "${name}" in join scope.`;
  }
  if (scope.kind === "empty") {
    return `Unknown column "${name}" in scope.`;
  }
  return `Unknown column "${name}" in input scope.`;
}

function ambiguousColumnMessage(name: string, alternatives: string[]) {
  if (alternatives.length === 2) {
    return `Ambiguous column "${name}"; use ${alternatives[0]} or ${alternatives[1]}.`;
  }
  return `Ambiguous column "${name}"; use ${alternatives.join(" or ")}.`;
}

export function analyzeExpression(
  expression: string,
  scope: ExpressionScope,
  options: AnalyzeExpressionOptions = {},
): ExpressionAnalysis {
  let ast: Expr;
  try {
    ast = parseExpression(expression);
  } catch (error) {
    return {
      ast: null,
      type: "unknown",
      diagnostics: [
        { code: "expr.parse-error", message: "Expression could not be parsed." },
      ],
    };
  }

  const diagnostics: ExpressionAnalysisDiagnostic[] = [];

  const columnPaths: string[][] = [];
  collectColumnPaths(ast, columnPaths);

  for (const path of columnPaths) {
    const key = path.join(".");
    if (Object.prototype.hasOwnProperty.call(scope.flatTypes, key)) continue;

    const bare = path.length === 1 ? path[0] : null;
    if (bare) {
      const alternatives = scope.ambiguousBareNames[bare];
      if (alternatives) {
        diagnostics.push({
          code: "expr.ambiguous-column",
          message: ambiguousColumnMessage(bare, alternatives),
          column: bare,
          alternatives,
        });
        continue;
      }
    }

    diagnostics.push({
      code: "expr.unknown-column",
      message: unknownColumnMessage(scope, key),
      column: key,
    });
  }

  const type = inferExpressionType(ast, scope.flatTypes);

  if (options.requireBoolean && diagnostics.length === 0 && type !== "boolean") {
    diagnostics.push({
      code: "expr.non-boolean",
      message: "Predicate must be boolean.",
    });
  }

  return { ast, type, diagnostics };
}
