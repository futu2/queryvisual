import type { GraphDocument } from "../../domain/document/types";
import {
  isOutputListenerConfig,
  normalizeOutputListenerConfig,
} from "../../domain/document/outputListeners";

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

function isNodeData(kind: typeof nodeKinds[number], value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  switch (kind) {
    case "graphInput":
      return isColumnMap(value.columns);
    case "fromTable":
      return isTableRef(value.tableRef) && isColumnMap(value.columns);
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

function normalizeDocumentOutputs(document: GraphDocument): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
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
    value.sourceHandle === "out" &&
    typeof value.target === "string" &&
    (value.targetHandle === "in" ||
      value.targetHandle === "left" ||
      value.targetHandle === "right")
  );
}

function sanitizeFilename(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized === "" ? "queryvisual" : sanitized;
}

export function serializeDocumentJson(document: GraphDocument) {
  return JSON.stringify(document, null, 2);
}

export function parseDocumentJson(raw: string): GraphDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid QueryVisual document");
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !isRecord(parsed.metadata) ||
    typeof parsed.metadata.name !== "string" ||
    !isViewport(parsed.viewport) ||
    !Array.isArray(parsed.nodes) ||
    !parsed.nodes.every(isGraphNode) ||
    !Array.isArray(parsed.edges) ||
    !parsed.edges.every(isGraphEdge)
  ) {
    throw new Error("Invalid QueryVisual document");
  }

  return normalizeDocumentOutputs(parsed as GraphDocument);
}

export function downloadDocument(graphDocument: GraphDocument) {
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
