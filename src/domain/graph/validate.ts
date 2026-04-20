import type { Diagnostic } from "../diagnostics/types";
import type {
  GraphDocument,
  GraphNode,
  NamedExpression,
} from "../document/types";
import { inferExpressionType } from "../expr/infer";
import { parseExpression } from "../expr/parser";
import type { ColumnMap, ColumnType } from "../schema/types";
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

    const node = nodesById[nodeId];
    if (!node) {
      return;
    }

    for (const edge of incomingEdges(document, nodeId)) {
      visit(edge.source);
    }

    ordered.push(node);
  }

  visit(outputId);
  return ordered;
}

function scopeFromSchema(schema: ColumnMap) {
  return { ...schema };
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

function inferExpressionSafely(
  expression: string,
  scope: ColumnMap,
  diagnostics: Diagnostic[],
  code: string,
  message: string,
  nodeId: string,
  field?: string,
) {
  try {
    return {
      type: inferExpressionType(parseExpression(expression), scope),
      ok: true,
    };
  } catch {
    diagnostics.push(diagnostic(code, message, nodeId, field));
    return {
      type: "unknown" as ColumnType,
      ok: false,
    };
  }
}

function mappingsToSchema(
  mappings: NamedExpression[],
  scope: ColumnMap,
  diagnostics: Diagnostic[],
  nodeId: string,
  code: string,
) {
  return Object.fromEntries(
    mappings.map(mapping => [
      mapping.name,
      inferExpressionSafely(
        mapping.expression,
        scope,
        diagnostics,
        code,
        "Mapping expression is invalid.",
        nodeId,
        mapping.name,
      ).type,
    ]),
  );
}

function singleInput(
  inputs: ReturnType<typeof incomingEdges>,
  diagnostics: Diagnostic[],
  nodeId: string,
  nodeKind: string,
  missingMessage: string,
) {
  const inEdges = inputs.filter(edge => edge.targetHandle === "in");
  if (inEdges.length === 0) {
    diagnostics.push(diagnostic(`${nodeKind}.missing-input`, missingMessage, nodeId));
    return null;
  }
  if (inEdges.length > 1) {
    diagnostics.push(
      diagnostic(
        `${nodeKind}.duplicate-input`,
        `${nodeKind} nodes require exactly one input.`,
        nodeId,
      ),
    );
  }
  return inEdges[0];
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
        const leftEdges = inputs.filter(edge => edge.targetHandle === "left");
        const rightEdges = inputs.filter(edge => edge.targetHandle === "right");
        const left = leftEdges[0];
        const right = rightEdges[0];
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
        if (leftEdges.length > 1) {
          diagnostics.push(
            diagnostic(
              "join.duplicate-left-input",
              "Join nodes require exactly one left input.",
              node.id,
            ),
          );
        }
        if (rightEdges.length > 1) {
          diagnostics.push(
            diagnostic(
              "join.duplicate-right-input",
              "Join nodes require exactly one right input.",
              node.id,
            ),
          );
        }
        const leftSchema = schemas[left.source] ?? {};
        const rightSchema = schemas[right.source] ?? {};
        const scope = { ...scopeFromSchema(leftSchema), ...scopeFromSchema(rightSchema) };
        const predicate = inferExpressionSafely(
          node.data.predicate,
          scope,
          diagnostics,
          "join.invalid-expression",
          "Join predicate is invalid.",
          node.id,
          "predicate",
        );
        if (predicate.ok && predicate.type !== "boolean") {
          diagnostics.push(
            diagnostic(
              "join.non-boolean",
              "Join predicate must be boolean.",
              node.id,
              "predicate",
            ),
          );
        }
        schemas[node.id] = { ...leftSchema, ...rightSchema };
        break;
      }
      case "where": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "where",
          "Where nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          break;
        }
        const inputSchema = schemas[input.source] ?? {};
        const predicate = inferExpressionSafely(
          node.data.predicate,
          inputSchema,
          diagnostics,
          "where.invalid-expression",
          "Where predicate is invalid.",
          node.id,
          "predicate",
        );
        if (predicate.ok && predicate.type !== "boolean") {
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
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "select",
          "Select nodes require one input.",
        );
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        schemas[node.id] = mappingsToSchema(
          node.data.mappings,
          inputSchema,
          diagnostics,
          node.id,
          "select.invalid-expression",
        );
        break;
      }
      case "aggregation": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "aggregation",
          "Aggregation nodes require one input.",
        );
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        schemas[node.id] = {
          ...mappingsToSchema(
            node.data.groupBy,
            inputSchema,
            diagnostics,
            node.id,
            "aggregation.invalid-expression",
          ),
          ...mappingsToSchema(
            node.data.aggregates,
            inputSchema,
            diagnostics,
            node.id,
            "aggregation.invalid-expression",
          ),
        };
        break;
      }
      case "sort":
      case "limit": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          node.kind,
          `${node.kind} nodes require one input.`,
        );
        if (!input) {
          schemas[node.id] = {};
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "output": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "output",
          "Output nodes require one input.",
        );
        if (!input) {
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
      ref: { nodeId: outputId },
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
