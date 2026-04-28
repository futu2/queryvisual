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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isGraphPackageExportLike(value: unknown): value is {
    exportKey: string;
    graphId: string;
    displayName: string;
  } {
    return (
      isRecord(value) &&
      typeof value.exportKey === "string" &&
      typeof value.graphId === "string" &&
      typeof value.displayName === "string"
    );
  }

  function isGraphDefinitionLike(value: unknown): value is GraphDefinition {
    if (!isRecord(value)) return false;
    if (typeof value.id !== "string") return false;
    if (!isRecord(value.metadata) || typeof value.metadata.name !== "string") return false;
    if (
      !isRecord(value.viewport) ||
      typeof value.viewport.x !== "number" ||
      typeof value.viewport.y !== "number" ||
      typeof value.viewport.zoom !== "number"
    ) {
      return false;
    }
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false;
    return true;
  }

  const installedPackages = Array.isArray(record.installedPackages)
    ? record.installedPackages
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .filter((entry) => typeof entry.packageId === "string" && typeof entry.version === "string")
        .map((entry) => {
          const metadata =
            isRecord(entry.metadata) && typeof entry.metadata.name === "string"
              ? {
                  name: entry.metadata.name,
                  description:
                    typeof entry.metadata.description === "string"
                      ? entry.metadata.description
                      : undefined,
                }
              : { name: entry.packageId as string };

          const exports = Array.isArray(entry.exports)
            ? entry.exports.filter(isGraphPackageExportLike)
            : [];

          const graphs = Array.isArray(entry.graphs)
            ? entry.graphs.filter(isGraphDefinitionLike)
            : [];

          const dependencyRefs = Array.isArray(entry.dependencyRefs)
            ? entry.dependencyRefs
                .filter((ref): ref is Record<string, unknown> => isRecord(ref))
                .filter(
                  (ref) => typeof ref.packageId === "string" && typeof ref.version === "string",
                )
                .map((ref) => ({ packageId: ref.packageId as string, version: ref.version as string }))
            : [];

          const normalized: InstalledGraphPackage = {
            packageId: entry.packageId as string,
            version: entry.version as string,
            metadata,
            exports,
            graphs,
            dependencyRefs,
          };

          return normalized;
        })
    : [];

  const packageManifest = (() => {
    if (!("packageManifest" in record)) return null;
    const raw = record.packageManifest;
    if (raw === null) return null;
    if (!isRecord(raw)) return null;
    if (
      typeof raw.packageId !== "string" ||
      typeof raw.version !== "string" ||
      typeof raw.name !== "string" ||
      !Array.isArray(raw.exports)
    ) {
      return null;
    }

    const exports = raw.exports.filter(isGraphPackageExportLike);
    return {
      packageId: raw.packageId,
      version: raw.version,
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : undefined,
      exports,
    } satisfies WorkspacePackageManifest;
  })();

  return {
    ...(value as Omit<GraphWorkspace, "installedPackages" | "packageManifest">),
    installedPackages,
    packageManifest,
  };
}
