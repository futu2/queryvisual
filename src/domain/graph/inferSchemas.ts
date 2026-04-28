import type {
  GraphDefinition,
  GraphDocument,
  GraphEdge,
  GraphNode,
  GraphWorkspace,
  NamedExpression,
} from "../document/types";
import { analyzeExpression } from "../expr/analyze";
import { buildExpressionScope } from "./expressionScope";
import type { ColumnMap, ColumnType } from "../schema/types";
import {
  buildSubgraphWorkspace,
  resolveSubgraphTarget,
} from "../workspace/interfaces";

type InferredNodeSchema = {
  schema: ColumnMap;
  structurallyValid: boolean;
};

function nodesById(document: GraphDocument): Record<string, GraphNode> {
  return Object.fromEntries(document.nodes.map((node) => [node.id, node]));
}

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter((edge) => edge.target === nodeId);
}

function orderedReachableNodes(document: GraphDocument, outputId: string) {
  const byId = nodesById(document);
  const visited = new Set<string>();
  const ordered: GraphNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = byId[nodeId];
    if (!node) return;

    for (const edge of incomingEdges(document, nodeId)) {
      visit(edge.source);
    }

    ordered.push(node);
  }

  visit(outputId);
  return ordered;
}

function outgoingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter((edge) => edge.source === nodeId);
}

function edgesForHandle(
  document: GraphDocument,
  nodeId: string,
  targetHandle: GraphEdge["targetHandle"],
) {
  return incomingEdges(document, nodeId).filter(
    (edge) => edge.targetHandle === targetHandle,
  );
}

function parseOutputHandle(handle: string): string | null {
  if (!handle.startsWith("out:")) return null;
  const id = handle.slice("out:".length);
  return id === "" ? null : id;
}

function parseInputHandle(handle: string): string | null {
  if (!handle.startsWith("in:")) return null;
  const id = handle.slice("in:".length);
  return id === "" ? null : id;
}

function inferNamedExpressionsSchema(
  document: GraphDocument,
  nodeId: string,
  rows: NamedExpression[],
  schemas: Record<string, ColumnMap>,
) {
  const scope = buildExpressionScope(document, nodeId, { schemas });

  return Object.fromEntries(
    rows.map((row) => [
      row.name,
      analyzeExpression(row.expression, scope).type,
    ]),
  );
}

function invalidSchema(): InferredNodeSchema {
  return { schema: {}, structurallyValid: false };
}

function isTypeCompatible(provided: ColumnType | undefined, required: ColumnType) {
  if (!provided) return false;
  if (provided === "unknown" || required === "unknown") return true;
  return provided === required;
}

type WorkspaceInferenceContext = {
  workspace?: GraphWorkspace;
  graphId?: string;
  graphInputSchemas?: Record<string, ColumnMap>;
  visitingGraphs?: Set<string>;
};

function inferGraphSchemasInternal(params: {
  graph: GraphDefinition;
  workspace?: GraphWorkspace;
  graphInputSchemas?: Record<string, ColumnMap>;
  visitingGraphs?: Set<string>;
}): Record<string, ColumnMap> {
  const byId = nodesById(params.graph);
  const cache = new Map<string, InferredNodeSchema>();
  const context: WorkspaceInferenceContext = {
    workspace: params.workspace,
    graphId: params.graph.id,
    graphInputSchemas: params.graphInputSchemas ?? {},
    visitingGraphs: params.visitingGraphs,
  };

  for (const node of params.graph.nodes) {
    inferNodeSchema(params.graph, node.id, byId, cache, new Set(), context);
  }

  return cachedSchemas(cache);
}

function inferWorkspaceGraphSchemasInternal(params: {
  workspace: GraphWorkspace;
  graphId: string;
  graphInputSchemas?: Record<string, ColumnMap>;
  visitingGraphs: Set<string>;
}): Record<string, ColumnMap> {
  if (params.visitingGraphs.has(params.graphId)) {
    return {};
  }

  const graph =
    params.workspace.graphs.find((candidate) => candidate.id === params.graphId) ??
    null;
  if (!graph) return {};

  params.visitingGraphs.add(params.graphId);
  try {
    return inferGraphSchemasInternal({
      graph,
      workspace: params.workspace,
      graphInputSchemas: params.graphInputSchemas,
      visitingGraphs: params.visitingGraphs,
    });
  } finally {
    params.visitingGraphs.delete(params.graphId);
  }
}

