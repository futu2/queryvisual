import type { GraphDocument } from "../../domain/document/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isGraphNode(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.label === "string" &&
    isPosition(value.position) &&
    isRecord(value.data)
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

  return parsed as GraphDocument;
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
