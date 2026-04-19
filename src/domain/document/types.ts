import type { ColumnMap, TableRef } from "../schema/types";

export type NodeKind =
  | "graphInput"
  | "fromTable"
  | "join"
  | "where"
  | "select"
  | "aggregation"
  | "sort"
  | "limit"
  | "output";

export interface Position {
  x: number;
  y: number;
}

export interface NamedExpression {
  name: string;
  expression: string;
}

export interface SortItem {
  expression: string;
  direction: "asc" | "desc";
}

export interface GraphNodeBase<TKind extends NodeKind, TData> {
  id: string;
  kind: TKind;
  label: string;
  position: Position;
  data: TData;
}

export type GraphNode =
  | GraphNodeBase<"graphInput", { columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"join", { joinType: "inner" | "left" | "right" | "full"; predicate: string }>
  | GraphNodeBase<"where", { predicate: string }>
  | GraphNodeBase<"select", { mappings: NamedExpression[] }>
  | GraphNodeBase<"aggregation", { groupBy: NamedExpression[]; aggregates: NamedExpression[] }>
  | GraphNodeBase<"sort", { items: SortItem[] }>
  | GraphNodeBase<"limit", { count: number; offset: number | null }>
  | GraphNodeBase<"output", { outputName: string }>;

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphDocument {
  version: 1;
  metadata: {
    name: string;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}
