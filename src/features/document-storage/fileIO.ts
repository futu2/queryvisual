import type {
  GraphDefinition,
  GraphDocumentBase,
  GraphWorkspace,
  LegacyGraphDocument,
} from "../../domain/document/types";
import type { SubgraphTarget } from "../../domain/document/types";
import {
  isOutputListenerConfig,
  normalizeOutputListenerConfig,
} from "../../domain/document/outputListeners";
import type { GraphPackageFile, InstalledGraphPackage, WorkspacePackageManifest } from "../../domain/package/types";

const MAX_PACKAGE_DEPENDENCY_DEPTH = 50;

const columnTypes = [
  "boolean",
  "int",
  "float",
  "string",
  "date",
  "timestamp",
  "null",
  "unknown",
] as const;

const nodeKinds = [
  "graphInput",
  "fromTable",
  "subgraph",
  "join",
  "where",
  "select",
  "aggregation",
  "sort",
  "limit",
  "output",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isColumnType(value: unknown) {
  return typeof value === "string" && columnTypes.includes(value as typeof columnTypes[number]);
}

function isColumnMap(value: unknown) {
  return (
    isRecord(value) &&
    Object.keys(value).every((columnName) => typeof columnName === "string") &&
    Object.values(value).every(isColumnType)
  );
}

function isTableRef(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.tableName === "string" &&
    (value.schemaName === undefined || typeof value.schemaName === "string")
  );
}

function isPosition(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

function isViewport(value: unknown) {
  return (
    isPosition(value) &&
    typeof value.zoom === "number"
  );
}

function isNamedExpression(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.expression === "string"
  );
}

function isSortItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.expression === "string" &&
    (value.direction === "asc" || value.direction === "desc")
  );
}

function isNodeKind(value: unknown): value is typeof nodeKinds[number] {
  return typeof value === "string" && nodeKinds.includes(value as typeof nodeKinds[number]);
}

function isSubgraphTarget(value: unknown): value is SubgraphTarget {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "local") {
    return typeof value.graphId === "string";
  }

  if (value.kind === "package") {
    return (
      typeof value.packageId === "string" &&
      typeof value.version === "string" &&
      typeof value.exportKey === "string"
    );
  }

  return false;
}

function isNodeData(kind: typeof nodeKinds[number], value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  switch (kind) {
    case "graphInput":
      return (
        (value.inputName === undefined || typeof value.inputName === "string") &&
        isColumnMap(value.columns)
      );
    case "fromTable":
      return isTableRef(value.tableRef) && isColumnMap(value.columns);
    case "subgraph":
      return (
        typeof value.graphId === "string" &&
        (value.target === undefined || isSubgraphTarget(value.target))
      );
    case "join":
      return (
        (value.joinType === "inner" ||
          value.joinType === "left" ||
          value.joinType === "right" ||
          value.joinType === "full") &&
        typeof value.predicate === "string"
      );
    case "where":
      return typeof value.predicate === "string";
    case "select":
      return Array.isArray(value.mappings) && value.mappings.every(isNamedExpression);
    case "aggregation":
      return (
        Array.isArray(value.groupBy) &&
        value.groupBy.every(isNamedExpression) &&
        Array.isArray(value.aggregates) &&
        value.aggregates.every(isNamedExpression)
      );
    case "sort":
      return Array.isArray(value.items) && value.items.every(isSortItem);
    case "limit":
      return (
        typeof value.count === "number" &&
        (value.offset === null || typeof value.offset === "number")
      );
    case "output":
      return (
        typeof value.outputName === "string" &&
        (value.listeners === undefined || isOutputListenerConfig(value.listeners))
      );
  }
}

function isGraphNode(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isNodeKind(value.kind) &&
    typeof value.label === "string" &&
    isPosition(value.position) &&
    isNodeData(value.kind, value.data)
  );
}

function isGraphEdge(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.sourceHandle === "string" &&
    typeof value.target === "string" &&
    typeof value.targetHandle === "string"
  );
}

function sanitizeFilename(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized === "" ? "queryvisual" : sanitized;
}

function hasGraphDocumentShape(value: unknown) {
  return (
    isRecord(value) &&
    isRecord(value.metadata) &&
    typeof value.metadata.name === "string" &&
    isViewport(value.viewport) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isGraphNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isGraphEdge)
  );
}

function isLegacyGraphDocument(value: unknown): value is LegacyGraphDocument {
  return hasGraphDocumentShape(value) && value.version === 1;
}

function isGraphDefinition(value: unknown): value is GraphDefinition {
  return hasGraphDocumentShape(value) && typeof value.id === "string";
}

function isGraphPackageExport(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.exportKey === "string" &&
    typeof value.graphId === "string" &&
    typeof value.displayName === "string"
  );
}

