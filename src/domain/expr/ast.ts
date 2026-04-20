import type { ColumnType } from "../schema/types";

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "and"
  | "or";

export type Expr =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "column"; path: string[] }
  | { kind: "unary"; op: "-" | "not"; expression: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] }
  | {
      kind: "case";
      branches: Array<{ when: Expr; then: Expr }>;
      elseExpression: Expr | null;
    }
  | { kind: "cast"; expression: Expr; to: ColumnType };
