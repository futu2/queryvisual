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
import type { ColumnMap } from "../schema/types";

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
      const childGraphId = node.data.graphId;

      const visitingGraphs = context.visitingGraphs ?? new Set<string>();
      const childInputSchemas: Record<string, ColumnMap> = {};
      let inputsOk = true;

      for (const edge of incomingEdges(document, node.id)) {
        const childInputId = parseInputHandle(edge.targetHandle);
        if (!childInputId) continue;

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
        childInputSchemas[childInputId] = sourceResult.schema;
      }

      if (!inputsOk) {
        result = invalidSchema();
        break;
      }

      const childSchemas = inferWorkspaceGraphSchemasInternal({
        workspace,
        graphId: childGraphId,
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
): Record<string, ColumnMap> {
  const byId = nodesById(document);
  const cache = new Map<string, InferredNodeSchema>();
  inferNodeSchema(document, nodeId, byId, cache, new Set(), {});
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
