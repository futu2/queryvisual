import type { GraphDocument, GraphNode } from "../document/types";
import type { ColumnMap, ColumnType } from "../schema/types";

export type ExpressionScopeSuggestion = {
  key: string;
  insertText: string;
  label: string;
  detail: string;
  type: "namespace" | "column";
};

export type ExpressionScope = {
  kind: "single" | "join";
  flatTypes: ColumnMap;
  ambiguousBareNames: Record<string, string[]>;
  suggestions: ExpressionScopeSuggestion[];
};

function nodesById(document: GraphDocument): Record<string, GraphNode> {
  return Object.fromEntries(document.nodes.map(node => [node.id, node]));
}

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter(edge => edge.target === nodeId);
}

function singleInputEdge(document: GraphDocument, nodeId: string) {
  return incomingEdges(document, nodeId).find(edge => edge.targetHandle === "in") ?? null;
}

function resolveNodeSchemaInternal(
  document: GraphDocument,
  nodeId: string,
  cache: Map<string, ColumnMap>,
  visiting: Set<string>,
): ColumnMap {
  if (cache.has(nodeId)) return cache.get(nodeId)!;
  if (visiting.has(nodeId)) return {};
  visiting.add(nodeId);

  const node = nodesById(document)[nodeId];
  if (!node) {
    visiting.delete(nodeId);
    cache.set(nodeId, {});
    return {};
  }

  let schema: ColumnMap = {};
  switch (node.kind) {
    case "graphInput":
    case "fromTable":
      schema = node.data.columns ?? {};
      break;
    case "join": {
      const inputs = incomingEdges(document, nodeId);
      const left = inputs.find(edge => edge.targetHandle === "left") ?? null;
      const right = inputs.find(edge => edge.targetHandle === "right") ?? null;
      const leftSchema = left ? resolveNodeSchemaInternal(document, left.source, cache, visiting) : {};
      const rightSchema = right ? resolveNodeSchemaInternal(document, right.source, cache, visiting) : {};
      schema = { ...leftSchema, ...rightSchema };
      break;
    }
    case "where":
    case "sort":
    case "limit":
    case "output": {
      const input = singleInputEdge(document, nodeId);
      schema = input ? resolveNodeSchemaInternal(document, input.source, cache, visiting) : {};
      break;
    }
    case "select": {
      schema = Object.fromEntries(
        (node.data.mappings ?? []).map(mapping => [mapping.name, "unknown" as ColumnType]),
      );
      break;
    }
    case "aggregation": {
      const groupBy = (node.data.groupBy ?? []).map(mapping => [
        mapping.name,
        "unknown" as ColumnType,
      ]);
      const aggregates = (node.data.aggregates ?? []).map(mapping => [
        mapping.name,
        "unknown" as ColumnType,
      ]);
      schema = Object.fromEntries([...groupBy, ...aggregates]);
      break;
    }
  }

  visiting.delete(nodeId);
  cache.set(nodeId, schema);
  return schema;
}

export function resolveNodeSchema(document: GraphDocument, nodeId: string): ColumnMap {
  return resolveNodeSchemaInternal(document, nodeId, new Map(), new Set());
}

function namespaceSuggestion(key: string): ExpressionScopeSuggestion {
  return {
    key,
    insertText: key,
    label: key,
    detail: "namespace",
    type: "namespace",
  };
}

function columnSuggestion(key: string, columnType: ColumnType): ExpressionScopeSuggestion {
  return {
    key,
    insertText: key,
    label: key,
    detail: columnType,
    type: "column",
  };
}

export function buildExpressionScope(document: GraphDocument, nodeId: string): ExpressionScope {
  const node = nodesById(document)[nodeId];
  if (!node) {
    return { kind: "single", flatTypes: {}, ambiguousBareNames: {}, suggestions: [] };
  }

  if (node.kind === "join") {
    const inputs = incomingEdges(document, nodeId);
    const leftEdge = inputs.find(edge => edge.targetHandle === "left") ?? null;
    const rightEdge = inputs.find(edge => edge.targetHandle === "right") ?? null;
    const leftSchema = leftEdge ? resolveNodeSchema(document, leftEdge.source) : {};
    const rightSchema = rightEdge ? resolveNodeSchema(document, rightEdge.source) : {};

    const flatTypes: ColumnMap = {};
    const ambiguousBareNames: Record<string, string[]> = {};
    const suggestions: ExpressionScopeSuggestion[] = [
      namespaceSuggestion("left."),
      namespaceSuggestion("right."),
    ];

    for (const [col, type] of Object.entries(leftSchema)) {
      const key = `left.${col}`;
      flatTypes[key] = type;
      suggestions.push(columnSuggestion(key, type));
    }
    for (const [col, type] of Object.entries(rightSchema)) {
      const key = `right.${col}`;
      flatTypes[key] = type;
      suggestions.push(columnSuggestion(key, type));
    }

    // Add bare names only when unambiguous. Track ambiguous bare names and omit them.
    const names = new Set<string>([...Object.keys(leftSchema), ...Object.keys(rightSchema)]);
    for (const name of names) {
      const inLeft = Object.prototype.hasOwnProperty.call(leftSchema, name);
      const inRight = Object.prototype.hasOwnProperty.call(rightSchema, name);
      if (inLeft && inRight) {
        ambiguousBareNames[name] = [`left.${name}`, `right.${name}`];
        continue;
      }
      const type = (inLeft ? leftSchema[name] : rightSchema[name]) as ColumnType | undefined;
      if (!type) continue;
      flatTypes[name] = type;
      suggestions.push(columnSuggestion(name, type));
    }

    return { kind: "join", flatTypes, ambiguousBareNames, suggestions };
  }

  // Zero-input nodes should not expose misleading "input." namespaces.
  if (node.kind === "graphInput" || node.kind === "fromTable") {
    return { kind: "single", flatTypes: {}, ambiguousBareNames: {}, suggestions: [] };
  }

  const input = singleInputEdge(document, nodeId);
  if (!input) {
    // Missing edges should be safe and return an empty scope.
    return { kind: "single", flatTypes: {}, ambiguousBareNames: {}, suggestions: [] };
  }
  const schema = resolveNodeSchema(document, input.source);

  const flatTypes: ColumnMap = {};
  const suggestions: ExpressionScopeSuggestion[] = [namespaceSuggestion("input.")];
  for (const [col, type] of Object.entries(schema)) {
    const qualified = `input.${col}`;
    flatTypes[qualified] = type;
    flatTypes[col] = type;
    suggestions.push(columnSuggestion(qualified, type));
    suggestions.push(columnSuggestion(col, type));
  }

  return { kind: "single", flatTypes, ambiguousBareNames: {}, suggestions };
}
