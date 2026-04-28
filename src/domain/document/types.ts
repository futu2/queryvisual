import type { ColumnMap, TableRef } from "../schema/types";
import type {
  InstalledGraphPackage,
  WorkspacePackageManifest,
} from "../package/types";

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

export type SubgraphTarget =
  | { kind: "local"; graphId: string }
  | { kind: "package"; packageId: string; version: string; exportKey: string };

export type GraphNode =
  | GraphNodeBase<"graphInput", { inputName: string; columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"subgraph", { graphId: string; target?: SubgraphTarget }>
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
  installedPackages: InstalledGraphPackage[];
  packageManifest: WorkspacePackageManifest | null;
}

export type GraphDocument = GraphDefinition | LegacyGraphDocument;

export function isGraphWorkspaceRuntime(value: unknown): value is GraphWorkspace {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { version?: unknown }).version !== 2
  ) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (!("graphs" in record) || !Array.isArray(record.graphs)) return false;
  if (!("installedPackages" in record) || !Array.isArray(record.installedPackages)) return false;
  if (!("packageManifest" in record)) return false;

  // `packageManifest` can be null, but must be present.
  const manifest = record.packageManifest;
  if (manifest !== null && typeof manifest !== "object") return false;

  return true;
}

export type GraphWorkspaceLikeRuntime = Omit<GraphWorkspace, "installedPackages" | "packageManifest"> & {
  installedPackages?: unknown;
  packageManifest?: unknown;
};

export function isGraphWorkspaceLikeRuntime(value: unknown): value is GraphWorkspaceLikeRuntime {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { version?: unknown }).version !== 2
  ) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (!("graphs" in record) || !Array.isArray(record.graphs)) return false;
  if (!("entryGraphId" in record) || typeof record.entryGraphId !== "string") return false;
  if (!("metadata" in record) || typeof record.metadata !== "object" || record.metadata === null) return false;

  return true;
}

export function normalizeGraphWorkspaceLikeRuntime(value: GraphWorkspaceLikeRuntime): GraphWorkspace {
  const record = value as Record<string, unknown>;

  const installedPackages = Array.isArray(record.installedPackages)
    ? (record.installedPackages as InstalledGraphPackage[])
    : [];

  const packageManifest = "packageManifest" in record
    ? (record.packageManifest as WorkspacePackageManifest | null)
    : null;

  return {
    ...(value as Omit<GraphWorkspace, "installedPackages" | "packageManifest">),
    installedPackages,
    packageManifest: packageManifest ?? null,
  };
}