function isGraphPackageMetadata(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function isInstalledGraphPackage(value: unknown): value is InstalledGraphPackage {
  return (
    isRecord(value) &&
    typeof value.packageId === "string" &&
    typeof value.version === "string" &&
    isGraphPackageMetadata(value.metadata) &&
    Array.isArray(value.exports) &&
    value.exports.every(isGraphPackageExport) &&
    Array.isArray(value.graphs) &&
    value.graphs.every(isGraphDefinition) &&
    Array.isArray(value.dependencyRefs) &&
    value.dependencyRefs.every(
      (ref) =>
        isRecord(ref) && typeof ref.packageId === "string" && typeof ref.version === "string",
    )
  );
}

function isWorkspacePackageManifest(value: unknown): value is WorkspacePackageManifest {
  return (
    isRecord(value) &&
    typeof value.packageId === "string" &&
    typeof value.version === "string" &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    Array.isArray(value.exports) &&
    value.exports.every(isGraphPackageExport)
  );
}

type GraphWorkspaceFile = Omit<GraphWorkspace, "installedPackages" | "packageManifest"> & {
  installedPackages?: InstalledGraphPackage[];
  packageManifest?: WorkspacePackageManifest | null;
};

function isGraphWorkspaceFile(value: unknown): value is GraphWorkspaceFile {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !isRecord(value.metadata) ||
    typeof value.metadata.name !== "string" ||
    typeof value.entryGraphId !== "string" ||
    !Array.isArray(value.graphs) ||
    !value.graphs.every(isGraphDefinition)
  ) {
    return false;
  }

  const graphIds = value.graphs.map((graph) => graph.id);

  const hasUniqueIds =
    new Set(graphIds).size === graphIds.length &&
    graphIds.includes(value.entryGraphId);

  if (!hasUniqueIds) {
    return false;
  }

  if (value.installedPackages !== undefined) {
    if (!Array.isArray(value.installedPackages) || !value.installedPackages.every(isInstalledGraphPackage)) {
      return false;
    }
  }

  if (value.packageManifest !== undefined && value.packageManifest !== null) {
    if (!isWorkspacePackageManifest(value.packageManifest)) {
      return false;
    }
  }

  return true;
}

function normalizeDocumentOutputs<TDocument extends GraphDocumentBase>(
  document: TDocument,
): TDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.kind === "graphInput") {
        const rawData = node.data as Record<string, unknown>;

        return {
          ...node,
          data: {
            inputName:
              typeof rawData.inputName === "string" ? rawData.inputName : node.label,
            columns: node.data.columns,
          },
        };
      }

      if (node.kind !== "output") {
        return node;
      }

      return {
        ...node,
        data: {
          outputName: node.data.outputName,
          listeners: normalizeOutputListenerConfig(
            node.data.outputName,
            (node.data as Record<string, unknown>).listeners,
          ),
        },
      };
    }),
  };
}

function normalizeWorkspace(workspace: GraphWorkspaceFile): GraphWorkspace {
  const withDefaults: GraphWorkspace = {
    ...workspace,
    installedPackages: workspace.installedPackages ?? [],
    packageManifest: workspace.packageManifest ?? null,
  };

  return {
    ...withDefaults,
    graphs: withDefaults.graphs.map((graph) => normalizeDocumentOutputs(graph)),
  };
}

function normalizeSubgraphTargets<TDocument extends GraphDocumentBase>(document: TDocument): TDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.kind !== "subgraph") {
        return node;
      }

      const rawData = node.data as Record<string, unknown>;
      if (!isSubgraphTarget(rawData.target) && typeof rawData.graphId === "string") {
        return {
          ...node,
          data: {
            ...node.data,
            target: { kind: "local", graphId: rawData.graphId },
          },
        };
      }

      return node;
    }),
  };
}

function hasInvalidLocalTargetMismatch(document: GraphDocumentBase): boolean {
  return document.nodes.some((node) => {
    if (node.kind !== "subgraph") return false;
    const data = node.data as Record<string, unknown>;
    if (typeof data.graphId !== "string") return true;

    const target = data.target;
    if (!isSubgraphTarget(target)) return false;
    if (target.kind !== "local") return false;

    return target.graphId !== data.graphId;
  });
}

function hasPackageTargetSubgraph(document: GraphDocumentBase): boolean {
  return document.nodes.some((node) => {
    if (node.kind !== "subgraph") return false;
    const data = node.data as Record<string, unknown>;
    const target = data.target as Record<string, unknown> | undefined;
    return isRecord(target) && target.kind === "package";
  });
}

