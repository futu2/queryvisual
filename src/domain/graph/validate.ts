import type { Diagnostic } from "../diagnostics/types";
import type {
  GraphDocument,
  GraphNode,
  NamedExpression,
} from "../document/types";
import type { ExpressionAnalysisDiagnosticCode } from "../expr/analyze";
import { analyzeExpression } from "../expr/analyze";
import type { ColumnMap } from "../schema/types";
import { buildExpressionScope } from "./expressionScope";
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

const analyzerCodeToNodeSuffix: Record<ExpressionAnalysisDiagnosticCode, string> = {
  "expr.parse-error": "invalid-expression",
  "expr.unknown-column": "unknown-column",
  "expr.ambiguous-column": "ambiguous-column",
  "expr.non-boolean": "non-boolean",
};

function pushAnalyzerDiagnostics(params: {
  diagnostics: Diagnostic[];
  nodeKind: GraphNode["kind"];
  nodeId: string;
  field: string;
  expression: string;
  requireBoolean?: boolean;
  document: GraphDocument;
  schemaOverrides: Record<string, ColumnMap>;
}) {
  const scope = buildExpressionScope(params.document, params.nodeId, {
    schemas: params.schemaOverrides,
  });
  const analysis = analyzeExpression(params.expression, scope, {
    requireBoolean: params.requireBoolean,
  });

  for (const diag of analysis.diagnostics) {
    params.diagnostics.push(
      diagnostic(
        `${params.nodeKind}.${analyzerCodeToNodeSuffix[diag.code]}`,
        diag.message,
        params.nodeId,
        params.field,
      ),
    );
  }

  return analysis.type;
}

function mappingsToSchema(
  mappings: NamedExpression[],
  diagnostics: Diagnostic[],
  nodeId: string,
  nodeKind: GraphNode["kind"],
  fieldPrefix: string,
  document: GraphDocument,
  schemaOverrides: Record<string, ColumnMap>,
) {
  return Object.fromEntries(
    mappings.map((mapping, index) => {
      const type = pushAnalyzerDiagnostics({
        diagnostics,
        nodeKind,
        nodeId,
        field: `${fieldPrefix}.${index}.expression`,
        expression: mapping.expression,
        document,
        schemaOverrides,
      });
      return [mapping.name, type];
    }),
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
        pushAnalyzerDiagnostics({
          diagnostics,
          nodeKind: "join",
          nodeId: node.id,
          field: "predicate",
          expression: node.data.predicate,
          requireBoolean: true,
          document,
          schemaOverrides: schemas,
        });
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
        pushAnalyzerDiagnostics({
          diagnostics,
          nodeKind: "where",
          nodeId: node.id,
          field: "predicate",
          expression: node.data.predicate,
          requireBoolean: true,
          document,
          schemaOverrides: schemas,
        });
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "select": {
        singleInput(
          inputs,
          diagnostics,
          node.id,
          "select",
          "Select nodes require one input.",
        );
        schemas[node.id] = mappingsToSchema(
          node.data.mappings,
          diagnostics,
          node.id,
          "select",
          "mappings",
          document,
          schemas,
        );
        break;
      }
      case "aggregation": {
        singleInput(
          inputs,
          diagnostics,
          node.id,
          "aggregation",
          "Aggregation nodes require one input.",
        );
        schemas[node.id] = {
          ...mappingsToSchema(
            node.data.groupBy,
            diagnostics,
            node.id,
            "aggregation",
            "groupBy",
            document,
            schemas,
          ),
          ...mappingsToSchema(
            node.data.aggregates,
            diagnostics,
            node.id,
            "aggregation",
            "aggregates",
            document,
            schemas,
          ),
        };
        break;
      }
      case "sort": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "sort",
          "sort nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          break;
        }
        for (const [index, item] of node.data.items.entries()) {
          pushAnalyzerDiagnostics({
            diagnostics,
            nodeKind: "sort",
            nodeId: node.id,
            field: `items.${index}.expression`,
            expression: item.expression,
            document,
            schemaOverrides: schemas,
          });
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "limit": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "limit",
          "limit nodes require one input.",
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
