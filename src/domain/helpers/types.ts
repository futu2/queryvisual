import type { Diagnostic } from "../diagnostics/types";
import type { Expr } from "../expr/ast";
import type { ColumnType } from "../schema/types";

export interface ImportedHelperDefinition {
  id: string;
  name: string;
  moduleName: string;
  expression: string;
  ast: Expr | null;
  arity: number;
  returnType: ColumnType;
  definingNodeId: string;
  importerNodeId: string;
  rowIndex: number;
}

export type HelperCallResolution =
  | { status: "resolved"; helper: ImportedHelperDefinition }
  | { status: "ambiguous"; helpers: ImportedHelperDefinition[] }
  | { status: "unresolved" };

export interface HelperRegistry {
  helpers: ImportedHelperDefinition[];
  diagnostics: Diagnostic[];
  resolveCall: (name: string) => HelperCallResolution;
}