function migrateLegacyDocumentToWorkspace(
  document: LegacyGraphDocument,
): GraphWorkspace {
  const graphId = "graph-main";

  return normalizeWorkspace({
    version: 2,
    metadata: {
      name: document.metadata.name,
    },
    entryGraphId: graphId,
    graphs: [
      normalizeSubgraphTargets({
        id: graphId,
        metadata: document.metadata,
        viewport: document.viewport,
        nodes: document.nodes,
        edges: document.edges,
      }),
    ],
    installedPackages: [],
    packageManifest: null,
  });
}

export function serializeDocumentJson(document: LegacyGraphDocument) {
  return JSON.stringify(document, null, 2);
}

export function parseDocumentJson(raw: string): LegacyGraphDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid QueryVisual document");
  }

  if (!isLegacyGraphDocument(parsed)) {
    throw new Error("Invalid QueryVisual document");
  }

  const normalized = normalizeSubgraphTargets(normalizeDocumentOutputs(parsed));
  if (hasInvalidLocalTargetMismatch(normalized)) {
    throw new Error("Invalid QueryVisual document");
  }
  if (hasPackageTargetSubgraph(normalized)) {
    throw new Error("Invalid QueryVisual document");
  }
  return normalized;
}

export function serializeWorkspaceJson(workspace: GraphWorkspace) {
  return JSON.stringify(workspace, null, 2);
}

export function parseWorkspaceJson(raw: string): GraphWorkspace {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid QueryVisual workspace");
  }

  if (isLegacyGraphDocument(parsed)) {
    const workspace = migrateLegacyDocumentToWorkspace(parsed);
    if (workspace.graphs.some((graph) => hasInvalidLocalTargetMismatch(graph))) {
      throw new Error("Invalid QueryVisual workspace");
    }
    if (workspace.graphs.some((graph) => hasPackageTargetSubgraph(graph))) {
      throw new Error("Invalid QueryVisual workspace");
    }
    return workspace;
  }

  if (!isGraphWorkspaceFile(parsed)) {
    throw new Error("Invalid QueryVisual workspace");
  }

  const normalized = normalizeWorkspace({
    ...parsed,
    graphs: parsed.graphs.map((graph) => normalizeSubgraphTargets(graph)),
  });
  if (normalized.graphs.some((graph) => hasInvalidLocalTargetMismatch(graph))) {
    throw new Error("Invalid QueryVisual workspace");
  }
  if (normalized.graphs.some((graph) => hasPackageTargetSubgraph(graph))) {
    throw new Error("Invalid QueryVisual workspace");
  }
  return normalized;
}

function isGraphPackageFile(value: unknown): value is GraphPackageFile {
  return isGraphPackageFileAtDepth(value, 0);
}

function isGraphPackageFileAtDepth(value: unknown, depth: number): value is GraphPackageFile {
  if (depth > MAX_PACKAGE_DEPENDENCY_DEPTH) {
    return false;
  }

  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.packageId !== "string" ||
    typeof value.version !== "string" ||
    !isGraphPackageMetadata(value.metadata) ||
    !Array.isArray(value.exports) ||
    !value.exports.every(isGraphPackageExport) ||
    !Array.isArray(value.graphs) ||
    !value.graphs.every(isGraphDefinition) ||
    !Array.isArray(value.dependencies)
  ) {
    return false;
  }

  const graphIds = new Set(value.graphs.map((graph) => graph.id));
  if (!value.exports.every((entry) => graphIds.has(entry.graphId))) {
    return false;
  }

  return value.dependencies.every((dep) => isGraphPackageFileAtDepth(dep, depth + 1));
}

function hasPackageTargetSubgraphInGraphs(graphs: GraphDefinition[]): boolean {
  return graphs.some((graph) => hasPackageTargetSubgraph(graph));
}

export function parsePackageJson(raw: string): GraphPackageFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid QueryVisual package");
  }

  if (!isGraphPackageFile(parsed)) {
    throw new Error("Invalid QueryVisual package");
  }

  if (hasPackageTargetSubgraphInGraphs(parsed.graphs)) {
    throw new Error("Invalid QueryVisual package");
  }

  const normalized = {
    ...parsed,
    graphs: parsed.graphs.map((graph) =>
      normalizeSubgraphTargets(normalizeDocumentOutputs(graph)),
    ),
  };

  if (normalized.graphs.some((graph) => hasInvalidLocalTargetMismatch(graph))) {
    throw new Error("Invalid QueryVisual package");
  }

  return normalized;
}

export function downloadDocument(graphDocument: LegacyGraphDocument) {
  const blob = new Blob([serializeDocumentJson(graphDocument)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(graphDocument.metadata.name)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadWorkspace(workspace: GraphWorkspace) {
  const blob = new Blob([serializeWorkspaceJson(workspace)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(workspace.metadata.name)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