function inferNodeSchema(
  document: GraphDocument,
  nodeId: string,
  byId: Record<string, GraphNode>,
  cache: Map<string, InferredNodeSchema>,
  visiting: Set<string>,
  context: WorkspaceInferenceContext,
): InferredNodeSchema {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }
  if (visiting.has(nodeId)) {
    return invalidSchema();
  }

  const node = byId[nodeId];
  if (!node) {
    const result = invalidSchema();
    cache.set(nodeId, result);
    return result;
  }

  visiting.add(nodeId);
  let result: InferredNodeSchema;

  switch (node.kind) {
    case "graphInput": {
      const overridden = context.graphInputSchemas?.[node.id];
      result = { schema: overridden ?? node.data.columns ?? {}, structurallyValid: true };
      break;
    }
    case "fromTable":
      result = { schema: node.data.columns ?? {}, structurallyValid: true };
      break;
    case "subgraph": {
      const workspace = context.workspace;
      if (!workspace) {
        result = invalidSchema();
        break;
      }

      const outputIds = new Set<string>();
      for (const edge of outgoingEdges(document, node.id)) {
        const outId = parseOutputHandle(edge.sourceHandle);
        if (outId) outputIds.add(outId);
      }

      if (outputIds.size !== 1) {
        result = invalidSchema();
        break;
      }

      const [childOutputId] = Array.from(outputIds);
      const resolved = resolveSubgraphTarget(workspace, node.data);
      const childGraph = resolved.graph;
      if (!childGraph) {
        result = invalidSchema();
        break;
      }

      const childInputNameCounts = new Map<string, number>();
      const childOutputNameCounts = new Map<string, number>();
      for (const childNode of childGraph.nodes) {
        if (childNode.kind === "graphInput") {
          childInputNameCounts.set(
            childNode.data.inputName,
            (childInputNameCounts.get(childNode.data.inputName) ?? 0) + 1,
          );
        }
        if (childNode.kind === "output") {
          childOutputNameCounts.set(
            childNode.data.outputName,
            (childOutputNameCounts.get(childNode.data.outputName) ?? 0) + 1,
          );
        }
      }
      if (
        [...childInputNameCounts.values()].some((count) => count > 1) ||
        [...childOutputNameCounts.values()].some((count) => count > 1)
      ) {
        // Child interface is ambiguous; fail closed instead of inferring schemas against an invalid
        // interface contract.
        result = invalidSchema();
        break;
      }

      const visitingGraphs = context.visitingGraphs ?? new Set<string>();
      const childInputSchemas: Record<string, ColumnMap> = {};
      let inputsOk = true;

      const childReachableNodes = orderedReachableNodes(childGraph, childOutputId);
      const requiredChildInputIds = new Set(
        childReachableNodes
          .filter(
            (n): n is Extract<GraphNode, { kind: "graphInput" }> => n.kind === "graphInput",
          )
          .map((n) => n.id),
      );

      const childById = nodesById(childGraph);
      const parentInputEdges = incomingEdges(document, node.id);
      for (const childInputId of requiredChildInputIds) {
        const childInputNode = childById[childInputId];
        if (!childInputNode || childInputNode.kind !== "graphInput") {
          inputsOk = false;
          continue;
        }

        const handleId = `in:${childInputId}`;
        const matches = parentInputEdges.filter((edge) => edge.targetHandle === handleId);
        if (matches.length !== 1) {
          inputsOk = false;
          continue;
        }

        const edge = matches[0]!;
        const sourceResult = inferNodeSchema(
          document,
          edge.source,
          byId,
          cache,
          visiting,
          context,
        );
        if (!sourceResult.structurallyValid) {
          inputsOk = false;
          continue;
        }

        const providedSchema = sourceResult.schema;
        const requiredSchema = childInputNode.data.columns ?? {};
        for (const [col, requiredType] of Object.entries(requiredSchema)) {
          if (!Object.prototype.hasOwnProperty.call(providedSchema, col)) {
            inputsOk = false;
            break;
          }

          const providedType = providedSchema[col];
          if (!isTypeCompatible(providedType, requiredType)) {
            inputsOk = false;
            break;
          }
        }

        if (!inputsOk) continue;
        childInputSchemas[childInputId] = providedSchema;
      }

      if (!inputsOk) {
        result = invalidSchema();
        break;
      }

      const childWorkspace = buildSubgraphWorkspace(workspace, resolved);
      const childSchemas = inferWorkspaceGraphSchemasInternal({
        workspace: childWorkspace,
        graphId: childGraph.id,
        graphInputSchemas: childInputSchemas,
        visitingGraphs,
      });
      const childOutputSchema = childSchemas[childOutputId] ?? null;
      result = childOutputSchema
        ? { schema: childOutputSchema, structurallyValid: true }
        : invalidSchema();
      break;
    }
    case "join": {
      const leftEdges = edgesForHandle(document, nodeId, "left");
      const rightEdges = edgesForHandle(document, nodeId, "right");
      if (leftEdges.length !== 1 || rightEdges.length !== 1) {
        result = invalidSchema();
        break;
      }

      const left = inferNodeSchema(
        document,
        leftEdges[0]!.source,
        byId,
        cache,
        visiting,
        context,
      );
      const right = inferNodeSchema(
        document,
        rightEdges[0]!.source,
        byId,
        cache,
        visiting,
        context,
      );

      result =
        left.structurallyValid && right.structurallyValid
          ? {
              schema: { ...left.schema, ...right.schema },
              structurallyValid: true,
            }
          : invalidSchema();
      break;
    }
    case "where":
    case "sort":
    case "limit":
    case "output": {
      const inputEdges = edgesForHandle(document, nodeId, "in");
      if (inputEdges.length !== 1) {
        result = invalidSchema();
        break;
      }

      const input = inferNodeSchema(
        document,
        inputEdges[0]!.source,
        byId,
        cache,
        visiting,
        context,
      );
      result = input.structurallyValid
        ? { schema: input.schema, structurallyValid: true }
        : invalidSchema();
      break;
    }
    case "select": {
      const inputEdges = edgesForHandle(document, nodeId, "in");
      if (inputEdges.length !== 1) {
        result = invalidSchema();
        break;
      }

      const input = inferNodeSchema(
        document,
        inputEdges[0]!.source,
        byId,
        cache,
        visiting,
        context,
      );
      if (!input.structurallyValid) {
        result = invalidSchema();
        break;
      }

      result = {
        schema: inferNamedExpressionsSchema(
          document,
          nodeId,
          node.data.mappings,
          Object.fromEntries(
            Array.from(cache.entries()).map(([id, entry]) => [id, entry.schema]),
          ),
        ),
        structurallyValid: true,
      };
      break;
    }
    case "aggregation": {
      const inputEdges = edgesForHandle(document, nodeId, "in");
      if (inputEdges.length !== 1) {
        result = invalidSchema();
        break;
      }

      const input = inferNodeSchema(
        document,
        inputEdges[0]!.source,
        byId,
        cache,
        visiting,
        context,
      );
      if (!input.structurallyValid) {
        result = invalidSchema();
        break;
      }

      const schemas = Object.fromEntries(
        Array.from(cache.entries()).map(([id, entry]) => [id, entry.schema]),
      );
      result = {
        schema: {
          ...inferNamedExpressionsSchema(document, nodeId, node.data.groupBy, schemas),
          ...inferNamedExpressionsSchema(
            document,
            nodeId,
            node.data.aggregates,
            schemas,
          ),
        },
        structurallyValid: true,
      };
      break;
    }
  }

  visiting.delete(nodeId);
  cache.set(nodeId, result);
  return result;
}

function cachedSchemas(cache: Map<string, InferredNodeSchema>) {
  return Object.fromEntries(
    Array.from(cache.entries()).map(([nodeId, result]) => [nodeId, result.schema]),
  );
}

export function inferNodeSchemas(
  document: GraphDocument,
  nodeId: string,
  context: WorkspaceInferenceContext = {},
): Record<string, ColumnMap> {
  const byId = nodesById(document);
  const cache = new Map<string, InferredNodeSchema>();
  inferNodeSchema(document, nodeId, byId, cache, new Set(), context);
  return cachedSchemas(cache);
}

export function inferDocumentSchemas(document: GraphDocument): Record<string, ColumnMap> {
  const byId = nodesById(document);
  const cache = new Map<string, InferredNodeSchema>();
  for (const node of document.nodes) {
    inferNodeSchema(document, node.id, byId, cache, new Set(), {});
  }
  return cachedSchemas(cache);
}

export function inferWorkspaceGraphSchemas(
  workspace: GraphWorkspace,
  graphId: string,
): Record<string, ColumnMap> {
  return inferWorkspaceGraphSchemasInternal({
    workspace,
    graphId,
    graphInputSchemas: {},
    visitingGraphs: new Set(),
  });
}
