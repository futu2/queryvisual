import type {
  GraphDocument,
  GraphEdge,
  GraphNode,
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

function edgesForHandle(
  document: GraphDocument,
  nodeId: string,
  targetHandle: GraphEdge["targetHandle"],
) {
  return incomingEdges(document, nodeId).filter(
    (edge) => edge.targetHandle === targetHandle,
  );
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

function inferNodeSchema(
  document: GraphDocument,
  nodeId: string,
  byId: Record<string, GraphNode>,
  cache: Map<string, InferredNodeSchema>,
  visiting: Set<string>,
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
    case "graphInput":
    case "fromTable":
      result = { schema: node.data.columns ?? {}, structurallyValid: true };
      break;
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
      );
      const right = inferNodeSchema(
        document,
        rightEdges[0]!.source,
        byId,
        cache,
        visiting,
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
  inferNodeSchema(document, nodeId, byId, cache, new Set());
  return cachedSchemas(cache);
}

export function inferDocumentSchemas(document: GraphDocument): Record<string, ColumnMap> {
  const byId = nodesById(document);
  const cache = new Map<string, InferredNodeSchema>();
  for (const node of document.nodes) {
    inferNodeSchema(document, node.id, byId, cache, new Set());
  }
  return cachedSchemas(cache);
}
