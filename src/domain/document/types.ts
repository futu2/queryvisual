import type { ColumnMap, TableRef } from "../schema/types";

export type NodeKind =
  | "graphInput"
  | "fromTable"
  | "subgraph"
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

export interface OutputListenerConfig {
  copyToClipboard: boolean;
  logToConsole: boolean;
  saveToLocalStorage: {
    enabled: boolean;
    key: string;
  };
}

export interface GraphNodeBase<TKind extends NodeKind, TData> {
  id: string;
  kind: TKind;
  label: string;
  position: Position;
  data: TData;
}

export type GraphNode =
  | GraphNodeBase<"graphInput", { inputName: string; columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"subgraph", { graphId: string }>
  | GraphNodeBase<"join", { joinType: "inner" | "left" | "right" | "full"; predicate: string }>
  | GraphNodeBase<"where", { predicate: string }>
  | GraphNodeBase<"select", { mappings: NamedExpression[] }>
  | GraphNodeBase<"aggregation", { groupBy: NamedExpression[]; aggregates: NamedExpression[] }>
  | GraphNodeBase<"sort", { items: SortItem[] }>
  | GraphNodeBase<"limit", { count: number; offset: number | null }>
  | GraphNodeBase<"output", { outputName: string; listeners: OutputListenerConfig }>;

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphDocumentBase {
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

export interface GraphDefinition extends GraphDocumentBase {
  id: string;
}

export interface LegacyGraphDocument extends GraphDocumentBase {
  version: 1;
}

export interface GraphWorkspace {
  version: 2;
  metadata: {
    name: string;
  };
  entryGraphId: string;
  graphs: GraphDefinition[];
}

export type GraphDocument = GraphDefinition | LegacyGraphDocument;
