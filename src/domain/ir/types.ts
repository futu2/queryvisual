import type { ColumnMap } from "../schema/types";

export type IRJoinType = "inner" | "left" | "right" | "full";

export type IRRelNode =
  | { kind: "input"; name: string; schema: ColumnMap }
  | { kind: "scan"; tableSql: string; schema: ColumnMap }
  | {
      kind: "join";
      joinType: IRJoinType;
      predicateSql: string;
      left: IRRelNode;
      right: IRRelNode;
      schema: ColumnMap;
    }
  | { kind: "filter"; predicateSql: string; input: IRRelNode }
  | {
      kind: "project";
      projections: Array<{ alias: string; expressionSql: string }>;
      input: IRRelNode;
      schema: ColumnMap;
    }
  | {
      kind: "aggregate";
      groupBy: Array<{ alias: string; expressionSql: string }>;
      aggregates: Array<{ alias: string; expressionSql: string }>;
      input: IRRelNode;
      schema: ColumnMap;
    }
  | {
      kind: "sort";
      items: Array<{ expressionSql: string; direction: "asc" | "desc" }>;
      input: IRRelNode;
    }
  | { kind: "limit"; count: number; offset: number | null; input: IRRelNode };
