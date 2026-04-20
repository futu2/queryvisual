import type { Diagnostic } from "../diagnostics/types";
import type {
  GraphDocument,
  GraphEdge,
  GraphNode,
  NamedExpression,
} from "../document/types";
import { inferExpressionType } from "../expr/infer";
import { parseExpression } from "../expr/parser";
import type { ColumnMap } from "../schema/types";
import type { SemanticOutput } from "./semantic";

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter(edge => edge.target === nodeId);
}

function orderedReachableNodes(document: GraphDocument, outputId: string) {
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  const ordered: GraphNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const edge of incomingEdges(document, nodeId)) {
      visit(edge.source);
    }

    ordered.push(nodesById[nodeId]);
  }

  visit(outputId);
  return ordered;
}

function scopeFromSchema(schema: ColumnMap) {
  return { ...schema };
}

function mappingsToSchema(mappings: NamedExpression[], scope: ColumnMap) {
  return Object.fromEntries(
    mappings.map(mapping => [
      mapping.name,
      inferExpressionType(parseExpression(mapping.expression), scope),
    ]),
  );
}

function diagnostic(
  code: string,
  message: string,
  nodeId: string,
  field?: string,
): Diagnostic {
  return {
    level: "error",
    code,
    message,
    ref: { nodeId, field },
  };
}

export function validateOutput(
  document: GraphDocument,
  outputId: string,
): SemanticOutput {
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const orderedNodes = orderedReachableNodes(document, outputId);
  const diagnostics: Diagnostic[] = [];
  const schemas: Record<string, ColumnMap> = {};

  for (const node of orderedNodes) {
    const inputs = incomingEdges(document, node.id);
    switch (node.kind) {
      case "graphInput":
        schemas[node.id] = node.data.columns;
        break;
      case "fromTable":
        schemas[node.id] = node.data.columns;
        break;
      case "join": {
        const left = inputs.find(edge => edge.targetHandle === "left");
        const right = inputs.find(edge => edge.targetHandle === "right");
        if (!left || !right) {
          diagnostics.push(
            diagnostic(
              "join.missing-input",
              "Join nodes require left and right inputs.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          break;
        }
        const leftSchema = schemas[left.source] ?? {};
        const rightSchema = schemas[right.source] ?? {};
        const scope = { ...scopeFromSchema(leftSchema), ...scopeFromSchema(rightSchema) };
        inferExpressionType(parseExpression(node.data.predicate), scope);
        schemas[node.id] = { ...leftSchema, ...rightSchema };
        break;
      }
      case "where": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(
            diagnostic(
              "where.missing-input",
              "Where nodes require one input.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          break;
        }
        const inputSchema = schemas[input.source] ?? {};
        const predicateType = inferExpressionType(
          parseExpression(node.data.predicate),
          inputSchema,
        );
        if (predicateType !== "boolean") {
          diagnostics.push(
            diagnostic(
              "where.non-boolean",
              "Where predicate must be boolean.",
              node.id,
              "predicate",
            ),
          );
        }
        schemas[node.id] = inputSchema;
        break;
      }
      case "select": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        if (!input) {
          diagnostics.push(
            diagnostic(
              "select.missing-input",
              "Select nodes require one input.",
              node.id,
            ),
          );
        }
        schemas[node.id] = mappingsToSchema(node.data.mappings, inputSchema);
        break;
      }
      case "aggregation": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        if (!input) {
          diagnostics.push(
            diagnostic(
              "aggregation.missing-input",
              "Aggregation nodes require one input.",
              node.id,
            ),
          );
        }
        schemas[node.id] = {
          ...mappingsToSchema(node.data.groupBy, inputSchema),
          ...mappingsToSchema(node.data.aggregates, inputSchema),
        };
        break;
      }
      case "sort":
      case "limit": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(
            diagnostic(
              `${node.kind}.missing-input`,
              `${node.kind} nodes require one input.`,
              node.id,
            ),
          );
          schemas[node.id] = {};
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "output": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(
            diagnostic(
              "output.missing-input",
              "Output nodes require one input.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
    }
  }

  const outputNode = nodesById[outputId];
  if (!outputNode || outputNode.kind !== "output") {
    diagnostics.push({
      level: "error",
      code: "output.invalid",
      message: `Node ${outputId} is not an output node.`,
    });
  }

  return {
    document,
    outputId,
    outputName: outputNode?.kind === "output" ? outputNode.data.outputName : outputId,
    orderedNodes,
    nodesById,
    schemas,
    diagnostics,
  };
}
