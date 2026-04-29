import type { GraphDocument, GraphNode } from "../document/types";
import type { ColumnMap, ColumnType } from "../schema/types";

type NodeKind = GraphNode["kind"];

export type BuildExpressionScopeOptions = {
  // Optional pre-resolved schemas (e.g. from validation) that should be preferred over
  // the static `resolveNodeSchema` fallback (which returns unknowns for select/aggregation).
  schemas?: Record<string, ColumnMap>;
};

export type ExpressionScopeSuggestion = {
  key: string;
  insertText: string;
  label: string;
  detail: string;
  type: ColumnType | "namespace";
};

export type ExpressionScope = {
  kind: "empty" | "single" | "join";
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

function isForwardingNodeKind(kind: NodeKind) {
  return kind === "where" || kind === "sort" || kind === "limit" || kind === "output";
}

function uniqueIncomingEdge(
  document: GraphDocument,
  nodeId: string,
  targetHandle: "in" | "left" | "right",
) {
  const matches = incomingEdges(document, nodeId).filter(edge => edge.targetHandle === targetHandle);
  if (matches.length !== 1) return null;
  return matches[0];
}

function singleInputEdge(document: GraphDocument, nodeId: string) {
  return uniqueIncomingEdge(document, nodeId, "in");
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
      const left = uniqueIncomingEdge(document, nodeId, "left");
      const right = uniqueIncomingEdge(document, nodeId, "right");
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
    case "helperFunctions":
    case "importHelperFunctions":
    case "importGraphHelpers":
      schema = {};
      break;
  }

  visiting.delete(nodeId);
  cache.set(nodeId, schema);
  return schema;
}

export function resolveNodeSchema(document: GraphDocument, nodeId: string): ColumnMap {
  return resolveNodeSchemaInternal(document, nodeId, new Map(), new Set());
}

function emptyScope(): ExpressionScope {
  return { kind: "empty", flatTypes: {}, ambiguousBareNames: {}, suggestions: [] };
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
    type: columnType,
  };
}

function buildJoinDerivedScope(
  document: GraphDocument,
  joinNodeId: string,
  options: BuildExpressionScopeOptions,
): ExpressionScope {
  const leftEdge = uniqueIncomingEdge(document, joinNodeId, "left");
  const rightEdge = uniqueIncomingEdge(document, joinNodeId, "right");
  const byId = nodesById(document);
  const leftUsable = !!(leftEdge && byId[leftEdge.source]);
  const rightUsable = !!(rightEdge && byId[rightEdge.source]);
  if (!leftUsable && !rightUsable) return emptyScope();

  const leftSchema = leftUsable
    ? (options.schemas?.[leftEdge!.source] ?? resolveNodeSchema(document, leftEdge!.source))
    : {};
  const rightSchema = rightUsable
    ? (options.schemas?.[rightEdge!.source] ?? resolveNodeSchema(document, rightEdge!.source))
    : {};

  const flatTypes: ColumnMap = {};
  const ambiguousBareNames: Record<string, string[]> = {};
  const suggestions: ExpressionScopeSuggestion[] = [];

  if (leftUsable) suggestions.push(namespaceSuggestion("left."));
  if (rightUsable) suggestions.push(namespaceSuggestion("right."));

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

  // Add bare names only when unambiguous across the connected sides.
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

function resolveEffectiveInputNodeId(
  document: GraphDocument,
  startNodeId: string,
): string | null {
  // Walk upstream through pass-through nodes to preserve join ambiguity semantics
  // for deep single-input chains (e.g. join -> where -> sort).
  let currentId: string | null = startNodeId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) return currentId;
    seen.add(currentId);

    const node = nodesById(document)[currentId];
    if (!node) return null;

    if (!isForwardingNodeKind(node.kind)) return currentId;
    const inEdge = singleInputEdge(document, currentId);
    currentId = inEdge?.source ?? null;
  }
  return null;
}

export function buildExpressionScope(
  document: GraphDocument,
  nodeId: string,
  options: BuildExpressionScopeOptions = {},
): ExpressionScope {
  const node = nodesById(document)[nodeId];
  if (!node) {
    return emptyScope();
  }

  if (node.kind === "join") {
    return buildJoinDerivedScope(document, nodeId, options);
  }

  // Zero-input nodes should not expose misleading "input." namespaces.
  if (node.kind === "graphInput" || node.kind === "fromTable") {
    return emptyScope();
  }

  const input = singleInputEdge(document, nodeId);
  if (!input) {
    // Missing edges should be safe and return an empty scope.
    return emptyScope();
  }

  const effectiveInputId = resolveEffectiveInputNodeId(document, input.source);
  if (!effectiveInputId) {
    return emptyScope();
  }
  // If the upstream node is a join, preserve join ambiguity semantics downstream.
  const effectiveInputNode = nodesById(document)[effectiveInputId];
  if (!effectiveInputNode) {
    return emptyScope();
  }
  if (effectiveInputNode.kind === "join") {
    return buildJoinDerivedScope(document, effectiveInputNode.id, options);
  }

  const schema = options.schemas?.[effectiveInputId] ?? resolveNodeSchema(document, effectiveInputId);

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
