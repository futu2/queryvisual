import type { ColumnType } from "../schema/types";
import type { ExpressionScope } from "../graph/expressionScope";
import type { HelperRegistry } from "../helpers/types";
import type { Expr } from "./ast";
import { inferExpressionType } from "./infer";
import { parseExpression } from "./parser";

export type AnalyzeExpressionOptions = {
  requireBoolean?: boolean;
  helpers?: HelperRegistry;
  allowPlaceholders?: boolean;
};

export type ExpressionAnalysisDiagnosticCode =
  | "expr.parse-error"
  | "expr.unknown-column"
  | "expr.ambiguous-column"
  | "expr.ambiguous-helper"
  | "expr.helper-arity"
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

function hasAnyColumnDiagnostics(diagnostics: ExpressionAnalysisDiagnostic[]) {
  return diagnostics.some(
    diag =>
      diag.code === "expr.unknown-column" || diag.code === "expr.ambiguous-column",
  );
}

function collectColumnPaths(expr: Expr, out: string[][]) {
  switch (expr.kind) {
    case "column":
      out.push(expr.path);
      return;
    case "literal":
    case "placeholder":
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

function collectCalls(expr: Expr, out: Array<Extract<Expr, { kind: "call" }>>) {
  switch (expr.kind) {
    case "call":
      out.push(expr);
      for (const arg of expr.args) collectCalls(arg, out);
      return;
    case "unary":
      collectCalls(expr.expression, out);
      return;
    case "binary":
      collectCalls(expr.left, out);
      collectCalls(expr.right, out);
      return;
    case "case":
      for (const branch of expr.branches) {
        collectCalls(branch.when, out);
        collectCalls(branch.then, out);
      }
      if (expr.elseExpression) collectCalls(expr.elseExpression, out);
      return;
    case "cast":
      collectCalls(expr.expression, out);
      return;
    case "column":
    case "literal":
    case "placeholder":
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
    ast = parseExpression(expression, {
      allowPlaceholders: options.allowPlaceholders,
    });
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
  const diagnosticKeys = new Set<string>();

  const columnPaths: string[][] = [];
  collectColumnPaths(ast, columnPaths);

  for (const path of columnPaths) {
    const key = path.join(".");
    if (Object.prototype.hasOwnProperty.call(scope.flatTypes, key)) continue;

    const bare = path.length === 1 ? path[0] : null;
    if (bare) {
      const alternatives = scope.ambiguousBareNames[bare];
      if (alternatives) {
        const diagKey = `expr.ambiguous-column:${bare}:${alternatives.join("|")}`;
        if (diagnosticKeys.has(diagKey)) continue;
        diagnosticKeys.add(diagKey);
        diagnostics.push({
          code: "expr.ambiguous-column",
          message: ambiguousColumnMessage(bare, alternatives),
          column: bare,
          alternatives,
        });
        continue;
      }
    }

    const diagKey = `expr.unknown-column:${key}`;
    if (diagnosticKeys.has(diagKey)) continue;
    diagnosticKeys.add(diagKey);
    diagnostics.push({
      code: "expr.unknown-column",
      message: unknownColumnMessage(scope, key),
      column: key,
    });
  }

  const calls: Array<Extract<Expr, { kind: "call" }>> = [];
  collectCalls(ast, calls);

  let hasHelperDiagnostics = false;
  for (const call of calls) {
    const resolution = options.helpers?.resolveCall(call.name);
    if (!resolution) continue;

    if (resolution.status === "ambiguous") {
      diagnostics.push({
        code: "expr.ambiguous-helper",
        message: `Ambiguous helper call "${call.name}". Use a module-qualified helper name.`,
      });
      hasHelperDiagnostics = true;
      continue;
    }

    if (
      resolution.status === "resolved" &&
      resolution.helper.arity !== call.args.length
    ) {
      diagnostics.push({
        code: "expr.helper-arity",
        message: `Helper "${call.name}" expects ${resolution.helper.arity} arguments but received ${call.args.length}.`,
      });
      hasHelperDiagnostics = true;
    }
  }

  // If we already know column resolution failed, do not report a misleading concrete type.
  const inferredType = inferExpressionType(ast, scope.flatTypes, {
    helpers: options.helpers,
  });
  const type: ColumnType = hasAnyColumnDiagnostics(diagnostics) || hasHelperDiagnostics
    ? "unknown"
    : inferredType;

  if (options.requireBoolean && diagnostics.length === 0 && type !== "boolean") {
    diagnostics.push({
      code: "expr.non-boolean",
      message: "Predicate must be boolean.",
    });
  }

  return { ast, type, diagnostics };
}
