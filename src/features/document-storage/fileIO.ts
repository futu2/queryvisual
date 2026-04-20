import type { GraphDocument } from "../../domain/document/types";

export function serializeDocumentJson(document: GraphDocument) {
  return JSON.stringify(document, null, 2);
}

export function parseDocumentJson(raw: string): GraphDocument {
  const parsed = JSON.parse(raw) as GraphDocument;
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new Error("Invalid QueryVisual document");
  }
  return parsed;
}

export function downloadDocument(graphDocument: GraphDocument) {
  const blob = new Blob([serializeDocumentJson(graphDocument)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${graphDocument.metadata.name || "queryvisual"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
